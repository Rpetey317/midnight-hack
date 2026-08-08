# 06 — Demo Script

Target: **2 minutes 30 seconds.** Judging weighs technology, innovation, completion, real-world
application, and Midnight developer-experience feedback.

Sequence follows [`Master-Doc.md`](Master-Doc.md) §28. Rehearse three times — the third rehearsal is
where you find the broken thing.

## The organising principle

§28: **lead with the information asymmetry, not the cryptography.** Nobody is persuaded by "we use ZK
proofs." They are persuaded by watching a buyer get an answer while visibly not getting the data.

So the demo is structured as a **two-window contrast**: buyer view on the left, vendor view on the
right. Set both up before you start talking.

## The 15-second version

> "When a bank buys software, the vendor has to hand over its whole security dossier — SBOMs, CVEs,
> repository configuration — to answer a handful of yes/no questions. We let the buyer publish those
> questions as a policy, and the vendor prove its answers from authenticated private evidence. The buyer
> gets a verdict. It never gets the evidence."

## Beat sheet

| # | Time | Beat | Show |
|---|---|---|---|
| 1 | 0:20 | **The buyer's requirement.** Start here, not with the tech. "ACME Bank requires every software supplier to satisfy this policy." Read the four predicates aloud. Note it is versioned and published — the vendor cannot quietly edit it. | Buyer view → policy |
| 2 | 0:30 | **The vendor's evidence.** Switch windows. Here is what the vendor actually has: artifact digest, 427 dependencies, exact CVE counts, MFA statistics, internal package names. Point at the label: **PRIVATE — not written to Midnight.** Say the line: *"the vendor has enough to answer the bank's question, and no desire to hand over its entire security dossier."* | Vendor view → private evidence panel |
| 3 | 0:25 | **Prove.** Select ACME Bank Procurement v3. Generate. Proof generation runs **on this machine** — no third party is contacted, and the evidence does not move. | Vendor view → Generate proof |
| 4 | 0:30 | **The verdict, and the absence.** Back to the buyer. ✓ SATISFIED, artifact digest, evidence date, valid until. Then the requirement checklist — four ✓ lines, no numbers. Then the raw transaction: no CVE counts, no dependency names, no MFA figures, no leaf. **This is the money shot. Linger.** | Buyer view → raw tx |
| 5 | 0:25 | **Same evidence, different buyer.** Now a government agency with a *different* policy — KEV and build provenance. Same evidence bundle. Prove again. Second record, no additional disclosure. *"The scanner never knew this policy existed."* | Vendor → second policy → buyer |
| 6 | 0:15 | **The negative case.** An artifact with 2 criticals against the bank policy. The protocol returns false and records it. It does not lie. | `prove` → `false` |
| 7 | 0:15 | **Continuous.** The timeline: proofs expire, fresh evidence produces fresh proofs. A record is a statement about a moment, not a permanent badge. | Buyer view → timeline |
| 8 | 0:10 | **Roadmap.** Nitro-attested anchor so trust in us collapses to trust in AWS; real OSPS Baseline control packs; multi-attestor requirements. | Spoken |

### Which beats are load-bearing

- **Beat 4 is the money shot.** Everything before it is setup. The absence of data *is* the product.
  Have the raw transaction pre-loaded in a second terminal; do not hunt for it live.
- **Beat 5 is the differentiator.** §17 and §30 both identify evidence reuse across independently
  defined policies as the central argument for programmable ZK. It is what separates this from "hide a
  CI report", and it is the answer to the sharpest question a judge will ask. **Do not cut beat 5.**
- **Beat 6 is what separates us from a happy-path demo.** A protocol that always says yes proves
  nothing. Judges notice.

## Anticipated questions

Master Doc §30–§37. Answer straight; hedging costs more credit than the weakness does.

**"Why doesn't the security scanner just evaluate the policy and sign PASS?"** *(the sharpest one — §30)*
> Because the scanner establishes reusable *facts*, and it cannot know every policy a future buyer will
> want evaluated. It measures `critical = 0, high = 3, KEV = 0, MFA = 94%`. Later a bank asks
> `high <= 5`, a government agency asks `KEV == 0`, an enterprise asks `MFA >= 90%`. Same evidence,
> three independent questions, no re-scan and no additional disclosure. That is exactly what you just
> saw in beat 5.

**"If I'm buying your software, shouldn't I see the report anyway?"** *(§31)*
> Sometimes, yes — and you still can. This does not replace due diligence. It covers the large class of
> procurement requirements where the *predicate* is necessary but the underlying evidence is not. If you
> genuinely need the full SBOM, ask for it; that channel is unchanged.

**"Why does this need a blockchain?"** *(§32)*
> A single bilateral proof does not — the vendor could email it. Midnight earns its place once there are
> many vendors and many buyers: shared policy definitions with stable versioned identity, artifact
> identities, proof timestamps, expiration, and a compliance history neither party hosts. Without it,
> "we're compliant" is a claim in the vendor's own database.

**"Isn't hiding vulnerabilities dangerous?"** *(§33)*
> The policy issuer decides what must be demonstrated, not us. A buyer can require `critical == 0 AND
> high == 0`, or demand full conventional disclosure separately. ZK does not determine what anyone is
> entitled to receive — it removes the cases where raw evidence had to be handed over unnecessarily.

**"What stops the vendor just saying it has zero vulnerabilities?"** *(§34)*
> The circuit does not trust vendor input. The evidence must hash to a commitment that an approved
> attestor authenticated and that is anchored on-chain, and it must bind to the public artifact digest.
> Change `critical = 4` to `critical = 0` and the commitment no longer matches — the Merkle path check
> fails. The residual trust is in the attestor measuring its domain correctly, and we state that
> explicitly rather than pretending ZK removes it.

**"What if your scanner misses something?"** *(§35)*
> Then the record is cryptographically valid and incomplete. The proof establishes "this authenticated
> evidence satisfies this policy" — not "this software is secure." That is why policies pin the approved
> attestor and version, so a record means "measured by X at version Y" rather than something absolute.
> Multi-attestor requirements — scanner A *and* scanner B *and* CI provenance — are the next step.

**"What if a new critical CVE lands tomorrow?"** *(§36)*
> The proof does not become false; it was always a statement about a moment. That is why every record
> carries an evidence date and an expiry, and why the buyer view distinguishes COMPLIANT, EXPIRED, and
> NO CURRENT PROOF. New evidence produces a new proof. That is the continuous-compliance property.

**"So where does trust actually sit?"** *(answer it straight)*
> GitHub's OIDC identity, plus our anchor inserting only genuinely attested leaves. We cannot verify
> Sigstore signatures in-circuit: GitHub signs with ECDSA over P-256, and Compact's only EC primitives
> are Jubjub, the proof system's embedded curve — there is no signature-verification primitive at all.
> In-circuit P-256 needs non-native field arithmetic, which is research-grade, not a weekend. So we
> verify off-chain and anchor the commitment. Every anchored leaf maps to a public Rekor entry, so a bad
> anchor is *detectable* even though it is not *prevented*. The fix is running the anchor in a Nitro
> Enclave and publishing its attestation document.

**"Why not have the attestor sign with a Jubjub key you could verify in-circuit?"** *(the informed
follow-up)*
> It would work, and it would not help. The circuit would verify a signature from a key we generated and
> hold — trust in our service is unchanged, only the verification venue moves. And it would discard the
> GitHub OIDC root, which is the same root SLSA and npm provenance use. The Merkle anchor gets the same
> property more cheaply.

**"What stops someone proving twice?"**
> A nullifier over the evidence commitment and the policy id. A known gap, documented: re-running the
> pipeline with a fresh salt yields a new commitment and a second record. The anchor enforces one
> attestation per repo-commit off-chain. And note that repeated proofs over *fresh* evidence are the
> intended behaviour — that is continuous compliance, not a bug.

## Midnight DX feedback

Explicitly part of the judging criteria. Everything below was hit while building the contract, with a
reproduction. Lead with the first — it is the most interesting.

**1. `disclose()` is required on `MerkleTree.insert()`, whose whole point is that it doesn't disclose.**

```compact
export circuit attest(leaf: Bytes<32>): [] { attestations.insert(leaf); }
```
```
potential witness-value disclosure must be declared but is not:
  nature of the disclosure: ledger operation might disclose the witness value
```

But `insert()` applies `leaf_hash()` internally, and we confirmed against a real
`proofData.publicTranscript` that the raw leaf never appears. So the annotation says "this becomes
public" about the one ledger operation that hides its argument. The disclosure analysis is conservative
about ledger writes and does not special-case `insert`. A developer who trusts the annotation concludes
their privacy design is broken and redesigns around a non-problem.

**2. `proofData` is not a sufficient privacy oracle. This one can bite hard.**

We wrote a test asserting that no private value reaches `proofData.publicTranscript`, then deliberately
leaked a private evidence field into a public ledger struct to confirm the test would catch it.
**It did not.** The leaked value appeared in *none* of `publicTranscript`, `input`, `output`, or
`privateTranscriptOutputs` — while sitting in plain sight in ledger state, readable by anyone forever.

The transcript records ledger *operations*; a value can reach state without appearing as a literal
anywhere in the proof data. So the natural way to write a privacy test — inspect the transcript —
passes while you publish exactly what you meant to hide. The real boundary is the resulting public
ledger state, and it is strictly larger than the transcript.

Worth signposting in the docs, because the failure is silent and the wrong intuition ("the transcript
is what goes on chain") is a very reasonable one to hold.

**3. The published SDK version set installs two incompatible WASM runtimes, and every circuit call
fails.** Out of the box, with nothing unusual in our setup:

```
Error: expected instance of StateValue
  at new ChargedState (.../midnight-js-protocol/node_modules/
                        @midnight-ntwrk/onchain-runtime-v3/...)
```

`midnight-js-protocol@4.1.1` pins `onchain-runtime-v3` to exactly **3.0.0**;
`compact-runtime@0.16.0` declares `^3.0.0`, which now floats to **3.1.0**. npm installs both, each
with its own WASM instance, so a `StateValue` built by one fails `instanceof` inside the other.

What makes it nasty: **deployment succeeds** — it never crosses the boundary — so you get a contract
address, feel fine, and then the *first* circuit call dies with an error that says nothing about
versions. The fix is a one-line `overrides` block, but finding it means reading a stack trace
carefully enough to notice one path is nested under `midnight-js-protocol/node_modules`.

Pinning the transitive dependency exactly in one package and with a caret in a sibling is the root
cause. The scaffold generated by `create-mn-app` has the same duplication.

**4. No published simulator package.** `@openzeppelin-compact/contracts-simulator`, referenced by
tooling docs, 404s on npm. Hand-threading `CircuitContext` over `compact-runtime` works and is about 100
lines — but you have to discover that yourself.

**5. Structs are emitted as anonymous inline object types**, not named exports, so TypeScript consumers
cannot `import type { Evidence }`. We recover them with `Parameters<PureCircuits['leafOf']>[0]`, which
works but is not obvious.

**6. Generated TypeScript uses snake_case `goes_left`** while the Compact docs write `goesLeft` — a
silent-failure trap when constructing Merkle paths by hand. Related: `checkRoot` takes
`{ field: bigint }`, not a bare `bigint`, and `sibling` is a `{ field: bigint }` wrapper.

**7. A Merkle digest has two byte orders depending on where you read it.** The same root is a
big-endian bigint as `MerkleTreeDigest.field` read from the ledger, and **little-endian** in the
transaction transcript. Comparing one against the other by hex string silently never matches.

**8. `Map` iteration depends on the value type, which is not signposted.** `Map<K, SomeStruct>` gets a
`[Symbol.iterator]` in the generated ledger reader; `Map<K, Counter>` does not, because an ADT
reference cannot be materialized into a tuple. Sensible in hindsight, invisible beforehand — and it
silently decides whether your frontend can enumerate a public registry or has to query it by computed
key. Relatedly, `merkleTree.history()` returns a bare `Iterator`, not an `IterableIterator`, so
`for...of` and spread both fail on it.

**9. `Map<K, Counter>` entries do not exist until inserted**, so `lookup().increment()` throws on first
use. Easy to miss, and it fails at runtime on the first successful transaction rather than at compile
time — the worst possible moment.

**10. `create-mn-app` v0.5.0 dropped the `counter` template** while much documentation still references
it; the current set is `hello-world`, `battleship`, `bboard`, `leaderboard`.

Specific, reproducible feedback scores better than "the docs could be better."

**Positive note, worth making:** `export pure circuit` is excellent. It let us export the commitment and
nullifier derivations as ordinary TypeScript functions compiled from the same source the circuit runs,
which turned our biggest integration risk — four components encoding one struct identically — into a
compiler guarantee. That pattern deserves documenting as a first-class technique, not just a language
feature.

## Failure drills

| If this breaks | Do this |
|---|---|
| Wallet won't connect | Run the proof from the CLI, narrate the two views from screenshots |
| Testnet slow / tx pending | Show a pre-recorded successful run; narrate over it |
| Proof generation slow | Pre-generate; explain timing is proving-key size, not protocol design |
| Anchoring fails live | Pre-anchor before the pitch. **Do this regardless.** |
| Buyer timeline empty | Pre-populate with two or three records at different dates |

Have a terminal recording *and* screenshots of both views saved locally before the pitch. If the network
dies at 16:45, you still have a demo.
