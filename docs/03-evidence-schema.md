# 03 — Evidence Schema

> **FREEZE THIS BEFORE ANYONE WRITES TRACK CODE.**
>
> Four components encode this struct independently: the Compact contract, the collector, the anchor,
> and the CLI/UI. If the encodings disagree by a single byte, `persistentCommit` produces a different
> leaf, the Merkle path check fails, and every proof breaks. You will discover this at the integration
> checkpoint with no time to fix it. **This is the highest-risk item in the project.**

## Rule: one implementation, everyone imports it

`collector/src/canonical.ts` is the **only** implementation of evidence → `Evidence` struct encoding.
The anchor, CLI, and UI import it. Nobody reimplements it. Not "reimplements it carefully" — nobody
reimplements it.

## The struct

```compact
struct Evidence {
  repoId:     Bytes<32>;   // persistentHash of "owner/name"
  commitId:   Bytes<32>;   // git SHA, left-aligned, zero-padded
  issuedAt:   Uint<64>;    // unix seconds
  ciGreen:    Boolean;     // Actions conclusion on HEAD == success
  criticals:  Uint<32>;    // critical severity findings
  highs:      Uint<32>;    // high severity findings
  vulnDeps:   Uint<32>;    // dependencies with known vulns
  coverage:   Uint<32>;    // percent * 100  (8734 == 87.34%)
}
```

Field order is load-bearing — it determines the commitment. **Do not reorder. Do not insert fields in
the middle.** Append-only, and appending changes the commitment, so it requires re-anchoring everything.

## Generated TypeScript mapping

**VERIFIED** 2026-08-07 — this is the compiler's own output from `compact compile --skip-zk`
(compiler v0.31.1, `pragma language_version >= 0.23`), not hand-written:

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
```

### Trip-ups, all confirmed from the generated output

| Trap | Detail |
|---|---|
| **`goes_left`, not `goesLeft`** | The Compact docs write `goesLeft`; the generated TypeScript emits **snake_case** `goes_left`. Getting this wrong fails silently at path construction. |
| **All numerics are `bigint`** | `Uint<32>` and `Uint<64>` both map to `bigint`. Passing a JS `number` throws. Use `123n` or `BigInt(x)`. |
| **`sibling` is a wrapper object** | It's `{ field: bigint }`, not a bare `bigint`. |
| **`Bytes<32>` is exactly 32** | `Uint8Array` of length 32. Not 31, not 33. Pad explicitly. |

## Canonical JSON (the wire format)

What the collector writes and the owner keeps privately:

```json
{
  "schema": "<PROJECT>.evidence.v1",
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

Rules: keys sorted, no insignificant whitespace, integers only (no floats — that's why coverage is
percent×100), `repo` lowercased, `commit` full 40-char lowercase hex.

## Encoding rules

| Field | From canonical JSON | Encoding |
|---|---|---|
| `repoId` | `repo` | `persistentHash` of the lowercased `"owner/name"` UTF-8 bytes |
| `commitId` | `commit` | 40 hex chars → 20 bytes → left-aligned in 32 bytes, zero-padded right |
| `issuedAt` | `issuedAt` | `BigInt(unix seconds)` |
| `ciGreen` | `checks.ciGreen` | boolean |
| `criticals`/`highs`/`vulnDeps` | `checks.*` | `BigInt`, saturate at `2^32 - 1` |
| `coverage` | `checks.coverage` | `BigInt(round(pct * 100))`, clamp to `[0, 10000]` |

`repoId` must be computed with the **same** `persistentHash` the circuit uses. Do not substitute a
Node `crypto` SHA-256 call and assume they match — `persistentHash` operates over Compact's typed,
field-aligned representation, not raw bytes. Cross-check one known value against the contract's own
output before trusting the pipeline.

## Salt

32 cryptographically random bytes, fresh per attestation, generated in CI.

- **Never** goes into the attestation predicate (that would unblind the commitment — see
  [02-threat-model.md](02-threat-model.md)).
- Travels with the evidence in the private artifact.
- Losing it makes the attestation unprovable forever. There is no recovery.

## Policy struct

```compact
struct Policy {
  maxCriticals:   Uint<32>;
  maxHighs:       Uint<32>;
  maxVulnDeps:    Uint<32>;
  minCoverage:    Uint<32>;
  requireCiGreen: Boolean;
}
```

Public in ledger state so verifiers can read what a badge means. Policy id is
`persistentHash` of the policy slug, e.g. `"production-ready"`.

**Ship exactly one policy.** Proposed `production-ready`:

```
maxCriticals: 0,  maxHighs: 5,  maxVulnDeps: 0,  minCoverage: 7000,  requireCiGreen: true
```

## Versioning

`schema` carries `v1`. Any field change is a **new schema version and a new policy id**. Old
attestations remain valid under the old policy — `HistoricMerkleTree` keeps historic roots valid, so
outstanding proofs don't break.

## Sign-off

Do not start track work until all four initial each line:

- [ ] Track A (contract) — struct matches the `.compact` source
- [ ] Track B (collector) — emits exactly these fields, canonically
- [ ] Track C (anchor/CLI) — imports `canonical.ts`, no reimplementation
- [ ] Track D (dApp) — imports `canonical.ts`, no reimplementation
