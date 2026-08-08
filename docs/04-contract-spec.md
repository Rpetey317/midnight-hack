# Compact contract specification

`contract/src/audit_registry.compact` implements one compliance registry shared
by all supported policies and artifacts. It uses Compact language version 0.23
or newer and the standard library's persistent hashes, commitments, and ledger
ADTs.

## Structs

Private `Evidence`:

```text
vendorId, productId, artifactDigest, commitId,
generatedAt, validUntil,
criticals, highs, totalVulnerabilities,
lintPassed, buildPassed
```

Public `Policy`:

```text
version, issuer,
maxCriticals, maxHighs, maxTotalVulnerabilities,
requireLint, requireBuild,
maxAgeSeconds
```

Public `ComplianceRecord`:

```text
vendorId, productId, artifactDigest,
policyId, policyVersion,
provenAt, validUntil, compliant
```

## Ledger

| Field | Type | Semantics |
| --- | --- | --- |
| `attestations` | `HistoricMerkleTree<16, Bytes<32>>` | Anchor-authorized evidence commitments; accepts paths against historic roots; maximum 65,536 insertions |
| `policies` | `Map<Bytes<32>, Policy>` | Public policy registry |
| `claimed` | `Set<Bytes<32>>` | Public nullifiers for replay prevention |
| `records` | `Map<Bytes<32>, ComplianceRecord>` | Latest record per artifact digest and policy ID |
| `history` | `List<ComplianceRecord>` | Append-only newest-first record timeline |
| `anchor` | sealed `Bytes<32>` | Immutable identity derived from the deployment anchor witness |

Everything in the ledger is public. `HistoricMerkleTree.insert` applies its leaf
hash internally; callers must use `insert`, not `insertHash`, and proof paths are
checked with `merkleTreePathRoot`.

## Witnesses

- `localSecret()` supplies the sponsor-derived anchor secret for deployment,
  `attest`, and `registerPolicy`.
- `getEvidence()` supplies the canonical private evidence.
- `getSalt()` supplies the evidence commitment salt.
- `getPath()` supplies the historic Merkle inclusion path.

The TypeScript implementation reads these values from
`AuditPrivateState`. Missing values fail at the witness boundary with an explicit
error.

## Pure derivations

- `leafOf(evidence, salt)` uses `persistentCommit<Evidence>`.
- `nullifierOf(leaf, policyId)` hashes a domain separator, leaf, and policy ID.
- `recordKeyOf(artifactDigest, policyId)` hashes a separate domain separator,
  artifact digest, and policy ID.
- `stringIdOf(paddedString)` hashes the fixed-width 64-byte identifier input.
- `anchorIdOf(secret)` hashes the anchor domain separator and secret.

The generated pure-circuit implementations are exported to TypeScript so the
runtime does not duplicate protocol hashes.

## Constructor and anchor authorization

The constructor stores `anchorIdOf(localSecret())` in the sealed `anchor` field.
`requireAnchor()` compares that immutable value with the current private witness.
The runtime derives the witness with domain-separated HKDF from the sponsor
wallet seed. Changing the configured seed or network does not migrate the
contract; a different seed fails the identity check.

## `attest(leaf)`

1. calls `requireAnchor()`;
2. inserts the provided commitment into `attestations`.

The runtime computes the leaf from encoded evidence and a random salt before the
call and waits for the hosted indexer to expose a matching Merkle path afterward.

## `registerPolicy(policyId, policy)`

1. calls `requireAnchor()`;
2. inserts or replaces the public policy under the supplied ID.

The current deploy command registers four bundled npm reference policies. There
is no UI/API for arbitrary policy administration.

## `proveCompliance(...)`

Public arguments are `vendorId`, `productId`, `artifactDigest`, and `policyId`.
The circuit:

1. loads private evidence, salt, and path;
2. recomputes the commitment and requires `path.leaf` to match it;
3. requires the path root to be accepted by the historic attestation tree;
4. binds private vendor, product, and artifact values to the public arguments;
5. computes a `(leaf, policyId)` nullifier and rejects reuse;
6. loads the public policy;
7. requires `validUntil <= generatedAt + maxAgeSeconds`;
8. evaluates critical/high/total-vulnerability thresholds and lint/build requirements;
9. writes the public record to `records` and pushes it onto `history`;
10. returns the one boolean verdict.

Only the final conjunction is disclosed. The circuit does not disclose which
individual requirement failed.

A false predicate writes a valid negative record. Membership, identity,
validity-window, or replay failure aborts the transaction instead.

## Time and replay semantics

The contract constrains the committed validity-window length but does not read
block time or prove that `generatedAt` equals the actual proof time. The runtime
sets it to local receipt time; consumers must compare `validUntil` with their own
trusted clock.

The nullifier prevents the same salted evidence leaf from being proven twice
against one policy. The same leaf may be proven against a different policy.
Fresh evidence/salt can create another proof. `records` replaces the current
entry for the same artifact/policy key while `history` preserves every record.

## Bundled policy values

| Policy | Criticals | Highs | Total vulnerabilities | Lint | Build | Max window |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| `npm-ci-baseline-v1` | 0 | 5 | unconstrained (`Uint<32>` max) | required | required | 30 days |
| `npm-production-release-v1` | 0 | 0 | 5 | required | required | 7 days |
| `npm-zero-known-vulns-v1` | 0 | 0 | 0 | required | required | 3 days |
| `npm-emergency-hotfix-v1` | 0 | 2 | unconstrained (`Uint<32>` max) | optional | required | 2 days |

The runtime gives evidence the selected policy's validity window. The private
`totalVulnerabilities` field is populated from `npm audit`'s `vulnerabilities.total`.
