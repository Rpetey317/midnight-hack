# 08 — Local Setup

> **Audience: an agent or engineer setting this repo up on a fresh machine.**
> Follow top to bottom. Every command here was executed on 2026-08-07 and the
> stated output is what actually happened, not what should happen.
>
> End state: the contract compiled with real proving keys, deployed to a local
> devnet, both buyer policies registered, and a full attest → prove → read
> round trip producing real ZK proofs.

## 0. What you are setting up

```
midnight-project/
├── contract/        ← everything below runs from here
│   └── src/devnet/  ← deploy, demo, inspect, prove
└── app/             ← owns docker-compose.yml (the devnet). Nothing else needed from it.
```

`contract/` is self-contained apart from the devnet compose file, which lives in
`app/`. The `devnet:*` npm scripts `cd ../app` for you.

## 1. Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Node | **22.20.0** | `>=22` required — the package sets `engines`. |
| npm | 11.12.1 | Ships with Node 22. |
| Docker | 29.4.2 | With Compose v2 (`docker compose`, not `docker-compose`). |
| Docker Compose | 5.1.3 | |
| Compact dev tools | **0.5.1** | The `compact` CLI. |
| Compact compiler | **0.31.1** | Installed *through* the CLI, see below. |

Also: **~4 GB free disk** (three container images plus ~16 MB of proving keys),
and enough RAM to run three containers. Verified on Linux x86_64
(6.8.0 kernel, 16 GB).

### Install the Compact toolchain

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

Then make sure `~/.local/bin` is on `PATH` and install the compiler itself:

```bash
compact update            # downloads the latest compiler toolchain
compact check             # → "Up to date -- 0.31.1"
compact --version         # → "compact 0.5.1"   (the CLI, not the compiler)
```

`compact --version` reports the **dev tools** version and `compact check` reports
the **compiler** version. They are different numbers; do not confuse them when
debugging a version mismatch.

## 2. Install dependencies

```bash
cd contract
npm install
```

### ⚠️ Do not remove the `overrides` block from `package.json`

```json
"overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }
```

**Without it, every circuit call fails at runtime** with:

```
Unexpected error executing scoped transaction '<unnamed>':
  Error: expected instance of StateValue
    at new ChargedState (.../midnight-js-protocol/node_modules/
                          @midnight-ntwrk/onchain-runtime-v3/...)
```

Cause: `@midnight-ntwrk/midnight-js-protocol@4.1.1` pins
`onchain-runtime-v3` to **exactly 3.0.0**, while `@midnight-ntwrk/compact-runtime@0.16.0`
declares `^3.0.0`, which now floats to **3.1.0**. npm installs both — one at the
top level and one nested — and each carries its own WASM instance. A `StateValue`
built by one fails `instanceof` inside the other, so contract *deployment*
succeeds (it never crosses the boundary) and the first *circuit call* dies.

Verify a single instance after installing:

```bash
find node_modules -name onchain-runtime-v3 -type d
# must print exactly one path
```

This affects `app/` identically, and will affect any package that combines
`compact-runtime` with the Midnight.js SDK. Apply the same override there.

## 3. Compile the contract

```bash
npm run compile        # --skip-zk: seconds, no proving keys
npm run typecheck
npm test               # 87 tests
```

`npm run compile` must run before `npm test` — the tests import the compiler's
generated output from `src/managed/`, which is gitignored.

Expected: compile exits 0, `tsc` silent, **87 passed**.

## 4. Generate real proving keys

Deployment needs them; a `--skip-zk` build has no `keys/` directory and
`deploy.ts` refuses to run.

```bash
npm run compile:keys   # ~45s on the reference machine
```

Produces, under `src/managed/audit_registry/keys/`:

| File | Size |
|---|---|
| `proveCompliance.prover` | ~10 MB |
| `attest.prover` | ~2.8 MB |
| `registerPolicy.prover` | ~2.8 MB |
| `*.verifier` | ~2 KB each |

**Regenerate these whenever the contract changes.** The Merkle tree depth (16)
and the `Evidence` struct shape are both baked into the key.

## 5. Start the devnet

```bash
npm run devnet:up      # cd ../app && docker compose up -d --wait
```

Three services, all pinned — do not bump them casually, `app/docker-compose.yml`
documents why each pin exists:

| Service | Image | Port |
|---|---|---|
| node | `midnightntwrk/midnight-node:1.0.0` | 9944 |
| indexer | `midnightntwrk/indexer-standalone:4.3.3` | 8088 |
| proof-server | `midnightntwrk/proof-server:8.1.0` | 6300 |

Confirm all three are healthy before continuing:

```bash
cd ../app && docker compose ps
# STATUS column must read "Up ... (healthy)" for all three
```

First run pulls ~2 GB of images. The node's healthcheck waits for **block 1**,
not just for HTTP — the indexer exits 1 if it connects at genesis, so
`--wait` gating on that is deliberate.

## 6. Deploy

```bash
npm run devnet:deploy
```

This derives the genesis-seed wallet, registers NIGHT UTXOs for DUST, deploys the
contract, and registers **both** buyer policies. It writes
`contract/.zkuat-devnet.json` (gitignored) with the contract address.

Expected tail:

```
  ✅ Deployed at 6df33c9ffd3c3c55fb381262cdf918c2cde4ee3f271166ba8b3a804bd0a07f0a
─── Register buyer policies ──────────────────────────────
  bank-v1 (8eb066f1ff82c34b…)
    registered.
  enterprise-v1 (65bb1b975c971159…)
    registered.
```

The address differs on every deploy. The two policy ids are deterministic and
will match exactly — they are `stringIdOf` of the slug.

> ⚠️ **LOCAL DEVNET ONLY.** The deploy uses the well-known genesis seed
> `0000…0001` from the node's `dev` chain preset so the pre-minted NIGHT is
> immediately spendable. Anyone running this devnet has full access to funds at
> that seed. Never point these scripts at preview, preprod, or mainnet.

## 7. Run the end-to-end demo

```bash
npm run devnet:demo
```

Runs the whole protocol with real ZK proofs: attestor anchors a blinded
commitment, the vendor proves compliance locally against **both** policies, and
the buyer reads the public records.

The headline is step 3 — one evidence bundle, two independently-defined buyer
policies, two different verdicts:

```
  proveCompliance against bank-v1...        → PASS
  proveCompliance against enterprise-v1...  → FAIL
```

(The fixture carries one forbidden dependency: the bank policy does not check
for them, the enterprise policy does.)

Step 5 then confirms mechanically that the commit, attestor, salt, evidence
commitment, and every finding count are absent from public ledger state.

Re-running is safe: the fixture stamps `generatedAt` with the current time, so
each run produces a fresh leaf and a fresh nullifier. It overwrites the current
records and appends two timeline entries.

## 8. Testing it manually

`devnet:demo` replays one fixed scenario. These two tools let you drive it yourself.

### `npm run devnet:inspect` — the buyer's view

Read-only. No wallet, no sync, no transaction — a single GraphQL query, back in about a second. Run it
at any point to see **exactly what an outside observer can learn**: registered policies and their
thresholds, current compliance records, the timeline, and the attestation/nullifier counts.

Use it as the before/after around every experiment below.

### `npm run devnet:prove` — drive your own evidence

Attests a fresh evidence bundle you describe on the command line, then proves it against one policy.
Each invocation is a complete round trip with a real ZK proof.

```bash
npm run devnet:prove -- --help          # full flag list
```

A fresh random salt is generated per run, so re-running the same facts is always safe — you get a new
leaf and a new nullifier rather than `already proven`.

#### Experiments worth running, in order

**1. The happy path.** Passes both policies.

```bash
npm run devnet:prove -- --policy bank-v1
npm run devnet:prove -- --policy enterprise-v1
```

**2. The two-policy contrast — the demo's core claim.** *One* set of facts, two buyers, two verdicts.

```bash
npm run devnet:prove -- --policy bank-v1        --forbidden-deps 1   # → PASS
npm run devnet:prove -- --policy enterprise-v1  --forbidden-deps 1   # → FAIL
```

The bank policy does not check forbidden dependencies; the enterprise policy caps them at zero. Now
the mirror image — six highs, which the bank caps at five and the enterprise ignores entirely:

```bash
npm run devnet:prove -- --policy bank-v1        --highs 6   # → FAIL
npm run devnet:prove -- --policy enterprise-v1  --highs 6   # → PASS
```

**3. Every predicate, one at a time.** Each of these flips exactly one fact:

```bash
npm run devnet:prove -- --criticals 1                          # both policies: FAIL
npm run devnet:prove -- --kev 1                                # bank: FAIL
npm run devnet:prove -- --no-provenance                        # both: FAIL
npm run devnet:prove -- --policy enterprise-v1 --no-branch-protected   # FAIL
```

**4. Failure is recorded, not hidden.** A `FAIL` still writes a public record with
`compliant: false` — that is what gives the buyer NOT COMPLIANT as distinct from NO CURRENT PROOF.

```bash
npm run devnet:prove -- --criticals 1
npm run devnet:inspect        # the record now reads ✗ NOT COMPLIANT
```

**5. Circuit rejections, which are different from `FAIL`.** These fire an `assert` *before* the
predicate is evaluated, so **no record is written at all** and the tool prints `⛔ REJECTED`:

```bash
npm run devnet:prove -- --valid-days 400              # "validity window exceeds policy"
npm run devnet:prove -- --claim-vendor globex-corp    # "vendor mismatch"
npm run devnet:prove -- --claim-product other-thing   # "product mismatch"
```

The `--claim-*` flags are the point here. `--vendor` changes the identity in **both** the evidence and
the public input, so they stay consistent and it simply passes — that is not a test of anything.
`--claim-vendor` changes only what is asserted *publicly*, leaving the evidence signed for the real
vendor, which is exactly the attack the binding exists to stop: filing a record under a name the
attestor never signed. The tool prints the deliberate mismatch before submitting so it is obvious what
is being exercised.

Confirm with `devnet:inspect` that nothing changed.

**6. Continuous compliance.** Prove the same artifact and policy twice. The current record is
*replaced* by the fresher one, while the timeline keeps both entries:

```bash
npm run devnet:prove -- --policy bank-v1
npm run devnet:inspect                    # note "Current records" vs "Timeline" counts
npm run devnet:prove -- --policy bank-v1
npm run devnet:inspect                    # records unchanged in count; timeline grew
```

**7. Independent artifacts.** A different digest is a different record key:

```bash
npm run devnet:prove -- --artifact $(printf 'ab%.0s' {1..32})
npm run devnet:inspect                    # two artifacts now tracked separately
```

#### What to look for

| Claim | How you confirm it manually |
|---|---|
| Findings stay private | `devnet:inspect` never shows a count, a dependency fact, or a config boolean |
| Evidence is reusable | Same facts, two policies, two independent verdicts (experiment 2) |
| The protocol can say no | Experiment 3 — a policy that always passes proves nothing |
| Identity is bound, not asserted | Experiment 5 — `--claim-vendor globex-corp` is rejected outright |
| Proofs are time-bound | Records carry evidence date and expiry; `--valid-days 400` is rejected |

Reset to the canonical demo state at any time with `npm run devnet:demo`.

## 9. Verify the whole thing from scratch

```bash
cd contract
npm run devnet:reset      # docker compose down -v && up -d --wait
npm run clean
npm install
npm run compile:keys
npm run typecheck && npm test
npm run devnet:deploy
npm run devnet:demo
```

`devnet:reset` destroys all chain volumes, so the previous deployment address
becomes meaningless — delete `.zkuat-devnet.json` if a stale one confuses you.

## Troubleshooting

Every entry below is a failure actually encountered, not a hypothetical.

| Symptom | Cause | Fix |
|---|---|---|
| `Error: expected instance of StateValue` on the first circuit call | Two `onchain-runtime-v3` WASM instances | The `overrides` block — see §2. `rm -rf node_modules package-lock.json && npm install`. |
| `❌ No proving keys found` | Only `--skip-zk` output exists | `npm run compile:keys` |
| `❌ Proof server not responding on :6300` | Devnet down, or proof-server still starting | `npm run devnet:up`, then `docker compose ps` until healthy |
| `Genesis-seed wallet has zero NIGHT` | Chain state predates the `dev` preset mint, or a partial volume | `npm run devnet:reset` |
| `Insufficient Funds` / `Not enough Dust` | Wallet DUST projection leads the next block's timestamp | Already handled — `withDustRetry` waits and retries up to 20×. If it exhausts, the devnet is not producing blocks; check `docker compose logs node`. |
| `InputsSignaturesLengthMismatch` (custom error 192) | DUST registration double-signed | Do **not** call `signRecipe` after `registerNightUtxosForDustGeneration` — its callback already signs. |
| `RPC-CORE: ... disconnected from ws://127.0.0.1:9944` during sync | Normal | Cosmetic. The wallet reconnects; ignore it. |
| Tests fail after changing the `.compact` file | Stale generated output | `npm run compile` before `npm test` |
| `leaf not found in the attestations tree` in the demo | Indexer lagging the node | Re-run; if persistent, `npm run devnet:reset` |

### Reading logs

```bash
cd app
docker compose logs -f node          # block production
docker compose logs -f indexer       # GraphQL indexing
docker compose logs -f proof-server  # proof generation
```

## What is NOT set up here

- **Public testnet** (preview/preprod). `src/devnet/config.ts` is devnet-only by
  design. `app/README.md` documents the multi-network flow, including faucets, if
  you need it.
- **`gh` CLI.** Track B needs it and there are two verified blockers — it is
  unauthenticated, and `gh attestation` does not exist before 2.49.0. See
  [05-implementation-plan.md](05-implementation-plan.md).
- **The vendor and buyer UIs.** Track D.

## Command reference

| Command | What it does |
|---|---|
| `npm run compile` | Compile `--skip-zk` — fast, no proving keys |
| `npm run compile:keys` | Compile with real proving keys (~45s) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 87 simulator tests |
| `npm run clean` | Remove `src/managed/` |
| `npm run devnet:up` / `:down` | Start / stop the devnet |
| `npm run devnet:reset` | Destroy volumes and restart clean |
| `npm run devnet:deploy` | Deploy + register both policies |
| `npm run devnet:demo` | Full attest → prove → read round trip (the canned scenario) |
| `npm run devnet:inspect` | Read-only public ledger view — instant, no wallet |
| `npm run devnet:prove -- --help` | Attest + prove your own evidence bundle |
