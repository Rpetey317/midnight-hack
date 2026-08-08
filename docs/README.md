# Documentation Index

Design documentation for our Hack Buenos Aires 2026 project: a **privacy-preserving software assurance
network** on Midnight.

## Source of truth

**[`Master-Doc-v2.md`](Master-Doc-v2.md) is authoritative.** [`Master-Doc.md`](Master-Doc.md) is the
superseded v1 and is kept because the rest of this folder cites it heavily.

### How to read a section reference

- A bare **§N** — §4, §37 — means **v1** (`Master-Doc.md`). Every existing citation in these docs
  resolves against it, and they were deliberately left unrenumbered.
- **v2 §N** means `Master-Doc-v2.md`.

Where a doc and the authoritative doc disagree, the doc is wrong — say so rather than working around it.

### v2 simplifies; it does not redirect

v2's core model is what `contract/` already implements: buyer policies as public contract state,
evidence as a private witness, a ZK verdict, a public time-bound record, continuous compliance. What it
**adds** is the application↔GitHub loop (v2 §5) and `npm audit` as the first real evidence tool (v2 §4).
What it **defers** — Sigstore/Rekor, blinded commitments, attestor keys, SLSA (v2 §10) — this repo
already built, and v2 §12 lists the same items as the intended upgrades. The as-built is a **superset**,
and it stays.

Two registers record the history:

- [07-alignment-delta.md](07-alignment-delta.md) — v1 → as-built. Mostly closed; several entries explain
  non-obvious contract design choices and are worth reading before editing it.
- [09-master-doc-v2-delta.md](09-master-doc-v2-delta.md) — **v2 → as-built.** Read this one first if you
  are working on the GitHub evidence path.

## Read in this order

| Doc | What it covers | Who needs it |
|-----|----------------|--------------|
| [00-overview.md](00-overview.md) | Problem, actors, why this needs ZK *and* a chain | Everyone — read first |
| [01-architecture.md](01-architecture.md) | Four actors, data flow, the public/private boundary | Everyone |
| [02-threat-model.md](02-threat-model.md) | What we prove, what we assume, known gaps, jury answers | Everyone; pitch material |
| [03-evidence-schema.md](03-evidence-schema.md) | **The integration contract.** Schema v2, as-built | All tracks |
| [04-contract-spec.md](04-contract-spec.md) | Ledger state, circuits, disclosure decisions, testing | Tracks A, C, D |
| [05-implementation-plan.md](05-implementation-plan.md) | Track assignments, timeline, cut list | Everyone |
| [06-demo-script.md](06-demo-script.md) | The 2½-minute pitch and the DX feedback | Whoever presents |
| [07-alignment-delta.md](07-alignment-delta.md) | v1 Master Doc → as-built register, now mostly resolved | Track A |
| [08-local-setup.md](08-local-setup.md) | **Setting this up on a fresh machine**, verified end to end | Anyone new |
| [09-master-doc-v2-delta.md](09-master-doc-v2-delta.md) | **Master-Doc-v2 → as-built.** The GitHub evidence path and its honest gaps | Everyone |

## The reframing in one paragraph

*(This describes the v1 realignment. v2 did not disturb it — see
[09](09-master-doc-v2-delta.md).)*

Track A built an **anonymous repo-badge protocol** — a repo proves *some attested repo* satisfies a
policy, revealing nothing, not even which repo. The Master Doc specifies an **identified B2B software
assurance protocol** — a named vendor proves a *specific artifact digest* satisfies a *buyer's published
policy*, producing a public, time-bound compliance record.

Most of the cryptography carried over. What changed: the **privacy boundary** (vendor, product, and
artifact digest are now public — we hide the findings, not the vendor), the **evidence schema** (grew
from 8 fields to 17, including the mandatory `artifactDigest`), and the **ledger** (gained compliance
records and a timeline). Anonymity stopped being a goal.

This is done. `contract/` runs schema v2.

## Status of claims in these docs

Midnight's stack moves fast and recalled knowledge about it is unreliable, so claims are tagged:

- **VERIFIED** — mechanically checked in this environment on 2026-08-07. Command and result recorded.
- **UNVERIFIED** — reasoned from documentation or skill content, not executed. Treat as a hypothesis.

| Question | Status |
|---|---|
| Does the generated `Ledger` expose iteration over `Map` / `List`? | **VERIFIED — yes**, when the value is a plain struct. `Map<K, Counter>` does not. The buyer timeline is unblocked; see [04](04-contract-spec.md#map-and-list-iteration--the-question-that-was-gating-the-buyer-view). |
| Do `blockTimeGte` / `blockTimeLt` work as the patterns reference describes? | Still UNVERIFIED, and not on the critical path — freshness is recorded and judged by the reader. |

### What is actually built

`contract/` — the Compact contract, witnesses, canonical encoding, and **87 simulator tests green** as
of 2026-08-07 on schema v2: identity binding, both buyer policies, compliance records and timeline, and
the historic-root property that validates the core design.

`collector/` + `attestor/` — 11 supply-chain checks with a labelled degradation path for each, canonical
JSON, ed25519 DSSE signing, and the predicate leak guard. **186 tests green.** Four signed fixtures in
`demo/fixtures/` were anchored and proven on the local devnet with real ZK proofs, producing exactly the
verdict matrix the demo script depends on. Package READMEs:
[`../attestor/README.md`](../attestor/README.md), [`../collector/README.md`](../collector/README.md),
[`../demo/README.md`](../demo/README.md).

`collector/src/github-evidence.ts` — the **v2 §4–§5 adapter**: the `evidence.json` a dispatched workflow
produces, mapped to the same `CollectorReport` the full collector emits, so normalize → sign → anchor →
prove is unchanged. The facts `npm audit` cannot establish come back `unavailable`, never a measured
zero. See [09-master-doc-v2-delta.md](09-master-doc-v2-delta.md).

`ui/` — Next.js app with Supabase GitHub auth and four routes (`/dashboard`, `/attester/[product]`,
`/verify`, `/policies`), plus the workflow dispatch → poll → artifact download path in
`ui/src/lib/github/evidence.ts`. **Proving is still simulated** (`prove-panel.tsx`) and the verifier
view reads `lib/demo.ts` fixtures rather than the chain — that wiring is in flight.

**Real proving keys are generated and the contract is deployed to a local devnet.** A full
attest → proveCompliance → read-record round trip runs with real ZK proofs, including the two-policy
contrast. Only the local devnet has been exercised; public testnet remains UNVERIFIED.

Setup on a fresh machine: **[08-local-setup.md](08-local-setup.md)** — verified by executing it end to
end against a wiped chain.

## Naming

Settled: **zkuat**. The slug is baked into the contract's domain separators, which are commitment
inputs, so renaming after the first real anchor would invalidate every record. Nothing has been anchored
yet.

## Hackathon constraints

- **Submission: 13:00 ART, Saturday 8 August 2026.**
- Team of 4, two tracks (we are in the one matching our Midnight experience level).
- Projects must be **open-source under Apache 2.0 at demo time**.
- Prizes: $3,500 first, $1,500 second, per track.
- Judging weighs technology, innovation, completion, real-world application, and **Midnight developer-
  experience feedback** — the DX notes in [06-demo-script.md](06-demo-script.md) are scored, not filler.
