# Privacy-Preserving Continuous Software Assurance on Midnight

## 1. Core idea

The project is a **B2B software assurance platform** where software vendors can prove that their products satisfy security or procurement requirements **without revealing the underlying security evidence**.

A vendor may possess a large amount of private, authenticated evidence about a software release:

```text
SBOM
dependency versions
vulnerability findings
specific CVEs
repository configuration
IAM/security settings
CI/CD configuration
build provenance
scanner outputs
audit findings
...
```

A potential customer usually does not need all of this information.

They may only need answers to questions such as:

```text
Does the product have zero critical known vulnerabilities?

Does it avoid dependencies prohibited by our organization?

Does it satisfy required repository access controls?

Was this artifact produced through an approved CI process?

Does it satisfy the machine-verifiable subset of
our software procurement policy?
```

The vendor therefore uses **authenticated private evidence** to generate a zero-knowledge proof against a specific policy.

The customer learns:

```text
Product X
Artifact SHA-256: ABC...

ACME Software Procurement Policy v3

✓ SATISFIED

Evidence date: 2026-08-07
```

but does not necessarily learn:

```text
exact dependency tree
exact vulnerability count
specific CVE identifiers
affected packages
exact IAM configuration
developer identities
internal repository structure
other confidential findings
```

The fundamental proposition is:

> **A buyer should be able to define what it needs to know, while a vendor proves those requirements using authenticated private evidence without having to disclose all of that evidence.**

---

# 2. The real-world problem

Software procurement already involves security assurance.

Companies purchasing third-party software need ways to assess whether suppliers follow suitable secure-development and software-supply-chain practices.

This relationship exists explicitly in frameworks such as NIST's Secure Software Development Framework. NIST states that software acquirers can use the SSDF to communicate with suppliers during acquisition, and related NIST supply-chain guidance recommends that acquiring organizations ensure third-party suppliers demonstrate adoption of secure-development practices.

The OpenSSF OSPS Baseline provides another useful foundation: it defines versioned security controls for software projects, grouped by maturity level and category. Its current published version is **2026.02.19**, and OpenSSF specifically recommends that downstream consumers identify the exact Baseline version against which compliance is claimed.

Today, assurance between organizations can involve combinations of security questionnaires, audits, compliance reports, SBOMs, vulnerability reports, CI evidence, build provenance and other documentation.

Our system does **not** attempt to replace all of those processes.

Instead, it targets the subset where the buyer's requirement can be expressed as a machine-verifiable predicate.

For example:

```text
criticalVulnerabilities == 0

knownExploitedVulnerabilities == 0

prohibitedDependencyCount == 0

mfaRequiredForPrivilegedUsers == true

protectedPrimaryBranch == true

buildProvenanceVerified == true
```

Those are much more suitable for a ZK system than vague requirements such as:

```text
"developers receive appropriate training"

"the organization has a mature security culture"

"adequate threat modeling has been performed"
```

The latter still require auditors, institutional processes or human judgment.

---

# 3. Why ZK instead of simply sharing the report?

This is the most important question for the pitch.

If the security report contains only:

```text
PASS
```

there is almost no reason to use Midnight.

Likewise, if the vendor is happy to publish every metric:

```text
critical = 0
high = 3
coverage = 87%
MFA = 94%
```

a signed report is probably sufficient.

The useful scenario is different.

Suppose the authenticated evidence contains:

```text
Artifact:
sha256:A712...

SBOM:
427 components

Critical vulnerabilities:
0

High vulnerabilities:
3

Medium vulnerabilities:
19

Affected dependencies:
internal-auth 3.1
library-X 5.2
library-Y 2.8

Known CVEs:
CVE-...
CVE-...
CVE-...

MFA:
47 / 50 privileged accounts

Repository administrators:
...

Branch rules:
...

Internal package names:
...
```

A prospective customer may legitimately need to know that the vendor satisfies:

```text
critical == 0

high <= 5

MFA >= 90%

prohibitedDependencyCount == 0
```

but not necessarily need the exact underlying values or internal details.

The ZK proof turns:

```text
PRIVATE AUTHENTICATED FACTS
              ↓
       PUBLIC PREDICATES
              ↓
           YES / NO
```

without revealing the facts themselves.

This is the selective privacy provided by Midnight: contract logic can operate across public and private state, with private information used in generating zero-knowledge proofs rather than simply being published to the ledger.

---

# 4. The stronger insight: evidence should be reusable

This is what makes the project substantially more interesting than:

> “Hide a CI report.”

Suppose a vendor has one authenticated security evidence set:

```text
Evidence E

artifact = ABC
critical = 0
high = 3
KEV = 0
MFA = 94%
GPLDependencies = 2
branchProtection = true
buildProvenance = true
...
```

Different customers may have different requirements.

## Bank A

```text
critical == 0
high <= 5
MFA >= 90%
```

## Government Agency B

```text
critical == 0
KEV == 0
buildProvenance == true
```

## Corporation C

```text
critical == 0
GPLDependencies == 0
branchProtection == true
```

The vendor does **not** need three different security scans.

It can use the same authenticated private evidence:

```text
                   Evidence E
                       │
           ┌───────────┼───────────┐
           │           │           │
           ▼           ▼           ▼
       Bank Policy   Gov Policy   Corp Policy
           │           │           │
           ▼           ▼           ▼
        ZK proof     ZK proof     ZK proof
```

This gives a much stronger answer to:

> “Why doesn't the scanner just sign PASS?”

Because the scanner cannot necessarily know every policy that every future buyer will want evaluated.

The attestor establishes **facts**.

The buyer or standard defines **requirements**.

Midnight evaluates the relationship privately.

---

# 5. Who defines the policy?

This needs to be explicit.

There are several possible policy issuers:

```text
a potential customer
a government procurement body
an industry consortium
a standards organization
an auditor
the vendor itself
```

For B2B procurement, the strongest model is:

```text
BUYER
  ↓
publishes requirements
  ↓
POLICY
  ↓
VENDOR proves against policy
```

For example:

```text
ACME-SOFTWARE-PROCUREMENT-v3

criticalVulnerabilities == 0
knownExploitedVulnerabilities == 0
prohibitedDependencyCount == 0
mfaRequired == true
approvedBuildProvenance == true
```

A vendor may select:

> “I want to prove my product against ACME Policy v3.”

But it cannot silently modify ACME Policy v3.

The policy therefore needs a stable identity such as:

```text
policy ID
policy version
contract address
policy hash
```

so that:

```text
proof against ACME-v3
```

cannot be confused with:

```text
proof against VendorModifiedEasyPolicy-v1
```

This is essential for trust.

---

# 6. What standards can policies come from?

Policies do not have to be completely arbitrary.

They can contain controls derived from actual frameworks.

A particularly practical starting point is the **OpenSSF OSPS Baseline**, because it already contains specific, versioned software-project security controls. The current published version is 2026.02.19.

NIST SSDF is another important source, especially for the overall producer/acquirer relationship, though its practices are intentionally outcome-oriented and often broader than what can directly be encoded into a circuit.

The platform should therefore distinguish:

```text
Full framework

        ↓ select

machine-verifiable subset

        ↓ encode

ZK policy
```

We should **not claim**:

> “We cryptographically prove full NIST compliance.”

Instead:

> “We support machine-verifiable controls derived from recognized software-security frameworks and organization-specific procurement requirements.”

That statement is much more defensible.

---

# 7. Authenticated evidence

ZK proves that private inputs satisfy a computation.

It does **not** magically prove that those private inputs correspond to reality.

Therefore this is invalid:

```text
Vendor:

criticalVulnerabilities = 0

        ↓

ZK

        ↓

"Look, I proved I have zero vulnerabilities."
```

The vendor could simply invent the input.

Instead:

```text
trusted source
      ↓
authenticated evidence
      ↓
ZK policy
```

For the hackathon, evidence can originate from a CI pipeline.

For example:

```text
Private GitHub repository
        ↓
GitHub Actions
        ↓
build artifact
        ↓
security scanner
        ↓
SBOM generator
        ↓
repository checks
        ↓
normalized evidence
```

GitHub already supports artifact attestations that establish build provenance for binaries and container images, providing cryptographically signed claims about where and how artifacts were built.

That makes GitHub provenance useful as part of our trust chain.

---

# 8. GitHub does not replace Midnight

GitHub artifact attestations answer something like:

> “Did artifact ABC come from this repository/commit/workflow?”

Midnight answers something different:

> “Does authenticated private evidence associated with artifact ABC satisfy Policy P?”

So:

```text
GitHub / CI
    │
    │ establishes provenance
    ▼
Authenticated evidence
    │
    │ remains private
    ▼
Midnight policy
    │
    │ evaluates predicates
    ▼
ZK compliance result
```

If our only requirement were:

> “Prove GitHub built artifact X.”

GitHub's own artifact attestation mechanism would already solve that problem, and adding Midnight would be unnecessary. GitHub explicitly positions artifact attestations as a mechanism for establishing and verifying build provenance.

Midnight becomes valuable because we want to compute **additional private predicates over authenticated evidence**.

---

# 9. Hackathon simplification: normalized attestor

Directly verifying GitHub's complete Sigstore/in-toto attestation infrastructure inside a Compact ZK circuit would create significant unnecessary complexity for an MVP.

Instead:

```text
GitHub Actions
      ↓
GitHub provenance
      ↓
our evidence adapter / attestor
      ↓
verify inputs
      ↓
normalize evidence
      ↓
sign normalized evidence
      ↓
Midnight
```

Example normalized private evidence:

```json
{
  "artifactDigest": "sha256:ABC123",
  "commit": "93fa81...",
  "timestamp": 1786100000,

  "criticalVulnerabilities": 0,
  "highVulnerabilities": 3,
  "knownExploitedVulnerabilities": 0,

  "prohibitedDependencies": 0,

  "mfaRequired": true,
  "primaryBranchProtected": true,

  "buildProvenanceVerified": true
}
```

The evidence adapter signs this object.

Conceptually:

```text
signature =
Sign(
    ATTESTOR_PRIVATE_KEY,
    hash(normalizedEvidence)
)
```

The Compact circuit knows the trusted attestor public key and verifies that the private evidence was authenticated before evaluating a policy.

Long-term, that adapter could be replaced or complemented by more direct attestation mechanisms.

For the hackathon, the abstraction is sufficient to demonstrate the important trust boundary.

---

# 10. The artifact identity

Every proof should refer to a **specific software artifact**.

Do not use only:

```text
Product version = 2.1.0
```

because version labels are human-controlled.

Use an immutable digest such as:

```text
sha256:8f739ab...
```

For an OCI/container image, its image digest is a natural identifier.

Then:

```text
authenticated evidence
        │
        │ artifactDigest = ABC
        ▼

ZK circuit

assert(
  evidence.artifactDigest ==
  publicArtifactDigest
)
```

The public proof therefore refers to exact artifact bytes, not merely “version 2.1”.

A commit SHA can also be included as provenance metadata:

```text
source commit → build → artifact digest
```

---

# 11. Continuous compliance

This is one of the strongest aspects of the project.

Security status changes over time.

Suppose:

```text
Product v2.3
Artifact ABC
```

On August 7:

```text
Vulnerability DB snapshot: D1

✓ no critical vulnerabilities
```

On August 20, a new critical CVE is disclosed affecting one of its dependencies.

The proof generated on August 7 has not become cryptographically false.

It means:

> “According to evidence E and policy P at time T, artifact ABC satisfied the policy.”

Therefore every compliance proof should be time-bound.

For example:

```text
Artifact:
ABC

Policy:
ACME-v3

Evidence timestamp:
2026-08-07

Policy version:
3

Valid until:
2026-09-07

Status:
✓ COMPLIANT
```

At expiration:

```text
old proof → EXPIRED
```

The vendor runs its evidence process again:

```text
new scan
    ↓
new authenticated evidence
    ↓
new proof
```

This creates **continuous privacy-preserving compliance** rather than a one-time certificate.

This also aligns well with OpenSSF's approach: compliance claims are tied to specific Baseline versions rather than an abstract permanent state.

---

# 12. Why Midnight and why blockchain?

ZK itself does not require blockchain.

A vendor could generate a proof and email it directly to a buyer.

So the blockchain needs an independent reason to exist.

For this project, Midnight provides a neutral registry for:

```text
policy definitions
policy versions
artifact identities
proof results
proof timestamps
expiration
compliance history
multiple vendors
multiple buyers
```

Instead of:

```text
Vendor database says:
"We passed."
```

a buyer can independently inspect:

```text
Artifact ABC

ACME Policy v3

2026-07-07    ✓
2026-08-07    ✓
2026-09-07    expired
2026-09-08    ✓
```

without gaining access to the private reports behind those proofs.

Midnight specifically supports public on-chain state interacting with private local state through ZK proofs, and its current architecture supports local proof generation followed by network validation.

That gives us a coherent reason for both technologies:

```text
ZK
    → selective disclosure

Blockchain
    → shared verification + history + policy registry

Midnight
    → combines those two
```

---

# 13. Main actors

The conceptual platform has four roles.

```text
              POLICY ISSUER
             buyer / standard
                    │
             publishes policy
                    │
                    ▼
                 Midnight
                    ▲
                    │ proof
                    │
                 VENDOR
                    ▲
                    │
          private authenticated
               evidence
                    ▲
                    │
                ATTESTOR
          CI / scanner / auditor
```

### Vendor

Owns the software product and private evidence.

Examples:

```text
SaaS company
library vendor
enterprise software supplier
security product vendor
government contractor
```

### Policy issuer / buyer

Defines requirements.

Examples:

```text
bank
government agency
enterprise procurement department
hospital
critical infrastructure operator
```

### Attestor

Establishes facts.

Examples:

```text
GitHub CI
security scanner
cloud provider
auditor
compliance platform
trusted internal enterprise service
```

### Midnight

Stores/verifies:

```text
policies
policy versions
proof-bearing transactions
compliance status
history
expiration
```

without receiving the private security evidence itself.

---

# 14. Real-life scenario: bank procurement

Suppose a bank is considering purchasing a proprietary fraud-detection system.

The bank publishes:

```text
BANK-SOFTWARE-POLICY-v4

critical vulnerabilities == 0

known exploited vulnerabilities == 0

MFA for privileged repository access == required

protected primary branch == true

build provenance == verified
```

The vendor's evidence contains much more:

```text
411 dependencies
0 critical CVEs
2 high CVEs
21 medium CVEs
exact CVE identifiers
developer identities
repository administrators
MFA statistics
branch configuration
CI configuration
internal package names
```

The vendor proves:

```text
FraudEngine
Artifact ABC

BANK-SOFTWARE-POLICY-v4

✓ SATISFIED
```

The bank doesn't receive the entire evidence bundle.

For requirements where detailed evidence genuinely matters, the bank can still request it separately.

The ZK system complements rather than eliminates conventional due diligence.

---

# 15. Real-life scenario: government procurement

A government agency publishes a machine-verifiable software supply-chain policy.

Several vendors bid:

```text
                     Government Policy
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          Vendor A       Vendor B       Vendor C
             │              │              │
             ▼              ▼              ▼
         private E       private E      private E
             │              │              │
             ▼              ▼              ▼
           proof          proof          proof
             │              │              │
             ✓              ✓              ✗
```

The government can objectively verify the same policy against every bidder while the bidders do not have to publish their full private security evidence.

This fits the real supplier/acquirer model described by NIST secure-software guidance.

---

# 16. Real-life scenario: proprietary SDK or dependency

A company wants to adopt a proprietary third-party library.

The buyer's policy says:

```text
No dependency may be present
in ACME-Prohibited-Packages-v2.

No component may have a
critical known vulnerability.

No known-exploited vulnerability
may affect the product.
```

The vendor has a private SBOM:

```text
Product X

├── package A
├── package B
├── internal-component X
├── internal-component Y
├── ...
└── package 427
```

Instead of handing over the entire dependency graph, the vendor can prove predicates over it.

This is a stronger privacy use case than hiding something relatively harmless such as an exact test-coverage percentage.

---

# 17. Real-life scenario: multiple customers

This should probably be part of the demo or pitch because it demonstrates why reusable private evidence matters.

Vendor:

```text
Artifact ABC

Private authenticated Evidence E
```

Customer A requires:

```text
critical == 0
high <= 5
```

Customer B requires:

```text
critical == 0
KEV == 0
```

Customer C requires:

```text
critical == 0
prohibitedLicenses == 0
```

The vendor proves against each independently:

```text
                  Evidence E
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Policy A    Policy B    Policy C
          │           │           │
          ▼           ▼           ▼
         PASS        PASS        PASS
```

No additional disclosure.

No requirement for the attestor to understand every customer policy.

This is one of the central arguments for using programmable ZK.

---

# 18. Proposed hackathon MVP

Do **not** implement the whole compliance platform.

Implement the smallest application that demonstrates the complete trust/privacy model.

The MVP should contain:

1. one sample private repository;
2. one GitHub Actions pipeline;
3. one generated security-evidence object;
4. one trusted evidence signer;
5. one Compact policy contract;
6. three or four private predicates;
7. two buyer policies if time allows;
8. one vendor dashboard;
9. one buyer dashboard;
10. proof history with timestamps/expiration.

A suitable first policy could be:

```text
critical vulnerabilities == 0

high vulnerabilities <= 5

known exploited vulnerabilities == 0

build provenance == verified
```

If implementing real OSPS controls is straightforward, replace or complement one of these with an actual machine-verifiable OSPS control.

Avoid making:

```text
coverage >= 80%
```

the flagship security requirement.

Coverage is fine as a technical demo predicate but a weak representation of software security.

---

# 19. MVP evidence pipeline

The simplest backend pipeline:

```text
PRIVATE REPOSITORY
       │
       ▼
GitHub Actions
       │
       ├── build artifact
       │
       ├── calculate digest
       │
       ├── dependency/security scan
       │
       └── optionally generate GitHub provenance
       │
       ▼
NORMALIZER / ATTESTOR
       │
       ├── validate expected CI information
       │
       ├── generate canonical evidence
       │
       └── sign evidence
       │
       ▼
Vendor application
```

Example private evidence:

```json
{
  "schemaVersion": 1,

  "artifactDigest": "ABC123",
  "commit": "98adef",

  "generatedAt": 1786100000,
  "validUntil": 1788778400,

  "critical": 0,
  "high": 3,
  "kev": 0,

  "forbiddenDependencies": 0,

  "mfaRequired": true,
  "branchProtected": true,
  "buildProvenanceVerified": true
}
```

Signature:

```text
Sign(attestorKey, canonicalEvidenceHash)
```

The detailed scanner report can still exist separately.

The normalized object represents only the facts we currently support.

---

# 20. Policy representation

For the MVP, do not make a generic arbitrary policy programming language unless it is extremely easy.

Hard-code two example Compact policies.

For example:

```text
POLICY_BANK_V1

critical == 0
high <= 5
kev == 0
buildProvenanceVerified
```

and:

```text
POLICY_ENTERPRISE_V1

critical == 0
forbiddenDependencies == 0
branchProtected
buildProvenanceVerified
```

Each policy has:

```text
policyId
policyVersion
policyHash
issuer
validFrom
optionalValidUntil
```

Later, policy composition could become dynamic.

For the hackathon, hard-coded policies are sufficient to prove the concept.

---

# 21. Conceptual Compact circuit

Not exact syntax:

```text
circuit proveCompliance(
    publicArtifactDigest,
    policyId
) {

    evidence = privateWitness();

    signature = privateSignatureWitness();

    assert(
        verifyTrustedAttestor(
            evidence,
            signature
        )
    );

    assert(
        evidence.artifactDigest
        ==
        publicArtifactDigest
    );

    assert(
        evidence.generatedAt >=
        requiredFreshnessTime
    );

    if policyId == BANK_POLICY_V1 {

        assert(evidence.critical == 0);
        assert(evidence.high <= 5);
        assert(evidence.kev == 0);
        assert(evidence.buildProvenanceVerified);
    }

    markCompliant(
        publicArtifactDigest,
        policyId,
        evidence.generatedAt
    );
}
```

The important thing is not the syntax.

The important separation is:

```text
PUBLIC

artifact digest
policy identity
proof timestamp
compliance status

PRIVATE

security evidence
vulnerability counts
repository settings
SBOM-derived facts
attestor signature inputs
```

---

# 22. Midnight integration

Compact defines the privacy-preserving contract/circuit logic.

Midnight.js provides the current official application-side tooling for deployment, contract interaction, encrypted private state and ZK-related operations.

Current Midnight documentation describes client-side/local proving: private data can remain on the user's machine while proofs are generated locally and submitted to the network for validation.

Conceptually:

```text
Vendor frontend
      │
      │ private evidence
      ▼
Midnight application layer
      │
      ▼
Compact circuit
      │
      ▼
local proof generation
      │
      ▼
proof-bearing transaction
      │
      ▼
Midnight
```

For the hackathon, keep this integration in TypeScript unless there is a very strong reason not to.

Other services can use whatever stack is convenient.

---

# 23. Suggested application architecture

```text
                       GitHub
                         │
                         ▼
                 GitHub Actions
                         │
                  scan / build
                         │
                         ▼
              Evidence Attestor API
                         │
                    signed evidence
                         │
                         ▼
┌──────────────────────────────────────────────┐
│              Vendor Web App                  │
│                                              │
│ private evidence                             │
│ artifact selector                            │
│ policy selector                              │
│ proof generation                             │
│ Midnight.js                                  │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
                Midnight Network
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
     policy registry       compliance proofs
          │                       │
          └───────────┬───────────┘
                      ▼
┌──────────────────────────────────────────────┐
│               Buyer Web App                  │
│                                              │
│ vendor/product lookup                        │
│ artifact identity                            │
│ policy status                                │
│ proof history                                │
│ expiration/freshness                         │
└──────────────────────────────────────────────┘
```

---

# 24. Vendor frontend

This is where the privacy value should be visually obvious.

## Vendor home

```text
My Products

PaymentEngine
FraudDetectionAPI
AuthSDK
```

Select:

```text
PaymentEngine
```

Then:

```text
Latest artifact

sha256:ABC...

Commit
93fa81...

Evidence generated
Aug 7, 2026
```

Private evidence panel:

```text
PRIVATE SECURITY EVIDENCE

Critical vulnerabilities       0
High vulnerabilities           3
Medium vulnerabilities        19
Known exploited                0

Dependencies                 427
Forbidden dependencies         0

MFA enforced                  Yes
Protected branch              Yes
Build provenance verified     Yes

[ View full internal report ]
```

Clearly mark:

```text
PRIVATE — not written to Midnight
```

Then show available policies:

```text
AVAILABLE POLICIES

ACME Bank Procurement v3
Government Software v1
OpenSSF Demo Baseline v1
```

For each:

```text
ACME Bank Procurement v3

Issuer:
ACME Bank

Requirements:
Critical CVEs = 0
High CVEs <= 5
KEV = 0
Build provenance verified

[ Generate proof ]
```

After click:

```text
Generating zero-knowledge proof...

✓ Proof accepted by Midnight

Valid until:
Sep 7, 2026
```

That is the vendor workflow.

---

# 25. Buyer frontend

The buyer should **not** see the private evidence.

Example:

```text
Vendor
Example Software Ltd.

Product
PaymentEngine

Artifact
sha256:ABC...

Policy
ACME Bank Procurement v3

Status
✓ COMPLIANT

Evidence date
Aug 7, 2026

Proof recorded
Aug 7, 2026

Valid until
Sep 7, 2026
```

Then:

```text
COMPLIANCE HISTORY

Artifact ABC
Jul 07    ACME v3     ✓
Aug 07    ACME v3     ✓

Artifact DEF
Sep 08    ACME v3     ✓
```

Do **not** display:

```text
critical = 0
high = 3
medium = 19
MFA = 94%
```

Instead:

```text
Requirements

✓ Critical vulnerability requirement satisfied
✓ High-severity vulnerability requirement satisfied
✓ Known-exploited vulnerability requirement satisfied
✓ Build provenance requirement satisfied
```

That contrast is the entire selective-disclosure demonstration.

---

# 26. Buyer policy management

If time allows, add:

```text
My Policies

ACME Procurement v2
ACME Procurement v3

[ Create policy ]
```

For the hackathon, “create” could simply select from supported predicates:

```text
Critical vulnerabilities
[ == ] [ 0 ]

High vulnerabilities
[ <= ] [ 5 ]

Known exploited
[ == ] [ 0 ]

Require verified provenance
[ ✓ ]
```

Then:

```text
Publish Policy
```

The application creates/registers a new version.

This demonstrates the long-term concept even if the underlying Compact circuits remain limited to predefined structures.

---

# 27. Continuous compliance frontend

This deserves its own UI because it helps justify the blockchain.

Buyer view:

```text
PaymentEngine

CURRENT STATUS
✓ COMPLIANT

Policy:
ACME-v3

Expires:
Sep 7
```

Timeline:

```text
Jun 07    Artifact A    ✓
Jul 07    Artifact A    ✓
Aug 07    Artifact B    ✓
Sep 07                  Expired
Sep 08    Artifact C    ✓
```

Vendor view can have:

```text
Compliance expires in 8 days

[ Re-run evidence pipeline ]
```

Eventually this becomes:

```text
CI runs
    ↓
evidence changes
    ↓
proof regenerated
    ↓
compliance continuously refreshed
```

That is much more interesting than a one-shot badge.

---

# 28. Demo sequence

A good demo should emphasize the information asymmetry rather than explaining cryptography first.

Start with the **buyer**:

```text
"We require vendors to satisfy ACME Procurement v3."
```

Show the policy.

Then switch to the **vendor**.

Show:

```text
private SBOM
vulnerability findings
internal metrics
repository configuration
```

Say:

> “The vendor has enough evidence to answer the buyer's question, but does not want to give the buyer its entire security dossier.”

Select:

```text
ACME Procurement v3
```

Click:

```text
Generate Proof
```

Show Midnight accepting the proof.

Switch back to buyer.

Buyer sees:

```text
PaymentEngine
Artifact ABC

ACME Procurement v3

✓ COMPLIANT
```

but none of the private values.

Then select **another buyer policy** using the same evidence:

```text
Government Software Policy v1
```

Generate another proof.

That demonstrates the strongest property:

> **one authenticated private evidence set, multiple independently defined policies.**

Finally show the history:

```text
July ✓
August ✓
```

and explain that proofs expire and are renewed as security evidence changes.

---

# 29. The pitch

A concise version:

> **Companies buying software need assurance that vendors meet their security requirements, but proving that often means exchanging detailed vulnerability reports, SBOMs and internal security evidence. We use Midnight to let buyers publish security policies and let vendors prove, using authenticated private evidence, that a specific software artifact satisfies those policies without revealing the underlying security data. The same evidence can be reused against different buyers' requirements, while Midnight provides an independently verifiable history of compliance over time.**

Even shorter:

> **Buyers define what they need to know. Vendors prove it without revealing everything they know.**

---

# 30. Why not just have the scanner sign PASS?

Expected jury challenge:

> “Why doesn't the security scanner just evaluate the policy and sign PASS?”

Answer:

Because the scanner establishes reusable facts.

Different customers can subsequently ask different questions of those facts.

```text
scanner:

critical = 0
high = 3
KEV = 0
MFA = 94%
...
```

Later:

```text
Bank:
high <= 5 ?

Government:
KEV == 0 ?

Enterprise:
MFA >= 90% ?
```

The attestor does not need to know every future policy.

The vendor does not need to disclose the facts.

ZK lets different verifiers evaluate predicates over the same authenticated private evidence.

---

# 31. Why not simply share the report?

Jury challenge:

> “If I'm buying your software, shouldn't I see the report anyway?”

Answer:

Sometimes yes.

ZK does not replace every security review.

But many procurement decisions require **specific facts**, not every internal detail.

A vendor may be willing to prove:

```text
no critical vulnerability exists
```

without handing every potential customer:

```text
full SBOM
medium/low findings
internal dependencies
specific patch status
internal repository information
developer/account configuration
```

If the customer genuinely needs those details, conventional disclosure remains possible.

Our platform is for situations where the **predicate is necessary but the underlying evidence is not**.

---

# 32. Why blockchain?

Jury challenge:

> “Fine, use ZK. Why put it on Midnight?”

Answer:

A single bilateral proof does not inherently require blockchain.

Midnight becomes useful when the system has:

```text
many vendors
many buyers
shared policy definitions
policy versioning
artifact identities
proof timestamps
expiration
long-term compliance history
independent verification
```

It acts as the neutral shared state rather than either party hosting the authoritative compliance database.

The history remains verifiable while the evidence itself stays private.

---

# 33. Aren't security findings supposed to be disclosed?

Jury challenge:

> “Isn't hiding vulnerabilities dangerous?”

Answer:

The product should not be presented as a mechanism for hiding legally or contractually required disclosures.

It is a **selective disclosure mechanism**.

The policy issuer decides what must be demonstrated.

A buyer could require:

```text
critical == 0
```

or:

```text
critical == 0
AND
high == 0
```

or demand full conventional disclosure separately.

ZK does not determine what information someone is entitled to receive.

It merely allows policies where revealing the raw evidence is unnecessary.

---

# 34. Can the vendor fake the report?

Jury challenge:

> “What's stopping the vendor from saying it has zero vulnerabilities?”

Answer:

The Compact circuit does not trust arbitrary vendor input.

Evidence must be authenticated by an approved attestor.

Conceptually:

```text
verify(attestorSignature, evidence)

AND

evidence.artifactDigest
==
publicArtifactDigest

AND

policy(evidence)
==
true
```

If the vendor changes:

```text
critical = 4
```

to:

```text
critical = 0
```

the attestor signature no longer matches.

The remaining trust assumption is therefore explicit:

> **We trust the attestor to correctly measure/report its domain.**

ZK does not eliminate that trust.

---

# 35. What if the scanner itself is bad?

Jury challenge:

> “What if your vulnerability scanner misses something?”

Answer:

The proof establishes:

> “This authenticated evidence satisfies the policy.”

It does not establish:

> “The software is metaphysically secure.”

Policies should therefore identify:

```text
approved attestor/scanner
scanner version
evidence timestamp
vulnerability database version if available
```

The system makes the assurance claim precise rather than absolute.

Multiple attestors could later be required:

```text
Scanner A
AND
Scanner B
AND
CI provenance
```

---

# 36. What if a new CVE appears tomorrow?

This is exactly why we introduce continuous compliance.

Proofs have:

```text
evidence timestamp
validity period
policy version
```

A proof is a historical statement.

New evidence requires a new proof.

The frontend should distinguish:

```text
COMPLIANT
EXPIRED
NO CURRENT PROOF
```

rather than presenting an old proof as permanent security.

---

# 37. What does Midnight actually hide?

Another likely jury question.

Public:

```text
vendor identifier
product identifier
artifact digest
policy ID/version
compliance result
proof timestamp
expiration
```

Private:

```text
exact vulnerability counts
specific CVEs
SBOM/dependencies
internal package names
repository configuration
MFA statistics
security findings
any other evidence not necessary to disclose
```

That is the selective-disclosure boundary.

---

# 38. What the project is NOT

The project is not:

```text
a vulnerability scanner
a replacement for SOC 2
a full NIST compliance engine
an auditor replacement
a magical truth oracle
a system that proves software has no vulnerabilities
a generic blockchain CI system
```

It is:

> **a privacy-preserving verification layer over authenticated software-assurance evidence.**

That distinction is important.

---

# 39. Hackathon implementation priorities

If time becomes limited, implement in this order:

1. Compact contract proving predicates over private evidence.
2. Attestor-signed evidence.
3. Artifact digest binding.
4. Vendor UI displaying private evidence.
5. Buyer UI displaying only compliance result.
6. One working policy.
7. Midnight proof submission.
8. Compliance timestamp/history.
9. Second policy over the same evidence.
10. GitHub Actions integration.
11. Expiration.
12. Real standard mapping.

The critical demo is already successful when:

```text
private authenticated evidence
        ↓
one Compact policy
        ↓
proof
        ↓
buyer sees PASS
without seeing private values
```

The **second policy using the same evidence** is the most valuable additional feature after that.

---

# 40. Suggested codebase structure

A practical monorepo might look like:

```text
/apps
    /vendor-web
        React/Next.js
        vendor dashboard
        private evidence UI
        policy selector
        Midnight integration

    /buyer-web
        React/Next.js
        public policy/status/history UI

/services
    /attestor
        TS or Rust
        evidence normalization
        signing
        optional GitHub verification

/contracts
    /compact
        compliance.compact
        policy definitions

/packages
    /evidence-schema
        canonical evidence types

    /policy-schema
        policy IDs/types

    /midnight
        generated Compact bindings
        Midnight.js adapter

/demo
    /sample-private-project
        vulnerable/safe sample application
        GitHub Actions workflow

    /fixtures
        sample evidence
```

For a hackathon, the buyer and vendor frontend can also be one application with:

```text
/vendor
/buyer
```

routes.

That is probably faster.

---

# 41. Minimal evidence schema

Something like:

```typescript
type SecurityEvidence = {
    schemaVersion: number;

    artifactDigest: string;
    commitHash: string;

    generatedAt: number;
    validUntil: number;

    criticalVulnerabilities: number;
    highVulnerabilities: number;
    knownExploitedVulnerabilities: number;

    forbiddenDependencies: number;

    mfaRequired: boolean;
    primaryBranchProtected: boolean;
    buildProvenanceVerified: boolean;
};
```

Then:

```typescript
type SignedEvidence = {
    evidence: SecurityEvidence;
    attestorId: string;
    signature: string;
};
```

Keep this canonical and deterministic so the same data produces the same signed representation.

---

# 42. Minimal policy schema

Application-side representation:

```typescript
type Policy = {
    id: string;
    version: number;

    issuer: string;
    name: string;

    maxCritical?: number;
    maxHigh?: number;
    maxKEV?: number;
    maxForbiddenDependencies?: number;

    requireMFA?: boolean;
    requireBranchProtection?: boolean;
    requireBuildProvenance?: boolean;

    evidenceMaxAgeDays: number;
};
```

For the hackathon, Compact doesn't necessarily need to support every policy dynamically.

The frontend can display this structure while the contract implements one or two supported policy circuits.

---

# 43. Public compliance record

Conceptually:

```typescript
type ComplianceRecord = {
    vendorId: string;
    productId: string;

    artifactDigest: string;

    policyId: string;
    policyVersion: number;

    provenAt: number;
    validUntil: number;

    compliant: boolean;
};
```

No private evidence goes here.

---

# 44. Future scaling

If the MVP succeeds, the architecture can expand considerably.

Possible extensions include:

```text
real OpenSSF policy packs

NIST SSDF-derived machine-verifiable controls

SBOM predicates

license compliance

SLSA/build provenance requirements

cloud/IAM configuration evidence

multiple independent attestors

auditor attestations

policy composition

policy marketplace/registry

automatic CI proof refresh

proof revocation

vendor organization identities

customer-specific private policies

selective revelation of individual findings

proofs across multiple products

supply-chain proofs across multiple vendors

dependency-level compliance inheritance
```

One particularly interesting long-term direction is **composable supply-chain assurance**.

For example:

```text
Vendor A proves Library A compliant
        ↓
Vendor B uses Library A
        ↓
Vendor B proves Product B compliant
        ↓
Enterprise consumes Product B
```

That goes well beyond what should be attempted during the hackathon, but demonstrates where a shared compliance-proof network could eventually lead.

---

# 45. Final project definition

The strongest version of the idea is no longer:

> “Use ZK to hide a CI report.”

It is:

> **Create a privacy-preserving software assurance network where organizations publish security policies and software vendors prove that authenticated private evidence about specific artifacts satisfies those policies. Evidence can be reused against different customers' requirements, while Midnight records independently verifiable, versioned and time-bound compliance proofs without putting the underlying vulnerability reports, SBOMs or internal security configuration on-chain.**

The conceptual flow is:

```text
             BUYER / STANDARD BODY

                 defines policy
                       │
                       ▼
                    Midnight
                       ▲
                       │
                    ZK proof
                       │
                     VENDOR
                       ▲
                       │
             authenticated private
              security evidence
                       ▲
                       │
           CI / scanner / attestor
```

And over time:

```text
                        SAME VENDOR EVIDENCE MODEL

                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
               Bank A          Gov B           Corp C
               Policy          Policy          Policy
                  │               │               │
                  ✓               ✓               ✓


                              CONTINUOUSLY

Artifact A     June      Policy A      ✓
Artifact A     July      Policy A      ✓
Artifact B     August    Policy A      ✓
Artifact B     September Policy A      EXPIRED
Artifact C     September Policy A      ✓
```

That combination — **buyer-defined policies + reusable private authenticated evidence + selective disclosure + multiple counterparties + continuous compliance history** — is the version worth building and pitching.