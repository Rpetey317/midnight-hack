# Contract specification

`audit_registry.compact` seals `anchorIdOf(anchorSecret)` at deployment. Both
administrative circuits call `requireAnchor`, so only a runtime deriving the
same secret from the configured sponsor seed can anchor leaves or register
policies.

## Private evidence

```text
vendorId, productId, artifactDigest, commitId,
generatedAt, validUntil,
criticals, highs, vulnDeps,
lintPassed, buildPassed
```

## Policy

```text
version, issuer,
maxCriticals, maxHighs, maxVulnDeps,
requireLint, requireBuild,
maxAgeSeconds
```

## `proveCompliance`

The circuit:

1. recomputes the salted evidence leaf and checks it against a historic Merkle
   root;
2. binds the private vendor, product, and artifact fields to public inputs;
3. loads the requested public policy;
4. rejects an overlong evidence validity window;
5. consumes a nullifier for this evidence and policy;
6. evaluates thresholds and required checks;
7. writes a public record containing the public identifiers, policy version,
   time bounds, and one compliance boolean.

A negative policy result is a valid proof and is recorded as `compliant=false`.
Invalid membership, identity, freshness, or replay claims fail the transaction.
