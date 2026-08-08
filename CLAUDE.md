# CLAUDE.md — working in this repo

Development and agent instructions. [README.md](README.md) is the public-facing overview; keep the
public/development split when editing either.

## What zkuat is, in one screen

A vendor proves that GitHub-generated security evidence satisfies a **public buyer policy** without
putting the findings on Midnight. Three packages and one workflow:

```
.github/workflows/generate-evidence.yml   npm audit + lint + build + npm pack digest
        │                                 → evidence.json artifact (1-day retention)
        ▼
ui/          Next.js 16 on Vercel (zkuat.works). GitHub OAuth, repo selection,
        │    workflow dispatch → artifact download, pairing, Supabase read-model.
        ▼    (loopback HTTP, six-digit pairing code)
runtime/     @zkuat/runtime — the local sponsor companion. Owns the sponsor wallet,
        │    private job state, Docker proof server, contract calls, indexer checks.
        ▼
contract/    @zkuat/contract — Compact protocol, canonical encoding, witnesses,
             the four bundled policies. The single source of protocol truth.
```

**No browser wallet anywhere.** One locally configured sponsor wallet pays DUST for every
transaction. The chain node and indexer are hosted (Preview/Preprod); the *only* Docker workload zkuat
manages is the local proof server.

Nothing in this repo signs evidence. **GitHub Actions is the trusted measurement environment** — that
is an explicit hackathon trust assumption, not an oversight. Do not describe the system as proving the
scanner was honest; it proves policy evaluation over accepted evidence.

## Source of truth

Code wins when behavior changes. In order:

1. `contract/src/audit_registry.compact` + `contract/src/encoding.ts` — protocol state, circuits, IDs,
   policies
2. `runtime/src/` — validation, wallet/proof orchestration, API, indexer verification
3. `.github/workflows/generate-evidence.yml` — measurement and artifact shape
4. `ui/src/` — hosted experience and its Supabase read-model

Docs, all current as of the last realignment:

| Doc | Covers |
|---|---|
| [docs/README.md](docs/README.md) | Index |
| [docs/01-architecture.md](docs/01-architecture.md) | Trust boundaries, end-to-end sequence, who sees what |
| [docs/03-evidence-schema.md](docs/03-evidence-schema.md) | GitHub evidence → Compact encoding |
| [docs/04-contract-spec.md](docs/04-contract-spec.md) | Ledger, circuits, disclosure |
| [docs/08-local-setup.md](docs/08-local-setup.md) | Runtime setup and operations |
| [docs/Master-Doc-v2.md](docs/Master-Doc-v2.md) | Current product/implementation brief |

Package READMEs are detailed and current — [contract/README.md](contract/README.md) and
[runtime/README.md](runtime/README.md) are the best reference for their respective surfaces.

> **Known doc drift:** `docs/Master-Doc-v2.md` §2 and §10 say deployment registers **two** policies.
> The code registers **four** (`BUNDLED_POLICY_SLUGS` in `contract/src/encoding.ts`), and
> `README.md`, `docs/01-architecture.md`, and `contract/README.md` all agree on four. Fix the master
> doc rather than propagating "two".

`ui/` has its own agent instructions in [ui/AGENTS.md](ui/AGENTS.md) (`ui/CLAUDE.md` just imports it).
That Next.js version has breaking changes relative to training data — read the guides in
`ui/node_modules/next/dist/docs/` before writing UI code.

## Hard rules

### 1. One WASM instance — do not add `@midnight-ntwrk/*` to `runtime/`

`runtime/package.json` depends on exactly one thing: `@zkuat/contract` (a `file:` link). All SDK
symbols come through **`contract/src/sdk.ts`**, which re-exports the handful the runtime needs so they
resolve inside `contract/node_modules`.

A second copy of the SDK's WASM module means a second class registry: an object minted by one fails
every `instanceof` in the other. It surfaces as `Error: expected instance of StateValue` on the first
circuit call — **deployment succeeds**, so the failure lands much later than you expect.

Both packages also carry:

```json
"overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }
```

`midnight-js-protocol@4.1.1` pins that runtime to exactly 3.0.0 while `compact-runtime@0.16.0`
declares `^3.0.0` and floats to 3.1.0. Without the override npm installs both. Verify after any
dependency change:

```bash
find contract/node_modules -name onchain-runtime-v3 -type d   # exactly one path
find runtime/node_modules  -name onchain-runtime-v3 -type d   # zero — resolves via the file: link
```

### 2. Do not reimplement protocol hashes

`@zkuat/contract` exports the derivations compiled from the same Compact source the circuit runs, so
TypeScript computes byte-for-byte what `proveCompliance` checks:

```typescript
import { encodeEvidence, pureCircuits, recordKey, POLICY_CI_BASELINE_SLUG } from '@zkuat/contract';

const evidence = encodeEvidence(canonicalJson);
const leaf     = pureCircuits.leafOf(evidence, salt);                    // the runtime anchors this
const key      = recordKey(canonicalJson.artifactDigest, POLICY_CI_BASELINE_SLUG);
```

`pureCircuits.leafOf` / `stringIdOf` / `recordKeyOf` / `nullifierOf`, plus `encodeEvidence`,
`vendorId`, `productId`, `policyId`, and `encodeArtifactDigest`, are the only implementations. See
`contract/src/index.ts` for the full export surface.

### 3. The name `zkuat` is a commitment input — do not rename

`contract/src/audit_registry.compact` domain-separates with literal strings:

```compact
pad(32, "zkuat:proof:nul:")     // nullifiers
pad(32, "zkuat:record:key:")    // record keys
pad(32, "zkuat:anchor:pk:")     // sealed anchor identity
```

`contract/src/anchor-secret.ts` does the same for HKDF (`zkuat:anchor-kdf:v1` /
`zkuat:anchor-secret:v1`). Changing any of these invalidates every nullifier, record key, and the
sealed anchor of an already-deployed contract.

### 4. Sponsor recovery phrase hygiene

The 24-word recovery phrase lives **only** in `runtime/.env`, mode `0600`. Never in Vercel,
Supabase, a `NEXT_PUBLIC_*` variable, browser storage, or source control.

The runtime checksum-validates the phrase and runs BIP-39 seed derivation over it for the wallet seed.
`ZKUAT_NETWORK=local` — and only `local` — additionally accepts a raw 64-character hexadecimal seed,
because a devnet's genesis accounts are funded by seed and no phrase restores them.
That seed is **never** a Compact witness. `deriveAnchorSecret()` HKDF-derives a 32-byte anchor witness;
deployment seals `anchorIdOf(secret)` in the contract, and `attest` / `registerPolicy` fail if the
configured phrase does not restore the deployer's wallet. Keep network + phrase constant for a given
contract address.

`~/.zkuat/runtime/jobs/*.json` deliberately contain raw prepared evidence, salt, and leaf. Treat the
whole storage directory as sensitive; never upload it or copy it into the repo.

### 5. Generated output: some committed, some not

`contract/src/managed/audit_registry/contract/` (JS bindings + `.d.ts`) and `compiler/` **are
committed**, so `runtime/` and `ui/` build without the Compact compiler. `keys/` and `zkir/` (~15 MB)
are gitignored and must be generated locally.

- `npm run compile` — bindings only, fast. **Run before `npm test`** after touching the `.compact`.
- `npm run compile:keys` — bindings + keys + ZKIR. **Required before `deploy` or any real proof.**
- Do not `npm run clean` unless you intend to regenerate everything.

Both compile scripts run `scripts/strip-sourcemap.mjs` afterwards because the generated sourcemap is
not usable by Node. Don't remove that postcompile hook.

## Setup

```bash
npm --prefix contract ci
npm --prefix contract run compile:keys      # needed for deploy/prove, not for unit tests
npm --prefix runtime ci
npm --prefix ui ci                          # only when developing the frontend

cp runtime/.env.example runtime/.env
chmod 600 runtime/.env
```

Set `ZKUAT_NETWORK` (`local`|`preview`|`preprod`) and `ZKUAT_SPONSOR_WALLET_SEED` (a quoted, valid
24-word English BIP-39 recovery phrase), then:

```bash
npm --prefix runtime run deploy             # 1 deploy + 4 registerPolicy transactions
# copy the printed address into ZKUAT_CONTRACT_ADDRESS
npm --prefix runtime start                  # prints the six-digit pairing code
```

For local frontend work set `ZKUAT_ALLOWED_ORIGIN=http://localhost:3000` — CORS requires an exact
origin match, no path.

Prerequisites: Node 22+, `compact` CLI/compiler on `PATH`, Docker callable by the current user, and a
Preview/Preprod sponsor wallet holding unshielded NIGHT so the SDK can register it for DUST generation.

## Commands

| Package | Command | Notes |
|---|---|---|
| `contract/` | `npm run compile` / `compile:keys` | see rule 5 |
| | `npm run typecheck` · `npm test` | vitest simulator tests |
| | `npm run clean` | destructive — removes all managed output |
| `runtime/` | `npm run deploy` · `npm start` | live network; needs keys + funded seed |
| | `npm run typecheck` · `npm test` | fakes for GitHub/proof-server/chain/indexer; no live txs |
| | `npx tsx src/cli.ts proof-server start\|status\|stop` | run from `runtime/` |
| | `npx tsx src/cli.ts ledger [owner/name]` | read-only public ledger dump; no wallet or seed |
| `ui/` | `npm run dev` · `lint` · `build` | needs Supabase env vars to serve |

Full development check:

```bash
npm --prefix contract run typecheck && npm --prefix contract test
npm --prefix runtime  run typecheck && npm --prefix runtime  test
npm --prefix ui run lint && npm --prefix ui run build
```

**Verified green on 2026-08-08** in this environment: `compact compile --skip-zk` exits 0, both
typechecks silent, **contract 18 tests** (1 file), **runtime 26 tests** (5 files).

Unit and simulator tests do **not** substitute for a funded live-network deployment test. Compilation
alone proves nothing — code must be compiled *and* executed.

## Trust boundaries — do not overclaim

State these accurately in docs, commits, and the pitch:

- **Evidence is not signed.** No Sigstore, Rekor, SLSA, or attestor key. GitHub Actions is trusted for
  measurement.
- **The runtime never calls GitHub.** It validates the payload the paired browser forwards, checking
  self-consistency of request ID, run URL/ID, repo, artifact name/ID, and success status. A compromised
  paired frontend could fabricate a self-consistent payload.
- **Evidence is private from the chain, the auditor, and the public — not from the web tier.** Vercel
  downloads the artifact and the vendor's browser renders it before forwarding.
- **The proof establishes that committed private values satisfy the policy predicate.** It does not
  prove `npm audit`, lint, or build ran honestly.
- **Pairing authorizes browser-initiated spending** from the local sponsor wallet through a limited
  API. It is not GitHub attestation.
- **The public UI is not chain-backed yet.** Dashboard, policy pages, and the public verifier read
  Supabase rows and hard-coded policy fixtures; a completed job is not copied into `artifacts` /
  `proof_activity`; the demo seeder inserts synthetic transaction hashes. **The runtime's own indexer
  check is authoritative for real jobs.**
- **The contract does not compare timestamps to block time.** It bounds `validUntil - generatedAt`
  against the policy; readers decide whether a record is currently expired.

## Deliberately out of scope — don't "fix" these

Signed evidence / Sigstore / KMS attestors · runtime-side GitHub retrieval · arbitrary policy creation
(the four npm reference policies are fixed at deploy) · multiple sponsor wallets or concurrent queues
(one promise queue serializes jobs because they share a wallet and private-state store) · remote key
custody · automatic Supabase↔indexer sync · a chain-backed public verifier · Supabase migrations ·
rate limiting, monitoring, key rotation.

These are recorded as tradeoffs in `docs/Master-Doc-v2.md` §13 and `docs/01-architecture.md`. If you
implement one, move it out of the tradeoff lists in *all* of README, `01-architecture.md`, and
`Master-Doc-v2.md` — they each carry a copy.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `expected instance of StateValue` on first circuit call | Two WASM instances — rule 1. `rm -rf node_modules package-lock.json && npm ci` |
| Proof assets missing at deploy/prove | `npm --prefix contract run compile:keys`, then reinstall/relink runtime deps |
| `anchor identity mismatch` | Configured seed ≠ deployer seed for that contract address |
| Tests fail after editing `.compact` | `npm run compile` before `npm test` |
| `origin is not allowed` | `ZKUAT_ALLOWED_ORIGIN` must match the page origin exactly, no path |
| Pairing fails after restart | Tokens are in-memory only; use the newly printed code |
| Wallet waits for DUST | Seed needs unshielded NIGHT; first use registers UTXOs, then accrues |
| Job stalls near verification | Hosted indexer lag; the runtime retries ~2 minutes |
| Proof server won't stop | Only containers labelled `works.zkuat.runtime=true` are managed; it refuses to touch an unrelated `zkuat-proof-server` |

## Claim discipline

Midnight's stack moves fast and recalled knowledge about it is unreliable — training data on Compact
syntax, stdlib signatures, SDK APIs, and tooling flags is known to be wrong. Verify against the
installed toolchain (`compact check`, `npm view <pkg> version`) or the actual source before asserting.

Mark claims **VERIFIED** only with a recorded command and result. Everything else is a hypothesis, and
should say so.
