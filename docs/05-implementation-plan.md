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
| `contract/` | ✅ Built, 50 tests green — **but on schema v1.** Needs the v2 migration. Not deployed. |
| `collector/` | ⬜ |
| `anchor/`, `cli/` | ⬜ |
| `ui/` (vendor + buyer) | ⬜ |

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
├── contract/                  # Track A ✅ (needs v2 migration)
│   └── src/{audit_registry.compact,encoding.ts,witnesses.ts,test/}
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
| **A — Contract** | Schema v2 migration, both §20 policies, compliance records, deploy to testnet | — |
| **B — Collector + attestor** | Checks → canonical v2 evidence → signed bundle. **Fixture first, live CI second.** | A's v2 struct |
| **C — Anchor + CLI** | Sigstore verification, `attest(leaf)` submission, CLI proof path | A's generated types |
| **D — Vendor + buyer views** | Two routes, Lace wallet, in-browser proving, the asymmetry contrast | A's generated types |

### Unblocking rule

Track A publishes generated TypeScript types **first**, compiling with `--skip-zk` (seconds, versus
minutes for real proving keys). C and D build against those types immediately. Real keys get generated
once, later, **after** the v2 migration — the struct shape and tree depth are both baked into the key.

### Track A — v2 migration, then deploy

Migration checklist is in [04-contract-spec.md](04-contract-spec.md#migration-checklist). In order:

1. `Evidence` v2, `Policy` v2, `ComplianceRecord`. Bump `EVIDENCE_SCHEMA` to `zkaudit.evidence.v2`.
2. `claimBadge` → `proveCompliance` with four public inputs; add the **artifact-digest assert** (§39 #3).
3. `records` map + `recordKeyOf` pure circuit.
4. Register **both** §20 policies.
5. Fixtures and tests: the seven criteria still apply, plus artifact-digest mismatch must fail, and the
   privacy assertions must be re-run — **the public set grew, so the old "absent from transcript"
   assertions no longer cover the new fields.**
6. Generate real keys. Deploy. Record the address.

The struct change is mechanical; the risk is forgetting step 5.

### Track B — Collector + attestor

> **Two verified environment blockers — fix these first, they take minutes now and an hour at 23:00.**
>
> **VERIFIED** 2026-08-07:
>
> 1. **`gh` is not authenticated.** `gh auth status` → *"You are not logged into any GitHub hosts."*
>    Every `gh api` call fails until someone runs `gh auth login`. Do it in the terminal with
>    `! gh auth login` so the interactive flow lands in this session.
> 2. **`gh attestation` does not exist in the installed version.** `gh` is 2.45.0 (Ubuntu apt);
>    `gh attestation --help` → *`unknown command "attestation" for "gh"`*. The subcommand landed in
>    **2.49.0**. Any plan step that shells out to `gh attestation verify` — including Track C's
>    fallback — **does not work as-is.**
>
> Fix by installing current `gh` from GitHub's own apt repo (or `sudo snap install gh`, which ships
> 2.86), **or** skip it entirely and use `@sigstore/verify` in Node, which is the primary
> recommendation anyway. Prefer the library: one fewer moving part, and it is what `anchor/` needs regardless.

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

### Track C — Anchor + CLI

Verify with **`@sigstore/verify` (4.1.2)**. The `gh attestation verify` fallback the old plan suggested
is **not available** — see the Track B blockers above; the installed `gh` predates that subcommand. Do
not budget time on it without upgrading `gh` first.

**The security-critical check is that the OIDC subject repo matches the predicate repo** — without it,
repo A can attest for repo B and the whole trust chain is decorative.

CLI: `anchor`, `prove --policy bank-v1 --artifact <digest>`, `status --artifact <digest>`.

The anchor's receipt should record the **leaf index** so the prover can use `pathForLeaf(index, leaf)`
instead of the O(n) `findPathForLeaf`.

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
| Renaming the project after anchoring | Medium | Domain separators are commitment inputs. Settle the name or keep `zkaudit` internally. |
| **`gh` unauthenticated + too old for `attestation`** | **Certain (verified)** | `gh auth login`; use `@sigstore/verify` instead of `gh attestation verify`. See Track B. |

Testnet funding is the classic silent killer — it blocks nothing until it blocks everything at 23:00.

## Definition of done

- [ ] Contract on schema v2; artifact-digest binding present and tested
- [ ] Both §20 policies registered; **the same evidence proves against both**
- [ ] Compliance record written with correct vendor, product, artifact, policy version, timestamps
- [ ] Contract deployed to testnet, address recorded
- [ ] A signed v2 evidence bundle exists and verifies
- [ ] Anchor rejects a bundle whose OIDC repo ≠ predicate repo
- [ ] End-to-end: attest → anchor → prove → buyer reads the record
- [ ] Negative case demonstrable (non-compliant evidence → `false`, no revert)
- [ ] Vendor view shows private evidence labelled "PRIVATE — not written to Midnight"
- [ ] Buyer view shows result and requirement checklist, and **no private value anywhere**
- [ ] Privacy checklist in [02-threat-model.md](02-threat-model.md) confirmed against a real v2 tx
- [ ] README + **Apache 2.0 LICENSE** (mandatory for submission)
- [ ] Demo rehearsed three times, under 3 minutes
