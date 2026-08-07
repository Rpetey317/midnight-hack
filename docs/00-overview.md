# 00 — Overview

> Derived from [`Master-Doc.md`](../Master-Doc.md), the project's source of truth. Section references
> like §4 point there.

## The problem

Software procurement already runs on security assurance. A bank buying a fraud-detection system, a
government agency evaluating bidders, an enterprise adopting a proprietary SDK — each needs to know
whether the supplier follows sound secure-development and supply-chain practices.

Today that means the vendor hands over a security dossier: SBOMs, dependency trees, vulnerability
findings with specific CVE identifiers, repository access configuration, CI configuration, MFA
statistics, internal package names. **The buyer usually needed a handful of facts and received the
entire attack surface.**

This relationship is explicit in real frameworks. NIST's Secure Software Development Framework is
designed partly so acquirers can communicate requirements to suppliers during acquisition, and NIST
supply-chain guidance recommends acquirers ensure third-party suppliers demonstrate secure-development
practices. The OpenSSF **OSPS Baseline** (published version **2026.02.19**) defines versioned security
controls grouped by maturity level, and OpenSSF specifically recommends that consumers identify the
exact Baseline version a compliance claim refers to.

Three costs follow:

1. **Over-disclosure.** Unpatched CVEs, weak modules, and internal architecture end up in a third
   party's document store — repeated once per customer. Auditors and procurement teams get breached too.
2. **Friction.** Enterprise security review takes weeks, and the vendor repeats it per customer.
3. **Staleness.** An assurance document is a photograph. It describes one artifact at one moment, and
   nobody re-runs the process per release because it is manual.

## The insight

**The buyer defines what it needs to know. The vendor should be able to prove exactly that, and
nothing more.**

Many procurement requirements are already machine-verifiable predicates:

```
criticalVulnerabilities == 0
knownExploitedVulnerabilities == 0
prohibitedDependencyCount == 0
mfaRequiredForPrivilegedUsers == true
protectedPrimaryBranch == true
buildProvenanceVerified == true
```

Those are a good fit for a zero-knowledge circuit. Requirements like *"developers receive appropriate
training"* or *"the organization has a mature security culture"* are not, and still need auditors and
human judgment. We target the machine-verifiable subset only (§2, §6).

## What we're building

A **privacy-preserving software assurance network**:

1. A vendor's CI produces **authenticated private evidence** about a specific build — normalized and
   signed by an **attestor** (§9). The evidence never leaves the vendor.
2. A commitment to that evidence is **anchored** on Midnight.
3. A **buyer publishes a policy** — a versioned, identifiable set of predicates the vendor cannot
   silently modify (§5).
4. The vendor generates a ZK proof **locally** that its private evidence satisfies that policy, bound
   to a **public artifact digest** (§10).
5. Midnight records a public, **time-bound compliance record** (§11, §43).

The buyer learns:

```
Product          PaymentEngine
Artifact         sha256:ABC...
Policy           ACME Bank Procurement v3
Status           ✓ SATISFIED
Evidence date    2026-08-07
Valid until      2026-09-07
```

The buyer does **not** learn exact vulnerability counts, specific CVE identifiers, affected packages,
the dependency tree, internal package names, repository configuration, MFA statistics, or developer
identities (§37).

## The strongest property: evidence is reusable

This is what makes the project more than "hide a CI report", and it is the answer to the sharpest jury
question (§4, §17, §30).

One authenticated evidence set. Different buyers, different requirements:

```
                        Evidence E
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
       Bank Policy      Gov Policy     Corp Policy
     critical == 0     critical == 0   critical == 0
     high <= 5         KEV == 0        forbiddenDeps == 0
     MFA >= 90%        provenance      branchProtected
            │               │               │
            ▼               ▼               ▼
         ZK proof        ZK proof        ZK proof
```

The vendor does not run three scans. The attestor does not need to know any buyer's policy in advance.

> The attestor establishes **facts**. The buyer defines **requirements**. Midnight evaluates the
> relationship privately.

That separation is why this needs *programmable* ZK rather than a scanner that signs `PASS`.

## Continuous compliance

Security posture changes even when the artifact does not. A new critical CVE disclosed on August 20
does not make an August 7 proof cryptographically false — it means the proof said:

> *"According to evidence E and policy P at time T, artifact ABC satisfied the policy."*

So every proof is time-bound, and the buyer view distinguishes three states (§11, §36):

```
COMPLIANT   ·   EXPIRED   ·   NO CURRENT PROOF
```

Fresh evidence produces a new proof. The result is continuous privacy-preserving compliance rather
than a permanent badge — and a verifiable history rather than a vendor's own claim (§12).

## Why this needs Midnight specifically

Judges will ask. Two separate questions, two separate answers.

**Why ZK?** On a transparent chain the contract needs the evidence on-chain to evaluate the policy,
which discloses everything. Compact evaluates the predicate inside the circuit and lets only the
verdict reach the ledger. `disclose()` makes that boundary explicit and compiler-enforced — we disclose
booleans and public identifiers out of a multi-field evidence struct, and the compiler rejects the code
if we get it wrong. Proving runs on the vendor's own machine, so no third party ever receives the
evidence. Remove the ZK layer and we are back to emailing a PDF.

**Why a blockchain?** A single bilateral proof does not need one — the vendor could email it. Midnight
earns its place once the system has many vendors, many buyers, and time (§12, §32):

| Needs a neutral registry | Why |
|---|---|
| Policy definitions and versions | So "ACME v3" means one thing to every vendor and cannot be quietly edited |
| Artifact identities | Proofs bind to immutable digests, not human-controlled version labels |
| Proof timestamps and expiration | Freshness is checkable by anyone, not asserted by the vendor |
| Compliance history | A buyer inspects the record instead of trusting a vendor database that says "we passed" |
| Independent verification | Neither party hosts the authoritative compliance state |

```
ZK          → selective disclosure
Blockchain  → shared verification, history, policy registry
Midnight    → both
```

## What this is not

Stated up front, because the threat model matters more than the demo (§38, and
[02-threat-model.md](02-threat-model.md)):

- **Not a vulnerability scanner.** We prove predicates over findings; we never produce or publish them.
- **Not a replacement for SOC 2, an auditor, or a full NIST compliance engine.** We do not claim to
  cryptographically prove framework compliance — only *machine-verifiable controls derived from*
  recognized frameworks and buyer-specific requirements (§6).
- **Not a truth oracle.** ZK proves that private inputs satisfy a computation, not that the inputs
  describe reality. Truth comes from the attestor, and that trust is explicit (§34, §35).
- **Not proof that software has no vulnerabilities.** It proves authenticated evidence satisfied a
  policy at a point in time.
- **Not a mechanism for hiding required disclosures.** The policy issuer decides what must be
  demonstrated; a buyer can still demand full conventional disclosure separately (§33).

It is: **a privacy-preserving verification layer over authenticated software-assurance evidence.**

## Real-world application

- **Bank procurement** (§14) — a vendor proves a fraud-detection build meets a bank's published policy
  without surrendering 411 dependency records and exact CVE identifiers.
- **Government tendering** (§15) — an agency evaluates the same policy against every bidder, objectively
  and uniformly, while bidders keep their security dossiers private.
- **Proprietary SDK adoption** (§16) — a vendor proves no dependency appears in the buyer's prohibited
  list without handing over a 427-component SBOM.
- **One vendor, many customers** (§17) — one evidence set, independently defined policies, no
  additional disclosure per customer.

## The pitch

> Companies buying software need assurance that vendors meet their security requirements, but proving
> that usually means exchanging detailed vulnerability reports, SBOMs and internal security evidence.
> We use Midnight to let buyers publish security policies and let vendors prove, using authenticated
> private evidence, that a specific software artifact satisfies those policies without revealing the
> underlying security data. The same evidence can be reused against different buyers' requirements,
> while Midnight provides an independently verifiable history of compliance over time.

Shorter:

> **Buyers define what they need to know. Vendors prove it without revealing everything they know.**
