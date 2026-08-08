# Evidence schema

The existing workflow artifact contains:

```json
{
  "repository": "owner/repository",
  "commit": "40-character-git-sha",
  "artifactDigest": "sha256:...",
  "vulnerabilities": {
    "critical": 0,
    "high": 0,
    "moderate": 0,
    "low": 0,
    "total": 0
  },
  "checks": {
    "lint": { "command": "npm run lint", "passed": true },
    "build": { "command": "npm run build", "passed": true }
  }
}
```

`@zkuat/collector` validates this untrusted JSON and maps it directly to
`zkuat.evidence.v3`:

- `repository` becomes lower-case `vendor` and `product` identifiers;
- the artifact digest and commit are encoded as fixed-width bytes;
- `critical`, `high`, and `total` become the three policy counts;
- lint/build results become booleans;
- runtime receipt time becomes `generatedAt`, with a 29-day validity window.

There is no evidence signature, key file, envelope, or separate anchor secret.
The runtime creates a fresh 32-byte salt and computes
`leafOf(encodeEvidence(evidence), salt)` with the contract-generated pure
circuit. Evidence and salt remain in owner-only local storage.

The public transaction inputs are vendor ID, product ID, artifact digest, and
policy ID. The findings and salt are never written to chain or returned by the
runtime API.
