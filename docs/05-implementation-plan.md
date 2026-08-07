# 05 — Implementation Plan

**Deadline: 13:00 ART, Saturday 8 August 2026.** Roughly 20 hours from the Friday afternoon start,
including sleep. Four people. This plan is built around that, not around what would be nice.

## Target repo layout

npm workspaces monorepo:

```
<repo-root>/
├── app/                       # scaffolded hello-world (SDK 4.1.1) — starting point
├── contract/                  # Track A
│   └── src/
│       ├── audit_registry.compact
│       ├── witnesses.ts
│       └── test/audit_registry.test.ts
├── collector/                 # Track B
│   └── src/
│       ├── checks/{ci,sast,deps}.ts
│       ├── canonical.ts       # ◄── single source of truth for encoding
│       └── index.ts
├── anchor/                    # Track C
│   └── src/{verify-attestation.ts,anchor.ts}
├── cli/                       # Track C — the demo of record
├── ui/                        # Track D
├── .github/workflows/attest.yml
└── docs/
```

## Track assignments

| Track | Owner | Deliverable | Blocked by |
|---|---|---|---|
| **A — Contract** | | `.compact` + `witnesses.ts` + simulator tests, deployed to testnet | schema freeze |
| **B — Collector + CI** | | checks + `canonical.ts` + `attest.yml` producing a real signed attestation | schema freeze |
| **C — Anchor + CLI** | | Sigstore verification, tx submission, `<PROJECT>` CLI end-to-end | schema, A's generated types |
| **D — dApp** | | React prover + verifier views, Lace wallet, in-browser proving | A's generated types |

### Unblocking rule

Track A publishes generated TypeScript types **first**, compiling with `--skip-zk` (seconds, versus
minutes for real proving keys). C and D build against those types immediately. Real keys get generated
once, later, when the contract stops changing.

### Track A — Contract

Start from the verified source in [04-contract-spec.md](04-contract-spec.md); it already compiles.
Remaining work: add owner-only access control on `attest` / `registerPolicy` using the sealed-ledger
pattern, write `witnesses.ts`, write the seven simulator tests. **Test 7 (historic root) is the one that
validates the core design — do not skip it.**

### Track B — Collector + CI

Checks, GitHub-only per the scoping decision:

| Check | Source | Notes |
|---|---|---|
| `ciGreen` | Actions conclusion on HEAD | via `gh api` or octokit |
| `criticals` / `highs` | `semgrep --config auto --json` | fall back to eslint if semgrep is slow to wire |
| `vulnDeps` | `npm audit --json` | count critical + high advisories |
| `coverage` | existing report if present | **otherwise stub a constant — do not build a coverage pipeline** |

Then `.github/workflows/attest.yml`: run collector → generate salt → compute leaf → `actions/attest`
with predicate `{ leaf, repo, sha, schema }` → upload evidence+salt as a **private** artifact.

The predicate carries the leaf only. Putting evidence there publishes findings to Rekor — see
[02-threat-model.md](02-threat-model.md).

`gh` CLI is **not installed** in this environment (`sudo snap install gh` or `sudo apt install gh`).
Whoever takes Track B installs it first.

### Track C — Anchor + CLI

Verify with `@sigstore/verify` (4.1.2) or shell out to `gh attestation verify`. **The security-critical
check is that the OIDC subject repo matches the predicate repo** — without it, repo A can attest for
repo B and the whole trust chain is decorative.

CLI commands: `attest` (trigger/ingest), `prove --policy production-ready`, `verify`.

The anchor's receipt should record the **leaf index** so the prover can use `pathForLeaf(index, leaf)`
instead of the O(n) `findPathForLeaf`.

### Track D — dApp

**Scaffold `create-mn-app --template leaderboard` separately as a reference implementation.** It ships
React + Lace + in-browser ZK proving — precisely our wiring. Lift from it; do not build wallet
integration from first principles with this clock running.

Two views: prover (load evidence, pick policy, generate proof locally, submit) and verifier (badge
tally, policy thresholds, "what the chain does not know" panel).

## Timeline

| Window (ART) | Milestone |
|---|---|
| → 16:00 | Scaffold, **freeze evidence schema**, Track A publishes generated types. Everyone unblocked. |
| 16:00 → 20:00 | Core build per track. A: compiles + tests. B: one real signed attestation exists. |
| 20:00 → 21:00 | Dinner + **integration checkpoint 1** — does a CI-produced leaf reach the contract? |
| 21:00 → 01:00 | Integration, testnet deploy, CLI green end-to-end. |
| 01:00 → 09:00 | Sleep, staggered. **The demo path must work before anyone sleeps.** |
| 09:00 → 11:30 | dApp polish, **demo rehearsal ×3**, README + Apache 2.0 licence. |
| 11:30 → 13:00 | Freeze. No new features. Submit. |

### Two hard rules

1. **The CLI is the demo of record.** The dApp is the pretty front-end. If wallet wiring breaks at
   12:40, the pitch still runs from a terminal. Track D must never become load-bearing.
2. **Working demo before sleep.** A half-integrated system at 01:00 is a failed submission at 13:00.
   Cut scope at midnight, not at noon.

## Cut list, in order

Drop without debate when behind:

1. Coverage check → stub a constant
2. Freshness / `maxAgeSeconds`
3. Multiple policies → ship only `production-ready`
4. dApp verifier view → CLI prints the same thing
5. dApp entirely → CLI demo
6. Live anchoring during the pitch → pre-anchor leaves beforehand, demo proving only

Item 6 is the safety net: **pre-anchor everything before the pitch regardless.** Live-anchoring on
stage adds a network round-trip and a failure mode for zero narrative gain.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Schema drift between tracks | **High** | Freeze first; one `canonical.ts`; everyone imports |
| Wallet/Lace wiring eats the evening | High | CLI is demo of record; crib from `leaderboard` |
| Proving key generation slow | Medium | `--skip-zk` during dev; generate real keys once, early evening |
| Testnet funding / DUST | Medium | Get a funded wallet in the **first hour**, not at 23:00 |
| `gh` CLI missing | Certain | Install at start of Track B |
| Sigstore verification fiddly | Medium | Fallback: shell to `gh attestation verify`, parse exit code |

Testnet funding is the classic silent killer — it blocks nothing until it blocks everything at 23:00.
Do it first.

## Definition of done

- [ ] `contract` compiles; all seven simulator tests pass
- [ ] Contract deployed to testnet, address recorded
- [ ] `attest.yml` produces a real Sigstore attestation, verifiable with `gh attestation verify`
- [ ] Anchor rejects a bundle whose OIDC repo ≠ predicate repo
- [ ] CLI: end-to-end attest → anchor → prove → verify against testnet
- [ ] Negative case demonstrable (non-compliant evidence → `false`)
- [ ] Privacy checklist in [02-threat-model.md](02-threat-model.md) confirmed against a real tx
- [ ] README + **Apache 2.0 LICENSE** (mandatory for submission)
- [ ] Demo rehearsed three times, under 3 minutes
