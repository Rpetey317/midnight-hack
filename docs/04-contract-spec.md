# 04 — Contract Specification

> **Status: BUILT AND TESTED on schema v2.** `contract/src/audit_registry.compact` compiles with
> `compact compile --skip-zk` (compiler v0.31.1, dev tools v0.5.1), typechecks clean, and **87
> simulator tests pass**. Runtime semantics are VERIFIED, not assumed.
>
> ```bash
> cd contract && npm install && npm run compile && npm test
> ```
>
> Still UNVERIFIED: real proving-key generation (`npm run compile:keys`) and on-chain behaviour. The
> simulator executes the same compiled circuit logic but does not produce or check a PLONK proof.
>
> The v1→v2 migration and its rationale are in [07-alignment-delta.md](07-alignment-delta.md).

## Resolved design unknowns

Everything below was probed by compiling and executing, not reasoned about. All nine work.

| # | Unknown | Result |
|---|---|---|
| 1 | `struct` with mixed `Boolean`/`Uint`/`Bytes` as a `persistentCommit<T>` type argument | ✅ works |
| 2 | Field access `path.leaf` on the stdlib `MerkleTreePath` struct | ✅ works |
| 3 | `Map.lookup()` returning a struct, used in comparisons | ✅ works |
| 4 | Conditional ledger write (`if (ok) { ... }`) inside a circuit | ✅ works |
| 5 | **17-field** mixed struct as a `persistentCommit<T>` argument | ✅ works — struct size is not a constraint |
| 6 | `Map<Bytes<32>, ComplianceRecord>` — struct value, `insert`/`lookup`, **and an iterator** | ✅ works |
| 7 | `List<ComplianceRecord>` ledger ADT with `pushFront`, **iterator**, and `head()` | ✅ works |
| 8 | Struct-literal construction in-circuit mixing public params, ledger reads, and disclosed witness values | ✅ works |
| 9 | `Uint<64> + Uint<64>` compared against a `Uint<64>` — width inference | ✅ works |

Unknown 2 mattered most in v1 — the fallback would have been reconstructing the path struct in-circuit
from witness siblings. Unknowns 6 and 7 mattered most in v2: they are what unblocked the buyer views.

### Map and List iteration — the question that was gating the buyer view

Earlier revisions of this document flagged iteration as UNVERIFIED and said it gated the buyer
timeline. It does not. The rule, read off the generated `index.d.ts`:

| Ledger field | Type | Iterator |
|---|---|---|
| `policies`, `records` | `Map<Bytes<32>, «struct»>` | ✅ `[Symbol.iterator]` yielding `[key, value]` |
| `claimed` | `Set<Bytes<32>>` | ✅ `[Symbol.iterator]` |
| `history` | `List<«struct»>` | ✅ `[Symbol.iterator]`, plus `head()` and `length()` |
| *(v1)* `compliantCount` | `Map<Bytes<32>, Counter>` | ❌ none |

**A `Map` iterates when its value is a plain struct, and does not when the value is itself a ledger
ADT** — you cannot materialize a `Counter` reference into an iterator tuple. So the buyer dashboard can
enumerate `records` directly and needs no client-side index, and the timeline can enumerate `history`.

`attestations.history()` is the odd one out: it returns a bare `Iterator`, **not** an
`IterableIterator`, so it cannot be spread or used with `for...of`. Drain it with `.next()`.

## Ledger state

```compact
export ledger attestations: HistoricMerkleTree<16, Bytes<32>>;
export ledger policies:     Map<Bytes<32>, Policy>;
export ledger claimed:      Set<Bytes<32>>;
export ledger records:      Map<Bytes<32>, ComplianceRecord>;
export ledger history:      List<ComplianceRecord>;
export sealed ledger anchor: Bytes<32>;
```

| Field | Rationale |
|---|---|
| `attestations` | **Load-bearing.** A plain `MerkleTree` invalidates every outstanding proof on each insert — the moment a second vendor attests, the first vendor's proof dies. `checkRoot()` accepts any historic root, which continuous compliance depends on. Depth 16 = 65,536 attestations. |
| `policies` | Public thresholds so buyers know what a record means. |
| `claimed` | Nullifiers are already-public values; a `Set` is right. Privacy comes from the nullifier being unguessable, not from hiding the set. |
| `records` | Current status keyed by `recordKeyOf(artifactDigest, policyId)` — exactly the buyer's query. A later proof for the same pair replaces the entry. |
| `history` | Append-only timeline (`pushFront`, so newest first). |
| `anchor` | `sealed` gives compiler-enforced immutability, no runtime access-control checks needed. |

**`compliantCount` was dropped in v2.** `records` subsumes it and gives an exact count by iteration,
whereas a `Map<_, Counter>` would double-count re-proofs of the same artifact — a headline number that
looks wrong on stage is worse than no headline number. Its removal also removes the seeding trap
described below, which is worth remembering for any future counter.

### The `Map<_, Counter>` seeding trap

Kept here because it will bite anyone who adds a per-policy tally back. A `Map<_, Counter>` entry does
not exist until inserted, so `compliantCount.lookup(id).increment(1)` throws on the **first** successful
proof. In v1 this was fixed by seeding in `registerPolicy`, guarded so re-registration did not wipe an
existing tally:

```compact
if (!compliantCount.member(disclose(policyId))) {
  compliantCount.insert(disclose(policyId), default<Counter>);
}
```

### Privacy property of `insert()`

`HistoricMerkleTree.insert()` applies `leaf_hash()` (a `persistent_hash`) before storing. **Only the
hash enters the transaction transcript** — this is the only ledger operation that hides its data
argument, and it is why nobody can build a leaf→artifact correlation table linking an on-chain proof
back to its attestation bundle.

**VERIFIED** by inspecting a real transcript. The test `does not publish the leaf preimage when
attesting` attests a known leaf and asserts its bytes are absent. They are.

**But the compiler still demands `disclose()` on the argument.** `attestations.insert(leaf)` bare is
rejected:

```
potential witness-value disclosure must be declared but is not:
  nature of the disclosure: ledger operation might disclose the witness value
```

So the annotation and the runtime behaviour disagree, on the one operation whose entire selling point is
that it does not disclose. The analysis is conservative about ledger writes and does not special-case
`insert`. Worth knowing before someone concludes the privacy story is broken and redesigns around a
non-problem. **Good Midnight DX feedback** — see [06-demo-script.md](06-demo-script.md).

Use `insert()`, **not** `insertHash()`. `insertHash()` publishes the hash you pass. Correspondingly
`proveCompliance` uses `merkleTreePathRoot<16, Bytes<32>>` (which hashes the leaf), not
`merkleTreePathRootNoLeafHash`.

## Circuits

| Circuit | Caller | Effect |
|---|---|---|
| `attest(leaf)` | anchor only | `attestations.insert(leaf)` |
| `registerPolicy(id, policy)` | anchor only | publishes thresholds |
| `proveCompliance(vendorId, productId, artifactDigest, policyId) -> Boolean` | vendor, locally | the whole protocol |
| `leafOf`, `nullifierOf`, `recordKeyOf`, `stringIdOf`, `anchorIdOf` | anyone, off-chain | pure derivations |

### Exported pure circuits — the encoding is compiler-guaranteed

```compact
export pure circuit leafOf(ev: Evidence, salt: Bytes<32>): Bytes<32>
export pure circuit nullifierOf(leaf: Bytes<32>, policyId: Bytes<32>): Bytes<32>
export pure circuit recordKeyOf(artifactDigest: Bytes<32>, policyId: Bytes<32>): Bytes<32>
export pure circuit stringIdOf(s: Bytes<64>): Bytes<32>
export pure circuit anchorIdOf(sk: Bytes<32>): Bytes<32>
```

**VERIFIED:** `persistentCommit` and `persistentHash` qualify as pure, and the compiler emits these into
a `pureCircuits` object callable from TypeScript with **no context and no transaction**.

`proveCompliance` calls `leafOf`/`nullifierOf`/`recordKeyOf` rather than inlining the expressions, so
the function Track B calls to build a leaf is literally the function the circuit checks it against.
This closes the schema-drift risk that [03-evidence-schema.md](03-evidence-schema.md) names as the
project's highest.

Domain separators are `zkuat:proof:nul:`, `zkuat:record:key:`, and `zkuat:anchor:pk:`. **These are
commitment inputs — renaming the project after anchoring invalidates every nullifier and every record.**
The name is settled.

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

Whoever deploys becomes the anchor permanently. A vendor calling `proveCompliance` never invokes
`localSecret` and needs no secret at all — there is a test for exactly that.

## `proveCompliance` — as-built source

The authoritative copy is `contract/src/audit_registry.compact`; this is it with comments stripped.

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

  // 1. Authenticated?
  const path = getPath();
  assert(disclose(path.leaf == leaf), "path/leaf mismatch");
  const digest = merkleTreePathRoot<16, Bytes<32>>(path);
  assert(attestations.checkRoot(disclose(digest)), "not attested");

  // 2. About THIS vendor's THIS product's THIS artifact?
  assert(disclose(ev.vendorId       == vendorId),       "vendor mismatch");
  assert(disclose(ev.productId      == productId),      "product mismatch");
  assert(disclose(ev.artifactDigest == artifactDigest), "artifact mismatch");

  // 3. Not replayed?
  const nul = disclose(nullifierOf(leaf, policyId));
  assert(!claimed.member(nul), "already proven");
  claimed.insert(nul);

  const p = policies.lookup(disclose(policyId));

  // 4. Measured by an acceptable attestor? All-zero means "any".
  assert(disclose(p.requiredAttestor == default<Bytes<32>>
                  || ev.attestorId == p.requiredAttestor), "attestor not accepted");

  // 5. Validity window within what the policy grants?
  assert(disclose(ev.validUntil <= ev.generatedAt + p.maxAgeSeconds),
         "validity window exceeds policy");

  // 6. The predicate — the conjunction is disclosed, never the operands.
  const ok = disclose(
    ev.criticals     <= p.maxCriticals     &&
    ev.highs         <= p.maxHighs         &&
    ev.kev           <= p.maxKev           &&
    ev.forbiddenDeps <= p.maxForbiddenDeps &&
    (!p.requireMfa              || ev.mfaRequired)     &&
    (!p.requireBranchProtection || ev.branchProtected) &&
    (!p.requireBuildProvenance  || ev.buildProvenanceVerified)
  );

  // 7. The public, time-bound record.
  const rec = ComplianceRecord {
    vendorId:       disclose(vendorId),
    productId:      disclose(productId),
    artifactDigest: disclose(artifactDigest),
    policyId:       disclose(policyId),
    policyVersion:  p.version,
    provenAt:       disclose(ev.generatedAt),
    validUntil:     disclose(ev.validUntil),
    compliant:      ok
  };

  records.insert(recordKeyOf(disclose(artifactDigest), disclose(policyId)), rec);
  history.pushFront(rec);

  return ok;
}
```

### Design notes

**Identity is bound in the evidence, not just passed as a public input.** Master Doc §21 binds only the
artifact digest. Binding vendor and product too costs two struct fields and two asserts and stops a
prover filing a record under a competitor's name — including a fabricated *failing* record. See
[03-evidence-schema.md](03-evidence-schema.md) for the reasoning; there is a test for the forgery case.

**The record is written whether or not the predicate passed**, carrying `compliant: ok`. This gives the
buyer four states — COMPLIANT / NOT COMPLIANT / EXPIRED / NO CURRENT PROOF — and puts the negative demo
case on-chain where it can be shown. A vendor would not voluntarily submit a failing proof, so in
practice failing records appear only when someone wants them to.

**Freshness is enforced relative to `generatedAt`, not to now.** Step 5 bounds how long an attestor may
declare evidence valid for, which is checkable in-circuit with no block-time primitive. Whether evidence
has *since* expired is the reader's judgement from `validUntil` in the public record. On-chain
enforcement against wall-clock would need `blockTimeLt`, which remains unverified and deferred.

**`records.insert` is last-writer-wins on `(artifactDigest, policyId)`.** Anyone holding attested
evidence that binds to that vendor/product/artifact can overwrite the entry — in practice only the
vendor, since only they hold their salt and bundle. A vendor could in principle overwrite a passing
record with an older failing one; they have no motive, and the identity binding stops anyone else.

### Disclosure decisions — every `disclose()` justified

Compact is private by default; each `disclose()` is a deliberate hole.

| Disclosed | Why it's safe / intended |
|---|---|
| `path.leaf == leaf` | A boolean, always `true` for honest provers. Reveals no evidence content. |
| `digest` (Merkle root) | A public historic root. Reveals nothing about *which* leaf. |
| identity comparisons | Booleans. The three identity values are public inputs already. |
| `nul` | Derived from the salt-blinded leaf, so unguessable. Must be public — it is the replay guard. |
| `vendorId`, `productId`, `artifactDigest`, `policyId` | **Public by design** (§37). A procurement record that omitted them would be useless to a buyer. |
| attestor comparison | A boolean. Which attestor is *required* is already public in the policy. |
| validity-window comparison | A boolean. Both operands are private; only the verdict leaks. |
| `ev.generatedAt`, `ev.validUntil` | Public by design — the buyer view shows evidence date and expiry. |
| `ok` | **The product.** The one bit the protocol exists to reveal. |

**Never disclosed:** every vulnerability count, `forbiddenDeps`, `vulnDeps`, `coverage`, all four
configuration booleans individually, `ev.commitId`, `ev.attestorId`, `salt`, `leaf`, `path` siblings.

Note the boolean-composition subtlety: disclosing the **conjunction** is safe, but disclosing each
requirement separately would leak which specific control failed. The buyer's per-requirement checklist
renders from `ok` alone — for a passing record every line is ✓ by definition. **Do not add
per-requirement disclosure to support the failing case** without deciding that leaking the failure
reason is acceptable.

## Testing

Simulator tests in `contract/src/test/`, run with `npm test`. **87 passing as of 2026-08-07.**

There is no published simulator package for Compact — `@openzeppelin-compact/contracts-simulator` does
not exist on npm, despite being referenced by some tooling docs. `src/test/simulator.ts` threads
`CircuitContext` by hand over `@midnight-ntwrk/compact-runtime`, which is all a simulator is.

Acceptance criteria, all met:

| # | Criterion | Status |
|---|---|---|
| 1 | Valid proof on compliant evidence → returns `true`, record written, nullifier burned | ✅ |
| 2 | Non-compliant evidence → returns `false`, **does not revert**, record marked non-compliant. Covered for criticals, KEV, highs, and provenance separately. | ✅ |
| 3 | Tampered evidence → fails at `path/leaf mismatch`. **All 17 fields mutated independently**, with a meta-test asserting the case list covers every struct key. | ✅ |
| 4 | Wrong salt → fails at `path/leaf mismatch` | ✅ |
| 5 | Leaf never attested → fails at `not attested` | ✅ |
| 6 | Replay of the same `(evidence, policy)` → fails at `already proven` | ✅ |
| 7 | **Historic root:** attest A, capture A's path, attest B and C, then prove with A's original path → still succeeds | ✅ |

Test 7 is the one most likely to be skipped and most likely to matter. It passes, and a second variant
holds the path across 20 further inserts. With a plain `MerkleTree` both fail — which is the point.

Beyond the seven:

| Area | What it covers |
|---|---|
| Identity binding | vendor / product / artifact mismatch each fail with their own message; the competitor-forgery case leaves no record |
| Attestor | zero `requiredAttestor` accepts any; a pinned attestor accepts the match and rejects others |
| Validity window | evidence granted a longer window than the policy allows is rejected |
| Record | all 8 fields correct; buyer-computable key; replaced by a fresher proof; one entry per `(artifact, policy)`; iterates; timeline newest-first |
| **Two policies** | the same bundle satisfies both; a bundle that passes BANK and fails ENTERPRISE, **and one that does the reverse** |
| Continuous compliance | fresh evidence for the same artifact and policy is permitted; the same evidence against a different policy is permitted |
| Policy identity | issuer and version published; the record is stamped with the version in force at proof time; updating thresholds does not disturb existing records |
| Access control | `attest`/`registerPolicy` rejected from a non-anchor; tree untouched after rejection; a vendor proves holding no secret at all |
| Encoding | `sha256:` prefix, digest length, commit alignment, v1-schema rejection, `validUntil <= generatedAt` rejection, coverage clamping, record-key agreement with the circuit |
| **Privacy** | see below |

### The privacy tests, and a trap worth knowing about

The privacy assertions mechanize the checklist in [02-threat-model.md](02-threat-model.md). Two
allowlist tests collect every 32-byte value on a public surface and assert the set is a subset of what
is public by design — so a field nobody remembered to write an assertion for is caught automatically,
which substring searches cannot do.

**The surfaces are not equivalent, and the important one is ledger state.** This was verified the hard
way: deliberately leaking `ev.commitId` into a `ComplianceRecord` produced a transcript that looked
completely clean —

- not in `proofData.publicTranscript`
- not in `proofData.input` or `proofData.output`
- not even in `proofData.privateTranscriptOutputs`

— while the value sat in plain sight in `ledger.records`, readable by anyone forever. **A privacy test
that inspects only the transcript can pass while private data is being published to the chain.** Both
allowlist tests exist for this reason, and the ledger-state one is load-bearing.

Two more toolchain traps surfaced while writing them, both now in
[03-evidence-schema.md](03-evidence-schema.md)'s trip-up table: `attestations.history()` returns a bare
`Iterator` rather than an `IterableIterator`, and a Merkle digest is **big-endian** as a
`MerkleTreeDigest.field` but **little-endian** in the transcript.

## Open items

- **UNVERIFIED:** `blockTimeGte` / `blockTimeLt` for wall-clock freshness enforcement. Recording
  `validUntil` and letting the reader judge needs no new primitive and is the shipped path.
- **UNVERIFIED:** real proving-key generation and on-chain execution. Nothing deployed yet. Generate
  keys **now that v2 is settled** — depth 16 and the struct shape are both baked into the key.
- The anchor secret is fixed at deployment with no rotation path. Fine for the hackathon; a real
  deployment wants rotation or a multi-sig anchor.
- `history` grows without bound. Fine at demo scale; a real deployment wants pruning or an
  indexer-derived timeline.
