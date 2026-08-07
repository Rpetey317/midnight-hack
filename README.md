# `<PROJECT>` — Privacy-Preserving Software Assurance

*Hack Buenos Aires 2026 · Midnight Network*

> **Name not yet decided.** Docs use the placeholder `<PROJECT>`. The code uses `zkaudit`, including in
> commitment domain separators — see [Naming](#naming) before renaming anything.

## What this is

Buyers publish machine-verifiable security policies. Vendors prove that a **specific software artifact**
satisfies those policies using **authenticated private evidence** — without handing over the SBOM, the
CVE list, the dependency tree, or the repository configuration.

The same evidence can be proven against **different buyers' policies** with no additional disclosure, and
Midnight keeps an independently verifiable, time-bound history of compliance.

A buyer learns:

```
Product          PaymentEngine
Artifact         sha256:ABC...
Policy           ACME Bank Procurement v3
Status           ✓ SATISFIED
Evidence date    2026-08-07
Valid until      2026-09-07
```

A buyer does **not** learn exact vulnerability counts, specific CVEs, affected packages, internal
package names, repository configuration, or MFA statistics.

> **Buyers define what they need to know. Vendors prove it without revealing everything they know.**

## Why it matters

Software procurement already runs on security assurance — NIST's SSDF exists partly so acquirers can
communicate requirements to suppliers, and the OpenSSF OSPS Baseline (published version 2026.02.19)
defines versioned controls for exactly this. Today satisfying a buyer means handing over the whole
security dossier, once per customer. **The buyer needed a handful of facts and received the entire attack
surface.**

The two properties that make this more than "hide a CI report":

1. **Evidence is reusable.** The attestor establishes *facts*; each buyer defines its own
   *requirements*. One scan, many independently-defined policies — the scanner never needs to know what
   any buyer will ask.
2. **Compliance is continuous.** Every proof is time-bound. A new CVE tomorrow doesn't falsify
   yesterday's proof; it expires it. Fresh evidence produces a fresh proof.

## Start here

**[`Master-Doc.md`](Master-Doc.md)** is the project's source of truth.
**[docs/](docs/README.md)** is the design documentation derived from it.

Fastest path for a new team member:
1. [docs/00-overview.md](docs/00-overview.md) — the idea, the actors, why it needs Midnight
2. [docs/03-evidence-schema.md](docs/03-evidence-schema.md) — the integration contract
3. [docs/05-implementation-plan.md](docs/05-implementation-plan.md) — your track

## Repo state

| Path | Status |
|---|---|
| `docs/` | ✅ Realigned to `Master-Doc.md` (2026-08-07) |
| `app/` | ✅ Minimal `hello-world` scaffold (SDK 4.1.1), deps installed |
| `contract/` | ⚠️ Built, 50 tests green — **on schema v1.** Needs the v2 migration. Not deployed. |
| `collector/`, `attestor/` | ⬜ |
| `anchor/`, `cli/` | ⬜ |
| `ui/` (vendor + buyer) | ⬜ |

### ⚠️ Docs and code currently disagree

`contract/` was built against an earlier framing — an *anonymous repo-badge* protocol. The Master Doc
specifies an *identified artifact-assurance* protocol. Most of the cryptography carries over, but the
evidence schema is missing fields the Master Doc treats as mandatory, above all `artifactDigest`.

**[docs/07-alignment-delta.md](docs/07-alignment-delta.md) is the register of every gap.** Read it before
touching `contract/`.

The migration must land **before** real proving-key generation or demo anchoring: a struct change re-keys
every leaf, so it is cheap now and expensive later.

## Integration surface

`contract/` exports the commitment and nullifier derivations as ordinary TypeScript functions, compiled
from the same Compact source the circuit runs — so the leaf you build cannot disagree with the leaf the
circuit checks.

```typescript
import { encodeEvidence, pureCircuits, policyId } from '@zkaudit/contract';

const evidence = encodeEvidence(canonicalJson);
const leaf     = pureCircuits.leafOf(evidence, salt);
const nul      = pureCircuits.nullifierOf(leaf, policyId('bank-v1'));
```

Do not reimplement any of that. See [docs/03-evidence-schema.md](docs/03-evidence-schema.md).

```bash
cd contract && npm install && npm run compile && npm test
```

## Toolchain

Verified in this environment on 2026-08-07:

| Component | Version |
|---|---|
| Compact compiler | 0.31.1 |
| Compact dev tools | 0.5.1 |
| `create-mn-app` | 0.5.0 |
| Midnight JS SDK | 4.1.1 |
| Node | 22.20.0 |
| Docker | 29.4.2 |
| `gh` | 2.45.0 — see caveats below |

Two verified environment gotchas that block Track B/C if unaddressed:

- **`gh` is not authenticated.** `gh auth status` reports no logged-in hosts, so every `gh api` call
  fails. Run `! gh auth login`.
- **`gh attestation` does not exist at 2.45.0** — the subcommand landed in 2.49.0. Use
  `@sigstore/verify` in Node rather than shelling out, or install a current `gh`.

No proof server is running locally (`:6300` is closed). `app/` brings one up via
`docker compose`.

## Design decision worth knowing up front

GitHub attestations are Sigstore/DSSE — ECDSA over **P-256**. Compact's only elliptic-curve primitives
are **Jubjub**, the proof system's embedded curve, and there is no signature-verification primitive at
all. Verifying P-256 in-circuit means non-native field arithmetic: research-grade, not a weekend.

So Sigstore verification runs **off-chain** and only the commitment is anchored. The trust root stays
GitHub's OIDC identity rather than a key we invented — which is also why we don't simply switch the
attestor to a Jubjub key we could verify in-circuit: that would relocate trust, not reduce it.

Full reasoning and residual assumptions in [docs/02-threat-model.md](docs/02-threat-model.md).

## Naming

The project name is unresolved. Note before renaming: the contract hardcodes `zkaudit` in its **domain
separators**, and domain separators are commitment inputs.

```compact
pad(32, "zkaudit:claim:nul:")
pad(32, "zkaudit:anchor:pk:")
```

Renaming after the first real anchor changes every nullifier and invalidates every compliance record.
Either settle the name before anchoring, or keep `zkaudit` as a permanent internal identifier that has
nothing to do with the product name.

## Licence

**Apache 2.0** — required to be in place at demo time. Note: the `LICENSE` file is **not yet present**.
