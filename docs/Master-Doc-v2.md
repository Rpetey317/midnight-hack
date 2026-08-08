# Project Alignment — Privacy-Preserving Software Compliance

## 1. Current project goal

Build a Midnight-based application where a software vendor can prove that a repository satisfies a buyer/auditor policy **without exposing the underlying evidence values**.

The hackathon version deliberately simplifies the trust model.

For now:

- GitHub Actions is treated as the trusted evidence-generation environment.
- The workflow produces a small `evidence.json`.
- The application triggers that workflow and retrieves the generated evidence.
- The evidence is used as private input to a Compact compliance proof.
- Midnight stores/verifies the public compliance result.

The current implementation is a proof of the architecture, not a production-grade software supply-chain attestation system.

## 2. Core use case

There are two main roles.

### Auditor / buyer

The auditor defines a software-security policy, for example:

```text
critical vulnerabilities <= 0
high vulnerabilities <= 3
```

Policies are registered in the Midnight contract and have a stable ID/version.

### Auditee / vendor

The vendor:

1. selects one of their GitHub repositories;
2. selects a published policy;
3. requests validation;
4. the application triggers the repository's GitHub Actions evidence workflow;
5. the workflow produces `evidence.json`;
6. the application retrieves that evidence;
7. the evidence is supplied privately to the Compact circuit;
8. a ZK proof is generated;
9. the resulting compliance transaction is submitted to Midnight.

The auditor later sees only the public compliance result.

## 3. Current architecture

```text
Auditor
   │
   │ registers/selects policy
   ▼
Midnight Contract
   ▲
   │
   │ compliance proof
   │
Vendor Application
   │
   │ trigger workflow
   ▼
GitHub Actions
   │
   │ generates
   ▼
evidence.json
   │
   │ retrieved by application
   ▼
private witness input
   │
   ▼
Compact circuit
   │
   ▼
Midnight proof
```

The raw evidence must not be written to Midnight.

## 4. GitHub evidence generation

Each participating repository contains a GitHub Actions workflow dedicated to evidence generation.

For the current hackathon version, this workflow is intentionally simple.

Example output:

```json
{
  "repository": "vendor/project",
  "commit": "abc123...",
  "vulnerabilities": {
    "critical": 0,
    "high": 2,
    "moderate": 4,
    "low": 1,
    "total": 7
  }
}
```

The first real tool used is `npm audit`.

The workflow:

```text
checkout repository
      ↓
install dependencies
      ↓
npm audit --json
      ↓
normalize output
      ↓
evidence.json
      ↓
upload GitHub Actions artifact
```

The workflow artifact is temporary GitHub Actions storage. It is **not committed into the repository**.

Later, additional tools can contribute fields to the same evidence schema, for example:

- OSV-Scanner;
- Semgrep;
- OpenSSF Scorecard;
- SBOM generators;
- repository configuration checks.

## 5. Application ↔ GitHub flow

The application already has GitHub-authenticated users.

When the vendor clicks **Validate / Prove**:

```text
User selects repository + policy
        ↓
Application triggers evidence workflow
        ↓
GitHub Actions executes
        ↓
Application identifies the matching workflow run
        ↓
Wait for successful completion
        ↓
Download evidence artifact
        ↓
Parse evidence.json
        ↓
Use evidence for proof generation
```

A `request_id` should be passed when triggering the workflow so the application can reliably associate the user's validation request with the correct workflow run/artifact.

The details of how the application is internally split into frontend/backend processes are outside this specification.

## 6. Compact / Midnight model

Use **one main registry/verifier contract**, not one contract per policy.

The contract should support the equivalent of:

```text
registerPolicy(...)
proveCompliance(policyId, repositoryOrArtifactIdentity, ...)
```

Policies are public contract state.

Example policy:

```text
Policy #1

maxCritical = 0
maxHigh = 3
```

The vendor chooses a registered policy and proves their private evidence satisfies it.

Conceptually:

```text
policy = ledger.policies[policyId]
report = getEvidenceWitness()

assert(report.critical <= policy.maxCritical)
assert(report.high <= policy.maxHigh)
```

The evidence is obtained through a Compact witness implemented by the application.

The deployed contract never fetches GitHub directly.

## 7. Evidence handoff to Compact

The application retrieves `evidence.json` from GitHub and keeps the parsed result available locally.

Conceptually:

```ts
const evidence = await retrieveEvidenceFromGithub();

const contract = new Contract({
  getEvidence: () => evidence
});
```

Compact declares the witness:

```text
witness getEvidence(): Evidence
```

During proof generation:

```text
GitHub evidence
     ↓
application
     ↓
Compact witness
     ↓
compiled circuit
     ↓
proof server
     ↓
ZK proof
```

The raw evidence is not sent to the Midnight ledger.

## 8. Public vs private data

### Private

For the current version:

```text
exact vulnerability counts
future scanner findings
future SBOM/security information
raw evidence.json
```

### Public

At minimum:

```text
vendor identity
repository/product identity
policy ID/version
proof timestamp
compliance result
```

A future version should bind proofs to an immutable artifact digest rather than only a repository/commit identity.

## 9. Continuous compliance

The long-term product idea remains **continuous privacy-preserving compliance**.

The same vendor can repeatedly prove compliance:

```text
Artifact / version A   Policy X   ✓
Artifact / version B   Policy X   ✓
Artifact / version C   Policy X   ✓
```

Policies may also change over time.

The important model is:

```text
one private evidence format
        ↓
multiple buyer policies
        ↓
different proofs
        ↓
compliance history
```

The same evidence can also be evaluated against multiple policies without exposing its raw values.

## 10. What is intentionally simplified for the hackathon

The previous design assumed a stronger provenance and attestation architecture.

That is **not required for the current MVP**.

For now, do not build around:

- custom Sigstore/Rekor commitments;
- blinded evidence commitments;
- custom attestor private keys;
- direct SLSA verification;
- direct GitHub attestation verification inside Compact;
- trusted reusable workflow registries;
- KMS-backed attestors;
- production-grade evidence provenance.

Instead, assume:

> GitHub Actions is the trusted environment and the `evidence.json` produced by the selected workflow is accepted as the evidence source.

This is sufficient to demonstrate the ZK/privacy and policy architecture.

Future versions can replace this simplified trust assumption with real software provenance and trusted-build attestations.

## 11. Current MVP

The minimum successful demo is:

1. Auditor creates/registers a policy.
2. Vendor selects a GitHub repository.
3. Vendor selects that policy.
4. Application triggers the repository evidence workflow.
5. GitHub Actions runs `npm audit`, lint, and the production build.
6. `evidence.json` is generated and uploaded as an artifact.
7. Application retrieves it.
8. Application supplies it privately to the Compact witness.
9. Proof generation checks the evidence against the selected policy.
10. Midnight accepts the proof.
11. Auditor sees that the vendor/repository satisfies the policy.

Example:

```text
PRIVATE EVIDENCE

critical = 0
high = 2
moderate = 4
```

Policy:

```text
critical <= 0
high <= 3
```

Public result:

```text
Vendor X
Repository Y
Policy #1
COMPLIANT
```

## 12. Future upgrades

After the MVP works, the architecture can evolve toward:

- multiple scanners feeding the same evidence schema;
- real SBOM evidence;
- artifact/image SHA-256 binding;
- trusted reusable workflows;
- GitHub/SLSA provenance validation;
- signed/attested evidence;
- proof expiration;
- automatic CI proof refresh;
- multiple independent evidence sources;
- real OpenSSF/NIST-derived policy packs.

The important point is that these upgrades should strengthen the **evidence provenance layer** without changing the core application model:

```text
authenticated/private evidence
        ↓
buyer-defined policy
        ↓
ZK proof
        ↓
public compliance record
```

## 13. Current project definition

> A privacy-preserving software compliance platform where auditors publish machine-verifiable security policies and vendors prove that evidence generated from their repositories satisfies those policies without exposing the underlying evidence values.

For the hackathon, GitHub Actions is the trusted evidence source. The application triggers the workflow, retrieves `evidence.json`, supplies it privately to the Compact circuit, generates a proof, and records the public compliance result on Midnight.
