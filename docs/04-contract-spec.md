# 04 — Contract Specification

> **Status: VERIFIED to compile.** The contract below was compiled on 2026-08-07 with
> `compact compile --skip-zk` (compiler v0.31.1, dev tools v0.5.1) — exit code 0, full `contract/` and
> `zkir/` output produced.
>
> **Compiling is not the same as behaving correctly.** Runtime semantics remain UNVERIFIED until the
> simulator tests in [Testing](#testing) pass. Do not claim correctness on stage until they do.

## Resolved design unknowns

Four things could have silently broken this design. All four were probed and **all four work**:

| # | Unknown | Result |
|---|---|---|
| 1 | `struct` with mixed `Boolean`/`Uint`/`Bytes` as a `persistentCommit<T>` type argument | ✅ works |
| 2 | Field access `path.leaf` on the stdlib `MerkleTreePath` struct | ✅ works |
| 3 | `Map.lookup()` returning a struct, used in comparisons | ✅ works |
| 4 | Conditional ledger write (`if (ok) { ... }`) inside a circuit | ✅ works |

Unknown 2 mattered most — the fallback would have been reconstructing the path struct in-circuit from
witness siblings, which is fiddlier. It's unnecessary.

## Ledger state

```compact
export ledger attestations:    HistoricMerkleTree<16, Bytes<32>>;
export ledger policies:        Map<Bytes<32>, Policy>;
export ledger claimed:         Set<Bytes<32>>;
export ledger compliantCount:  Map<Bytes<32>, Counter>;
export sealed ledger anchor:   Bytes<32>;
```

### Why each type

| Field | Type | Rationale |
|---|---|---|
| `attestations` | `HistoricMerkleTree<16, Bytes<32>>` | **Load-bearing.** Plain `MerkleTree` invalidates every outstanding proof on each insert — the moment a second repo anchors, the first repo's proof dies. `HistoricMerkleTree.checkRoot()` accepts any historic root. Depth 16 = 65,536 attestations. |
| `policies` | `Map` | Public thresholds so verifiers know what a badge means. |
| `claimed` | `Set` | Nullifiers are already-public values; a `Set` is right. Privacy comes from the nullifier being unguessable, not from hiding the set. |
| `compliantCount` | `Map<_, Counter>` | Public tally per policy — the demo's visible on-chain effect. |
| `anchor` | `sealed` | Compiler-enforced immutability, no runtime access-control checks needed. |

### Privacy property of `insert()`

`MerkleTree.insert()` / `HistoricMerkleTree.insert()` apply `leaf_hash()` (a `persistent_hash`) before
storing. **Only the hash enters the transaction transcript** — this is the only ledger operation that
hides its data argument. So even the blinded commitment never appears publicly.

Use `insert()`, **not** `insertHash()`. `insertHash()` publishes the hash you pass. Correspondingly the
circuit uses `merkleTreePathRoot<16, Bytes<32>>` (which hashes the leaf), not
`merkleTreePathRootNoLeafHash`.

## Circuits

| Circuit | Caller | Effect |
|---|---|---|
| `attest(leaf)` | anchor only | `attestations.insert(leaf)` |
| `registerPolicy(id, policy)` | anchor only | writes public thresholds |
| `claimBadge(policyId) -> Boolean` | repo owner, locally | membership + nullifier + policy predicate |

## `claimBadge` — verified source

```compact
pragma language_version >= 0.23;
import CompactStandardLibrary;

struct Evidence {
  repoId:     Bytes<32>;
  commitId:   Bytes<32>;
  issuedAt:   Uint<64>;
  ciGreen:    Boolean;
  criticals:  Uint<32>;
  highs:      Uint<32>;
  vulnDeps:   Uint<32>;
  coverage:   Uint<32>;
}

struct Policy {
  maxCriticals:   Uint<32>;
  maxHighs:       Uint<32>;
  maxVulnDeps:    Uint<32>;
  minCoverage:    Uint<32>;
  requireCiGreen: Boolean;
}

export ledger attestations:   HistoricMerkleTree<16, Bytes<32>>;
export ledger policies:       Map<Bytes<32>, Policy>;
export ledger claimed:        Set<Bytes<32>>;
export ledger compliantCount: Map<Bytes<32>, Counter>;

witness getEvidence(): Evidence;
witness getSalt(): Bytes<32>;
witness getPath(): MerkleTreePath<16, Bytes<32>>;

export circuit claimBadge(policyId: Bytes<32>): Boolean {
  const ev   = getEvidence();
  const salt = getSalt();
  const leaf = persistentCommit<Evidence>(ev, salt);

  // Bind the witness-supplied path to OUR computed commitment.
  // Without this the prover could supply a path for someone else's leaf.
  const path = getPath();
  assert(disclose(path.leaf == leaf), "path/leaf mismatch");

  const digest = merkleTreePathRoot<16, Bytes<32>>(path);
  assert(attestations.checkRoot(disclose(digest)), "not anchored");

  const nul = disclose(persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "<PROJECT>:claim:nul:"), leaf, policyId
  ]));
  assert(!claimed.member(nul), "already claimed");
  claimed.insert(nul);

  const p = policies.lookup(disclose(policyId));
  const ok = disclose(
    ev.criticals <= p.maxCriticals && ev.highs <= p.maxHighs &&
    ev.vulnDeps  <= p.maxVulnDeps  && ev.coverage >= p.minCoverage &&
    (!p.requireCiGreen || ev.ciGreen)
  );

  if (ok) { compliantCount.lookup(disclose(policyId)).increment(1); }
  return ok;
}
```

### Disclosure decisions — every `disclose()` justified

Compact is private by default; each `disclose()` is a deliberate hole. Reviewers should check these:

| Disclosed | Why it's safe |
|---|---|
| `path.leaf == leaf` | A boolean, always `true` for honest provers. Reveals no evidence content. |
| `digest` (Merkle root) | A public historic root. Reveals nothing about *which* leaf. |
| `nul` | Derived from the salt-blinded leaf, so unguessable. Must be public — it's the replay guard. |
| `policyId` | Public by design; the verifier must know which policy was checked. |
| `ok` | **The product.** The one bit we intend to reveal. |

**Never disclosed:** `ev` (any field), `salt`, `leaf`, `path` siblings.

The critical line is the predicate: `disclose(ev.criticals <= p.maxCriticals && ...)` discloses the
*comparison*, never the operands. Writing `disclose(ev.criticals)` would defeat the entire protocol.

## Generated TypeScript surface

**VERIFIED** — from the compiler's `index.d.ts`:

```typescript
export type Ledger = {
  attestations: {
    isFull(): boolean;
    checkRoot(rt: { field: bigint }): boolean;
    root(): MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index: bigint, leaf: Uint8Array): MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf: Uint8Array): MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<MerkleTreeDigest>;
  };
  policies: {
    isEmpty(): boolean; size(): bigint;
    member(key: Uint8Array): boolean;
    lookup(key: Uint8Array): { maxCriticals: bigint, maxHighs: bigint,
                               maxVulnDeps: bigint, minCoverage: bigint,
                               requireCiGreen: boolean };
  };
  // claimed: Set, compliantCount: Map<_, Counter>
};
```

Notes for Track C/D:
- `findPathForLeaf` is an **O(n) scan** — fine at demo scale, but use `pathForLeaf(index, leaf)` if the
  anchor records the leaf index in the receipt. Prefer that.
- `findPathForLeaf` returns `undefined` when absent. Handle it; don't let it become a cryptic circuit failure.
- `checkRoot` takes `{ field: bigint }`, not a bare bigint.
- `claimBadge` is impure/provable (there are **no** pure circuits) — it always needs a proof and a tx.

## Testing

Simulator tests in `contract/src/test/`. These are the acceptance criteria for Track A:

1. Valid claim on compliant evidence → returns `true`, `compliantCount` increments.
2. Valid claim on non-compliant evidence → returns `false`, **does not revert**, tally unchanged.
   (Proving non-compliance is a legitimate outcome, not an error.)
3. Tampered evidence (any field mutated) → fails at `path/leaf mismatch`.
4. Wrong salt → fails at `path/leaf mismatch`.
5. Leaf never anchored → fails at `not anchored`.
6. Replay of the same `(leaf, policy)` → fails at `already claimed`.
7. **Historic root property:** anchor leaf A, build A's path, anchor leaves B and C, *then* claim with
   A's original path → still succeeds. This is the whole reason for `HistoricMerkleTree`; if it fails,
   the design is broken.

Test 7 is the one most likely to be skipped and most likely to matter.

## Open items

- **UNVERIFIED:** block-time access in-circuit for `maxAgeSeconds` freshness. First on the cut list.
- Access control on `attest` / `registerPolicy` is specified (`sealed ledger anchor`) but not in the
  probed source — Track A adds it using the owner-only pattern (`persistentHash` of a witness secret
  compared against the sealed field).
- Depth 16 is arbitrary but ample. Changing it changes the proving key; decide before generating keys.
