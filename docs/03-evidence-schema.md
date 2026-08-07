# 03 — Evidence Schema

> **Two schemas live in this document.**
>
> - **v1 — as-built.** Implemented, tested, and what `contract/` runs today. `zkaudit.evidence.v1`.
> - **v2 — target.** What [`Master-Doc.md`](../Master-Doc.md) §41 requires. **Not implemented.**
>
> v1 was frozen before the Master Doc existed. It is missing fields the Master Doc treats as
> mandatory — most importantly `artifactDigest`, which §10 makes the anchor of every claim. v2 is
> therefore a real migration, not a tidy-up. See [07-alignment-delta.md](07-alignment-delta.md) §2.
>
> **Anything that changes this struct re-keys every leaf.** `persistentCommit<Evidence>` commits to the
> whole struct, so one added field invalidates every anchored attestation and every outstanding proof.
> There is no incremental path. **Migrate before generating real proving keys or anchoring demo data.**

## Why this document is load-bearing

Four components encode this struct: the contract, the collector, the anchor, and the CLI/UI. If the
encodings disagree by a single byte, `persistentCommit` produces a different leaf, the Merkle path check
fails, and every proof breaks. You would discover it at the integration checkpoint with no time to fix
it. **This was the highest-risk item in the project.**

It is closed by construction — see the rule below. The rule survives the v1→v2 migration unchanged.

## Rule: one implementation, everyone imports it

**`contract/` is the only implementation, and most of it is the compiler's own output.**

The contract exports its derivations as **pure circuits**, which the Compact compiler emits into a
`pureCircuits` object callable from TypeScript with no context and no transaction. These compile from
the same source the proving circuit runs, so what TypeScript computes is byte for byte what the circuit
checks. Drift is not discouraged — it is impossible.

```typescript
import { encodeEvidence, pureCircuits, policyId } from '@zkaudit/contract';

const evidence = encodeEvidence(canonicalJson);
const leaf     = pureCircuits.leafOf(evidence, salt);
const nul      = pureCircuits.nullifierOf(leaf, policyId('production-ready'));
```

The collector, anchor, CLI, and UI import these. Nobody reimplements them. Not "reimplements them
carefully" — nobody reimplements them. **VERIFIED** — `contract/src/test/audit_registry.test.ts` anchors
a leaf computed in TypeScript and proves against it in-circuit; if the two ever diverge, that test fails.

---

# v1 — as-built

**Status: implemented, 50 simulator tests green (2026-08-07).** `EVIDENCE_SCHEMA = 'zkaudit.evidence.v1'`.

```compact
struct Evidence {
  repoId:     Bytes<32>;   // persistentHash of padded "owner/name"
  commitId:   Bytes<32>;   // git SHA, left-aligned, zero-padded
  issuedAt:   Uint<64>;    // unix seconds
  ciGreen:    Boolean;     // Actions conclusion on HEAD == success
  criticals:  Uint<32>;    // critical severity findings
  highs:      Uint<32>;    // high severity findings
  vulnDeps:   Uint<32>;    // dependencies with known vulns
  coverage:   Uint<32>;    // percent * 100  (8734 == 87.34%)
}

struct Policy {
  maxCriticals:   Uint<32>;
  maxHighs:       Uint<32>;
  maxVulnDeps:    Uint<32>;
  minCoverage:    Uint<32>;
  requireCiGreen: Boolean;
}
```

One registered policy, `production-ready`:

```
maxCriticals: 0,  maxHighs: 5,  maxVulnDeps: 0,  minCoverage: 7000,  requireCiGreen: true
```

### Generated TypeScript mapping

**VERIFIED** 2026-08-07 — the compiler's own output from `compact compile --skip-zk` (compiler v0.31.1,
`pragma language_version >= 0.23`), not hand-written:

```typescript
getEvidence(context: WitnessContext<Ledger, PS>): [PS, {
  repoId:    Uint8Array,   // Bytes<32>
  commitId:  Uint8Array,   // Bytes<32>
  issuedAt:  bigint,       // Uint<64>
  ciGreen:   boolean,      // Boolean
  criticals: bigint,       // Uint<32>
  highs:     bigint,       // Uint<32>
  vulnDeps:  bigint,       // Uint<32>
  coverage:  bigint        // Uint<32>
}];

getSalt(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];   // Bytes<32>

getPath(context: WitnessContext<Ledger, PS>): [PS, {
  leaf: Uint8Array,
  path: { sibling: { field: bigint }, goes_left: boolean }[]
}];

localSecret(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];   // Bytes<32>
```

`localSecret` is the anchor operator's key, used only by `attest` and `registerPolicy`. A vendor proving
compliance never invokes it and can leave it null — but the TypeScript `Witnesses` object must still
supply the key, so `contract/src/witnesses.ts` provides one that throws a named error if it is ever
actually reached.

These four are implemented once, in `contract/src/witnesses.ts`, over an `AuditPrivateState`.

### Trip-ups, all confirmed from the generated output

These survive the migration — they are properties of the toolchain, not the schema.

| Trap | Detail |
|---|---|
| **`goes_left`, not `goesLeft`** | The Compact docs write `goesLeft`; the generated TypeScript emits **snake_case** `goes_left`. Getting this wrong fails silently at path construction. |
| **All numerics are `bigint`** | `Uint<32>` and `Uint<64>` both map to `bigint`. Passing a JS `number` throws. Use `123n` or `BigInt(x)`. |
| **`sibling` is a wrapper object** | It's `{ field: bigint }`, not a bare `bigint`. |
| **`Bytes<32>` is exactly 32** | `Uint8Array` of length 32. Not 31, not 33. Pad explicitly. |
| **`Evidence` and `Policy` are anonymous** | The compiler emits them as inline object types, not named exports. `contract/src/types.ts` recovers them by indexing into the generated signatures, so a struct change becomes a TypeScript error rather than a silent commitment mismatch. Import from there. |

### v1 canonical JSON

```json
{
  "schema": "zkaudit.evidence.v1",
  "repo": "owner/name",
  "commit": "9f2a...",
  "issuedAt": 1754582400,
  "checks": {
    "ciGreen": true,
    "criticals": 0,
    "highs": 2,
    "vulnDeps": 0,
    "coverage": 8734
  }
}
```

### v1 encoding rules

Implemented in `contract/src/encoding.ts`. The table is the specification; that file is the
implementation.

| Field | From canonical JSON | Encoding |
|---|---|---|
| `repoId` | `repo` | lowercase → UTF-8 → **zero-pad right to 64 bytes** → `pureCircuits.repoIdOf()` |
| `commitId` | `commit` | 40 hex chars → 20 bytes → left-aligned in 32 bytes, zero-padded right |
| `issuedAt` | `issuedAt` | `BigInt(unix seconds)` |
| `ciGreen` | `checks.ciGreen` | boolean |
| `criticals`/`highs`/`vulnDeps` | `checks.*` | `BigInt`, saturate at `2^32 - 1` |
| `coverage` | `checks.coverage` | `BigInt(round(pct * 100))`, clamp to `[0, 10000]` |

---

# v2 — target

Per Master Doc §41, §10, §11, §35. **Not implemented.**

## The struct

Field order is load-bearing: identity, then time, then facts grouped by domain. **Do not reorder. Do
not insert fields in the middle.** Append-only, and appending changes the commitment.

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

  // ── weak signal: a demo predicate, never a flagship threshold (§18) ──
  coverage:                Uint<32>;    // percent * 100
}
```

### What changed from v1, and why

| Change | Master Doc | Rationale |
|---|---|---|
| **`artifactDigest` added** | §10, §21 | Every claim must refer to immutable artifact bytes, not a version label. Bound to a public circuit input. **The single most important addition.** |
| **`repoId` removed** | §37 | It existed to give the *repo* an identity while keeping it anonymous. Superseded: artifact + vendor identity are now public, and the repo is not the subject of the claim. |
| **`validUntil` added** | §11, §36 | Continuous compliance. Lands in the public record so the buyer view can show COMPLIANT / EXPIRED / NO CURRENT PROOF. |
| **`kev` added** | §20, §41 | Known-exploited-vulnerability count appears in every policy example in the Master Doc. |
| **`forbiddenDeps` added** | §16, §41 | Distinct from `vulnDeps`: "appears on the buyer's prohibited list" is a licence/policy fact, not a vulnerability fact. Both are kept. |
| **`mfaRequired`, `branchProtected`, `buildProvenanceVerified` added** | §41, §8 | Repository and provenance controls. `buildProvenanceVerified` is the hook into GitHub attestations (§8). |
| **`attestorId` added** | §35 | Lets a policy pin which attestor is acceptable, so a record means "measured by X". |
| **`coverage` demoted** | §18 | Kept as a field so existing collector work is not wasted, but removed from every flagship policy: *"Coverage is fine as a technical demo predicate but a weak representation of software security."* |
| **`issuedAt` → `generatedAt`** | §41 | Naming only. |

`schemaVersion` stays **outside** the struct. v1 already gates it at the encoding boundary — a wrong
schema string throws in `encodeEvidence` — which fails loudly and costs zero circuit constraints. Keep
that mechanism; bump the string to `zkaudit.evidence.v2`.

## v2 canonical JSON

```json
{
  "schema": "zkaudit.evidence.v2",
  "artifactDigest": "sha256:8f739ab...",
  "commit": "9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3",
  "attestor": "zkaudit-attestor-v1",
  "generatedAt": 1754582400,
  "validUntil": 1757260800,
  "vulns":  { "criticals": 0, "highs": 3, "kev": 0 },
  "deps":   { "forbidden": 0, "vulnerable": 0 },
  "config": { "mfaRequired": true, "branchProtected": true, "buildProvenanceVerified": true, "ciGreen": true },
  "coverage": 8734
}
```

Rules, unchanged from v1: keys sorted, no insignificant whitespace, **integers only** (no floats — that
is why coverage is percent×100), `commit` full 40-char lowercase hex.

`artifactDigest` accepts the `sha256:` prefix in JSON for human legibility and strips it during
encoding; the 32 raw bytes are what get committed.

## v2 encoding rules

| Field | From canonical JSON | Encoding |
|---|---|---|
| `artifactDigest` | `artifactDigest` | strip `sha256:` → 64 hex chars → **exactly 32 bytes**. Reject any other length. |
| `commitId` | `commit` | 40 hex chars → 20 bytes → left-aligned in 32 bytes, zero-padded right |
| `attestorId` | `attestor` | slug → `stringIdOf()` (the 64-byte padding, see below) |
| `generatedAt` / `validUntil` | as named | `BigInt(unix seconds)`; reject `validUntil <= generatedAt` |
| `criticals` / `highs` / `kev` | `vulns.*` | `BigInt`, saturate at `2^32 - 1` |
| `forbiddenDeps` / `vulnDeps` | `deps.forbidden` / `deps.vulnerable` | `BigInt`, saturate at `2^32 - 1` |
| four booleans | `config.*` | boolean |
| `coverage` | `coverage` | `BigInt(round(pct * 100))`, clamp to `[0, 10000]` |

### The 64-byte string padding

`Bytes<N>` is fixed-width in Compact, so "hash the UTF-8 bytes" is underspecified — the width has to be
pinned somewhere, and it is pinned at **64 bytes, zero-padded right**. The encoder throws rather than
truncating on an overlong input; silent truncation would collide two identities into one.

One padding rule covers every string this protocol hashes: policy ids, attestor ids, vendor ids, product
ids. In v1 the circuit is called `repoIdOf`; **rename it `stringIdOf` in v2** — it was never
repo-specific, and the name now misleads.

These must be computed with the **same** `persistentHash` the circuit uses. Do not substitute a Node
`crypto` SHA-256 call and assume they match — `persistentHash` operates over Compact's typed,
field-aligned representation, not raw bytes. Calling the pure circuit avoids the question entirely.

## Policy struct (v2)

```compact
struct Policy {
  version:                 Uint<32>;
  issuer:                  Bytes<32>;   // stringIdOf(issuing organisation)
  maxCriticals:            Uint<32>;
  maxHighs:                Uint<32>;
  maxKev:                  Uint<32>;
  maxForbiddenDeps:        Uint<32>;
  requireMfa:              Boolean;
  requireBranchProtection: Boolean;
  requireBuildProvenance:  Boolean;
  requiredAttestor:        Bytes<32>;   // zero == any registered attestor
  maxAgeSeconds:           Uint<64>;    // §42 evidenceMaxAgeDays, in seconds
}
```

Public in ledger state so buyers can read exactly what a record means. Policy identity must be stable
and unforgeable (§5): a vendor may choose to prove against ACME v3, but cannot silently modify ACME v3.
`version` and `issuer` carry that; `policyId(slug)` remains the key.

### Ship both policies (§20)

Not one. §39 ranks a second policy over the same evidence as **the most valuable addition after the
core loop**, and it costs no new circuit code — the circuit already takes `policyId` and reads
thresholds from ledger state.

```
POLICY_BANK_V1        criticals == 0,  highs <= 5,  kev == 0,  requireBuildProvenance
POLICY_ENTERPRISE_V1  criticals == 0,  forbiddenDeps == 0,  requireBranchProtection,
                      requireBuildProvenance
```

Both must pass against the **same** evidence bundle. That contrast is the demo's strongest beat (§17, §28).

`registerPolicy` must keep seeding any per-policy counter alongside the policy: a `Map<_, Counter>`
entry does not exist until inserted, so without the seed the first successful proof throws on
`lookup().increment()`. Guarded, so re-registration updates thresholds and leaves tallies intact.

## Salt

32 cryptographically random bytes, fresh per attestation, generated in CI. Unchanged in v2.

- **Never** goes into the attestation predicate — that would unblind the commitment. See
  [02-threat-model.md](02-threat-model.md).
- Travels with the evidence in the private artifact.
- Losing it makes the attestation unprovable forever. There is no recovery.

## Versioning

`schema` carries the version. Any field change is a **new schema version and a new policy id set**. Old
attestations remain valid under old policies — `HistoricMerkleTree` keeps historic roots valid, so
outstanding proofs do not break when new evidence is anchored.

## Sign-off

**v1** — implemented and tested:

- [x] Track A (contract) — struct matches `contract/src/audit_registry.compact`; encoding in
      `contract/src/encoding.ts`; 50 tests green (2026-08-07)

**v2** — nothing signed off. Migration is [07-alignment-delta.md](07-alignment-delta.md) item 1 and
blocks real key generation and demo anchoring.

- [ ] Track A — `Evidence` v2, `Policy` v2, `stringIdOf` rename, artifact-digest binding
- [ ] Track B (collector) — emits v2 canonically; imports `@zkaudit/contract`
- [ ] Track C (anchor/CLI) — imports `@zkaudit/contract`, no reimplementation
- [ ] Track D (vendor + buyer views) — imports `@zkaudit/contract`, no reimplementation
