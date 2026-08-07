# 04 — Contract Specification

> **Two states in this document.**
>
> - **[As-built](#as-built-v1)** — `contract/src/audit_registry.compact`. Compiles, typechecks, 50
>   simulator tests pass. Accurate as of 2026-08-07.
> - **[Target](#target-v2)** — what [`Master-Doc.md`](../Master-Doc.md) requires. Not implemented.
>
> The delta and its rationale live in [07-alignment-delta.md](07-alignment-delta.md). Read that before
> editing the contract.
>
> ```bash
> cd contract && npm install && npm run compile && npm test
> ```

## Resolved design unknowns

Four things could have silently broken this design. All four were probed and **all four work** — and
all four remain valid for v2:

| # | Unknown | Result |
|---|---|---|
| 1 | `struct` with mixed `Boolean`/`Uint`/`Bytes` as a `persistentCommit<T>` type argument | ✅ works |
| 2 | Field access `path.leaf` on the stdlib `MerkleTreePath` struct | ✅ works |
| 3 | `Map.lookup()` returning a struct, used in comparisons | ✅ works |
| 4 | Conditional ledger write (`if (ok) { ... }`) inside a circuit | ✅ works |

Unknown 2 mattered most — the fallback would have been reconstructing the path struct in-circuit from
witness siblings, which is fiddlier. It is unnecessary.

Unknown 1 is what makes the v2 struct growth safe: a 15-field mixed struct commits the same way an
8-field one does. Only the leaf value changes, not the technique.

---

# As-built (v1)

**Status: BUILT AND TESTED.** Compiles with `compact compile --skip-zk` (compiler v0.31.1, dev tools
v0.5.1), typechecks clean, and **50 simulator tests pass** — including test 7, the historic-root
property that validates the core design. Runtime semantics are VERIFIED, not assumed.

Still UNVERIFIED: real proving-key generation (`npm run compile:keys`) and on-chain behaviour. The
simulator executes the same compiled circuit logic but does not produce or check a PLONK proof.

## Ledger state

```compact
export ledger attestations:    HistoricMerkleTree<16, Bytes<32>>;
export ledger policies:        Map<Bytes<32>, Policy>;
export ledger claimed:         Set<Bytes<32>>;
export ledger compliantCount:  Map<Bytes<32>, Counter>;
export sealed ledger anchor:   Bytes<32>;
```

| Field | Type | Rationale |
|---|---|---|
| `attestations` | `HistoricMerkleTree<16, Bytes<32>>` | **Load-bearing.** Plain `MerkleTree` invalidates every outstanding proof on each insert — the moment a second vendor anchors, the first vendor's proof dies. `checkRoot()` accepts any historic root. Depth 16 = 65,536 attestations. |
| `policies` | `Map` | Public thresholds so buyers know what a record means. |
| `claimed` | `Set` | Nullifiers are already-public values; a `Set` is right. Privacy comes from the nullifier being unguessable, not from hiding the set. |
| `compliantCount` | `Map<_, Counter>` | Public tally per policy. **Insufficient for the Master Doc** — see [Target](#target-v2). |
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
public", on the one operation whose entire selling point is that it doesn't. The disclosure analysis is
conservative about ledger writes generally and does not special-case `insert`. Worth knowing before
someone concludes the privacy story is broken and redesigns around a non-problem. **This is good Midnight
DX feedback** — see [06-demo-script.md](06-demo-script.md).

Use `insert()`, **not** `insertHash()`. `insertHash()` publishes the hash you pass. Correspondingly the
circuit uses `merkleTreePathRoot<16, Bytes<32>>` (which hashes the leaf), not
`merkleTreePathRootNoLeafHash`.

## Circuits

| Circuit | Caller | Effect |
|---|---|---|
| `attest(leaf)` | anchor only | `attestations.insert(leaf)` |
| `registerPolicy(id, policy)` | anchor only | writes public thresholds, seeds the tally |
| `claimBadge(policyId) -> Boolean` | vendor, locally | membership + nullifier + policy predicate |
| `leafOf`, `nullifierOf`, `repoIdOf`, `anchorIdOf` | anyone, off-chain | pure derivations |

### Exported pure circuits — the encoding is compiler-guaranteed

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
schema-drift risk that [03-evidence-schema.md](03-evidence-schema.md) names as the project's highest.

`repoIdOf` takes `Bytes<64>` because `Bytes<N>` is fixed-width — the padding had to be pinned somewhere.
Policy ids use the same circuit and the same padding. **The name is misleading** and should become
`stringIdOf` in v2; it was never repo-specific.

### Anchor access control

Identity derives from a witness secret, **not** `ownPublicKey()` — the latter is prover-supplied circuit
context that any caller can set to any value, so using it for authorization is bypassable. Its only safe
use is routing tokens to a caller.

```compact
export sealed ledger anchor: Bytes<32>;
witness localSecret(): Bytes<32>;

constructor() { anchor = disclose(anchorIdOf(localSecret())); }
circuit requireAnchor(): [] { assert(disclose(anchorIdOf(localSecret()) == anchor), "not anchor"); }
```

Whoever deploys becomes the anchor permanently. A vendor calling `claimBadge` never invokes
`localSecret` and needs no secret at all — there is a test for exactly that.

### Counter initialization — a real bug caught during implementation

`compliantCount.lookup(policyId).increment(1)` throws if the key was never inserted, and a
`Map<_, Counter>` entry does not exist until it is. Without seeding, **the first successful claim would
fail.** `registerPolicy` seeds it:

```compact
if (!compliantCount.member(disclose(policyId))) {
  compliantCount.insert(disclose(policyId), default<Counter>);
}
```

Guarded, so re-registering a policy updates thresholds without wiping the tally. `claimBadge`'s lookup
is then safe by invariant: `policies.lookup` on the line above already fails for an unregistered policy.

**This trap applies identically to any v2 per-policy or per-record counter.** Seed on registration.

## `claimBadge` — as-built source

The authoritative copy is `contract/src/audit_registry.compact`; this is it with comments stripped.

```compact
export circuit claimBadge(policyId: Bytes<32>): Boolean {
  const ev   = getEvidence();
  const salt = getSalt();
  const leaf = leafOf(ev, salt);

  // Bind the witness-supplied path to OUR computed commitment.
  // Without this the prover could supply a path for someone else's leaf.
  const path = getPath();
  assert(disclose(path.leaf == leaf), "path/leaf mismatch");

  const digest = merkleTreePathRoot<16, Bytes<32>>(path);
  assert(attestations.checkRoot(disclose(digest)), "not anchored");

  const nul = disclose(nullifierOf(leaf, policyId));
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

Compact is private by default; each `disclose()` is a deliberate hole. Reviewers check these.

| Disclosed | Why it's safe |
|---|---|
| `path.leaf == leaf` | A boolean, always `true` for honest provers. Reveals no evidence content. |
| `digest` (Merkle root) | A public historic root. Reveals nothing about *which* leaf. |
| `nul` | Derived from the salt-blinded leaf, so unguessable. Must be public — it is the replay guard. |
| `policyId` | Public by design; the buyer must know which policy was checked. |
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

Notes:
- `findPathForLeaf` is an **O(n) scan** — fine at demo scale, but prefer `pathForLeaf(index, leaf)` if
  the anchor records the leaf index in its receipt.
- `findPathForLeaf` returns `undefined` when absent. Handle it; don't let it become a cryptic circuit
  failure.
- `checkRoot` takes `{ field: bigint }`, not a bare bigint.
- `claimBadge` is impure/provable — it always needs a proof and a tx.
- **`Map` exposes `isEmpty/size/member/lookup` and no iterator**, while `attestations` exposes
  `history()`. This matters for v2: see the open question under [Target](#target-v2).

## Testing

Simulator tests in `contract/src/test/`, run with `npm test`. **50 passing as of 2026-08-07.**

There is no published simulator package for Compact — `@openzeppelin-compact/contracts-simulator` does
not exist on npm, despite being referenced by some tooling docs. `src/test/simulator.ts` threads
`CircuitContext` by hand over `@midnight-ntwrk/compact-runtime`, which is all a simulator is.

Acceptance criteria, all met:

| # | Criterion | Status |
|---|---|---|
| 1 | Valid claim on compliant evidence → returns `true`, tally increments | ✅ |
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
| Encoding | 64-byte padding, overlong-name rejection, commit SHA left-alignment, schema-version rejection, coverage clamping |
| Access control | `attest` and `registerPolicy` rejected from a non-anchor; tree untouched after rejection; a vendor claims holding no secret at all |
| Policy registration | Thresholds readable; tally seeded; re-registration preserves the tally; unregistered policy rejected |
| **Privacy** | Leaf preimage absent from the anchoring transcript; repo, commit, salt, and leaf absent from the claim transcript; nullifier and policy id present as intended |
| Known gaps | Fresh-salt re-anchoring permitting a second claim is pinned by a test, so changing it is deliberate rather than accidental |

The privacy tests mechanize the checklist in [02-threat-model.md](02-threat-model.md) — it is checked by
assertion, not by eye before the demo. **Keep that property through the v2 migration.**

---

# Target (v2)

Required by the Master Doc, not implemented. Rationale in
[07-alignment-delta.md](07-alignment-delta.md).

## Ledger state

```compact
export ledger attestations: HistoricMerkleTree<16, Bytes<32>>;
export ledger policies:     Map<Bytes<32>, Policy>;
export ledger claimed:      Set<Bytes<32>>;
export sealed ledger anchor: Bytes<32>;

// NEW — §43. Current status, keyed by stringIdOf-style hash(artifactDigest, policyId):
// exactly the buyer's query.
export ledger records:      Map<Bytes<32>, ComplianceRecord>;

// NEW — §25, §27. Append-only timeline. See the open question below.
export ledger history:      List<ComplianceRecord>;
```

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
```

`compliantCount` becomes optional — `records` subsumes it. Keep it if the demo wants a headline number.

### Open question that gates the buyer history view

**UNVERIFIED — resolve before designing the buyer timeline.** `List<T>` is a valid ledger type with
`pushFront` / `popFront` / `head` (per the `compact-ledger` skill), but the v1 generated surface above
shows `Map` with **no iterator**. Whether the generated `Ledger` type exposes iteration over a `List` or
a `Map` is unconfirmed.

If it does not, two fallbacks, neither requiring a contract change:

1. **Point lookup for current status** — `records[hash(artifactDigest, policyId)]` answers the buyer's
   primary question (§25's top panel) with no iteration at all.
2. **Client-side timeline** — the UI keeps the list of known artifact digests (it knows them; they are
   public) and does one lookup per digest to assemble the history.

Do not build the buyer view around iteration until someone has confirmed it exists.

## `proveCompliance`

Replaces `claimBadge`. Four **public** inputs; everything else private.

```compact
export circuit proveCompliance(
  vendorId:       Bytes<32>,
  productId:      Bytes<32>,
  artifactDigest: Bytes<32>,
  policyId:       Bytes<32>
): Boolean {
  const ev   = getEvidence();
  const salt = getSalt();
  const leaf = leafOf(ev, salt);

  // 1. Authenticated? — bind the witness path to our commitment, then to the tree.
  const path = getPath();
  assert(disclose(path.leaf == leaf), "path/leaf mismatch");
  const digest = merkleTreePathRoot<16, Bytes<32>>(path);
  assert(attestations.checkRoot(disclose(digest)), "not attested");

  // 2. About THIS artifact? — §10. The highest-value line in the migration.
  assert(disclose(ev.artifactDigest == artifactDigest), "artifact mismatch");

  // 3. Not replayed?
  const nul = disclose(nullifierOf(leaf, policyId));
  assert(!claimed.member(nul), "already proven");
  claimed.insert(nul);

  const p = policies.lookup(disclose(policyId));

  // 4. Measured by an acceptable attestor? — §35. Zero means "any".
  assert(disclose(p.requiredAttestor == default<Bytes<32>>
                  || ev.attestorId == p.requiredAttestor), "attestor not accepted");

  // 5. The predicate. disclose() wraps the comparison, never the operands.
  const ok = disclose(
    ev.criticals     <= p.maxCriticals     &&
    ev.highs         <= p.maxHighs         &&
    ev.kev           <= p.maxKev           &&
    ev.forbiddenDeps <= p.maxForbiddenDeps &&
    (!p.requireMfa              || ev.mfaRequired)     &&
    (!p.requireBranchProtection || ev.branchProtected) &&
    (!p.requireBuildProvenance  || ev.buildProvenanceVerified)
  );

  // 6. Public, time-bound record — §11, §43.
  const key = recordKeyOf(artifactDigest, policyId);
  records.insert(disclose(key), ComplianceRecord {
    vendorId:       disclose(vendorId),
    productId:      disclose(productId),
    artifactDigest: disclose(artifactDigest),
    policyId:       disclose(policyId),
    policyVersion:  disclose(p.version),
    provenAt:       disclose(ev.generatedAt),
    validUntil:     disclose(ev.validUntil),
    compliant:      ok
  });

  return ok;
}
```

### New disclosure decisions

Each addition must be justified as deliberately as the v1 set.

| Disclosed | Why it's safe / intended |
|---|---|
| `ev.artifactDigest == artifactDigest` | A boolean. The digest itself is a public input already (§37). |
| `vendorId`, `productId`, `artifactDigest` | **Public by design** (§37). A procurement record that omitted them would be useless to a buyer. |
| `p.version` | Reading public ledger state. |
| `ev.generatedAt`, `ev.validUntil` | Public by design — §1's buyer view shows "Evidence date", §11 requires visible expiry. |
| attestor comparison | A boolean. Which attestor is *required* is already public in the policy. |

**Still never disclosed:** every vulnerability count, `forbiddenDeps`, `vulnDeps`, `coverage`, all four
configuration booleans individually, `salt`, `leaf`, `path` siblings, `ev.commitId`, `ev.attestorId`.

Note the boolean-composition subtlety: disclosing the **conjunction** is safe, but disclosing each
requirement separately would leak which specific control failed. §25's buyer view shows a per-requirement
checklist — for a *passing* record every line is ✓ by definition, so it can be rendered from `ok` alone.
**Do not add per-requirement disclosure to support the failing case** without deciding that leaking the
failure reason is acceptable.

### New helper

```compact
export pure circuit recordKeyOf(artifactDigest: Bytes<32>, policyId: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "zkaudit:record:key:"), artifactDigest, policyId
  ]);
}
```

Pure, so the buyer UI computes the same key off-chain to do its lookup.

## Migration checklist

Ordered. Items 1–3 are the contract; 4 is the fixtures; 5 is the guard against regression.

1. `Evidence` v2 struct, `Policy` v2 struct, `ComplianceRecord`. Bump `EVIDENCE_SCHEMA` to `…v2`.
2. Rename `repoIdOf` → `stringIdOf`, `claimBadge` → `proveCompliance`. Add `recordKeyOf`.
3. Add the artifact-digest binding, the attestor check, and the record write. Add `records`.
4. Update `encoding.ts` and `fixtures.ts` for the new fields; register both §20 policies.
5. Extend the test suite: the seven criteria still apply, plus **artifact-digest mismatch must fail**,
   the record must be written with correct values, and the privacy assertions must be re-run against
   the new transcript — the public set grew, so the "absent from transcript" list changed and the old
   assertions will not catch a mistake in the new fields.

## Open items

- **UNVERIFIED:** `List`/`Map` iteration in the generated TypeScript ledger reader. Gates the buyer
  timeline; see above.
- **UNVERIFIED:** `blockTimeGte` / `blockTimeLt` for on-chain freshness enforcement. Recording
  `validUntil` and letting the reader judge needs no new primitive and is the MVP path.
- **UNVERIFIED:** real proving-key generation and on-chain execution. Nothing deployed yet. Generate
  keys **after** the v2 migration — depth 16 and the struct shape are both baked into the key.
- The anchor secret is fixed at deployment with no rotation path. Fine for the hackathon; a real
  deployment wants rotation or a multi-sig anchor.
- Project name unresolved. `zkaudit` is hardcoded in domain separators, which are commitment inputs —
  renaming after anchoring invalidates every record. Settle it before the first real anchor.
