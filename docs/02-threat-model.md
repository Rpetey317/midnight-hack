# 02 — Threat Model

> Judges reward a team that names its own weaknesses before they do. This is pitch material, not just
> engineering hygiene. Master Doc §30–§38 are largely a threat-model discussion — they are folded in
> here so there is one place to revise before presenting.
>
> Budget 20 minutes on this document before the pitch.

## What the protocol actually proves

A valid `proveCompliance` proof establishes, in zero knowledge:

1. There exists an evidence struct `E` and salt `s` such that `persistentCommit(E, s)` equals a leaf in
   the on-chain `attestations` tree (at some historic root) — i.e. **an approved attestor signed `E`**.
2. `E.artifactDigest` equals the **public** artifact digest in the proof (§10). The claim is about
   specific artifact bytes, not a human-controlled version label.
3. `E.vendorId` and `E.productId` equal the public vendor and product in the proof. The record's
   subject is signed by the attestor, not chosen by the prover — see below.
4. `E.attestorId` is accepted by `P`, and `E`'s validity window is no longer than `P` grants.
5. `E` satisfies the public thresholds of policy `P` at version `v`.
6. The nullifier for `(leaf, P)` has not been used before.

It discloses: vendor id, product id, artifact digest, policy id and version, the verdict boolean, the
evidence timestamp, the expiry, and the nullifier. Nothing else (§37).

### Why point 3 exists — public is not the same as trustworthy

Master Doc §21 binds only the artifact digest. That is not enough once records are enumerable. If
`vendorId` and `productId` were merely public circuit inputs, a prover holding valid evidence for their
*own* artifact could file the resulting record under **any vendor name** — and a buyer enumerating
`records` would see it. The sharp version is filing a fabricated *failing* record against a competitor.

So all three identity fields live in the `Evidence` struct, where the attestor signs them, and the
circuit asserts each against its public input. Two struct fields and two asserts. There is a test named
for the competitor-forgery case.

## What it does not prove

**The protocol proves evidence was authenticated and satisfies a policy. It does not prove the evidence
is true.** Truth comes from the attestor, not from the ZK proof. Master Doc §34 and §35 are built around
saying this plainly, and being clear about it is what separates a credible protocol from a demo.

Nor does it prove the software is secure. It proves:

> *"According to evidence E from attestor A, artifact ABC satisfied policy P at time T."*

Not:

> *"Artifact ABC is secure."*

## Trust assumptions

### 1. GitHub's OIDC identity and Sigstore (unavoidable, standard)

We trust GitHub to correctly bind a workflow's OIDC token to the repository that ran it, and Fulcio and
Rekor to behave. This is the same trust root as SLSA provenance and npm provenance. If GitHub is
compromised, attestation is meaningless — but that is true of the entire software supply chain today.

### 2. The attestor measures its domain correctly (explicit and irreducible)

Master Doc §34's answer to *"what stops the vendor faking the report?"* — the circuit does not trust
arbitrary vendor input, because changing any evidence field breaks the commitment and the Merkle path
check fails. But that only moves trust to the attestor.

**We trust the attestor to correctly measure and report its domain.** ZK does not eliminate this and
should not pretend to. What it does is make the assumption *precise and pinnable*: §35 wants policies to
name an approved attestor, scanner version, and vulnerability-database version, so a compliance record
means "measured by X at version Y against DB snapshot Z" rather than something absolute.

Post-hackathon this is where multi-attestor requirements go — `Scanner A AND Scanner B AND CI
provenance` — so a single bad attestor is not sufficient.

### 3. The anchor inserts only attested leaves (our residual assumption)

Because signature verification is off-chain ([01-architecture.md](01-architecture.md)), the contract
cannot distinguish an honestly-verified leaf from an arbitrary one. A malicious anchor operator could
insert a leaf for evidence that was never attested, letting someone prove unearned compliance.

**Mitigations available now:**
- The anchor is a small, single-purpose, open-source component — auditable in an afternoon.
- Every anchored leaf corresponds to a public Rekor entry, so an independent monitor can replay the log
  and detect leaves with no matching attestation. Detection is possible even though prevention is not.

**The real fix (post-hackathon):** run the anchor in an AWS Nitro Enclave and publish its attestation
document. Trust in us then collapses to trust in AWS — the enclave measurement proves the anchor runs
unmodified code. Strongest item on the roadmap.

### 4. The checks themselves are meaningful

The protocol is agnostic to check quality. A vendor could configure a scanner with every rule disabled
and honestly attest "0 critical findings." The record would be cryptographically valid and practically
worthless (§35).

**Mitigation:** the policy pins collector version and configuration hash, so a record means "ran
collector v1.2.0 with config hash 0xabc…". `Policy.requiredAttestor` is the first step; version and
config pinning is the same pattern and is cut for time.

**This is the live risk on the Master-Doc-v2 path, and it is not hypothetical.** The v2 workflow runs
`npm audit` only. It establishes no KEV fact and evaluates no prohibited-package list, yet the
`Evidence` struct has a slot for each. Writing `0` into them would put "no known-exploited
vulnerabilities" — the exact claim `bank-v1` checks — into a public compliance record on the strength
of a measurement that never happened.

`collector/src/github-evidence.ts` therefore marks both `unavailable` rather than measured, and
`zkuat-attest` refuses to sign a degraded report without `--allow-degraded`. **The number still reaches
the commitment**; the status does not, because `Evidence` commits to the value and not its provenance.
So this is surfaced-to-a-human, not enforced. Anyone signing a v2-path bundle is accepting that the
KEV and forbidden-dependency predicates are vacuous. Named in
[09-master-doc-v2-delta.md](09-master-doc-v2-delta.md), and the reason the adapter has tests asserting
the statuses rather than only the values.

## Known gaps

Real, and we say so out loud.

### Gap 1 — Fresh-salt re-anchoring permits a duplicate record

The nullifier is over `(leaf, policyId)`, and `leaf` includes the salt. Re-running CI on the *same
commit* with a *fresh salt* produces a different leaf, a different nullifier, and a second valid proof.

- **Impact:** duplicate *timeline* entries for one underlying measurement. It does **not** let a
  non-compliant artifact prove compliance, and it does **not** inflate any count — `records` is keyed
  on `(artifactDigest, policyId)`, so a re-proof replaces the current entry rather than adding one.
  Only `history` accumulates.
- **Severity dropped sharply under the current framing.** Continuous compliance (§11) *wants* repeated
  proofs as evidence is refreshed, so "new evidence → new leaf → new record" is the intended
  behaviour. The residual defect is cosmetic: two timeline entries can describe the same measurement.
- **Mitigation now:** the anchor sees repo and commit in the attestation predicate, so it enforces one
  anchored attestation per `(repo, commit)` off-chain.
- **Proper fix, now cheaper.** The old design rejected a nullifier over `(repoId, commitId, policyId)`
  because those values are low-entropy and an observer could brute-force the nullifier to
  de-anonymise the claimant. **Artifact identity is now public anyway**, so that objection is gone: a
  deterministic nullifier over `(artifactDigest, policyId, evidenceEpoch)` is available and leaks
  nothing new. Straightforward post-hackathon, and worth mentioning as a designed-for improvement
  rather than an oversight.

### Gap 2 — Freshness is recorded, not enforced on-chain

`Evidence.validUntil` lands in the public `ComplianceRecord`, and the buyer view compares it against
wall-clock time to show **COMPLIANT / EXPIRED / NO CURRENT PROOF** (§36). That satisfies what §11 and
§36 ask the frontend to display, but the *chain* does not reject a stale proof at submission.

- **Impact:** a vendor can submit a proof from expired evidence. The record will show as expired to any
  correct reader, so this is a display-integrity issue for naive clients rather than a forgeable claim.
- **Partially enforced already.** `proveCompliance` asserts
  `ev.validUntil <= ev.generatedAt + p.maxAgeSeconds`, which bounds how long an attestor may declare
  evidence valid for. That needs no block-time primitive and closes the "attestor grants a ten-year
  window against a thirty-day policy" hole. What remains unenforced is *now* — the chain cannot tell
  that `validUntil` has already passed.
- **Path to full enforcement (UNVERIFIED):** `blockTimeGte` / `blockTimeLt` appear in the
  `compact-patterns` state-management reference and would allow
  `assert(blockTimeLt(disclose(ev.validUntil)))`. Not executed in this project — verify with
  `/midnight-verify:verify` before relying on it. Note the reference's own warning that the deadline
  must come from ledger state or a public input, never from an unchecked witness, or a prover spoofs it.

### Gap 2b — Record overwrite is last-writer-wins

`records` is keyed on `(artifactDigest, policyId)` and `insert` replaces. Anyone holding attested
evidence that binds to that vendor, product, and artifact can overwrite the current entry — including
with an *older, failing* bundle.

- **Impact:** in practice only the vendor can do this, since only they hold the salt and bundle, and
  they have no motive to downgrade their own record. The identity binding (point 3 above) is what stops
  anyone else. So this is a self-harm vector, not an attack surface.
- **Fix if it ever matters:** refuse to overwrite a record whose `provenAt` is newer than the incoming
  one. One comparison against existing ledger state; cut for time, not for difficulty.

### Gap 3 — Metadata leakage through timing and tree size

- The tree's `firstFree()` index is public, so the total number of anchored attestations is visible.
- Anchoring happens shortly after a CI run. An observer correlating public GitHub push events with
  anchor transaction timing can guess which repository anchored. **The anchor transaction is the
  weakest metadata link in the system**, not the proof.
- **Reduced impact under the current framing.** Vendor and artifact identity are public in the
  compliance record anyway, so correlating an anchor to a repo reveals much less than it used to. What
  it can still reveal is *that a vendor measured and did not publish a record* — i.e. a failed check
  they chose not to prove. That inference is worth naming.
- **Mitigation:** batch anchoring on a fixed schedule, plus decoy inserts. Cheap; cut for time.

### Gap 4 — Non-publication is informative

A vendor that anchors evidence but never submits a compliance proof implies the evidence failed. With
public anchoring timestamps, absence becomes a signal.

- This is inherent to any voluntary-disclosure scheme, including today's questionnaires.
- **Mitigation:** allow submitting `compliant: false` records, so absence and failure are
  distinguishable and neither is inferable from silence. The circuit already returns `false` rather
  than reverting, so the mechanism exists — it is a UI and incentive question.

### Gap 5 — Small deployment, thin history

At demo scale there are a handful of records and a short timeline, so "independently verifiable
compliance history" is structural rather than practical. Inherent to launch, not a design flaw — but do
not overclaim it on stage.

## Anticipated jury challenges

Master Doc §30–§37, condensed. Full versions in the demo script.

| Challenge | One-line answer |
|---|---|
| *"Why doesn't the scanner just sign PASS?"* (§30) | Because it cannot know every buyer's future policy. The attestor establishes reusable facts; buyers ask different questions of them. |
| *"Shouldn't I see the report anyway?"* (§31) | Sometimes yes — this does not replace due diligence. It covers cases where the predicate is necessary but the underlying evidence is not. |
| *"Why blockchain?"* (§32) | Shared policy definitions, versioning, timestamps, expiration, and history across many vendors and buyers — with neither party hosting the authoritative state. |
| *"Isn't hiding vulnerabilities dangerous?"* (§33) | The policy issuer decides what must be demonstrated. A buyer can require `critical == 0 AND high == 0`, or demand full disclosure separately. ZK does not determine entitlement. |
| *"What stops the vendor faking it?"* (§34) | Evidence must be attestor-authenticated and bound to a public artifact digest. Change a field and the commitment breaks. Residual trust is in the attestor, stated explicitly. |
| *"What if the scanner misses something?"* (§35) | Then the record is valid and incomplete. Policies pin the attestor and version so the claim is precise rather than absolute. |
| *"What if a new CVE lands tomorrow?"* (§36) | The proof was always a historical statement. It expires; fresh evidence produces a fresh proof. That is why the UI shows three states. |

## Deliberate non-goals

- **Not a replacement for human audit.** It automates the continuous mechanical portion.
- **Not a vulnerability database.** We prove properties of findings; we never publish findings.
- **Not on-chain signature verification.** Correct long-term, infeasible today — and a Jubjub-native
  attestor key would relocate trust rather than reduce it (see [01-architecture.md](01-architecture.md)).
- **Not a full framework compliance engine.** Machine-verifiable controls derived from recognized
  frameworks, not "cryptographically proven NIST compliance" (§6).

## Privacy checklist for review

The contract half is mechanized in `contract/src/test/` — two allowlist tests collect every 32-byte
value on a public surface and assert the set is a subset of what is public by design, so a new field
nobody wrote an assertion for is caught automatically.

- [x] No finding counts, CVE identifiers, or dependency facts on any public surface
- [x] No repository configuration detail on any public surface
- [x] Leaf preimage absent from the attesting transcript (`insert()` applies `leaf_hash()`)
- [x] Salt never published anywhere
- [x] `proveCompliance` publishes **only** the intended set: vendor, product, artifact digest, policy
      id/version, verdict, timestamps, nullifier, record key
- [~] Evidence bundle is private, not attached to the public attestation predicate — *Track B*.
      Mechanized as `assertNoEvidenceLeak()` in `attestor/src/predicate.ts`: the predicate's key set
      must be exactly `{leaf, repo, sha, schema}`, and no private evidence field name or value may
      appear in any of them. Allowlist-shaped, so a new `Evidence` field is guarded without anyone
      editing it.

      **Partially ticked, deliberately.** The guard is implemented and unit-tested, and `anchor/` runs
      it before submitting. It is **no longer a CI gate**: `.github/workflows/attest.yml` used to run
      it before `actions/attest`, and that workflow was replaced with the Master-Doc-v2 §4 evidence
      job, which publishes no predicate at all. So the leak this guards against is currently
      unreachable through CI — but the *mechanized* claim only holds on the anchor path, not on the
      live GitHub path. See [09-master-doc-v2-delta.md](09-master-doc-v2-delta.md).
- [ ] The buyer view renders no private value, including in error states and tooltips — *Track D*

### Check ledger state, not just the transcript

**The transcript is not the privacy boundary.** Verified by deliberately leaking a private evidence
field into a `ComplianceRecord`: the value appeared in *none* of `proofData.publicTranscript`,
`.input`, `.output`, or `.privateTranscriptOutputs` — while sitting readable in `ledger.records`
forever.

A privacy test that greps the transcript therefore passes while you publish exactly what you meant to
hide. The real surface is the resulting public ledger state, and it is strictly larger. Both allowlist
tests exist for this reason; the ledger-state one is load-bearing. **Anyone reviewing a new circuit
should check state, not transcripts.**
