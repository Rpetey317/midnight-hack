# Documentation Index

Design documentation for our Hack Buenos Aires 2026 project: a **privacy-preserving software assurance
network** on Midnight.

## Source of truth

**[`../Master-Doc.md`](../Master-Doc.md) is authoritative.** Everything in `docs/` is derived from it and
cites it by section (§4, §37, …). Where a doc and the Master Doc disagree, the Master Doc wins and the
doc is wrong — say so rather than working around it.

The docs in this folder were **realigned to the Master Doc on 2026-08-07**, after Track A was already
built. Track A was built against an earlier framing, so **code and docs currently disagree.**
[07-alignment-delta.md](07-alignment-delta.md) is the register of exactly where and what to change.

## Read in this order

| Doc | What it covers | Who needs it |
|-----|----------------|--------------|
| [00-overview.md](00-overview.md) | Problem, actors, why this needs ZK *and* a chain | Everyone — read first |
| [01-architecture.md](01-architecture.md) | Four actors, data flow, the public/private boundary | Everyone |
| [02-threat-model.md](02-threat-model.md) | What we prove, what we assume, known gaps, jury answers | Everyone; pitch material |
| [03-evidence-schema.md](03-evidence-schema.md) | **The integration contract.** v1 as-built + v2 target | All tracks |
| [04-contract-spec.md](04-contract-spec.md) | Ledger state, circuits, disclosure decisions, migration | Tracks A, C, D |
| [05-implementation-plan.md](05-implementation-plan.md) | Track assignments, timeline, cut list | Everyone |
| [06-demo-script.md](06-demo-script.md) | The 2½-minute pitch and the DX feedback | Whoever presents |
| [07-alignment-delta.md](07-alignment-delta.md) | **Master Doc → as-built gap.** Read before editing `contract/` | Track A |

## The reframing in one paragraph

Track A built an **anonymous repo-badge protocol** — a repo proves *some attested repo* satisfies a
policy, revealing nothing, not even which repo. The Master Doc specifies an **identified B2B software
assurance protocol** — a named vendor proves a *specific artifact digest* satisfies a *buyer's published
policy*, producing a public, time-bound compliance record.

Most of the cryptography carries over. What changes: the **privacy boundary** (vendor, product, and
artifact digest are now public — we hide the findings, not the vendor), the **evidence schema** (grows
from 8 fields to 15, including the mandatory `artifactDigest`), and the **ledger** (gains compliance
records). Anonymity stops being a goal.

## Status of claims in these docs

Midnight's stack moves fast and recalled knowledge about it is unreliable, so claims are tagged:

- **VERIFIED** — mechanically checked in this environment on 2026-08-07. Command and result recorded.
- **UNVERIFIED** — reasoned from documentation or skill content, not executed. Treat as a hypothesis.

Two UNVERIFIED items currently gate design decisions:

| Question | Gates | Where |
|---|---|---|
| Does the generated `Ledger` type expose iteration over `Map` / `List`? | The buyer's compliance timeline | [04](04-contract-spec.md#open-question-that-gates-the-buyer-history-view) |
| Do `blockTimeGte` / `blockTimeLt` work as the patterns reference describes? | On-chain freshness enforcement (not the MVP path) | [02](02-threat-model.md#gap-2--freshness-is-recorded-not-enforced-on-chain) |

### What is actually built

`contract/` — the Compact contract, witnesses, canonical encoding, and **50 simulator tests green** as
of 2026-08-07, including the historic-root property that validates the core design. Real proving keys
and on-chain behaviour remain UNVERIFIED; nothing is deployed.

It is on **schema v1**. The v2 migration is the first item in
[05-implementation-plan.md](05-implementation-plan.md) and must land before real key generation or demo
anchoring, because a struct change re-keys every leaf.

## Naming

Unresolved. Docs use the placeholder `<PROJECT>` where a product name is needed. The code uses `zkaudit`
— including in **domain separators**, which are commitment inputs, so renaming after the first real
anchor invalidates every record. Either settle the name before anchoring or keep `zkaudit` as a
permanent internal identifier independent of the product name.

## Hackathon constraints

- **Submission: 13:00 ART, Saturday 8 August 2026.**
- Team of 4, two tracks (we are in the one matching our Midnight experience level).
- Projects must be **open-source under Apache 2.0 at demo time**.
- Prizes: $3,500 first, $1,500 second, per track.
- Judging weighs technology, innovation, completion, real-world application, and **Midnight developer-
  experience feedback** — the DX notes in [06-demo-script.md](06-demo-script.md) are scored, not filler.
