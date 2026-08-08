# @zkuat/contract

Compact compliance registry and the single TypeScript encoding used by the
runtime.

The contract stores:

- a sealed anchor identity derived from the sponsor wallet seed;
- a historic Merkle tree of salted evidence commitments;
- public buyer policies;
- one public compliance record per artifact and policy;
- nullifiers preventing the same evidence/policy claim from being replayed.

Private witnesses contain the evidence, random salt, Merkle path, or derived
anchor secret as required by each circuit. The raw sponsor seed is never a
Compact witness.

## Circuits

- `attest(leaf)` verifies the sealed anchor secret and inserts a commitment.
- `registerPolicy(policyId, policy)` verifies the same anchor secret and stores
  a policy.
- `proveCompliance(vendorId, productId, artifactDigest, policyId)` proves
  membership and policy evaluation, then writes only the verdict and public
  identifiers.

## Build and test

```bash
npm install
npm run compile       # fast compiler output for tests
npm run typecheck
npm test
npm run compile:keys  # required before runtime deploy/start
```

`compile:keys` creates the proving/verifying assets consumed by the local proof
server. Network, wallet, deployment, and transaction lifecycle code lives in
`@zkuat/runtime`, not in this package.
