# 07 — Alignment Delta (Master Doc → as-built)

> **Purpose.** [`Master-Doc.md`](../Master-Doc.md) is the source of truth for this project. Track A was
> built against an earlier framing. This document is the register of every place they disagree, what
> has to change, and what survives untouched.
>
> **Docs in `docs/` have been realigned to the Master Doc.** Code has **not** — that is deliberate and
> deferred. So `docs/` now describes the target, and this file is the map from target back to what is
> actually running.
>
> Read this before touching `contract/`.

## The one-paragraph summary

Track A built an **anonymous repo-badge protocol**: a repo proves *some attested repo* satisfies a
policy, revealing nothing — not even which repo. The Master Doc specifies an **identified B2B software
assurance protocol**: a named vendor proves that a *specific artifact digest* satisfies a *buyer's
published policy*, and the result is a public, time-bound compliance record a buyer can look up.

The cryptographic machinery is almost entirely reusable. The **privacy boundary moves**, the
**evidence schema grows**, and the ledger gains **compliance records**. Anonymity stops being a goal.

## Severity register

| # | Divergence | Severity | Code impact |
|---|---|---|---|
| 1 | Anonymity is not a goal; artifact/vendor/product are **public** | **Critical** — inverts the privacy story | Contract circuit signature, docs, pitch |
| 2 | Evidence schema missing `artifactDigest`, `validUntil`, `kev`, `forbiddenDeps`, 3 config booleans | **Critical** — schema is "frozen" at v1, Master Doc needs v2 | `Evidence` struct → every leaf changes |
| 3 | No artifact-digest binding in the circuit | **Critical** — §10 calls this mandatory | New public param + assert |
| 4 | No compliance records / history on-chain | **High** — §12 is the "why blockchain" answer | New ledger ADT |
| 5 | `coverage` is the flagship threshold | **High** — §18 explicitly warns against this | Policy struct + demo policy |
| 6 | Single policy; multi-policy is cut item #3 | **High** — §39 ranks second policy as top add-on | Register two policies |
| 7 | No policy issuer/version metadata | Medium — §5 needs stable policy identity | `Policy` struct |
| 8 | Expiration unmodelled | Medium — §11/§36 core to continuous compliance | Record fields + UI states |
| 9 | UI treated as expendable; CLI is demo of record | Medium — §39 ranks both UIs above CI integration | Plan + staffing |
| 10 | No attestor identity in evidence or policy | Low — §35 hardening | `attestorId` / `requiredAttestor` |
| 11 | No standards grounding (OSPS Baseline, NIST SSDF) | Low — §2/§6 credibility | Docs only |
| 12 | Terminology: repo/badge/claim vs vendor/artifact/compliance | Low but pervasive | Renames |

## 1 — Anonymity inverts (the critical one)

Track A's docs claimed the verifier learns *"an attested repo satisfies Policy X"* and **"not even
which repo you are."** Master Doc §37 says the opposite:

| Master Doc §37 | Field |
|---|---|
| **Public** | vendor identifier, product identifier, **artifact digest**, policy ID/version, compliance result, proof timestamp, expiration |
| **Private** | exact vulnerability counts, specific CVEs, SBOM/dependencies, internal package names, repository configuration, MFA statistics, security findings |

This is not a softening — it is a reversal, and it is *correct for the use case*. A procurement record
that doesn't say **which vendor's which artifact** is compliant is useless to a buyer. §43's
`ComplianceRecord` is public by construction.

### What this kills

- The "not even which repo you are" line, everywhere. It was the headline claim of `00-overview.md`
  and beat 5 of the demo script.
- **Gap 4 (small anonymity set)** in the old threat model. Largely moot — we are no longer relying on
  an anonymity set for the security property.
- The de-anonymisation reasoning behind **Gap 1**. The old doc chose a "counting bug over a privacy
  break" because repo/commit nullifiers were guessable. With identity public, that trade mostly
  evaporates and a deterministic nullifier over `(artifactDigest, policyId, evidence epoch)` becomes
  available.

### What survives, with a new justification

`HistoricMerkleTree` is still the right structure, but **for a different reason**. Previously: hide
which member is acting. Now: the tree is how we get **authenticated evidence without in-circuit
signature verification**, and `insert()`'s `leaf_hash()` still keeps the *evidence commitment* itself
off the transcript — so nobody can link an on-chain proof back to its Rekor attestation bundle, and
nobody can build a leaf→artifact correlation table. `checkRoot()` over historic roots still keeps old
proofs valid as new evidence is anchored, which continuous compliance (§11) depends on.

Say this precisely in the pitch. "We hide the findings, not the vendor" is the honest and stronger claim.

## 2 — Evidence schema v1 → v2

`docs/03-evidence-schema.md` marks v1 **FROZEN**, and it is implemented and tested. The Master Doc
needs fields it does not have.

| Master Doc §41 field | v1 as-built | Action |
|---|---|---|
| `artifactDigest` | ❌ absent | **Add.** §10 makes it mandatory and public. |
| `commitHash` | ✅ `commitId` | Rename only |
| `generatedAt` | ✅ `issuedAt` | Rename only |
| `validUntil` | ❌ absent | **Add.** §11 continuous compliance. |
| `criticalVulnerabilities` | ✅ `criticals` | Rename only |
| `highVulnerabilities` | ✅ `highs` | Rename only |
| `knownExploitedVulnerabilities` | ❌ absent | **Add.** In every Master Doc policy example. |
| `forbiddenDependencies` | ⚠️ `vulnDeps` is a different fact | **Add** `forbiddenDeps`; keep `vulnDeps` |
| `mfaRequired` | ❌ absent | **Add** |
| `primaryBranchProtected` | ❌ absent | **Add** (v1 `ciGreen` is a weaker relative) |
| `buildProvenanceVerified` | ❌ absent | **Add.** §8 — the GitHub-provenance hook. |
| — | ⚠️ `repoId` | **Drop.** Existed for repo anonymity. Superseded by `artifactDigest`. |
| — | ⚠️ `coverage` | **Demote** — keep the field, remove from flagship policy (§18) |

**Any change here re-keys every leaf.** `persistentCommit<Evidence>` is over the whole struct, so a
single added field invalidates every anchored attestation and every outstanding proof. There is no
incremental migration: it is a v2 schema, a v2 policy id set, and a re-anchor.

Consequence: **do this before generating real proving keys or anchoring anything for the demo.** It is
cheap now and expensive in six hours.

### Proposed v2 struct

Field order is load-bearing. Identity first, then time, then facts grouped by domain.

```compact
struct Evidence {
  // ── identity ──
  artifactDigest:          Bytes<32>;   // sha256 of the artifact; bound to a PUBLIC circuit input
  commitId:                Bytes<32>;   // git SHA, 20 bytes left-aligned, zero-padded
  attestorId:              Bytes<32>;   // which attestor produced this (§35)

  // ── time ──
  generatedAt:             Uint<64>;    // unix seconds
  validUntil:              Uint<64>;    // unix seconds (§11)

  // ── vulnerability facts ──
  criticals:               Uint<32>;
  highs:                   Uint<32>;
  kev:                     Uint<32>;    // CISA Known Exploited Vulnerabilities

  // ── dependency facts ──
  forbiddenDeps:           Uint<32>;    // count matching the buyer's prohibited list
  vulnDeps:                Uint<32>;    // dependencies carrying known vulns

  // ── configuration facts ──
  mfaRequired:             Boolean;
  branchProtected:         Boolean;
  buildProvenanceVerified: Boolean;
  ciGreen:                 Boolean;

  // ── weak signal: kept as a demo predicate, never a flagship threshold (§18) ──
  coverage:                Uint<32>;    // percent * 100
}
```

`schemaVersion` stays **outside** the struct: v1 already gates it at the encoding boundary via
`EVIDENCE_SCHEMA` string rejection, which fails loudly and costs no circuit constraints. Keep that.

## 3 — Artifact-digest binding

Master Doc §10 and §21 are unambiguous — the digest is a **public circuit input** and the circuit
asserts the private evidence matches it:

```compact
assert(disclose(ev.artifactDigest == artifactDigest), "artifact mismatch");
```

Without this the proof says "*some* attested artifact passes", which is precisely the anonymous
version we are moving away from. This is one assert and one parameter, and it is the highest
value-per-line change in the register.

## 4 — Compliance records and history

§12 names the registry as the reason a blockchain is justified at all; §43 gives the record shape;
§25/§27 want a queryable timeline. v1 has only `compliantCount: Map<Bytes<32>, Counter>` — a tally,
which cannot answer "is artifact ABC currently compliant with ACME v3?".

```compact
struct ComplianceRecord {
  vendorId:       Bytes<32>;
  productId:      Bytes<32>;
  artifactDigest: Bytes<32>;
  policyId:       Bytes<32>;
  policyVersion:  Uint<32>;
  provenAt:       Uint<64>;
  validUntil:     Uint<64>;
  compliant:      Boolean;
}

// Current status, keyed by hash(artifactDigest, policyId) — exactly the buyer's query.
export ledger records: Map<Bytes<32>, ComplianceRecord>;

// Append-only timeline for the history view.
export ledger history: List<ComplianceRecord>;
```

**UNVERIFIED, and it gates the buyer history view — check this first:**

- `List<T>` is a valid ledger type with `pushFront` / `popFront` / `head` (per the `compact-ledger`
  skill). Whether the generated TypeScript `Ledger` exposes **iteration** over a `List` or a `Map` is
  not confirmed. The v1 generated surface shows `Map` with only `isEmpty/size/member/lookup` and **no
  iterator**, while `attestations` does expose `history()`. If neither iterates, the timeline must be
  reconstructed client-side from the vendor's own record keys, or from indexer events.
- Fallback that needs no iteration: buyer looks up `records[hash(artifactDigest, policyId)]` for
  current status, and the UI keeps a local list of known artifact digests to build the timeline.

Do not design the buyer view around iteration until someone has confirmed it exists.

## 5 — Coverage demoted

Master Doc §18: *"Avoid making `coverage >= 80%` the flagship security requirement. Coverage is fine
as a technical demo predicate but a weak representation of software security."*

v1's only policy is `production-ready` with `minCoverage: 7000` as a core threshold. Replace with the
§20 policies, which are built from vulnerability and provenance facts.

## 6 — Two policies, and it is not a cut item

Old cut list ranked "multiple policies → ship only `production-ready`" as **cut item 3**. Master Doc
§39 ranks *"second policy over the same evidence"* as **the single most valuable addition after the
core loop**, and §4/§17 make evidence reuse the central argument for programmable ZK. §17 says it
"should probably be part of the demo or pitch."

**This moves from cut list to must-have.** It is also cheap: the contract already takes `policyId` as
a parameter and reads thresholds from ledger state, so a second policy is one more `registerPolicy`
call and zero new circuit code. The cost is entirely in the demo narrative, which is where the value is.

Per §20:

```
POLICY_BANK_V1        criticals == 0, highs <= 5, kev == 0, buildProvenanceVerified
POLICY_ENTERPRISE_V1  criticals == 0, forbiddenDeps == 0, branchProtected, buildProvenanceVerified
```

Both must pass against the *same* evidence bundle. That contrast is the demo's strongest beat.

## 7 — Policy identity and metadata

§5 requires a policy to be unforgeable and versioned: *"a vendor may select 'I want to prove against
ACME Policy v3', but it cannot silently modify ACME Policy v3."* §42 lists issuer, version, and
freshness. v1's `Policy` has thresholds only.

```compact
struct Policy {
  version:                 Uint<32>;
  issuer:                  Bytes<32>;   // hash of the issuing organisation
  maxCriticals:            Uint<32>;
  maxHighs:                Uint<32>;
  maxKev:                  Uint<32>;
  maxForbiddenDeps:        Uint<32>;
  requireMfa:              Boolean;
  requireBranchProtection: Boolean;
  requireBuildProvenance:  Boolean;
  requiredAttestor:        Bytes<32>;   // §35; zero == any registered attestor
  maxAgeSeconds:           Uint<64>;    // §42 evidenceMaxAgeDays, in seconds
}
```

Policy ids stay `policyId(slug)` through the existing `repoIdOf` padding circuit — that mechanism is
fine, only the struct grows. Note `repoIdOf` is now a misleading name; it is a generic
64-byte-padded-string hasher. Rename to `stringIdOf` when touching the contract.

## 8 — Expiration

§11 and §36 want three distinguishable states: **COMPLIANT / EXPIRED / NO CURRENT PROOF**.

**Recommended MVP mechanism — no unverified primitive required.** Put `validUntil` in the public
`ComplianceRecord` and let the *reader* compare against wall-clock time. The chain records the claim
window; the UI judges freshness. This delivers exactly what §36 asks the frontend to display, and it
needs nothing the contract cannot already do.

**Hardening path (do not put on the critical path).** `blockTimeGte` / `blockTimeLt` appear in the
`compact-patterns` state-management reference and would let the circuit *enforce* freshness rather
than merely record it:

```compact
assert(blockTimeLt(disclose(ev.validUntil)), "evidence expired");
```

**UNVERIFIED in this project** — from skill content, not executed here. Verify with
`/midnight-verify:verify` before writing it into a circuit. Note the reference's own warning: the
deadline must come from ledger or public input, never from an unchecked witness, or a prover spoofs it.

## 9 — UI priority inverts

| | Old plan | Master Doc §39 |
|---|---|---|
| Vendor UI (private evidence) | Cut item 5 ("dApp entirely → CLI demo") | Priority **4** |
| Buyer UI (result only) | Cut item 4 | Priority **5** |
| GitHub Actions integration | Track B, core | Priority **10** |

§24: *"This is where the privacy value should be visually obvious."* §28's demo sequence is
inherently two-window — buyer view, then vendor view, then back to buyer. A terminal cannot show the
information-asymmetry contrast that is the entire point.

**The old plan's engineering instinct was sound but its conclusion is now wrong.** Keep a CLI as the
proof-path fallback, but the two views are deliverables, not polish. The honest resolution:

- **CLI remains the fallback for the proving step** if wallet wiring fails at 12:40.
- **The two views are must-have**, because without them there is no demonstration of selective
  disclosure — only an assertion of it.
- **GitHub Actions integration can be faked with a fixture** far more safely than the UI can be
  replaced. §39 ranking it 10th says exactly this.

This is a genuine scope decision, not a doc edit. Flagged for the team, not resolved here.

## 10 — Attestor identity

§35 wants policies to pin an approved attestor, scanner version, and vuln-DB version, so a badge means
"measured by X at version Y". v1 has a single sealed `anchor` identity and no attestor concept in the
evidence at all.

Minimum: `attestorId` in `Evidence`, `requiredAttestor` in `Policy`, one assert. §35's multi-attestor
future (`Scanner A AND Scanner B AND CI provenance`) is explicitly post-hackathon.

## 11 — Standards grounding

Master Doc §2 and §6 anchor the pitch in **OpenSSF OSPS Baseline** (published version **2026.02.19**,
versioned controls by maturity level) and **NIST SSDF** (the producer/acquirer relationship). The old
docs cite neither.

§6's guardrail is the important part: **do not claim "we cryptographically prove full NIST
compliance."** Claim *"machine-verifiable controls derived from recognized software-security
frameworks."* §38's not-a-list exists to keep the pitch defensible under a hostile question.

## 12 — Terminology map

Pervasive and mechanical. Apply when touching code.

| v1 (as-built) | Master Doc |
|---|---|
| repo owner | **vendor** |
| verifier | **buyer** / policy issuer |
| anchor operator | **attestor** (facts) + anchor (submission) |
| badge | compliance proof / **compliance record** |
| `claimBadge` | **`proveCompliance`** |
| `compliantCount` | `records` + `history` (tally optional) |
| `repoId` | dropped → `artifactDigest` + `commitId` |
| `repoIdOf` | `stringIdOf` (it is a generic padded-string hasher) |
| `production-ready` | `POLICY_BANK_V1`, `POLICY_ENTERPRISE_V1` |

### Naming collision worth catching now

The contract hardcodes `zkaudit` in its **domain separators**:

```compact
pad(32, "zkaudit:claim:nul:")
pad(32, "zkaudit:anchor:pk:")
```

Domain separators are commitment inputs. Renaming the project after anchoring changes every nullifier
and invalidates every record. **Settle the name before the first real anchor**, or accept `zkaudit` as
a permanent internal identifier independent of the product name. The `<PROJECT>` placeholder in docs
is still unresolved.

## What survives untouched

Worth stating, because it is most of the work:

- **The P-256 / Jubjub constraint analysis** (`01-architecture.md`). Still true, still the reason the
  trust boundary is off-chain, and Master Doc §9 independently endorses the normalized-attestor
  simplification. This analysis is *more* aligned with the Master Doc than the old framing was.
- **`export pure circuit` as the anti-drift mechanism.** `leafOf` / `nullifierOf` compiled from the
  same source the circuit runs. The v2 schema changes the struct, not the technique.
- **Nullifier over `(leaf, policyId)`.** Accidentally correct for continuous compliance: same evidence
  + same policy is blocked, new evidence → new leaf → new proof is permitted. That is the desired
  behaviour, and Gap 1's severity drops accordingly — re-proving fresh evidence for the same commit is
  now a *feature*.
- **Anchor access control via witness secret, not `ownPublicKey()`.** Correct and non-obvious.
- **The simulator harness** and the privacy-transcript assertions. Both survive a struct change with
  fixture edits only.
- **The whole DX feedback list.** Independent of framing, and judged.

## Recommended order of work

Ordered by (Master Doc priority × cheapness). Items 1–3 are hours; 4–5 are the demo.

1. **Evidence v2 struct + artifact-digest binding.** One struct, one param, one assert. Unblocks
   everything and must precede any real anchoring or key generation.
2. **`Policy` v2 + register both §20 policies.** No new circuit logic; delivers §39's top add-on.
3. **`ComplianceRecord` + `records` map.** Answers the buyer's actual query and justifies the chain.
4. **Vendor view** — private evidence panel, explicitly labelled *"PRIVATE — not written to
   Midnight"*, policy selector, generate-proof.
5. **Buyer view** — result, requirement checklist, timeline, and the three freshness states.

Deferred without regret: in-circuit `blockTimeGte` enforcement, multi-attestor, real OSPS control
mapping, policy composition, `List`-based history if iteration turns out not to exist.
