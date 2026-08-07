# 02 — Threat Model

> Judges reward a team that names its own weaknesses before they do. This document is pitch material,
> not just engineering hygiene. Budget 20 minutes to read it before presenting.

## What the protocol actually proves

A valid `claimBadge` proof establishes, in zero knowledge:

1. There exists an evidence struct `E` and salt `s` such that `persistentCommit(E, s)` equals a leaf in
   the on-chain `attestations` tree (at some historic root).
2. `E` satisfies the public thresholds of policy `P`.
3. The nullifier for `(leaf, P)` has not been used before.

It discloses: the nullifier, the policy id, and the verdict boolean. Nothing else.

## What it does not prove

**The protocol proves evidence was attested and satisfies a policy. It does not prove the evidence is
true.** Truth comes from the trust chain below, not from the ZK proof. Being clear about this
distinction is what separates a credible protocol from a demo.

## Trust assumptions

### 1. GitHub's OIDC identity and Sigstore (unavoidable, standard)

We trust that GitHub correctly binds a workflow's OIDC token to the repository that ran it, and that
Fulcio/Rekor behave. This is the same trust root as SLSA provenance and `npm` provenance. If GitHub is
compromised, attestation is meaningless — but that's true of the entire software supply chain today.

### 2. The anchor operator inserts only GitHub-attested leaves (our residual assumption)

Because signature verification is off-chain ([01-architecture.md](01-architecture.md)), the contract
cannot tell an honestly-verified leaf from an arbitrary one. A malicious anchor operator could insert a
leaf for evidence that was never attested, letting someone claim an unearned badge.

**Mitigations available now:**
- The anchor is a small, single-purpose, open-source component — auditable in an afternoon.
- Every anchored leaf corresponds to a public Rekor entry, so an independent monitor can replay the log
  and detect leaves that don't correspond to real attestations. Detection is possible even though
  prevention isn't.

**The real fix (post-hackathon):** run the anchor in an AWS Nitro Enclave and publish its attestation
document. Trust in us then collapses to trust in AWS — the enclave measurement proves the anchor is
running unmodified code. This closes the loop on the original "gh and aws attestations" idea and is the
strongest item on the roadmap.

### 3. The checks themselves are meaningful

The protocol is agnostic to check quality. A repo could configure a SAST tool with every rule disabled
and honestly attest "0 critical findings." The badge would be cryptographically valid and practically
worthless.

**Mitigation:** the policy should eventually pin the *collector version and configuration hash*, so a
badge means "ran collector v1.2.0 with config hash 0xabc…". We have the field space for this; it's cut
for time. See "Known gaps" below.

## Known gaps

These are real and we should say so out loud.

### Gap 1 — Salt re-anchoring permits duplicate claims

The nullifier is `persistentHash([domain, leaf, policyId])`, and `leaf` includes the salt. A repo can
re-run CI on the *same commit* with a *fresh salt*, producing a different leaf, a different nullifier,
and therefore a second valid claim for the same underlying evidence.

- **Impact:** inflates `compliantCount`. Does not let a non-compliant repo claim compliance.
- **Mitigation now:** the anchor sees the repo and commit in the attestation predicate, so it enforces
  one anchored attestation per `(repo, commit)` off-chain.
- **Why not fix on-chain:** a nullifier over `(repoId, commitId, policyId)` would be deterministic — but
  repo names and commit SHAs are low-entropy and guessable, so an observer could brute-force the
  nullifier and de-anonymise the claimant. That trades a counting bug for a privacy break. **We chose
  the counting bug deliberately.**
- **Proper fix:** nullifier keyed on a long-lived repo secret, `persistentHash([domain, repoSecret,
  commitId, policyId])`. Deterministic per commit, unguessable without the secret. Straightforward
  post-hackathon.

### Gap 2 — Freshness is not enforced on-chain

`Evidence.issuedAt` exists but the MVP policy does not check it, so a stale-but-passing attestation
stays claimable indefinitely. Adding `maxAgeSeconds` requires block-time access in-circuit
(**UNVERIFIED** — needs a check against the current stdlib). It is first on the cut list precisely
because it's a correctness nicety rather than a security boundary.

### Gap 3 — Metadata leakage through timing and tree size

- The tree's `firstFree()` index is public, so the total number of anchored attestations is visible.
- Anchoring happens shortly after a CI run. An observer correlating public GitHub push events with
  anchor transaction timing can guess which repo anchored — **the anchor transaction is the weakest
  privacy link in the system**, not the claim proof.
- **Mitigation:** batch anchoring on a fixed schedule, plus decoy inserts. Cheap to add, cut for time.

### Gap 4 — Small anonymity set

With few repos anchored, "an attested repo satisfies Policy X" narrows sharply. In the demo the set is
tiny, so the privacy claim is structural rather than practical. This is inherent to launch, not a design
flaw — but do not overclaim it on stage.

## Deliberate non-goals

- **Not a replacement for human audit.** It automates the continuous mechanical portion.
- **Not a vulnerability database.** We prove properties of findings; we never publish findings.
- **Not on-chain signature verification.** Correct long-term, infeasible today (see
  [01-architecture.md](01-architecture.md)).

## Privacy checklist for review

Before demo, confirm each by inspecting a real transaction:

- [ ] No repo identifier in any transcript
- [ ] No finding counts or coverage values in any transcript
- [ ] Leaf preimage absent (`insert()` applies `leaf_hash()`)
- [ ] Only nullifier, policy id, and verdict disclosed by `claimBadge`
- [ ] Evidence artifact is private, not attached to the public attestation predicate
- [ ] Salt never published anywhere
