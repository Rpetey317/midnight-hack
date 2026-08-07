# 04 — Contract Specification

> **Status: BUILT AND TESTED.** Implemented at `contract/src/audit_registry.compact`. Compiles with
> `compact compile --skip-zk` (compiler v0.31.1, dev tools v0.5.1), typechecks clean, and **50
> simulator tests pass** — including test 7, the historic-root property that validates the core
> design. Runtime semantics are VERIFIED, not merely assumed.
>
> Still UNVERIFIED: real proving-key generation (`npm run compile:keys`) and on-chain behaviour. The
> simulator executes the same compiled circuit logic but does not produce or check a PLONK proof.
>
> ```bash
> cd contract && npm install && npm run compile && npm test
> ```
>
> The source below is the specification as originally designed. Four things changed during
> implementation — see [As-built changes](#as-built-changes).

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

**VERIFIED** 2026-08-07 by inspecting a real transcript, not by reading docs. The test
`does not publish the leaf preimage when anchoring` anchors a known leaf and asserts its bytes are
absent from `proofData.publicTranscript`. They are.

**But the compiler still demands `disclose()` on the argument.** Writing `attestations.insert(leaf)`
bare is rejected:

```
potential witness-value disclosure must be declared but is not:
  witness value potentially disclosed:
    the value of parameter leaf of exported circuit attest
  nature of the disclosure:
    ledger operation might disclose the witness value
```

So the annotation and the actual runtime behaviour disagree — `disclose()` reads as "this becomes
public", on the one operation whose entire selling point is that it doesn't. The disclosure analysis
is conservative about ledger writes generally and does not special-case `insert`. Worth knowing before
someone concludes the privacy story is broken and redesigns around it. **This is good Midnight DX
feedback** — see [06-demo-script.md](06-demo-script.md).

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

## As-built changes

Four differences between the specification above and `contract/src/audit_registry.compact`. All are
implemented and tested.

### 1. Exported pure circuits — the encoding is now compiler-guaranteed

```compact
export pure circuit leafOf(ev: Evidence, salt: Bytes<32>): Bytes<32>
export pure circuit nullifierOf(leaf: Bytes<32>, policyId: Bytes<32>): Bytes<32>
export pure circuit repoIdOf(repo: Bytes<64>): Bytes<32>
export pure circuit anchorIdOf(sk: Bytes<32>): Bytes<32>
```

**VERIFIED:** `persistentCommit` and `persistentHash` do qualify as pure, and the compiler emits these
into a `pureCircuits` object callable from TypeScript with **no context and no transaction**.

`claimBadge` calls `leafOf`/`nullifierOf` rather than inlining the expressions, so the function Track B
calls to build a leaf is literally the function the circuit checks it against. This closes the
schema-drift risk that [03-evidence-schema.md](03-evidence-schema.md) named as the project's highest.

`repoIdOf` takes `Bytes<64>` because `Bytes<N>` is fixed-width — the padding had to be pinned
somewhere. Policy ids use the same circuit and the same padding.

### 2. `disclose()` required on `attest`'s leaf

Forced by the compiler, not chosen. See [Privacy property of `insert()`](#privacy-property-of-insert)
— the raw leaf still does not reach the transcript.

### 3. Counter initialization — a real bug in the spec above

`compliantCount.lookup(policyId).increment(1)` throws if the key was never inserted, and a
`Map<_, Counter>` entry does not exist until it is. As written, **the first successful claim would
fail.** `registerPolicy` now seeds it:

```compact
if (!compliantCount.member(disclose(policyId))) {
  compliantCount.insert(disclose(policyId), default<Counter>);
}
```

Guarded, so re-registering a policy updates thresholds without wiping the tally. `claimBadge`'s lookup
is then safe by invariant: `policies.lookup` on the line above already fails for an unregistered
policy.

### 4. Anchor access control

As specified in [Open items](#open-items), now implemented. Identity derives from a witness secret,
**not** `ownPublicKey()` — the latter is prover-supplied circuit context that any caller can set to any
value, so using it for authorization is bypassable.

```compact
export sealed ledger anchor: Bytes<32>;
witness localSecret(): Bytes<32>;

constructor() { anchor = disclose(anchorIdOf(localSecret())); }
circuit requireAnchor(): [] { assert(disclose(anchorIdOf(localSecret()) == anchor), "not anchor"); }
```

Whoever deploys becomes the anchor permanently. A repo owner calling `claimBadge` never invokes
`localSecret` and needs no secret at all — there is a test for exactly that.

## Testing

Simulator tests in `contract/src/test/`, run with `npm test`. **50 passing as of 2026-08-07.**

There is no published simulator package for Compact — `@openzeppelin-compact/contracts-simulator`
does not exist on npm, despite being referenced by some tooling docs. `src/test/simulator.ts` threads
`CircuitContext` by hand over `@midnight-ntwrk/compact-runtime`, which is all a simulator is.

These are the acceptance criteria for Track A:

| # | Criterion | Status |
|---|---|---|
| 1 | Valid claim on compliant evidence → returns `true`, `compliantCount` increments | ✅ |
| 2 | Non-compliant evidence → returns `false`, **does not revert**, tally unchanged. Proving non-compliance is a legitimate outcome, not an error. Covered for criticals, coverage, and CI status separately. | ✅ |
| 3 | Tampered evidence → fails at `path/leaf mismatch`. All seven fields mutated independently. | ✅ |
| 4 | Wrong salt → fails at `path/leaf mismatch` | ✅ |
| 5 | Leaf never anchored → fails at `not anchored` | ✅ |
| 6 | Replay of the same `(leaf, policy)` → fails at `already claimed` | ✅ |
| 7 | **Historic root:** anchor leaf A, capture A's path, anchor B and C, *then* claim with A's original path → still succeeds | ✅ |

Test 7 is the one most likely to be skipped and most likely to matter. It passes, and a second variant
holds the path across 20 further inserts. With a plain `MerkleTree` both fail — which is the point.

Beyond the seven:

| Area | What it covers |
|---|---|
| Deployment | Deployer is sealed as anchor; tree, policies, and nullifier set start empty |
| Pure circuits | The TypeScript-computed leaf is the one `claimBadge` accepts; commitments are blinded and deterministic; nullifiers are domain-separated and differ per policy |
| Encoding | 64-byte repo padding, overlong-name rejection, commit SHA left-alignment, schema-version rejection, coverage clamping |
| Access control | `attest` and `registerPolicy` rejected from a non-anchor; tree untouched after rejection; a repo owner claims holding no secret at all |
| Policy registration | Thresholds readable; tally seeded; re-registration preserves the tally; unregistered policy rejected |
| **Privacy** | Leaf preimage absent from the anchoring transcript; repo, commit, salt, and leaf absent from the claim transcript; nullifier and policy id present as intended |
| Known gaps | Gap 1 (fresh-salt re-anchoring permits a second claim) is pinned by a test, so a future change to it is deliberate rather than accidental |

The privacy tests mechanize the checklist in [02-threat-model.md](02-threat-model.md) — it is checked
by assertion now, not by eye before the demo.

## Open items

- **UNVERIFIED:** block-time access in-circuit for `maxAgeSeconds` freshness. First on the cut list.
- **UNVERIFIED:** real proving-key generation and on-chain execution. `npm run compile:keys` generates
  keys; nothing has been deployed yet.
- ~~Access control on `attest` / `registerPolicy`~~ — done, see [As-built changes](#as-built-changes).
- Depth 16 is arbitrary but ample. Changing it changes the proving key; decide before generating keys.
- The anchor secret is fixed at deployment and has no rotation path. Fine for the hackathon; a real
  deployment wants key rotation or a multi-sig anchor.
