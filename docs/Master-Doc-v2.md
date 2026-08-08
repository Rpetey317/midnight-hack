# zkuat current product and implementation brief

This filename is retained from the original v2 alignment document. The content
below describes the current repository rather than the superseded design.

## 1. Project definition

zkuat is a privacy-preserving software compliance application where a vendor can
prove that GitHub-generated security evidence satisfies a public buyer policy
without putting the underlying findings on Midnight.

The current hackathon trust statement is:

> GitHub Actions is trusted to run the repository's compatible measurement
> workflow. zkuat proves policy evaluation over the accepted artifact; it does
> not cryptographically prove the scanner or web handoff was honest.

## 2. Actors

### Vendor / auditee

The vendor signs into `zkuat.works` with GitHub, selects a repository and policy,
retrieves the workflow evidence, pairs a local sponsor runtime, and requests the
proof. The vendor does not connect a browser wallet.

### Buyer / auditor

The buyer cares about the public policy definition, artifact identity, validity
window, and compliance verdict. The buyer does not receive vulnerability counts,
lint/build output, commit evidence, salt, or Merkle path.

In this hackathon build, arbitrary buyer policy creation is not implemented. The
runtime deploy command registers two fixed examples.

### Local sponsor operator

The person running `@zkuat/runtime` controls one Preview/Preprod sponsor wallet
through its 24-word recovery phrase. That wallet pays DUST for the vendor's
contract calls and its decoded seed also derives the contract anchor witness.
For the demo this is normally the vendor's machine and operator.

## 3. Repository state

```text
zkuat/
├── .github/workflows/generate-evidence.yml
├── contract/   Compact protocol + shared TypeScript encoding
├── runtime/    local wallet/proof/API/indexer companion
├── ui/         Vercel Next.js application + Supabase read-model
└── docs/       current implementation documentation
```

## 4. Evidence generation

The compatible GitHub Actions workflow:

1. checks out the repository;
2. installs Node dependencies;
3. captures `npm audit --json`;
4. runs lint and build without aborting evidence generation;
5. runs `npm pack` and hashes the tarball bytes with SHA-256;
6. writes `evidence.json` containing repository, commit, artifact digest,
   severity counts, and lint/build booleans;
7. uploads `zkuat-evidence-<request-id>` for one day.

The copy in this repository operates on `ui/`. Repositories added through the
application must carry an equivalent workflow or a configured alternative
filename with the same dispatch/artifact/schema contract.

## 5. GitHub and web handoff

The hosted Next.js server action uses the signed-in user's Supabase GitHub
provider token to dispatch the workflow on the default branch, find the run by
request UUID, wait up to ten minutes, require success, download the artifact,
and parse `evidence.json`.

The server returns the raw JSON and run/artifact metadata to the authenticated
browser. The vendor can inspect it before proving. This means the evidence is
not exclusively local: Vercel and the vendor browser see it. The privacy claim
is that it is not published to the auditor, Supabase public read-model, or
Midnight ledger.

## 6. Local runtime

`@zkuat/runtime` is an HTTP service bound to loopback. It must be started by the
user; a deployed web page cannot launch it. The browser pairs using a six-digit
code and receives an in-memory bearer token.

For each job the runtime:

1. validates the forwarded JSON and self-consistency of request, run URL/ID,
   artifact name/ID, repository, completion status, and policy slug;
2. maps the artifact into canonical `zkuat.evidence.v4`;
3. sets `generatedAt` to local receipt time and `validUntil` from the selected policy;
4. creates a fresh random salt and Compact commitment;
5. persists the full private job below `~/.zkuat/runtime`;
6. starts the local Docker proof server;
7. starts and synchronizes the sponsor wallet, registering NIGHT outputs for
   DUST generation when needed;
8. confirms that the seed-derived anchor matches the configured contract;
9. submits the anchor transaction;
10. obtains the indexed Merkle path and submits the compliance proof;
11. verifies transaction status, contract entry point, record key fields, and
    verdict through the hosted indexer.

The runtime trusts the paired frontend's GitHub payload. It does not re-download
or authenticate the artifact itself.

## 7. Compact model

There is one registry contract rather than one contract per policy. It exposes:

```text
attest(leaf)
registerPolicy(policyId, policy)
proveCompliance(vendorId, productId, artifactDigest, policyId)
```

The sealed anchor identity authorizes the first two calls. A depth-16 historic
Merkle tree authenticates accepted evidence while allowing proofs against older
roots. Policies are public. Nullifiers prevent one evidence leaf from being
reused against the same policy. `records` holds the current artifact/policy
result and `history` preserves every result.

The proof checks:

- the private salted evidence is in the anchored set;
- private vendor, product, and artifact values match the public inputs;
- the evidence/policy pair has not been replayed;
- the committed validity window is no longer than the public policy allows;
- vulnerability thresholds and required command outcomes hold.

Only the combined verdict is disclosed. A failed predicate produces a valid
public `compliant=false` record; invalid membership, binding, freshness-window,
or replay claims fail the transaction.

## 8. Implemented policies

`npm-ci-baseline-v1` requires:

```text
critical == 0
high <= 5
lint passed
build passed
validity window <= 30 days
```

`npm-production-release-v1` requires:

```text
critical == 0
high == 0
totalVulnerabilities <= 5
lint passed
build passed
validity window <= 7 days
```

`npm-zero-known-vulns-v1` requires zero critical, high, and total
vulnerabilities, both checks, and a window of at most 3 days.

`npm-emergency-hotfix-v1` permits at most 2 highs and skipped lint, but requires
zero criticals, a successful build, and a window of at most 2 days.

The runtime maps `npm audit`'s `vulnerabilities.total` into
`totalVulnerabilities`.

## 9. Public and private data

### Private from Midnight and the public verifier

```text
commit SHA
critical/high/total values
moderate/low artifact values
lint/build results
salt and evidence leaf
Merkle path
sponsor recovery phrase, decoded seed, and derived anchor secret
```

### Public on Midnight

```text
derived vendor ID
derived product ID
artifact SHA-256
policy ID and version
provenAt and validUntil
one compliance boolean
nullifier and contract transaction/state effects
```

The application intentionally hides findings, not the vendor relationship or
artifact identity.

## 10. Transactions and gas sponsorship

A proof job normally creates two contract transactions:

1. `attest`
2. `proveCompliance`

Verification is a read. On first use the wallet may separately register NIGHT
UTXOs for DUST generation. Deployment creates one contract and submits two
policy-registration calls.

The sponsor recovery phrase is stored only in the local runtime env file. The
runtime checksum-validates it and decodes the original wallet seed. Neither the
phrase nor raw seed is put in Vercel, Supabase, frontend environment variables,
or the contract witness.

## 11. Hosted UI and public verifier status

The deployed UI implements GitHub OAuth, repository registration, workflow
retrieval, local-runtime pairing, policy selection, proof progress, and display
of real runtime transaction receipts.

Its dashboard and public verifier are currently a separate Supabase-backed
read-model. The repository includes no database migrations. A real completed
runtime job is not yet written into `artifacts` or `proof_activity`, policy pages
use a hard-coded mirror of contract policies, and verifier pages do not query the
Midnight indexer. The demo seeder inserts synthetic transaction hashes.

Therefore the local runtime's indexer check is authoritative for real jobs. The
public verifier currently demonstrates the intended product experience rather
than providing independent live-chain verification.

## 12. Minimum reproducible demo

1. Install/compile the contract and runtime.
2. Configure the 24-word recovery phrase for a funded Preview/Preprod sponsor wallet.
3. Deploy the contract and record its address.
4. Start the runtime and leave it running.
5. Sign into `zkuat.works` with GitHub.
6. Add a repository that carries the compatible evidence workflow.
7. Request evidence and wait for the successful Actions artifact.
8. Pair the browser with the local runtime.
9. Select one of the four policies and generate the proof.
10. Observe the `attest` and `proveCompliance` transaction IDs and the final
    indexed `verified` or `rejected` record.

## 13. Deliberate hackathon scope

Not implemented:

- signed evidence, Sigstore/Rekor, SLSA, or KMS attestors;
- runtime-side GitHub authentication/retrieval;
- arbitrary policy creation/governance;
- multiple sponsor wallets or concurrent transaction queues;
- remote key custody;
- automatic Supabase/indexer synchronization;
- a direct chain-backed public verifier;
- production recovery guarantees, monitoring, rate limiting, or key rotation.

## 14. Logical next steps

The cleanest continuation is to preserve the Compact evidence/policy boundary
while strengthening integration and provenance:

1. persist each verified runtime receipt into the application read-model;
2. make the public verifier query and deserialize actual indexer state;
3. replace UI policy fixtures with ledger reads;
4. move GitHub artifact retrieval/verification into the local runtime or add a
   signed provenance envelope;
5. add Supabase migrations and reproducible frontend deployment configuration;
6. add live-network integration tests and operational diagnostics;
7. later add richer scanners, SBOM/provenance inputs, and policy governance.

The core product remains:

> private measured evidence → public buyer policy → local zero-knowledge proof →
> public, artifact-bound compliance record.
