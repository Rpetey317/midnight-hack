# 00 — Overview

## The problem

To prove your codebase is healthy, you currently have to show it to someone.

Every security audit, every SOC2 or ISO control attestation, every vendor security questionnaire works
the same way: the customer or auditor demands evidence, and you hand over source access, CI logs,
dependency manifests, and vulnerability findings. **The evidence is the exposure.** You are forced to
disclose your attack surface to prove you don't have one.

This has three concrete costs:

1. **Leakage.** Your unpatched CVEs, your weak modules, your coverage gaps end up in a third party's
   Google Drive. That's a breach waiting to happen — auditors get compromised too.
2. **Friction.** Enterprise security review takes weeks per customer, and you repeat it per customer.
3. **Staleness.** An audit is a photograph. It attests to one commit, months ago. Nobody re-audits per
   merge because the process is manual.

## The insight

**The verifier doesn't need the evidence. They need to know a policy was satisfied.**

"Does this repo have zero critical vulnerabilities, green CI, and 80%+ coverage?" is a boolean. The
underlying evidence is private data. Proving a predicate over private data without revealing the data
is precisely what zero-knowledge proofs do.

## What we're building

`<PROJECT>` is a protocol where:

1. A repo's **own CI** runs the audit checks and produces evidence that never leaves the repo.
2. GitHub cryptographically signs a **commitment** to that evidence, bound to the repo's OIDC identity.
3. The commitment is **anchored** in a Merkle tree on Midnight.
4. The repo owner generates a ZK proof **locally** that the anchored evidence satisfies a published
   policy, disclosing only the verdict.

A verifier learns: *"an attested repo satisfies Policy X."* They learn nothing else — not the repo, not
the commit, not the findings, not the coverage, not even which leaf in the tree was proven.

## Why this needs Midnight specifically

This is the question judges will ask, so the answer needs to be crisp.

| Requirement | Why a normal chain or a signed JSON file fails |
|---|---|
| Prove a predicate over private data | A public chain would need the evidence on-chain to check the policy. A signed JSON file discloses everything it attests. |
| Selective disclosure | We disclose one boolean out of an eight-field evidence struct. Compact's `disclose()` makes that boundary explicit and compiler-enforced. |
| Anonymous set membership | `HistoricMerkleTree` + ZK path proofs let a repo prove it's in the attested set without revealing which member it is. A `Set` would reveal the queried element. |
| Local proving | Proofs are generated on the developer's machine. No third party ever receives the evidence — which is the entire point of the product. |
| Public, auditable policy | Policy thresholds live in public ledger state, so verifiers know exactly what a badge means. |

The honest framing: **Midnight is not decorative here.** Remove the ZK layer and you're back to
emailing a PDF. The privacy property *is* the product.

## What the protocol does not do

Stated up front because the threat model matters more than the demo (see [02-threat-model.md](02-threat-model.md)):

- It does not verify GitHub's signature inside the circuit. That happens off-chain — see
  [01-architecture.md](01-architecture.md) for why this is forced, not lazy.
- It does not prove the checks themselves are good. It proves that the checks a repo's CI ran produced
  results satisfying a policy. Garbage checks produce a garbage-but-valid badge.
- It does not replace a human security audit. It automates the *continuous, mechanical* portion —
  the part that should run every merge and currently runs once a year.

## Real-world application

- **Vendor security review.** A SaaS vendor proves policy compliance to 50 enterprise customers without
  50 NDAs and 50 document exchanges.
- **Supply chain.** A dependency proves it maintains green CI and zero criticals, continuously, without
  publishing its vulnerability history to attackers.
- **Compliance evidence.** Continuous, per-commit control attestation instead of an annual snapshot.
- **Open-source trust signals.** A maintainer proves security posture without handing scanners a map of
  where the weaknesses are.
