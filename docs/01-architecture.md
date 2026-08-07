# 01 — Architecture

## The constraint that shapes everything

**GitHub artifact attestations cannot be verified inside a Compact circuit.** This is not a shortcut we
took; it's a hard limit we checked before designing around it.

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
  explicitly under functions that do not exist, with the note "Build from EC primitives."

Verifying P-256 inside a circuit built on Jubjub requires **non-native field arithmetic** — simulating
one prime field inside another. That's hundreds of thousands of constraints and a research-grade
engineering effort. Not a weekend.

### What follows from that

The trust boundary sits **off-chain**. Sigstore verification runs in a normal Node process using
standard libraries (`@sigstore/verify` 4.1.2, or `gh attestation verify`), and only a *commitment* is
anchored on-chain.

The important consequence: **our trust root is still GitHub's OIDC identity, not a key we invented.**
We didn't fall back to "trust our attestor service" — we fell back to "trust GitHub, plus trust that our
anchor only inserts GitHub-attested leaves." That second clause is the residual assumption, and
[02-threat-model.md](02-threat-model.md) is honest about it.

## Data flow

```
┌─ 1. GitHub Actions — the repo's OWN CI, OIDC identity ────────────────┐
│                                                                        │
│   collector runs checks                                                │
│     ├─ Actions conclusion on HEAD                                      │
│     ├─ branch protection enabled?                                      │
│     ├─ npm audit  → critical / high counts                             │
│     └─ SAST (semgrep)                                                  │
│                                                                        │
│   evidence.json          ◄── PRIVATE. Never leaves this boundary.      │
│   salt = random 32 bytes                                               │
│   leaf = persistentCommit(evidence, salt)                              │
│                                                                        │
│   actions/attest  → Sigstore-signed predicate { leaf, repo, sha }      │
│   evidence + salt → private artifact, owner downloads                  │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │  attestation bundle — PUBLIC, carries leaf only
                               ▼
┌─ 2. Anchor service — off-chain Node ───────────────────────────────────┐
│   @sigstore/verify:  signature valid? cert chain to Fulcio? Rekor OK?  │
│   OIDC subject repo == predicate repo?   ◄── blocks repo spoofing      │
│   submit tx: attest(leaf)                                              │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─ 3. MIDNIGHT — public ledger state ────────────────────────────────────┐
│   attestations:    HistoricMerkleTree<16, Bytes<32>>                   │
│     └─ insert() applies leaf_hash() — the leaf itself never appears    │
│        in the transaction transcript                                   │
│   policies:        Map<Bytes<32>, Policy>       public thresholds      │
│   claimed:         Set<Bytes<32>>               nullifiers             │
│   compliantCount:  Map<Bytes<32>, Counter>      public badge tally     │
└──────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─ 4. Prover — repo owner's machine, LOCAL proof generation ─────────────┐
│   witnesses (private):  evidence, salt, merkle path                    │
│                                                                        │
│   claimBadge(policyId) -> Boolean                                      │
│     leaf   = persistentCommit(evidence, salt)                          │
│     assert path.leaf == leaf                    bind path to evidence  │
│     assert attestations.checkRoot(root(path))   anchored?              │
│     assert !claimed.member(nullifier)           not replayed?          │
│     disclose(criticals <= max && ciGreen && coverage >= min)            │
└────────────────────────────────────────────────────────────────────────┘
```

## Why the predicate carries only the commitment

This is the single most important design detail, and it's easy to get wrong.

**GitHub attestations on public repos are world-readable via Rekor.** Rekor is a public transparency
log — anyone can pull the attestation for any public repo. If we put the raw evidence in the
attestation predicate, our vulnerability findings would be published to a public log. That would leak
exactly what the protocol exists to protect.

So the predicate carries `{ leaf, repo, sha, schema }` and nothing else. `leaf` is a blinded
commitment; without the salt it reveals nothing about the evidence. The evidence and salt travel to the
repo owner as a private artifact and enter only the local ZK proof.

## Trust summary

| Party | What they see | What they must trust |
|---|---|---|
| **Public observer** | Nullifier, policy id, verdict, badge tally. Tree size. | — |
| **Verifier** | "An attested repo satisfies Policy X" | GitHub OIDC; anchor inserts only attested leaves |
| **Anchor operator** | Repo name, commit, leaf. **Not the evidence.** | GitHub OIDC |
| **Repo owner** | Everything | — |

Worth emphasising: **even the anchor operator never sees the findings.** They see that repo X produced
commitment L. The evidence stays with the owner. That's a stronger position than any audit vendor today.

## Component responsibilities

| Component | Runs where | Responsibility |
|---|---|---|
| `collector` | GitHub Actions | Run checks, emit canonical evidence, compute commitment |
| `.github/workflows/attest.yml` | GitHub Actions | Invoke collector, sign via `actions/attest`, upload private artifact |
| `anchor` | Operator's server / laptop | Verify Sigstore bundle, check OIDC↔repo binding, submit `attest(leaf)` |
| `contract` | Midnight | Anchor tree, policy registry, nullifier set, badge tally |
| `cli` | Developer machine | `attest` / `prove` / `verify`; **the demo of record** |
| `ui` | Browser | Prover + verifier views, Lace wallet, in-browser proving |

## Scaffolding notes

**VERIFIED** 2026-08-07: `create-mn-app` v0.5.0 templates are `hello-world`, `battleship`, `bboard`,
`leaderboard` (`dex` and `midnight-kitties` are marked coming soon). There is **no `counter` template**
— older docs referencing it are stale.

- `app/` currently holds a minimal `hello-world` scaffold (SDK 4.1.1, `@midnight-ntwrk/wallet-sdk` 1.2.0).
- **Track D should scaffold `leaderboard` separately as a reference.** It is described as a
  "privacy-preserving leaderboard with a React + Lace browser DApp and in-browser ZK proving" — exactly
  the wiring our prover UI needs. Lift from it rather than building wallet integration from scratch.
