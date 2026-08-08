# 09 — Master-Doc-v2 Delta (v2 → as-built)

> **Purpose.** [`Master-Doc-v2.md`](Master-Doc-v2.md) is now the source of truth.
> [07-alignment-delta.md](07-alignment-delta.md) did this job for v1; this is the register for v2 —
> where it and the code differ, and what was done about it.
>
> **Bare §N references in `docs/` mean v1** ([`Master-Doc.md`](Master-Doc.md)). This document writes
> **v2 §N** when it means v2.

## The one-paragraph summary

**v2 simplifies; it does not redirect.** Its core model — buyer policies as public contract state,
evidence supplied as a private witness, a ZK verdict, a public time-bound compliance record, continuous
compliance — is exactly what `contract/` already implements. What v2 **adds** is an evidence *source*:
the application dispatches the repository's own workflow, waits for it, downloads the artifact, and
parses `evidence.json` (v2 §4–§5). What v2 **defers** — Sigstore/Rekor, blinded commitments, attestor
keys, SLSA (v2 §10) — this repo already built, and v2 §12 lists the same items as the intended upgrade
path.

So the as-built is a **superset**. Nothing was removed.

## Resolution status

| # | v2 says | As-built | Resolved? |
|---|---|---|---|
| 1 | v2 §6 — one registry contract, `registerPolicy` + `proveCompliance`, policies public | `audit_registry.compact`, unchanged | ✅ already true |
| 2 | v2 §7 — evidence enters through a Compact witness | `witness getEvidence(): Evidence` | ✅ already true |
| 3 | v2 §8 — public: vendor, repo/product, policy id/version, timestamp, result | `ComplianceRecord`, unchanged | ✅ already true |
| 4 | v2 §9 — continuous compliance, same evidence against many policies | `records` + `history`, `HistoricMerkleTree` | ✅ already true |
| 5 | v2 §4 — workflow runs `npm audit`, emits `evidence.json`, uploads an artifact | `.github/workflows/attest.yml`, rewritten | ✅ live |
| 6 | v2 §5 — app dispatches with a `request_id`, polls, downloads, parses | `ui/src/lib/github/evidence.ts` | ✅ live |
| 7 | v2 §4 evidence.json → the 17-field `Evidence` struct | `collector/src/github-evidence.ts` | ✅ new |
| 8 | v2 §10 — do not *require* Sigstore, blinded commitments, attestor keys | Built anyway; v2 §12 wants them later | ✅ kept, documented |
| 9 | v2 §8 — artifact digest is a *future* upgrade | Mandatory today; the workflow emits one | ✅ arrived early |
| 10 | v2 §4 — `npm audit` is the first real tool | It is. It cannot measure 4 of 11 checks. | ⚠️ **see below** |

## 1 — What v2 added: the live evidence path

```
vendor clicks Validate
        ↓
app POSTs /actions/workflows/attest.yml/dispatches   { request_id }
        ↓
GitHub Actions   npm audit --json  →  npm pack | sha256  →  evidence.json
        ↓
uploaded as artifact  zkuat-evidence-<request_id>
        ↓
app polls runs, matches request_id in the run title, downloads + unzips
        ↓
collector/src/github-evidence.ts  →  CollectorReport
        ↓
attestor normalize() → sign → bundle.json → anchor → proveCompliance
```

The last four steps are the point of the adapter: it emits the **same `CollectorReport`** the full
collector emits, so normalize, sign, anchor, and prove are all unchanged. Two evidence sources, one
downstream pipeline.

| Path | Evidence source | Trust root |
|---|---|---|
| Signed (v1) | `collector` → `attestor` DSSE bundle → `anchor` verifies Sigstore | our attestor key + GitHub OIDC |
| Live (v2) | dispatched workflow → `evidence.json` → adapter | GitHub Actions, trusted per v2 §10 |

### The document

```json
{
  "repository": "owner/name",
  "commit": "9f2a1b3c…",
  "artifactDigest": "sha256:8f739ab…",
  "vulnerabilities": { "critical": 0, "high": 3, "moderate": 4, "low": 1, "total": 8 }
}
```

`artifactDigest` is the one field added to what v2 §4 sketches. v2 §8 calls artifact binding a future
upgrade, but the circuit already requires it as a mandatory public input, and `npm pack | sha256` costs
six lines in a workflow that was otherwise left alone. **It does not need to be reproducible across
runs** — `proveCompliance` only requires the same 32 bytes in the private evidence and the public input
of a single proof.

## 2 — The mapping, and what `npm audit` cannot say

`collector/src/github-evidence.ts`. The `status` column is the load-bearing one.

| `Evidence` field | Source | Status |
|---|---|---|
| `vendorId` / `productId` | `repository.split('/')` | measured |
| `artifactDigest` | `npm pack \| sha256` | measured |
| `commitId` | `commit` — `GITHUB_SHA` is already 40-hex | measured |
| `attestorId` | `github-actions` | measured |
| `criticals` / `highs` | `vulnerabilities.critical` / `.high` | measured |
| `vulnDeps` | `vulnerabilities.total` | measured |
| `ciGreen` | the dispatched run's conclusion | measured |
| `buildProvenanceVerified` | the dispatched run's conclusion, **under v2 §10's trust assumption** | measured |
| `branchProtected` / `mfaRequired` | `gh api`, downstream of CI (`--probe`) | measured, else `unavailable` |
| **`kev`** | — | **`unavailable`** |
| **`forbiddenDeps`** | — | **`unavailable`** |
| `coverage` | — | `stubbed` at 0; absent from both policies |

### The honest gap, stated plainly

`npm audit` reports severity counts. It does **not** cross-reference the CISA KEV catalogue and it does
**not** evaluate a prohibited-package list. Writing `0` into those two slots would put *"no
known-exploited vulnerabilities"* — the exact predicate `bank-v1` checks — into a public compliance
record on the strength of a measurement that never ran. That is the failure
[02-threat-model.md](02-threat-model.md) names under *"the checks themselves are meaningful"*, and the
reason `collector/src/checks/npm-audit.ts` carries a `scanned` flag at all.

So the adapter marks both `unavailable`, and `zkuat-attest` refuses to sign a degraded report without
`--allow-degraded`.

**This is surfaced, not enforced.** `Evidence` commits to the *value*, not its provenance, so the `0`
still reaches the commitment and the circuit still evaluates `kev <= p.maxKev` as satisfied. Anyone
signing a v2-path bundle is accepting that those two predicates are vacuous. The adapter's tests assert
the *statuses*, not just the values, so nobody can quietly turn them into measured zeroes.

**`branchProtected` is measured downstream, not in CI.** `enterprise-v1` requires it, so leaving it
unmeasured would fail every real proof against that policy for a non-reason. The workflow is fixed and
does not gather it, so `reportFromGithubEvidence({ probeRepository: true })` asks the GitHub API using
the same `checks/repo.ts` helpers the full collector uses — including the subtlety that a 404 on
`/branches/{b}/protection` *is* the answer `false`, not a missing answer.

### What `buildProvenanceVerified: true` means on this path

Exactly: *"this document came out of a workflow run the application dispatched, and GitHub reported it
successful."* That is provenance **under v2 §10's assumption that GitHub Actions is the trusted
evidence environment** — nothing more. It is **not** a Sigstore bundle verification; `anchor/` still
does that on the signed path, and the adapter's `source` string says so verbatim so no reader can
conflate the two. There is a test asserting that string.

## 3 — What v2 defers that we already have (v2 §10)

v2 §10 says do not build around: custom Sigstore/Rekor commitments, blinded evidence commitments,
custom attestor private keys, direct SLSA verification, in-circuit GitHub attestation verification,
trusted reusable workflow registries, KMS-backed attestors, production-grade evidence provenance.

All of it exists in `attestor/`, `anchor/`, and the salt + `HistoricMerkleTree` design. **It stays**, for
three reasons:

1. **v2 §10 says these are not *required*, not that they are wrong.** v2 §12 lists the same items —
   signed/attested evidence, SLSA provenance, artifact SHA-256 binding, trusted reusable workflows — as
   the upgrades a future version should make. We are ahead of that roadmap, not off it.
2. **Removing them is expensive and subtractive.** The `Evidence` struct is a `persistentCommit` input,
   so shrinking it re-keys every leaf: new proving keys, a redeploy, and a rewrite of the contract test
   suite, to end up with strictly less.
3. **The blinded commitment is what keeps findings off the transcript.** `insert()`'s `leaf_hash()` is
   why nobody can build a leaf→artifact correlation table. Dropping it would weaken a privacy property
   v2 §3 still depends on.

The P-256 / Jubjub analysis in [01-architecture.md](01-architecture.md) is unchanged and still correct:
GitHub's attestations cannot be verified in-circuit, which is why that boundary is off-chain. v2 §9
independently reaches the same simplification.

## 4 — Where the trust boundary sits now

| | Signed path (v1) | Live path (v2) |
|---|---|---|
| Who measures | `collector`, pinned by version + config hash | GitHub Actions runner |
| Who authenticates | `attestor` ed25519 DSSE | nobody — v2 §10 trusts the environment |
| Who verifies before anchoring | `anchor`: Sigstore chain, OIDC↔repo binding, one anchor per `(repo, commit)` | same anchor, but with `--allow-unsigned` |
| Residual assumption | attestor measures correctly; anchor inserts only attested leaves | **plus**: GitHub Actions was not tampered with, and the KEV / forbidden-dependency predicates are vacuous |

The v2 path is the weaker of the two and should be described that way on stage. It is also the one that
demonstrates v2 §11's MVP end to end with live data, which is why it exists.

## 5 — Consequences for other docs

- [01-architecture.md](01-architecture.md) — the component table now describes the replaced workflow.
  The data-flow diagram still describes the **signed** path, which is still real.
- [02-threat-model.md](02-threat-model.md) — trust assumption 4 gained the KEV/forbidden-dependency
  note; the privacy checklist item about the attestation predicate is now partially ticked, because
  `assertNoEvidenceLeak` is no longer a CI gate (the current workflow publishes no predicate at all).
- [03-evidence-schema.md](03-evidence-schema.md) — the "nobody reimplements" rule has one documented
  exception, `ui/`, forced by the WASM boundary.
- [05-implementation-plan.md](05-implementation-plan.md) — Track B's workflow section, and the status
  table.
- [06-demo-script.md](06-demo-script.md) — unchanged. The beats are about information asymmetry, not
  about which evidence source produced the bundle.

## 6 — Still open

- **The UI's two-policy contrast.** `lib/demo.ts`'s `EVIDENCE` passes *both* policies and
  `EVIDENCE_FAILING` fails *both*, so the fixtures do not show demo beat 5. The chain-side tools do —
  `npm run devnet:prove -- --forbidden-deps 1` passes `bank-v1` and fails `enterprise-v1`. A third
  fixture would close this.
- **Proving is still simulated** in `ui/src/components/app/prove-panel.tsx`, and the verifier view reads
  `lib/demo.ts` rather than the chain.
- **The live path has never run green end to end.** The adapter is unit-tested against the document
  shape; nobody has yet dispatched the workflow, downloaded the artifact, and proven the result.
