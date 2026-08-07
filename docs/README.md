# Documentation Index

Design documentation for our Hack Buenos Aires 2026 project: a **ZK audit attestation protocol**.

> **Naming:** not decided yet. Every doc uses the placeholder `<PROJECT>`. When we settle on a name:
> ```bash
> grep -rl '<PROJECT>' docs/ | xargs sed -i 's/<PROJECT>/OurName/g'
> ```
> The scaffolded app lives in `app/` — a name-neutral directory, so no rename is needed there.

## Read in this order

| Doc | What it covers | Who needs it |
|-----|----------------|--------------|
| [00-overview.md](00-overview.md) | Problem, solution, why this needs Midnight | Everyone — read first |
| [01-architecture.md](01-architecture.md) | Components, data flow, trust boundary | Everyone |
| [02-threat-model.md](02-threat-model.md) | What we prove, what we assume, known holes | Everyone; pitch material |
| [03-evidence-schema.md](03-evidence-schema.md) | **The integration contract. Frozen and implemented.** | All four tracks |
| [04-contract-spec.md](04-contract-spec.md) | Ledger state, circuits, disclosure decisions | Track A, C, D |
| [05-implementation-plan.md](05-implementation-plan.md) | Track assignments, timeline, cut list | Everyone |
| [06-demo-script.md](06-demo-script.md) | The 2½-minute pitch | Whoever presents |

## Status of claims in these docs

Midnight's stack moves fast and recalled knowledge about it is unreliable, so claims here are tagged:

- **VERIFIED** — mechanically checked in this environment on 2026-08-07. Command and result recorded in the doc.
- **UNVERIFIED** — reasoned from documentation, not yet executed. Treat as a hypothesis to confirm.

The contract is now **built and tested** — `contract/`, 50 simulator tests green as of 2026-08-07,
including the historic-root property that validates the core design. Real proving keys and on-chain
behaviour remain UNVERIFIED.

The evidence schema in [03-evidence-schema.md](03-evidence-schema.md) is **frozen and implemented**.
Tracks B, C, and D import `@zkaudit/contract` for the encoding rather than reimplementing it.

## Hackathon constraints

- **Submission: 13:00 ART, Saturday 8 August 2026.**
- Team of 4, two tracks (we are in the one matching our Midnight experience level).
- Projects must be **open-source under Apache 2.0 at demo time**.
- Prizes: $3,500 first, $1,500 second, per track.
