# Documentation Index

Design documentation for our Hack Buenos Aires 2026 project: a **privacy-preserving software assurance
network** on Midnight.

## Source of truth

**[`../Master-Doc.md`](../Master-Doc.md) is authoritative.** Everything in `docs/` is derived from it and
cites it by section (§4, §37, …). Where a doc and the Master Doc disagree, the Master Doc wins and the
doc is wrong — say so rather than working around it.

The docs in this folder were realigned to the Master Doc on 2026-08-07, and `contract/` was migrated to
match on the same day. **Code and docs now agree.** [07-alignment-delta.md](07-alignment-delta.md) is the
register of what changed and why — worth reading before editing the contract, because several entries
explain non-obvious design choices.

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
| [07-alignment-delta.md](07-alignment-delta.md) | Master Doc → as-built register, now mostly resolved | Track A |

## The reframing in one paragraph

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

Real proving keys and on-chain behaviour remain UNVERIFIED; nothing is deployed. Those are the next
steps.

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
