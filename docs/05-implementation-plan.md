# 05 — Implementation Plan

**Deadline: 13:00 ART, Saturday 8 August 2026.** Roughly **21 hours** from this revision (15:45 ART
Friday), including sleep. Four people.

Track A is done. The plan below is reordered against [`Master-Doc.md`](../Master-Doc.md) §39, which
ranks priorities differently from the original plan — see [Priority inversion](#priority-inversion).

## Where we are

| Component | State |
|---|---|
| `docs/` | ✅ Realigned to the Master Doc |
| `app/` | ✅ Minimal `hello-world` scaffold (SDK 4.1.1), deps installed |
| `contract/` | ✅ **Schema v2, 87 tests green, real keys, deployed to local devnet.** Full attest → prove → read round trip works. |
| `collector/`, `attestor/` | ✅ **11 checks, DSSE signing, 165 tests green.** Four signed fixtures anchored and proven on the devnet. |
| `demo/fixtures/` | ✅ Committed and verifying |
| `.github/workflows/attest.yml` | ✅ Written, not green (private repo — attestations plan-gated). Nothing depends on it. |
| `anchor/`, `cli/` | ✅ **Trust boundary + `anchor`/`prove`/`status`, 12 tests.** Two fixtures anchored and proven end to end on the devnet. Sigstore path written, comparator tested, never run against a real Fulcio cert. |
| `ui/` (vendor + buyer) | ⬜ |

**Track C is done; Track D is unblocked twice over** — by A's generated types and now by B's signed bundles. `@zkuat/contract` exports the v2 encoding, both policies, and the
pure circuits that make the leaf, nullifier, and record key. Import them; do not reimplement.

## Priority inversion

Master Doc §39 orders implementation differently from the original plan, and the differences are not
cosmetic.

| Item | Original plan | §39 rank |
|---|---|---|
| Contract predicates over private evidence | Track A, core | **1** |
| Attestor-signed evidence | Track B, core | **2** |
| **Artifact digest binding** | absent | **3** |
| **Vendor UI showing private evidence** | cut item 5 | **4** |
| **Buyer UI showing result only** | cut item 4 | **5** |
| One working policy | core | 6 |
| Midnight proof submission | core | 7 |
| Compliance timestamp / history | absent | 8 |
| **Second policy over same evidence** | cut item 3 | **9** |
| **GitHub Actions integration** | Track B, core | **10** |
| Expiration | cut item 2 | 11 |

Two conclusions the team needs to accept explicitly:

**1. The two UIs are must-have, not polish.** §24: *"This is where the privacy value should be visually
obvious."* §28's demo is inherently two-window — buyer view, vendor view, back to buyer. A terminal
cannot show the information asymmetry that *is* the product. Without the views we assert selective
disclosure rather than demonstrate it.

**2. GitHub Actions integration can be a fixture; the UI cannot.** §39 ranking CI tenth says this
outright. A signed evidence fixture produced once by hand is indistinguishable, on stage, from one
produced by a live workflow — and infinitely more reliable. Live CI is a nice-to-have.

The original plan's instinct — *"the CLI is the demo of record because wallet wiring is the biggest
risk"* — was sound engineering and is still partly right. The resolution:

> **Keep a CLI that can execute the full proof path as a fallback. But build both views, and treat the
> vendor/buyer contrast as the deliverable.** If the browser dies at 12:40, the CLI proves the protocol
> works; the pitch then *describes* the asymmetry instead of showing it. That is a degraded demo, not a
> failed one.

## Target repo layout

Master Doc §40 suggests `/apps/vendor-web` + `/apps/buyer-web`, then notes a single app with `/vendor`
and `/buyer` routes is faster for a hackathon. **Take the single app.**

```
<repo-root>/
├── app/                       # scaffolded hello-world — starting point
├── contract/                  # Track A ✅ v2, tested, deployed to devnet
│   └── src/{audit_registry.compact,encoding.ts,witnesses.ts,test/,devnet/}
├── collector/                 # Track B — checks → canonical evidence
├── attestor/                  # Track B — normalize + sign  (§9)
├── anchor/                    # Track C — Sigstore verify + attest(leaf)
├── cli/                       # Track C — fallback proof path
├── ui/                        # Track D — /vendor and /buyer routes
├── demo/fixtures/             # signed evidence bundles — the safety net
├── .github/workflows/attest.yml
└── docs/
```

## Track assignments

| Track | Deliverable | Blocked by |
|---|---|---|
| **A — Contract** | ✅ Schema v2, both §20 policies, compliance records, real keys, devnet deploy | — |
| **B — Collector + attestor** | Checks → canonical v2 evidence → signed bundle. **Fixture first, live CI second.** | A's v2 struct |
| **C — Anchor + CLI** | Sigstore verification, `attest(leaf)` submission, CLI proof path | A's generated types |
| **D — Vendor + buyer views** | Two routes, Lace wallet, in-browser proving, the asymmetry contrast | A's generated types |

### Unblocking rule

Track A publishes generated TypeScript types **first**, compiling with `--skip-zk` (seconds, versus
minutes for real proving keys). C and D build against those types immediately. Real keys get generated
once, later, **after** the v2 migration — the struct shape and tree depth are both baked into the key.

### Track A — done through devnet deploy

Steps 1–5 of the old checklist are complete (2026-08-07): `Evidence` v2, `Policy` v2,
`ComplianceRecord`, `proveCompliance` with vendor/product/artifact binding, `records` + `history`, both
§20 policies, and 87 tests including rewritten privacy assertions. Details in
[04-contract-spec.md](04-contract-spec.md).

Step 6 is done too: **real proving keys generated** (~45s) and the contract **deployed to a local
devnet** with both policies registered. `npm run devnet:demo` runs the whole protocol with real ZK
proofs and prints the two-policy contrast. Setup on a fresh machine:
[08-local-setup.md](08-local-setup.md), verified end to end against a wiped chain.

What remains for Track A:

1. **Public testnet deploy** (preview/preprod) if the demo needs it — only the local devnet has been
   exercised. The CLI is devnet-only by design; `app/README.md` documents the multi-network flow.
2. **Pre-anchor demo data** so the pitch never depends on a live round trip.

Three things changed relative to the earlier plan, worth knowing before building against it:

- **Identity is bound in the evidence**, not just passed as a public input — `vendorId` and
  `productId` are struct fields the attestor signs, and the circuit asserts all three identity fields.
  Track B's canonical JSON therefore carries `vendor` and `product`.
- **`compliantCount` no longer exists.** `records` iterates, so an exact compliant count is a filter
  over it; a counter would double-count re-proofs of the same artifact.
- **The buyer view is not blocked on anything.** `records` and `history` both expose
  `[Symbol.iterator]` in the generated ledger reader — the open question about iteration is closed.

### Track B — done: fixtures, collector, attestor, workflow

> **Environment status, re-checked 2026-08-07 evening:**
>
> 1. ~~**`gh` is not authenticated.**~~ **RESOLVED.** `gh auth status` → logged in as `Rpetey317`.
>    Every `gh api` check in the collector works.
> 2. **`gh attestation` still does not exist in the installed version.** `gh` is 2.45.0 (Ubuntu apt);
>    the subcommand landed in **2.49.0**. Any step that shells out to `gh attestation verify` —
>    including Track C's fallback — **does not work as-is.**
>
> The collector routes around (2) with the REST endpoint
> `gh api repos/{o}/{r}/attestations/sha256:{digest}`, which works on 2.45 and 404s cleanly. Track C
> should use `@sigstore/verify` rather than upgrading `gh`: one fewer moving part, and it is what
> `anchor/` needs regardless.
>
> Also verified this session: the repo `Rpetey317/midnight-hack` is **private**, so GitHub artifact
> attestations are plan-gated and `actions/attest` may never go green here. Planned for — see
> [Track B status](#track-b--done-fixtures-collector-attestor-workflow).

**Done, 2026-08-07 evening.** `collector/`, `attestor/`, `demo/fixtures/`, and
`.github/workflows/attest.yml` all exist. 138 attestor tests and 27 collector tests green.

**Tracks C and D are unblocked.** Four signed bundles are committed and verified end to end against
the local devnet with real ZK proofs. The whole surface is two calls:

```typescript
import { loadBundle, bundleToPrivateState } from '@zkuat/attestor';
const { evidence, salt, leaf } = bundleToPrivateState(loadBundle('demo/fixtures/bank-only/bundle.json'));
```

Track C additionally wants `buildPredicate` / `assertNoEvidenceLeak`, and **must** pass
`trustedKeyIds` to `verifyBundle`. Details: [`../attestor/README.md`](../attestor/README.md).

| Fixture | bank-v1 | enterprise-v1 | Confirmed on-chain |
|---|---|---|---|
| `passes-both` | ✓ PASS | ✓ PASS | ✅ |
| `bank-only` | ✓ PASS | ✗ FAIL | ✅ **beat 5** |
| `enterprise-only` | ✗ FAIL | ✓ PASS | ✅ |
| `fails-both` | ✗ FAIL | ✗ FAIL | ✅ **beat 6** |

**Install order matters: `npm --prefix contract install` first.** `@zkuat/contract` is a `file:`
dependency, so npm symlinks it without installing *its* dependencies, and Node then resolves the
symlink to its real path and looks for `@midnight-ntwrk/compact-runtime` inside `contract/`. A
`postinstall` check in both packages says this out loud; without it the failure is a runtime
`ERR_MODULE_NOT_FOUND` several commands after the mistake. **Tracks C and D will hit this** — it is
invisible on any machine where Track A has ever run `npm install`, and only shows up on a fresh clone.

Four things the rest of the team needs to know:

1. **`contract/src/managed/audit_registry/contract/` is now committed** (140 KB of generated JS and
   `.d.ts`; keys and ZKIR stay ignored). Without it a fresh clone, a CI runner, and Track D's browser
   build cannot import `pureCircuits`. **Track A must re-commit it after any `.compact` change** —
   the attestor's fixture tests fail loudly if it drifts.
2. **`npm run devnet:prove -- --bundle <path>`** now takes a signed bundle, verifies it, and runs the
   full attest → prove → record round trip. That is the integration checkpoint, and it passes.
3. **Run `cd attestor && npm run fixtures:refresh` before the pitch.** Committed fixtures carry a
   pinned `generatedAt`, so they eventually render as EXPIRED in the buyer view. Refreshing also
   yields new leaves and nullifiers, which is how to rehearse more than once without hitting the
   replay guard.

The live workflow is written but **not green and not depended on** — §39 ranks CI tenth, and the repo
is private, where artifact attestations are plan-gated. The demo path uses committed fixtures.

<details>
<summary>Original plan for this track, kept for the check table</summary>

**Produce a signed v2 fixture in the first hour.** Everything downstream unblocks on the existence of a
valid signed evidence bundle, and nothing downstream cares whether a workflow or a human produced it.

Then checks, in value order for the §20 policies:

| Field | Source | Notes |
|---|---|---|
| `artifactDigest` | `sha256sum` of the built artifact | Trivial and mandatory |
| `criticals` / `highs` | `npm audit --json` or `semgrep --config auto --json` | |
| `kev` | cross-reference advisories against the CISA KEV catalogue | JSON feed; a set intersection |
| `forbiddenDeps` | dependency list ∩ a prohibited-package list | The list is a demo input; keep it small and visible |
| `branchProtected`, `mfaRequired` | `gh api` repo/org settings | |
| `buildProvenanceVerified` | `gh attestation verify` exit code | The §8 hook |
| `ciGreen` | Actions conclusion on HEAD | |
| `coverage` | existing report if present | **Otherwise stub. Do not build a coverage pipeline** (§18) |

Then `attestor/`: validate the CI inputs, normalize to canonical v2 JSON, sign. Then — **only if time
remains** — `.github/workflows/attest.yml` doing it live, with predicate `{ leaf, repo, sha, schema }`
and evidence+salt as a **private** artifact.

The predicate carries the leaf only. Putting evidence there publishes findings to Rekor — see
[02-threat-model.md](02-threat-model.md).

</details>

### Track C — done: anchor + CLI

**Done, 2026-08-07 evening.** `anchor/` and `cli/` exist; 12 anchor tests green; two fixtures anchored
and proven end to end against the local devnet with real ZK proofs. Details in
[`../anchor/README.md`](../anchor/README.md) and [`../cli/README.md`](../cli/README.md).

`anchor/` is the trust boundary — the only component deciding whether a leaf deserves to be on chain.
Four checks in cost order: trusted attestor keyid → predicate leaks nothing → Sigstore repo binding →
one anchor per `(repo, commit)`. Then `attest(leaf)`. It stays deliberately small, because
"auditable in an afternoon" is the stated mitigation for [02-threat-model.md](02-threat-model.md) §3.

`cli/` is `zkuat anchor | prove | status`. Exit codes **0 PASS · 1 FAIL · 2 circuit rejected** — the
difference between 1 and 2 matters, because a `false` record is a legitimate published outcome while a
rejected call writes nothing.

The receipt records the **leaf index**, read as `firstFree()` immediately before the insert and then
confirmed with `pathForLeaf`. That is the first use of `pathForLeaf` in the project; verified against a
nonzero index, so it is not passing by luck at zero. A failed confirmation records `-1` and the prover
falls back to `findPathForLeaf`.

Three things the rest of the team needs to know:

1. **No package outside `contract/` may depend on `@midnight-ntwrk/*`.** A second copy of the SDK's
   WASM module means a second class registry, and the first circuit call dies with `expected instance
   of StateValue` — the same failure the `overrides` block guards against, but across `node_modules`
   trees, where an override cannot reach. `anchor/` and `cli/` reach the SDK through the new
   `contract/src/devnet/sdk.ts`, which re-exports the handful of symbols they need so the specifiers
   resolve from `contract/node_modules`. **Track D will hit this in the browser build too.**
   Check with `find node_modules -name onchain-runtime-v3` — it must print nothing outside `contract/`.
2. **Install order is now four deep:** `contract → attestor → anchor → cli`. Each `postinstall`
   guard names the ones below it.
3. **All four fixtures share one commit**, so the one-anchor-per-`(repo, commit)` rule rejects the
   second and later ones under the same `--repo`. Give each a distinct `--repo`, or pass `--force`.

**Sigstore, honestly.** `@sigstore/verify` 4.1.2 is wired — signature → Fulcio → Rekor — plus a
leaf-binding check so a genuine attestation for a *different* artifact cannot authorise anchoring.
The repo comparator and the v1/v2 certificate-extension decoding are unit-tested. But the repo is
private, `actions/attest` has never gone green, and every fixture carries `"sigstore": null`, so the
full-chain path **has never run against a real Fulcio certificate**. An unsigned bundle requires
`--allow-unsigned` and prints `⚠ repo binding NOT CHECKED`; it is never silently accepted.

`gh attestation verify` remains unavailable — `gh` is 2.45.0, the subcommand landed in 2.49.0.

### Track D — Vendor + buyer views

**Scaffold `create-mn-app --template leaderboard` separately as a reference.** It ships React + Lace +
in-browser ZK proving — precisely our wiring. Lift from it; do not build wallet integration from first
principles with this clock running.

**Vendor route** (§24) — the private side:
- Product and artifact selector, showing the digest and commit
- **Private evidence panel**, every field visible, labelled **"PRIVATE — not written to Midnight"**.
  This label is the demo. Make it impossible to miss.
- Policy list with each policy's requirements
- Generate-proof, then "✓ Proof accepted · valid until …"

**Buyer route** (§25) — the public side:
- Vendor, product, artifact digest, policy, status, evidence date, valid-until
- Requirement checklist rendered as ✓ lines — **never the underlying values**
- Compliance timeline with **COMPLIANT / EXPIRED / NO CURRENT PROOF** (§36)

The two routes side by side in one browser is the entire pitch. Build them to be shown together.

Read the iteration caveat in [04-contract-spec.md](04-contract-spec.md#open-question-that-gates-the-buyer-history-view)
before designing the timeline — `Map` may not expose an iterator, in which case the timeline is built
from per-digest point lookups.

## Timeline

| Window (ART) | Milestone |
|---|---|
| → 17:00 | **A: v2 struct + artifact binding, types published.** B: signed v2 fixture exists. D: `leaderboard` scaffolded and running. |
| 17:00 → 20:00 | A: records + both policies + tests green. C: anchor verifies a real bundle. D: vendor route rendering private evidence. |
| 20:00 → 21:00 | Dinner + **integration checkpoint 1** — does a fixture leaf reach the contract and prove? |
| 21:00 → 01:00 | Real keys, testnet deploy, end-to-end proof. D: buyer route. **Pre-anchor demo data.** |
| 01:00 → 09:00 | Sleep, staggered. **The demo path must work before anyone sleeps.** |
| 09:00 → 11:30 | Second policy against the same evidence (§39 #9). Timeline view. **Rehearse ×3.** README + LICENSE. |
| 11:30 → 13:00 | Freeze. No new features. Submit. |

### Two hard rules

1. **Working demo before sleep.** A half-integrated system at 01:00 is a failed submission at 13:00.
   Cut scope at midnight, not at noon.
2. **Pre-anchor everything before the pitch.** Live-anchoring on stage adds a network round-trip and a
   failure mode for zero narrative gain.

## Cut list, in order

Reordered per §39. Drop without debate when behind.

1. Live GitHub Actions workflow → use the signed fixture (§39 ranks CI tenth)
2. `coverage` check → stub a constant (§18 — it is not a flagship threshold anyway)
3. `mfaRequired` / `branchProtected` collectors → constants from the fixture
4. On-chain freshness enforcement → `validUntil` in the record, reader judges (already the MVP path)
5. Buyer compliance *timeline* → keep current status only
6. CLI polish → one hard-coded happy path
7. Live anchoring during the pitch → pre-anchored

**Do not cut:** the artifact-digest binding, the second policy, the vendor private-evidence panel, or
the buyer result-only view. Those four are what distinguish this from "hide a CI report" — they are
§39 items 3, 4, 5, and 9.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| v2 migration breaks the green test suite | **High** | It will — the privacy assertions must change. Budget an hour, not ten minutes. |
| Schema drift between tracks | Low now | `pureCircuits` makes it structurally impossible. Preserved through v2. |
| Wallet/Lace wiring eats the evening | **High** | Crib from `leaderboard`; CLI is the fallback proof path |
| Proving key generation slow | Medium | `--skip-zk` during dev; generate real keys once, **after** v2 |
| Testnet funding / DUST | Medium | Get a funded wallet **now**, not at 23:00 |
| `Map`/`List` iteration absent | Medium | Buyer timeline falls back to point lookups — decide early |
| ~~Renaming the project after anchoring~~ | Closed | Name settled as `zkuat` before anything was anchored. Domain separators are commitment inputs; changing them now would invalidate every record. |
| **`gh` unauthenticated + too old for `attestation`** | **Certain (verified)** | `gh auth login`; use `@sigstore/verify` instead of `gh attestation verify`. See Track B. |

Testnet funding is the classic silent killer — it blocks nothing until it blocks everything at 23:00.

## Definition of done

- [ ] Contract on schema v2; artifact-digest binding present and tested
- [ ] Both §20 policies registered; **the same evidence proves against both**
- [ ] Compliance record written with correct vendor, product, artifact, policy version, timestamps
- [ ] Contract deployed to testnet, address recorded
- [ ] A signed v2 evidence bundle exists and verifies
- [ ] Anchor rejects a bundle whose OIDC repo ≠ predicate repo — **partial, deliberately unticked.**
  The comparator is written and unit-tested (mismatched repo, mismatched commit, absent claim, both
  certificate-extension encodings); the full chain has never run against a real Fulcio certificate,
  because the repo is private and every fixture is `sigstore: null`. Not ticked without a certificate.
- [x] End-to-end: attest → anchor → prove → buyer reads the record — `zkuat anchor` → `prove` →
  `status`, two fixtures, real ZK proofs, cross-checked against `devnet:inspect`
- [x] Negative case demonstrable (non-compliant evidence → `false`, no revert) — `bank-only` against
  `enterprise-v1` exits 1 with a record reading `compliant: false`
- [ ] Vendor view shows private evidence labelled "PRIVATE — not written to Midnight"
- [ ] Buyer view shows result and requirement checklist, and **no private value anywhere**
- [ ] Privacy checklist in [02-threat-model.md](02-threat-model.md) confirmed against a real v2 tx
- [ ] README + **Apache 2.0 LICENSE** (mandatory for submission)
- [ ] Demo rehearsed three times, under 3 minutes
