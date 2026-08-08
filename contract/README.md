# `@zkuat/contract`

This package is the single source of truth for zkuat's Compact compliance
registry, evidence encoding, witness shape, identifier derivations, and the four
policies deployed by `@zkuat/runtime`.

Generated JavaScript bindings, declarations, and compiler metadata are committed
so TypeScript consumers can install the repository without compiling Compact.
Proving keys and ZKIR are intentionally ignored and must be generated locally.

## Layout

| Path | Purpose |
| --- | --- |
| `src/audit_registry.compact` | Ledger schema, witnesses, pure derivations, constructor, and callable circuits |
| `src/encoding.ts` | Canonical `zkuat.evidence.v4` encoding, string/digest helpers, record keys, and bundled policies |
| `src/anchor-secret.ts` | Domain-separated HKDF from sponsor seed to the 32-byte Compact anchor witness |
| `src/witnesses.ts` | Runtime-loaded private state and witness implementations |
| `src/types.ts` | Types derived from generated Compact signatures and ledger readers |
| `src/sdk.ts` | One shared Midnight SDK dependency entry point for the runtime |
| `src/managed/audit_registry/` | Compiler output; large `keys/` and `zkir/` subdirectories are generated and ignored |
| `src/test/` | Compact simulator fixtures and behavioral tests |

## Public ledger state

- `attestations`: depth-16 `HistoricMerkleTree`, allowing proofs against earlier
  roots as new evidence is anchored;
- `policies`: public policy definitions keyed by a Compact-derived policy ID;
- `claimed`: nullifiers preventing reuse of one evidence leaf against the same
  policy;
- `records`: latest record keyed by artifact digest and policy ID;
- `history`: append-only compliance-record timeline;
- `anchor`: sealed identity fixed by the deployment witness.

All ledger fields are public. Vulnerability counts, command outcomes, commit,
salt, evidence leaf, and Merkle path are not stored in the ledger. The public
record contains vendor ID, product ID, artifact digest, policy ID/version,
`provenAt`, `validUntil`, and one boolean verdict.

## Circuits

- `attest(leaf)` requires the sealed anchor witness and inserts the commitment
  into the historic Merkle tree.
- `registerPolicy(policyId, policy)` requires the same anchor witness and inserts
  or replaces a public policy.
- `proveCompliance(vendorId, productId, artifactDigest, policyId)` recomputes the
  private salted commitment, verifies historic membership, binds the private
  identity fields to public inputs, prevents replay, evaluates the selected
  policy, and writes the public record and history entry.

A policy failure is still a valid proof and writes `compliant=false`. Invalid
membership, identity binding, policy lookup, validity-window length, or replay
causes the transaction to fail.

The contract bounds `validUntil - generatedAt` against the policy but does not
compare either timestamp with block time. Readers decide whether a record is
currently expired.

## Bundled policies

| Slug | Requirements |
| --- | --- |
| `npm-ci-baseline-v1` | 0 criticals, at most 5 highs, lint and build passed, validity window at most 30 days |
| `npm-production-release-v1` | 0 criticals/highs, at most 5 total vulnerabilities, lint and build passed, validity window at most 7 days |
| `npm-zero-known-vulns-v1` | 0 criticals/highs/total vulnerabilities, lint and build passed, validity window at most 3 days |
| `npm-emergency-hotfix-v1` | 0 criticals, at most 2 highs, build passed, validity window at most 2 days; lint optional |

The runtime maps `npm audit`'s `vulnerabilities.total` directly into the private
`totalVulnerabilities` evidence field.

## Anchor and private state

The runtime decodes the sponsor recovery phrase to its 32-byte wallet seed.
Deployment derives an anchor secret from that seed with domain-separated HKDF
and seals `anchorIdOf(secret)` in the contract. Neither the phrase nor raw seed
is passed to Compact. Runtime calls to `attest` and `registerPolicy` derive the
same secret and fail when the configured phrase restores a different wallet.

The proof witness state contains the canonical evidence struct, fresh salt, and
Merkle path. `pureCircuits.leafOf`, `stringIdOf`, `recordKeyOf`, and
`nullifierOf` are generated from Compact and reused by TypeScript to avoid
reimplementing protocol hashes.

## Build and test

Requirements are Node.js 22+ and a compatible Compact CLI/compiler on `PATH`.

```bash
npm ci
npm run compile        # bindings only; skips proving-key generation
npm run typecheck
npm test
npm run compile:keys   # bindings plus keys/ZKIR required by the runtime
```

`compile` and `compile:keys` run `scripts/strip-sourcemap.mjs` after compilation
because the generated sourcemap is not usable by Node. Do not run `npm run
clean` unless you intend to regenerate all managed output.

Wallet setup, proof-server management, deployment, transaction submission, and
indexer verification live in [`@zkuat/runtime`](../runtime/README.md).
