# 03 — Evidence Schema

> **v2 is implemented.** `zkuat.evidence.v2`, 87 simulator tests green (2026-08-07). This document
> describes what `contract/` runs today. The superseded v1 schema is summarised at the bottom for
> anyone reading older commits.
>
> **Anything that changes this struct re-keys every leaf.** `persistentCommit<Evidence>` commits to the
> whole struct, so one added field invalidates every anchored attestation and every outstanding proof.
> There is no incremental path — a field change is a new schema version, a new policy id set, and a
> re-anchor. **Nothing has been anchored yet, so v2 is still free to change. That stops being true the
> moment real proving keys are generated.**

## Why this document is load-bearing

Four components encode this struct: the contract, the collector, the attestor, and the CLI/UI. If the
encodings disagree by a single byte, `persistentCommit` produces a different leaf, the Merkle path check
fails, and every proof breaks. You would discover it at the integration checkpoint with no time to fix
it. **This was the highest-risk item in the project.**

It is closed by construction — see the rule below.

## Rule: one implementation, everyone imports it

**`contract/` is the only implementation, and most of it is the compiler's own output.**

The contract exports its derivations as **pure circuits**, which the Compact compiler emits into a
`pureCircuits` object callable from TypeScript with no context and no transaction. These compile from
the same source the proving circuit runs, so what TypeScript computes is byte for byte what the circuit
checks. Drift is not discouraged — it is impossible.

```typescript
import { encodeEvidence, pureCircuits, recordKey, POLICY_BANK_ID } from '@zkuat/contract';

const evidence = encodeEvidence(canonicalJson);
const leaf     = pureCircuits.leafOf(evidence, salt);          // the attestor anchors this
const nul      = pureCircuits.nullifierOf(leaf, POLICY_BANK_ID);
const key      = recordKey(canonicalJson.artifactDigest, 'bank-v1');  // the buyer's lookup
```

The collector, attestor, anchor, CLI, and both UIs import these. Nobody reimplements them. Not
"reimplements them carefully" — nobody reimplements them. **VERIFIED** —
`contract/src/test/audit_registry.test.ts` attests a leaf computed in TypeScript and proves against it
in-circuit; if the two ever diverge, that test fails.

---

# v2 — as-built

`EVIDENCE_SCHEMA = 'zkuat.evidence.v2'`. Source: `contract/src/audit_registry.compact`,
`contract/src/encoding.ts`.

## The struct

Field order is load-bearing: identity, then time, then facts grouped by domain. **Do not reorder. Do
not insert fields in the middle.**

```compact
struct Evidence {
  // ── identity ──
  vendorId:                Bytes<32>;   // stringIdOf(vendor slug)
  productId:               Bytes<32>;   // stringIdOf(product slug)
  artifactDigest:          Bytes<32>;   // sha256 of the built artifact
  commitId:                Bytes<32>;   // git SHA, 20 bytes left-aligned, zero-padded
  attestorId:              Bytes<32>;   // stringIdOf(attestor slug)

  // ── time ──
  generatedAt:             Uint<64>;    // unix seconds
  validUntil:              Uint<64>;    // unix seconds

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

### `vendorId` and `productId` are bound in evidence — a deviation from the Master Doc

Master Doc §41's evidence schema does not include them; §43's compliance record does. Taking them only
as public circuit inputs would mean **nothing binds them to the attested facts**: a prover could file a
record under any vendor name they liked, and a buyer filtering the `records` map by vendor would see
forged entries — including a fabricated *failing* record against a competitor.

Putting them in the struct costs two fields and two asserts, and it is the difference between a
compliance record that means something and one that is decorative. `proveCompliance` asserts all three
identity fields against their public inputs. There is a test for the competitor-forgery case
specifically.

### What changed from v1, and why

| Change | Master Doc | Rationale |
|---|---|---|
| **`artifactDigest` added** | §10, §21 | Every claim must refer to immutable artifact bytes, not a version label. **The single most important addition.** |
| **`vendorId`, `productId` added** | §43 + the reasoning above | So the record's subject is cryptographically bound, not merely asserted. |
| **`repoId` removed** | §37 | It existed to give the *repo* an identity while keeping it anonymous. Superseded. |
| **`validUntil` added** | §11, §36 | Continuous compliance. Lands in the public record so the buyer view can show COMPLIANT / NOT COMPLIANT / EXPIRED / NO CURRENT PROOF. |
| **`kev` added** | §20, §41 | Known-exploited-vulnerability count appears in every Master Doc policy example. |
| **`forbiddenDeps` added** | §16, §41 | Distinct from `vulnDeps`: "appears on the buyer's prohibited list" is a licence/policy fact, not a vulnerability fact. Both kept. |
| **`mfaRequired`, `branchProtected`, `buildProvenanceVerified` added** | §41, §8 | Repository and provenance controls. `buildProvenanceVerified` is the hook into GitHub attestations. |
| **`attestorId` added** | §35 | Lets a policy pin which attestor is acceptable, so a record means "measured by X". |
| **`coverage` demoted** | §18 | Kept as a field so collector work is not wasted, but absent from both shipped policies. |
| **`issuedAt` → `generatedAt`** | §41 | Naming only. |

`schemaVersion` stays **outside** the struct. It is gated at the encoding boundary — a wrong schema
string throws in `encodeEvidence` — which fails loudly and costs zero circuit constraints.

## Generated TypeScript mapping

**VERIFIED** — the compiler's own output from `compact compile --skip-zk` (compiler v0.31.1,
`pragma language_version >= 0.23`), not hand-written:

```typescript
getEvidence(context: WitnessContext<Ledger, PS>): [PS, {
  vendorId: Uint8Array, productId: Uint8Array, artifactDigest: Uint8Array,
  commitId: Uint8Array, attestorId: Uint8Array,
  generatedAt: bigint, validUntil: bigint,
  criticals: bigint, highs: bigint, kev: bigint,
  forbiddenDeps: bigint, vulnDeps: bigint,
  mfaRequired: boolean, branchProtected: boolean,
  buildProvenanceVerified: boolean, ciGreen: boolean,
  coverage: bigint
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

Properties of the toolchain, not the schema — they survived the migration unchanged.

| Trap | Detail |
|---|---|
| **`goes_left`, not `goesLeft`** | The Compact docs write `goesLeft`; the generated TypeScript emits **snake_case** `goes_left`. Getting this wrong fails silently at path construction. |
| **All numerics are `bigint`** | `Uint<32>` and `Uint<64>` both map to `bigint`. Passing a JS `number` throws. Use `123n` or `BigInt(x)`. |
| **`sibling` is a wrapper object** | It's `{ field: bigint }`, not a bare `bigint`. |
| **`Bytes<32>` is exactly 32** | `Uint8Array` of length 32. Not 31, not 33. Pad explicitly. |
| **Structs are anonymous** | `Evidence`, `Policy`, and `ComplianceRecord` are emitted as inline object types, not named exports. `contract/src/types.ts` recovers them by indexing into the generated signatures, so a struct change becomes a TypeScript error rather than a silent commitment mismatch. Import from there. |
| **`history()` is an `Iterator`, not an `Iterable`** | `attestations.history()` cannot be spread or used with `for...of`. Drain it with `.next()`. |
| **Merkle digests have two byte orders** | A `MerkleTreeDigest.field` read from the ledger is a big-endian bigint; the same digest appears **little-endian** in the transaction transcript. Comparing one against the other by hex silently fails to match. |

## v2 canonical JSON

```json
{
  "schema": "zkuat.evidence.v2",
  "vendor": "acme-software",
  "product": "widget-api",
  "artifactDigest": "sha256:8f739ab...",
  "commit": "9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3",
  "attestor": "zkuat-attestor-v1",
  "generatedAt": 1754582400,
  "validUntil": 1757088000,
  "vulns":  { "criticals": 0, "highs": 3, "kev": 0 },
  "deps":   { "forbidden": 0, "vulnerable": 0 },
  "config": { "mfaRequired": true, "branchProtected": true, "buildProvenanceVerified": true, "ciGreen": true },
  "coverage": 8734
}
```

Rules: keys sorted, no insignificant whitespace, **integers only** (no floats — that is why coverage is
percent×100), `commit` full 40-char lowercase hex.

`artifactDigest` accepts the `sha256:` prefix in JSON for human legibility and strips it during
encoding; the 32 raw bytes are what get committed.

## v2 encoding rules

Implemented in `contract/src/encoding.ts`. The table is the specification; that file is the
implementation.

| Field | From canonical JSON | Encoding |
|---|---|---|
| `vendorId` / `productId` | `vendor` / `product` | slug → `stringIdOf()` (64-byte padding, below) |
| `artifactDigest` | `artifactDigest` | strip `sha256:` → 64 hex chars → **exactly 32 bytes**. Any other length throws. |
| `commitId` | `commit` | 40 hex chars → 20 bytes → left-aligned in 32 bytes, zero-padded right |
| `attestorId` | `attestor` | slug → `stringIdOf()` |
| `generatedAt` / `validUntil` | as named | `BigInt(unix seconds)`; **throws if `validUntil <= generatedAt`** |
| `criticals` / `highs` / `kev` | `vulns.*` | `BigInt`, saturate at `2^32 - 1` |
| `forbiddenDeps` / `vulnDeps` | `deps.forbidden` / `deps.vulnerable` | `BigInt`, saturate at `2^32 - 1` |
| four booleans | `config.*` | boolean |
| `coverage` | `coverage` | `BigInt(round(pct * 100))`, clamp to `[0, 10000]` |

### The 64-byte string padding

`Bytes<N>` is fixed-width in Compact, so "hash the UTF-8 bytes" is underspecified — the width has to be
pinned somewhere, and it is pinned at **64 bytes, zero-padded right, lowercased**. The encoder throws
rather than truncating on an overlong input; silent truncation would collide two identities into one.

One padding rule covers every string this protocol hashes: vendor ids, product ids, attestor ids, policy
ids, and issuer names. The circuit is `stringIdOf` (renamed from v1's misleading `repoIdOf` — it was
never repo-specific). `encoding.ts` exposes `vendorId()`, `productId()`, `attestorId()`, `policyId()`,
and `issuerId()` as named wrappers over the same function, so call sites read as intent.

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
  requiredAttestor:        Bytes<32>;   // all-zero == any attestor accepted
  maxAgeSeconds:           Uint<64>;    // longest validity window the policy grants
}
```

Public in ledger state so buyers can read exactly what a record means. Policy identity must be stable
and unforgeable (§5): a vendor may choose to prove against ACME v3, but cannot silently modify ACME v3.
`version` and `issuer` carry that; `policyId(slug)` remains the key, and the record is stamped with the
`version` in force at proof time.

**A field with no threshold is set to `MAX_U32`, not zero** — zero would mean "at most zero", the
strictest possible bound rather than "unconstrained". This is the easiest way to write a policy that
accidentally rejects everything.

`maxAgeSeconds` is enforced, but not against wall-clock time. `proveCompliance` asserts
`validUntil <= generatedAt + maxAgeSeconds`, which bounds how long an attestor may declare evidence
valid for — checkable in-circuit with no block-time primitive. Whether evidence has *since* expired is
the reader's judgement, from `validUntil` in the public record.

### Both shipped policies (§20)

Not one. §39 ranks a second policy over the same evidence as **the most valuable addition after the
core loop**, and it costs no new circuit code — the circuit takes `policyId` and reads thresholds from
ledger state.

```
POLICY_BANK_V1        criticals == 0,  highs <= 5,  kev == 0,  requireBuildProvenance
                      issuer: first-national-bank,  maxAge: 30 days

POLICY_ENTERPRISE_V1  criticals == 0,  forbiddenDeps == 0,  requireBranchProtection,
                      requireBuildProvenance
                      issuer: globex-corp,  maxAge: 30 days
```

Neither mentions coverage. Both are evaluated over the **same** evidence bundle, and the fixtures
include a case that passes one and fails the other in each direction — that contrast is the demo's
strongest beat (§17, §28) and it is covered by tests.

## The signed bundle — Track B's output, Tracks C and D's input

`@zkuat/attestor` emits two documents per attestation, and their difference is the privacy design.

| File | Audience | Contents |
|---|---|---|
| `bundle.json` | the vendor only, mode 0600 | evidence, **salt**, leaf, DSSE signature |
| `predicate.json` | the world, via Sigstore → Rekor | `{ leaf, repo, sha, schema }` and nothing else |

The attestor signs a **statement** — the canonical evidence *plus* the leaf — rather than the bare
evidence, so one evidence document is bound to one commitment and neither is swappable under the same
signature. ed25519 DSSE, `node:crypto`, no dependency.

The salt sits **outside** the signed payload. Signing it would make it a natural thing to quote when
presenting a signature, and it is the one value whose publication unblinds the commitment. The binding
that matters — `evidence + salt → leaf → tree` — is enforced in-circuit by `proveCompliance`.

```typescript
import { loadBundle, bundleToPrivateState } from '@zkuat/attestor';

const bundle = loadBundle('demo/fixtures/bank-only/bundle.json');
const { evidence, salt, leaf } = bundleToPrivateState(bundle);   // verifies, then decodes
```

`bundleToPrivateState` returns exactly the fields `AuditPrivateState` needs, leaving `path` for the
caller to read off the chain after anchoring. It verifies first: signature, statement against the
signed payload, and the leaf re-derived through `pureCircuits.leafOf`. Skipping that turns a bad
bundle into a `path/leaf mismatch` minutes into proof generation.

**Track C must pass `trustedKeyIds`.** Without it, `verifyBundle` checks the signature against the key
the bundle *carries* — internal consistency, and nothing about who signed.

Full format: [`../attestor/README.md`](../attestor/README.md).

## Salt

32 cryptographically random bytes, fresh per attestation, generated in CI. Unchanged in v2.

- **Never** goes into the attestation predicate — that would unblind the commitment. See
  [02-threat-model.md](02-threat-model.md).
- Travels with the evidence in the private bundle.
- Losing it makes the evidence unprovable forever. There is no recovery.

## Versioning

`schema` carries the version. Any field change is a **new schema version and a new policy id set**. Old
attestations remain valid under old policies — `HistoricMerkleTree` keeps historic roots valid, so
outstanding proofs do not break when new evidence is anchored.

## Sign-off

- [x] **Track A (contract)** — `Evidence` v2, `Policy` v2, `ComplianceRecord`, identity binding,
      `stringIdOf`; encoding in `contract/src/encoding.ts`; 87 tests green (2026-08-07)
- [x] **Track B (collector + attestor)** — `@zkuat/collector` measures, `@zkuat/attestor` normalizes
      and signs; both import `@zkuat/contract` and call `pureCircuits.leafOf`. Four signed fixtures
      committed under `demo/fixtures/`, 138 + 27 tests green (2026-08-07). Bundle format below.
- [ ] Track C (anchor/CLI) — imports `@zkuat/contract`, no reimplementation
- [ ] Track D (vendor + buyer views) — imports `@zkuat/contract`, no reimplementation

---

# v1 — superseded

Kept only so older commits read sensibly. `zkaudit.evidence.v1`, 8 fields:
`repoId`, `commitId`, `issuedAt`, `ciGreen`, `criticals`, `highs`, `vulnDeps`, `coverage`, with a
5-field `Policy` of raw thresholds and one registered policy (`production-ready`, keyed on
`minCoverage: 7000`).

It was frozen before the Master Doc existed and had no artifact digest, no vendor identity, no
expiration, and no compliance record — so a proof meant "some attested repo passes", which is the
anonymous framing the Master Doc reverses. See [07-alignment-delta.md](07-alignment-delta.md) for the
full register.
