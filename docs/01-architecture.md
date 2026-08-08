# 01 — Architecture

> Aligned to [`Master-Doc.md`](Master-Doc.md) (v1); bare §N references point there. The ledger state
> and circuit signature below are **as-built** — `contract/` runs schema v2. See
> [07-alignment-delta.md](07-alignment-delta.md) for how it got here.
>
> [`Master-Doc-v2.md`](Master-Doc-v2.md) is now authoritative and **defers** the Sigstore/anchor
> machinery described below (v2 §10) rather than contradicting it — v2 §12 lists it as the intended
> upgrade path. It stays. The live evidence path under v2 is
> [09-master-doc-v2-delta.md](09-master-doc-v2-delta.md).

## Four actors

Master Doc §13. Keep these distinct — conflating attestor and vendor is what makes the trust story
collapse under questioning.

```
                    POLICY ISSUER
                    buyer / standard body
                           │
                    publishes policy
                           │
                           ▼
                       MIDNIGHT
                           ▲
                           │ ZK proof
                           │
                        VENDOR
                           ▲
                           │ private authenticated evidence
                           │
                       ATTESTOR
                    CI / scanner / auditor
```

| Actor | Owns | Examples |
|---|---|---|
| **Vendor** | The product and its private evidence. Generates proofs locally. | SaaS company, library vendor, government contractor |
| **Policy issuer / buyer** | Requirements. Publishes a versioned policy. | Bank, government agency, enterprise procurement, hospital |
| **Attestor** | Facts. Measures and signs normalized evidence. | GitHub CI, security scanner, cloud provider, auditor |
| **Midnight** | Policies, records, timestamps, expiration, history — never the evidence. | — |

The separation of **attestor establishes facts** from **buyer defines requirements** is the load-bearing
idea (§4, §30). It is why a scanner signing `PASS` is not a substitute.

## The constraint that shapes the trust boundary

**GitHub artifact attestations cannot be verified inside a Compact circuit.** Checked before designing
around it, and Master Doc §9 independently reaches the same conclusion.

GitHub's attestations are Sigstore/DSSE:

- signature: **ECDSA over NIST P-256**
- identity: short-lived X.509 certificate chain to Fulcio, bound to the workflow's OIDC claims
- transparency: Rekor inclusion proof (SHA-256 Merkle)

Compact's cryptographic surface (**VERIFIED** against `compact-standard-library`, compiler v0.31.1):

- Elliptic curve ops are **Jubjub only** — `ecAdd`, `ecMul`, `ecMulGenerator`, `hashToCurve`,
  `jubjubPointX/Y`, `constructJubjubPoint`. Jubjub is the proof system's *embedded* curve.
- Hashing/commitment: `persistentHash` / `persistentCommit` (SHA-256), `transientHash` /
  `transientCommit` (circuit-efficient).
- **There is no signature-verification primitive.** The stdlib index lists `verify(sig, msg, pk)`
  explicitly among functions that do not exist, noting "Build from EC primitives."

Verifying P-256 inside a circuit built on Jubjub requires **non-native field arithmetic** — simulating
one prime field inside another. Hundreds of thousands of constraints and a research-grade effort. Not a
weekend.

### What follows

The attestor trust boundary sits **off-chain**. Sigstore verification runs in a normal Node process
using **`@sigstore/verify` 4.1.2**, and only a *commitment* is anchored.

> The `gh attestation verify` shortcut is unavailable here: the installed `gh` is 2.45.0 and the
> subcommand landed in 2.49.0 (**VERIFIED** 2026-08-07). Use the library. See
> [05-implementation-plan.md](05-implementation-plan.md#track-b--collector--attestor).

The consequence worth defending: **our trust root is GitHub's OIDC identity, not a key we invented.**
We did not fall back to "trust our attestor service" — we fell back to "trust GitHub, plus trust that
the anchor inserts only GitHub-attested leaves." That second clause is the residual assumption and
[02-threat-model.md](02-threat-model.md) is explicit about it.

### Why not a Jubjub-native attestor signature?

A fair question, since §9 lets us define our own attestor and its key. If the attestor signed with
Schnorr over Jubjub instead of ECDSA over P-256, in-circuit verification becomes *feasible* —
`ecMul`/`ecAdd`/`hashToCurve` are all present.

We are not doing it, for two reasons:

1. **It relocates trust rather than reducing it.** The circuit would verify a signature from a key
   *we* generated and hold. Trust in our attestor service is unchanged; only the verification venue
   moves. The Merkle anchor achieves the same trust property at a fraction of the cost.
2. **It discards the GitHub OIDC root.** Our current chain terminates at GitHub's identity, which is
   the same root SLSA and npm provenance use. A self-signed Jubjub key is strictly weaker.

Worth having ready as an answer, because it sounds like the obvious fix and is not. Post-hackathon the
real improvement is a Nitro-attested anchor (see [02-threat-model.md](02-threat-model.md)), not
in-circuit signature verification.

## Data flow

```
┌─ 1. BUYER — publishes a policy ────────────────────────────────────────┐
│   registerPolicy(policyId, { version, issuer, thresholds… })           │
│   Public. Versioned. The vendor cannot silently modify it. (§5)        │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─ 2. VENDOR CI + ATTESTOR — the repo's OWN pipeline, OIDC identity ─────┐
│                                                                        │
│   build artifact              → artifactDigest = sha256(artifact)      │
│   dependency / vuln scan      → criticals, highs, kev, forbiddenDeps   │
│   repository config checks     → mfa, branchProtected, ciGreen          │
│   GitHub provenance            → buildProvenanceVerified                │
│                                                                        │
│   attestor normalizes + signs → evidence.json   ◄── PRIVATE, never     │
│   salt = random 32 bytes                            leaves the vendor  │
│   leaf = persistentCommit(evidence, salt)                              │
│                                                                        │
│   actions/attest → Sigstore-signed predicate { leaf, repo, sha }       │
│   evidence + salt → private artifact, vendor downloads                 │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │  attestation bundle — PUBLIC, carries the leaf only
                               ▼
┌─ 3. ANCHOR — off-chain Node ───────────────────────────────────────────┐
│   @sigstore/verify:  signature valid? cert chain to Fulcio? Rekor OK?  │
│   OIDC subject repo == predicate repo?   ◄── blocks repo spoofing      │
│   submit tx: attest(leaf)                                              │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─ 4. MIDNIGHT — public ledger state ────────────────────────────────────┐
│   attestations:  HistoricMerkleTree<16, Bytes<32>>                     │
│     └─ insert() applies leaf_hash(); the leaf never enters the         │
│        transaction transcript                                          │
│   policies:      Map<Bytes<32>, Policy>        versioned, public       │
│   records:       Map<Bytes<32>, ComplianceRecord>   current status     │
│   history:       List<ComplianceRecord>        timeline  (see §07)     │
│   claimed:       Set<Bytes<32>>                nullifiers              │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─ 5. VENDOR — local proof generation, on their own machine ─────────────┐
│   witnesses (private):  evidence, salt, merkle path                    │
│   public inputs:        vendorId, productId, artifactDigest, policyId  │
│                                                                        │
│   proveCompliance(...) -> Boolean                                      │
│     leaf = leafOf(evidence, salt)                                      │
│     assert path.leaf == leaf                     bind path to evidence │
│     assert attestations.checkRoot(root(path))    authenticated?        │
│     assert evidence.artifactDigest == artifactDigest   §10 binding     │
│     assert !claimed.member(nullifier)            not replayed?         │
│     disclose(criticals <= max && kev <= max && provenance && …)        │
│     write ComplianceRecord{ …, validUntil, compliant }                 │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─ 6. BUYER — reads the record ──────────────────────────────────────────┐
│   records[hash(artifactDigest, policyId)]                              │
│   → ✓ SATISFIED · evidence date · valid until · requirement checklist  │
│   Never the underlying values. (§25, §37)                              │
└────────────────────────────────────────────────────────────────────────┘
```

## Why the predicate carries only the commitment

The single most important detail, and easy to get wrong.

**GitHub attestations on public repos are world-readable via Rekor.** Rekor is a public transparency
log — anyone can pull the attestation for any public repo. Putting raw evidence in the attestation
predicate would publish our vulnerability findings to a public log, leaking exactly what the protocol
exists to protect.

So the predicate carries `{ leaf, repo, sha, schema }` and nothing else. `leaf` is a blinded
commitment; without the salt it reveals nothing. Evidence and salt travel to the vendor as a private
artifact and enter only the local ZK proof.

### Where provenance is actually verified

Worth being precise, because two components look like they do the same thing and only one of them is
load-bearing.

The **collector** sets `buildProvenanceVerified` by asking GitHub whether an attestation *exists* for
the artifact digest (`gh api repos/{o}/{r}/attestations/sha256:{digest}`). That is a presence check.
It does not validate a Sigstore bundle and it does not compare the OIDC subject repo against the
predicate repo.

The **anchor** does. That comparison is the security-critical one — without it, repo A can attest for
repo B and the whole trust chain is decorative — and it runs off-chain in Node with
`@sigstore/verify` against our own predicate, before `attest(leaf)` is submitted. The collector's
report records the distinction in its `source` field so nobody reads more into the boolean than it
carries.

## What is public and what is private

Master Doc §37. This table is the product — get it right and the pitch writes itself.

| Public on-chain | Private, never on-chain |
|---|---|
| Vendor identifier | Exact vulnerability counts |
| Product identifier | Specific CVE identifiers |
| **Artifact digest** | Affected packages |
| Policy ID and version | SBOM / dependency tree |
| Compliance result (one boolean) | Internal package names |
| Proof timestamp | Repository configuration detail |
| Expiration | MFA statistics |
| | Developer identities |
| | Any finding not required to be disclosed |

**We hide the findings, not the vendor.** A procurement record that did not identify the vendor and
artifact would be useless to a buyer — so identity is public by design, not by concession.

### What the Merkle tree is for now

Not anonymity. Three things:

1. **Authenticated evidence without in-circuit signature verification** — membership in the anchored
   tree stands in for "an attestor signed this", which we cannot check in-circuit (see above).
2. **The evidence commitment stays off the transcript.** `insert()` applies `leaf_hash()`, so nobody
   can link an on-chain proof back to its public Rekor attestation bundle, or build a leaf→artifact
   correlation table.
3. **`HistoricMerkleTree.checkRoot()` accepts any historic root**, so a proof stays valid as new
   evidence is anchored. Continuous compliance (§11) depends on this: a plain `MerkleTree` would kill
   every outstanding proof on each insert.

## Trust summary

| Party | What they see | What they must trust |
|---|---|---|
| **Public observer** | Compliance records, policy thresholds, nullifiers, tree size | — |
| **Buyer** | "Artifact ABC satisfies Policy P, as of T, until T+Δ" | Attestor measures its domain correctly; anchor inserts only attested leaves |
| **Anchor operator** | Repo name, commit, leaf. **Not the evidence.** | GitHub OIDC |
| **Attestor** | The full evidence it measures | — |
| **Vendor** | Everything | — |

Worth emphasising: **the anchor operator never sees the findings.** They see that repo X produced
commitment L. That is a stronger position than any assurance vendor occupies today.

## Component responsibilities

| Component | Runs where | Responsibility |
|---|---|---|
| `collector` | Vendor's GitHub Actions, or the operator's machine | Run checks, emit a private report. ✅ Built. `src/github-evidence.ts` adapts a v2 workflow's `evidence.json` into the same report. |
| `.github/workflows/attest.yml` | Vendor's GitHub Actions | **Rewritten for Master-Doc-v2 §4.** `workflow_dispatch` with a `request_id` → `npm audit --json` + `npm run lint` + `npm run build` → `npm pack` digest → `evidence.json` uploaded as an artifact. It no longer invokes the collector and no longer calls `actions/attest`. ✅ Live — the app dispatches it. |
| `attestor` | Vendor CI or trusted service | Validate CI inputs, normalize evidence, sign (§9), compute the commitment. ✅ Built |
| `anchor` | Operator's server / laptop | Verify Sigstore bundle, check OIDC↔repo binding, submit `attest(leaf)` |
| `contract` | Midnight | Anchor tree, policy registry, compliance records, nullifiers |
| `ui/vendor` | Browser | Private evidence panel, policy selector, local proving |
| `ui/buyer` | Browser | Policy, compliance status, requirement checklist, history |
| `cli` | Developer machine | Fallback proof path if wallet wiring fails |

Master Doc §40 suggests `/apps/vendor-web` + `/apps/buyer-web`, then notes a single app with `/vendor`
and `/buyer` routes is faster for a hackathon. Take the single app.

## Scaffolding notes

**VERIFIED** 2026-08-07: `create-mn-app` v0.5.0 templates are `hello-world`, `battleship`, `bboard`,
`leaderboard` (`dex` and `midnight-kitties` marked coming soon). There is **no `counter` template** —
docs referencing it are stale.

- `app/` holds a minimal `hello-world` scaffold (SDK 4.1.1, `@midnight-ntwrk/wallet-sdk` 1.2.0).
- **Scaffold `leaderboard` separately as a reference.** It ships React + Lace + in-browser ZK proving —
  exactly the vendor view's wiring. Lift from it rather than building wallet integration from scratch.
