# GitHub evidence and Compact encoding

The evidence protocol has three distinct shapes:

1. the JSON emitted by GitHub Actions;
2. transport metadata supplied by the UI to the runtime;
3. the canonical `zkuat.evidence.v4` values encoded into the Compact `Evidence`
   struct.

There is no zkuat evidence signature, attestor key, signed envelope, or
separately configured anchor secret. The contract still has an anchor-secret
check: that witness is deterministically derived from the sponsor seed and is
unrelated to signing `evidence.json`.

## Workflow artifact

`.github/workflows/generate-evidence.yml` currently emits:

```json
{
  "repository": "owner/repository",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "artifactDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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

For this repository the workflow runs in `ui/`. It uses `npm audit --json`, runs
lint and build as nonfatal evidence-producing steps, creates an `npm pack`
tarball, and hashes that tarball with SHA-256. It uploads only `evidence.json` as
`zkuat-evidence-<request-id>` with one-day retention.

The digest identifies the exact tarball bytes produced in that run. The workflow
does not promise reproducible `npm pack` output across separate runs.

## UI-to-runtime transport

The browser sends:

```text
evidence
requestId
run: id, url, status, conclusion
artifact: id, name
policySlug
```

The runtime requires:

- one of the four bundled npm policy slugs;
- a UUID-like hexadecimal/hyphen request ID;
- positive safe-integer run and artifact IDs;
- run status `completed` and conclusion `success`;
- artifact name exactly `zkuat-evidence-<request-id>`;
- a GitHub HTTPS run URL whose repository and run ID match the evidence;
- repository form `owner/name`;
- a 40-character hexadecimal commit SHA;
- a SHA-256 digest with or without the `sha256:` prefix;
- non-negative integer counts;
- exact check commands `npm run lint` and `npm run build` with boolean results.

These checks detect malformed or inconsistent forwarded data. They do not prove
the data came from GitHub because the runtime does not independently contact
GitHub.

## Canonical mapping

At job creation, the runtime maps the validated artifact as follows:

| GitHub/runtime value | Canonical value |
| --- | --- |
| repository owner | lower-case `vendor` string |
| repository name | lower-case `product` string |
| `artifactDigest` | normalized lower-case SHA-256 string |
| `commit` | lower-case full SHA |
| local receipt time | `generatedAt` Unix seconds |
| receipt time + selected policy window | `validUntil` Unix seconds |
| `vulnerabilities.critical` | `vulns.criticals` |
| `vulnerabilities.high` | `vulns.highs` |
| `vulnerabilities.total` | `vulns.totalVulnerabilities` |
| lint/build booleans | `checks.lintPassed` / `checks.buildPassed` |

The selected policy determines whether the runtime sets a 30-, 7-, 3-, or
2-day validity window. The workflow artifact itself is unchanged.

`moderate` and `low` are validated but are not included in the Compact evidence
struct or evaluated by the bundled policies.

## Compact encoding

`contract/src/encoding.ts` performs the only TypeScript encoding used by the
runtime:

- vendor, product, policy, and issuer strings are lowercased, UTF-8 encoded,
  right-padded with zeroes to 64 bytes, and passed through the generated
  `stringIdOf`; values longer than 64 UTF-8 bytes are rejected;
- the artifact digest becomes exactly 32 bytes;
- the 20-byte Git SHA is left-aligned in 32 bytes and zero-padded on the right;
- timestamps become `Uint<64>` values;
- vulnerability values become `Uint<32>` values and saturate at the maximum;
- check results become Compact booleans.

Field order in `Evidence` determines the commitment and is protocol-critical.
The runtime calls generated `pureCircuits.leafOf(encodedEvidence, salt)` rather
than reimplementing the Compact commitment.

Each job creates a cryptographically random 32-byte salt and stores:

```text
schema = zkuat.runtime-evidence.v1
GitHub metadata
canonical zkuat.evidence.v4 values
saltHex
leafHex
```

The resulting private job JSON is mode `0600` below the runtime storage
directory.

## Public and private values

Public contract call inputs are derived vendor ID, product ID, artifact digest,
and policy ID. The resulting record additionally publishes policy version,
`provenAt`, `validUntil`, and `compliant`.

Private from the ledger are the raw vendor/product strings, commit, all
vulnerability values, lint/build booleans, salt, leaf, and Merkle path. The
vendor/product identities remain practically public through their hashed IDs
and surrounding UI context; zkuat's intended privacy target is the security
findings, not vendor anonymity.

The web tier and vendor browser do see the artifact JSON. Ledger privacy should
not be confused with keeping the evidence exclusively inside the local runtime.
