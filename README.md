# `<PROJECT>` — ZK Audit Attestation Protocol

*Hack Buenos Aires 2026 · Midnight Network*

> **Name not yet decided.** Docs use the placeholder `<PROJECT>`. To rename:
> `grep -rl '<PROJECT>' docs/ README.md | xargs sed -i 's/<PROJECT>/OurName/g'`

## What this is

Prove your codebase satisfies a security policy — **without revealing the code, the findings, or even
which repo you are.**

Your CI runs the audit checks and produces evidence that never leaves the repo. GitHub cryptographically
signs a *commitment* to that evidence. The commitment is anchored in a Merkle tree on Midnight. You then
generate a zero-knowledge proof **locally** that the anchored evidence satisfies a published policy —
disclosing only the verdict.

A verifier learns: *"an attested repo satisfies Policy X."* Nothing else.

## Why it matters

Every security audit today forces the same trade: to prove your codebase is healthy, you hand a third
party your source, your CI logs, and your vulnerability findings. **The evidence is the exposure.**

The verifier never actually needed the evidence. They needed a boolean. That's what ZK proofs are for.

## Start here

**[docs/README.md](docs/README.md)** — full design documentation.

Fastest path for a new team member:
1. [docs/00-overview.md](docs/00-overview.md) — the idea and why it needs Midnight
2. [docs/03-evidence-schema.md](docs/03-evidence-schema.md) — **freeze before writing code**
3. [docs/05-implementation-plan.md](docs/05-implementation-plan.md) — your track

## Repo state

| Path | Status |
|---|---|
| `docs/` | ✅ Design docs complete |
| `app/` | ✅ Minimal `hello-world` scaffold (SDK 4.1.1), deps installed |
| `contract/` | ⬜ Track A — contract source verified to compile, see [04-contract-spec.md](docs/04-contract-spec.md) |
| `collector/` | ⬜ Track B |
| `anchor/`, `cli/` | ⬜ Track C |
| `ui/` | ⬜ Track D |

## Toolchain

Verified in this environment on 2026-08-07:

| Component | Version |
|---|---|
| Compact compiler | 0.31.1 |
| Compact dev tools | 0.5.1 |
| `create-mn-app` | 0.5.0 |
| Midnight JS SDK | 4.1.1 |
| Node | 22.20.0 |

Missing and needed: **`gh` CLI** (`sudo apt install gh`) for Track B.

## Design decision worth knowing up front

GitHub attestations are Sigstore/DSSE — ECDSA over **P-256**. Compact's only elliptic-curve primitives
are **Jubjub**, the proof system's embedded curve, and there is no signature-verification primitive at
all. Verifying P-256 in-circuit means non-native field arithmetic: research-grade, not a weekend.

So Sigstore verification runs **off-chain** and only the commitment is anchored. The trust root remains
GitHub's OIDC identity rather than a key we invented. Full reasoning and residual assumptions in
[docs/02-threat-model.md](docs/02-threat-model.md).

## Licence

**Apache 2.0** — required to be in place at demo time.
