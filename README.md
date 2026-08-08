# zkuat — Privacy-Preserving Software Assurance

*Hack Buenos Aires 2026 · Midnight Network*

## What this is

Buyers publish machine-verifiable security policies. Vendors prove that a **specific software artifact**
satisfies those policies using **authenticated private evidence** — without handing over the SBOM, the
CVE list, the dependency tree, or the repository configuration.

The same evidence can be proven against **different buyers' policies** with no additional disclosure, and
Midnight keeps an independently verifiable, time-bound history of compliance.

A buyer learns:

```
Product          PaymentEngine
Artifact         sha256:ABC...
Policy           ACME Bank Procurement v3
Status           ✓ SATISFIED
Evidence date    2026-08-07
Valid until      2026-09-07
```

A buyer does **not** learn exact vulnerability counts, specific CVEs, affected packages, internal
package names, repository configuration, or MFA statistics.

> **Buyers define what they need to know. Vendors prove it without revealing everything they know.**

## Why it matters

Software procurement already runs on security assurance — NIST's SSDF exists partly so acquirers can
communicate requirements to suppliers, and the OpenSSF OSPS Baseline (published version 2026.02.19)
defines versioned controls for exactly this. Today satisfying a buyer means handing over the whole
security dossier, once per customer. **The buyer needed a handful of facts and received the entire attack
surface.**

The two properties that make this more than "hide a CI report":

1. **Evidence is reusable.** The attestor establishes *facts*; each buyer defines its own
   *requirements*. One scan, many independently-defined policies — the scanner never needs to know what
   any buyer will ask.
2. **Compliance is continuous.** Every proof is time-bound. A new CVE tomorrow doesn't falsify
   yesterday's proof; it expires it. Fresh evidence produces a fresh proof.

## Start here

**[`docs/Master-Doc-v2.md`](docs/Master-Doc-v2.md)** is the project's source of truth.
[`docs/Master-Doc.md`](docs/Master-Doc.md) is the superseded v1, kept because the design docs cite it
heavily — a bare **§N** in `docs/` means v1, **v2 §N** means v2.
**[docs/](docs/README.md)** is the design documentation derived from both.

Fastest path for a new team member:
1. [docs/00-overview.md](docs/00-overview.md) — the idea, the actors, why it needs Midnight
2. [docs/03-evidence-schema.md](docs/03-evidence-schema.md) — the integration contract
3. [docs/09-master-doc-v2-delta.md](docs/09-master-doc-v2-delta.md) — where v2 and the code differ
4. [docs/05-implementation-plan.md](docs/05-implementation-plan.md) — your track

## Repo state

| Path | Status |
|---|---|
| `docs/` | ✅ Realigned to `Master-Doc-v2.md` |
| `app/` | ✅ Minimal `hello-world` scaffold (SDK 4.1.1), deps installed |
| `contract/` | ✅ **v2, 87 tests, real keys, deployed to local devnet.** Full attest → prove → read round trip. |
| `collector/`, `attestor/` | ✅ **11 checks, DSSE-signed bundles, 186 tests.** Four signed fixtures anchored and proven on the devnet with real ZK proofs. Plus the v2 GitHub-evidence adapter. |
| `demo/fixtures/` | ✅ Committed, verifying, and consumable by `--bundle` |
| `.github/workflows/attest.yml` | ✅ **The Master-Doc-v2 §4 evidence job** — dispatch → audit + lint + build → `npm pack` digest → `evidence.json` artifact. The app dispatches it by name. |
| `anchor/`, `cli/` | ✅ **Trust boundary + `anchor`/`prove`/`status`, 12 tests.** Two fixtures anchored and proven on the devnet with real ZK proofs; Sigstore repo binding written and unit-tested, never exercised against a real Fulcio cert (the repo is private). |
| `ui/` (vendor + buyer) | 🟡 Four routes, Supabase GitHub auth, live workflow dispatch → artifact download. **Proving is simulated; the verifier view reads fixtures, not the chain.** |

Try the whole thing without a chain:

```bash
cd attestor && npm install && npm run verify -- \
  ../demo/fixtures/bank-only/bundle.json --trust ../demo/keys/zkuat-attestor-v1.pub.json
```

Then with real ZK proofs — the same signed bundle against two buyer policies:

```bash
cd contract && npm run devnet:up && npm run devnet:deploy
npm run devnet:prove -- --bundle ../demo/fixtures/bank-only/bundle.json --policy bank-v1        # PASS
npm run devnet:prove -- --bundle ../demo/fixtures/bank-only/bundle.json --policy enterprise-v1  # FAIL
npm run devnet:inspect
```

### Docs and code are aligned

`contract/` was originally built against an earlier framing — an *anonymous repo-badge* protocol — and
migrated to the Master Doc's *identified artifact-assurance* model on 2026-08-07. Schema v2 carries the
mandatory `artifactDigest`, and vendor and product identity are bound in the evidence rather than merely
asserted by the prover.

**[docs/07-alignment-delta.md](docs/07-alignment-delta.md) records every gap and its resolution.** The
two still open are scope decisions, not code: UI priority and standards grounding.

`Master-Doc-v2.md` then **simplified** the trust model rather than redirecting it: GitHub Actions is
taken as the trusted evidence environment, and the Sigstore/attestor-key machinery becomes optional
(v2 §10) rather than wrong — v2 §12 lists it as the intended upgrade. Both paths are live and produce
the same report type. **[docs/09-master-doc-v2-delta.md](docs/09-master-doc-v2-delta.md)** is that
register, including which facts the live path cannot measure.

Real proving keys are generated and the contract runs on a local devnet — `npm run devnet:demo`
executes the whole protocol with real ZK proofs. Setting this up on another machine:
**[docs/08-local-setup.md](docs/08-local-setup.md)**, which was verified by running it end to end
against a wiped chain.

## Integration surface

`contract/` exports the commitment and nullifier derivations as ordinary TypeScript functions, compiled
from the same Compact source the circuit runs — so the leaf you build cannot disagree with the leaf the
circuit checks.

```typescript
import { encodeEvidence, pureCircuits, recordKey, POLICY_BANK_ID } from '@zkuat/contract';

const evidence = encodeEvidence(canonicalJson);
const leaf     = pureCircuits.leafOf(evidence, salt);          // the attestor anchors this
const nul      = pureCircuits.nullifierOf(leaf, POLICY_BANK_ID);
const key      = recordKey(canonicalJson.artifactDigest, 'bank-v1');  // the buyer's lookup
```

Do not reimplement any of that. See [docs/03-evidence-schema.md](docs/03-evidence-schema.md).

```bash
cd contract
npm install && npm run compile:keys      # real proving keys, ~45s
npm run devnet:up && npm run devnet:deploy && npm run devnet:demo
```

> **Heads-up for Tracks C and D:** `contract/package.json` carries an `overrides` block pinning
> `@midnight-ntwrk/onchain-runtime-v3`. Without it the SDK installs two incompatible WASM runtimes and
> **every circuit call fails** with `expected instance of StateValue` — deployment succeeds, so the
> failure lands later than you would expect. Copy the override into any package that combines
> `compact-runtime` with Midnight.js. Details in [docs/08-local-setup.md](docs/08-local-setup.md).

## Toolchain

Verified in this environment on 2026-08-07:

| Component | Version |
|---|---|
| Compact compiler | 0.31.1 |
| Compact dev tools | 0.5.1 |
| `create-mn-app` | 0.5.0 |
| Midnight JS SDK | 4.1.1 |
| Node | 22.20.0 |
| Docker | 29.4.2 |
| `gh` | 2.45.0 — see caveats below |

One environment gotcha still open, and one now closed:

- ~~`gh` is not authenticated.~~ **Resolved** — the collector's `gh api` checks work.
- **`gh attestation` does not exist at 2.45.0** — the subcommand landed in 2.49.0. The collector
  routes around it with the REST endpoint `gh api repos/{o}/{r}/attestations/sha256:{digest}`, which
  works on 2.45. Track C uses `@sigstore/verify` in Node rather than upgrading `gh` — see
  [anchor/README.md](anchor/README.md) for what that path does and does not currently prove.

No proof server is running locally (`:6300` is closed). `app/` brings one up via
`docker compose`.

## Design decision worth knowing up front

GitHub attestations are Sigstore/DSSE — ECDSA over **P-256**. Compact's only elliptic-curve primitives
are **Jubjub**, the proof system's embedded curve, and there is no signature-verification primitive at
all. Verifying P-256 in-circuit means non-native field arithmetic: research-grade, not a weekend.

So Sigstore verification runs **off-chain** and only the commitment is anchored. The trust root stays
GitHub's OIDC identity rather than a key we invented — which is also why we don't simply switch the
attestor to a Jubjub key we could verify in-circuit: that would relocate trust, not reduce it.

Full reasoning and residual assumptions in [docs/02-threat-model.md](docs/02-threat-model.md).

## Naming

Settled: **zkuat**. It is baked into the contract's domain separators, which are commitment inputs:

```compact
pad(32, "zkuat:proof:nul:")
pad(32, "zkuat:record:key:")
pad(32, "zkuat:anchor:pk:")
```

Renaming after the first real anchor would change every nullifier and invalidate every compliance
record. Nothing has been anchored yet, so this was free to settle; it is not free afterwards.

## Licence

**Apache 2.0** — see [LICENSE](LICENSE).
