# 03 — Evidence Schema

> **FROZEN — Track A, 2026-08-07.** The encoding below is implemented and mechanically tested.
>
> Four components encode this struct: the Compact contract, the collector, the anchor, and the
> CLI/UI. If the encodings disagree by a single byte, `persistentCommit` produces a different leaf,
> the Merkle path check fails, and every proof breaks. You would discover this at the integration
> checkpoint with no time to fix it. **This was the highest-risk item in the project.**
>
> It is now closed by construction — see the rule below.

## Rule: one implementation, everyone imports it

**`contract/` is the only implementation, and most of it is the compiler's own output.**

The contract exports `leafOf`, `nullifierOf`, `repoIdOf`, and `anchorIdOf` as **pure circuits**, which
the Compact compiler emits into a `pureCircuits` object callable from TypeScript with no context and
no transaction. These are compiled from the same source `claimBadge` runs, so what TypeScript computes
is byte for byte what the circuit checks. Drift is not discouraged — it is impossible.

The byte-level JSON → struct encoding (`encodeRepo`, `encodeCommit`, `encodeEvidence`) lives beside
them in `contract/src/encoding.ts`.

```typescript
import { encodeEvidence, pureCircuits, policyId } from '@zkaudit/contract';

const evidence = encodeEvidence(canonicalJson);
const leaf     = pureCircuits.leafOf(evidence, salt);
const nul      = pureCircuits.nullifierOf(leaf, policyId('production-ready'));
```

The collector, anchor, CLI, and UI import these. Nobody reimplements them. Not "reimplements them
carefully" — nobody reimplements them. **VERIFIED** — `contract/src/test/audit_registry.test.ts`
anchors a leaf computed in TypeScript and proves against it in-circuit; if the two ever diverge, that
test fails.

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

localSecret(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];   // Bytes<32>
```

`localSecret` is the anchor operator's key, used only by `attest` and `registerPolicy`. A repo owner
calling `claimBadge` never invokes it and can leave it null — but the TypeScript `Witnesses` object
must still supply the key, so `contract/src/witnesses.ts` provides one that throws a named error if
it is ever actually reached.

These four are implemented once, in `contract/src/witnesses.ts`, over an `AuditPrivateState`. Import
that rather than writing your own.

### Trip-ups, all confirmed from the generated output

| Trap | Detail |
|---|---|
| **`goes_left`, not `goesLeft`** | The Compact docs write `goesLeft`; the generated TypeScript emits **snake_case** `goes_left`. Getting this wrong fails silently at path construction. |
| **All numerics are `bigint`** | `Uint<32>` and `Uint<64>` both map to `bigint`. Passing a JS `number` throws. Use `123n` or `BigInt(x)`. |
| **`sibling` is a wrapper object** | It's `{ field: bigint }`, not a bare `bigint`. |
| **`Bytes<32>` is exactly 32** | `Uint8Array` of length 32. Not 31, not 33. Pad explicitly. |
| **`Evidence` and `Policy` are anonymous** | The compiler emits them as inline object types, not named exports. `contract/src/types.ts` recovers them by indexing into the generated signatures, so a struct change becomes a TypeScript error rather than a silent commitment mismatch. Import from there. |

## Canonical JSON (the wire format)

What the collector writes and the owner keeps privately:

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

Rules: keys sorted, no insignificant whitespace, integers only (no floats — that's why coverage is
percent×100), `repo` lowercased, `commit` full 40-char lowercase hex.

## Encoding rules

All of these are implemented in `contract/src/encoding.ts`. The table is the specification; that file
is the implementation. Do not write a second one.

| Field | From canonical JSON | Encoding |
|---|---|---|
| `repoId` | `repo` | lowercase → UTF-8 → **zero-pad right to 64 bytes** → `pureCircuits.repoIdOf()` |
| `commitId` | `commit` | 40 hex chars → 20 bytes → left-aligned in 32 bytes, zero-padded right |
| `issuedAt` | `issuedAt` | `BigInt(unix seconds)` |
| `ciGreen` | `checks.ciGreen` | boolean |
| `criticals`/`highs`/`vulnDeps` | `checks.*` | `BigInt`, saturate at `2^32 - 1` |
| `coverage` | `checks.coverage` | `BigInt(round(pct * 100))`, clamp to `[0, 10000]` |

### The 64-byte repo padding

`Bytes<N>` is fixed-width in Compact, so "hash the UTF-8 bytes" is underspecified — the width has to
be pinned somewhere, and it is pinned here at **64 bytes, zero-padded right**. `encodeRepo()` throws
rather than truncating on an overlong name; silent truncation would collide two repos into one
identity.

Policy ids use the **same** padding and the same `repoIdOf` circuit, so one padding rule covers every
string this protocol hashes. `policyId('production-ready')` is the id for the policy below.

`repoId` must be computed with the **same** `persistentHash` the circuit uses. Do not substitute a
Node `crypto` SHA-256 call and assume they match — `persistentHash` operates over Compact's typed,
field-aligned representation, not raw bytes. Calling `pureCircuits.repoIdOf()` is how you avoid the
question entirely.

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
`policyId(slug)` — the 64-byte-padded slug through `repoIdOf`, e.g. `policyId('production-ready')`.

**Ship exactly one policy.** `production-ready`:

```
maxCriticals: 0,  maxHighs: 5,  maxVulnDeps: 0,  minCoverage: 7000,  requireCiGreen: true
```

`registerPolicy` seeds the badge tally alongside the policy. This matters: a `Map<_, Counter>` entry
does not exist until inserted, so without the seed the first successful `claimBadge` would throw on
`compliantCount.lookup().increment()`. Re-registering a policy updates the thresholds and leaves an
existing tally intact.

## Versioning

`schema` carries `v1`. Any field change is a **new schema version and a new policy id**. Old
attestations remain valid under the old policy — `HistoricMerkleTree` keeps historic roots valid, so
outstanding proofs don't break.

## Sign-off

- [x] **Track A (contract)** — struct matches `contract/src/audit_registry.compact`; encoding
      implemented in `contract/src/encoding.ts`; 50 tests green (2026-08-07)
- [ ] Track B (collector) — emits exactly these fields, canonically; imports `@zkaudit/contract`
- [ ] Track C (anchor/CLI) — imports `@zkaudit/contract`, no reimplementation
- [ ] Track D (dApp) — imports `@zkaudit/contract`, no reimplementation

`schema` is the string `zkaudit.evidence.v1`, exported as `EVIDENCE_SCHEMA`. `encodeEvidence()`
rejects any other value, so a version mismatch fails loudly at the boundary instead of producing a
leaf nobody can prove against.
