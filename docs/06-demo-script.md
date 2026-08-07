# 06 — Demo Script

Target: **2 minutes 30 seconds.** Judging weighs technology, innovation, completion, real-world
application, and Midnight developer-experience feedback.

Rehearse three times. The third rehearsal is where you find the broken thing.

## The 15-second version

> "Proving your code is secure currently means showing your code to someone. We built a protocol where
> your CI attests to your security posture, and you prove compliance to anyone — without showing them
> the repo, the findings, or even which repo you are."

## Beat sheet

| # | Time | Beat | Show |
|---|---|---|---|
| 1 | 0:15 | **The problem.** Every security review means handing over source, CI logs, and vulnerability findings. The evidence *is* the exposure — your unpatched CVEs end up in an auditor's Drive. | Slide or spoken |
| 2 | 0:20 | **Local evidence.** Real findings from a real scan. This file never leaves the machine. | `cat evidence.json` |
| 3 | 0:25 | **GitHub attests.** The repo's own CI signs a *commitment* via Sigstore. Note what's in the predicate: a commitment. Not the findings — Rekor is a public log, so publishing findings there would leak exactly what we're protecting. | Attestation JSON + `gh attestation verify` |
| 4 | 0:35 | **Local proof.** Proof generation runs here. No third party is contacted. | `<PROJECT> prove --policy production-ready` |
| 5 | 0:40 | **The verdict, and what's absent.** Badge granted, tally incremented. Then the raw transaction: no repo, no commit, no findings, no leaf. Just a nullifier, a policy id, and one boolean. | Verifier view → raw tx |
| 6 | 0:20 | **The negative case.** A repo with 2 criticals. The protocol refuses. | `prove` → `false` |
| 7 | 0:15 | **Roadmap.** In-circuit Sigstore verification; AWS Nitro-attested anchor so trust in us collapses to trust in AWS; IaC and cloud-posture policies. | Spoken |

**Beat 5 is the money shot.** Everything before it is setup. Linger on the raw transaction — the
absence of data is the product. Have it pre-loaded in a second terminal; don't hunt for it live.

**Beat 6 is what separates us from a demo that only shows the happy path.** A protocol that always says
yes proves nothing. Judges notice.

## Anticipated questions

**"Why does this need a blockchain?"**
> Two properties. The anchored Merkle tree is a tamper-evident, publicly verifiable set — so a badge
> can't be backdated or forged after the fact. And `HistoricMerkleTree` lets a proof stay valid as new
> attestations arrive, so a claim made today still verifies next month. Without a shared anchor,
> "prove you were attested" collapses to "trust my server."

**"Why Midnight rather than a normal chain?"**
> On a transparent chain the evidence has to be on-chain for the contract to check the policy — which
> discloses everything. Midnight lets the predicate be evaluated inside the circuit and only the verdict
> reach the ledger. Remove the ZK layer and we're back to emailing a PDF.

**"Can't you just lie in the witness?"**
> No. The witness evidence must hash to a commitment anchored on-chain, and that commitment was signed
> by GitHub's OIDC identity in the repo's own CI. Change any field and the path check fails.

**"So where does trust actually sit?"** *(the sharp question — answer it straight)*
> GitHub's OIDC identity, plus our anchor inserting only genuinely attested leaves. We can't verify
> Sigstore signatures in-circuit: GitHub signs with ECDSA over P-256, and Compact's only EC primitives
> are Jubjub, the proof system's embedded curve. There's no signature-verification primitive at all.
> Doing it in-circuit needs non-native field arithmetic — research-grade, not a weekend. So we verify
> off-chain and anchor the commitment. Every anchored leaf maps to a public Rekor entry, so a bad anchor
> is *detectable* even though it isn't *prevented*. The fix is running the anchor in a Nitro Enclave and
> publishing its attestation — that's the top roadmap item.

That answer wins more credit than pretending the problem doesn't exist. Judges will find it either way.

**"What stops someone claiming twice?"**
> A nullifier over the leaf and policy. And a known gap, which we documented: re-running CI with a fresh
> salt yields a new leaf and a second claim. The anchor enforces one attestation per repo-commit
> off-chain. The on-chain fix is a nullifier keyed on a long-lived repo secret — we didn't use
> repo-and-commit directly because those are guessable and would let observers de-anonymise claimants.
> We chose a counting bug over a privacy break.

**"What if the checks are bad?"**
> Then the badge is valid and worthless. The protocol proves evidence was attested and satisfies a
> policy, not that the checks were well-configured. The fix is pinning collector version and config hash
> into the policy — we have the field space, we cut it for time.

## Midnight DX feedback

Explicitly part of the judging criteria, so prepare two or three concrete notes. Everything below was
hit while building Track A, with a reproduction. Lead with the first one — it is the most interesting.

**1. `disclose()` is required on `MerkleTree.insert()`, whose whole point is that it doesn't disclose.**

```compact
export circuit attest(leaf: Bytes<32>): [] { attestations.insert(leaf); }
```
```
potential witness-value disclosure must be declared but is not:
  nature of the disclosure: ledger operation might disclose the witness value
```

But `insert()` applies `leaf_hash()` internally, and we confirmed against a real
`proofData.publicTranscript` that the raw leaf never appears in it. So the annotation says "this
becomes public" about the one ledger operation that hides its argument. The disclosure analysis is
conservative about ledger writes and does not special-case `insert`. A developer who trusts the
annotation concludes their privacy design is broken and redesigns around a non-problem.

**2. No published simulator package.** The `@openzeppelin-compact/contracts-simulator` package that
tooling docs reference returns 404 on npm. Hand-threading `CircuitContext` over `compact-runtime`
works fine and is about 100 lines, but you have to discover that yourself.

**3. `Evidence` and `Policy` structs are emitted as anonymous inline object types**, not named
exports, so TypeScript consumers cannot `import type { Evidence }`. We recover them with
`Parameters<PureCircuits['leafOf']>[0]`, which works but is not obvious.

**4. Generated TypeScript uses snake_case `goes_left`** while the Compact docs write `goesLeft` — a
silent-failure trap when constructing Merkle paths by hand. Related: `checkRoot` takes
`{ field: bigint }`, not a bare `bigint`, and `sibling` is a `{ field: bigint }` wrapper.

**5. `create-mn-app` v0.5.0 dropped the `counter` template** while much documentation still references
it; the current set is `hello-world`, `battleship`, `bboard`, `leaderboard`.

Specific, reproducible feedback scores better than "the docs could be better."

**Positive note worth making too:** `export pure circuit` is excellent. It let us export the
commitment and nullifier derivations as ordinary TypeScript functions compiled from the same source
the circuit runs, which turned our biggest integration risk — four components encoding one struct
identically — into a compiler guarantee. That pattern deserves to be documented as a first-class
technique, not just a language feature.

## Failure drills

| If this breaks | Do this |
|---|---|
| Wallet won't connect | Switch to CLI. It's the demo of record for exactly this reason. |
| Testnet slow / tx pending | Show a pre-recorded successful run; narrate over it. |
| Proof generation slow | Pre-generate; explain that timing is proving-key size, not protocol design. |
| Anchoring fails live | Pre-anchor before the pitch. **Do this regardless.** |

Have a terminal recording of a full successful run saved locally before the pitch. If the network dies
at 16:45, you still have a demo.
