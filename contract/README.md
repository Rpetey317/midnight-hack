# `@zkaudit/contract` — Track A

The Compact contract, its TypeScript witnesses, the canonical encoding, and the simulator tests.

This package is the **integration surface for every other track**. Tracks B, C, and D import from
here rather than reimplementing the commitment scheme.

> ## ⚠️ This package is on schema v1; the Master Doc requires v2
>
> [`../Master-Doc.md`](../Master-Doc.md) is the project's source of truth, and it landed after this
> package was built. The code here implements an earlier framing — an **anonymous repo-badge** protocol.
> The Master Doc specifies an **identified artifact-assurance** protocol.
>
> Most of the cryptography carries over unchanged. What must change:
>
> | Change | Why |
> |---|---|
> | Add `artifactDigest` to `Evidence` and bind it to a public circuit input | Master Doc §10 — every claim must name specific artifact bytes. **Highest value per line.** |
> | Grow `Evidence` to 15 fields: `validUntil`, `kev`, `forbiddenDeps`, `mfaRequired`, `branchProtected`, `buildProvenanceVerified`, `attestorId` | §41 |
> | Drop `repoId`; demote `coverage` out of every flagship policy | §37, §18 |
> | Add `ComplianceRecord` + a `records` ledger map | §43 — a `Counter` tally cannot answer "is artifact ABC compliant with ACME v3?" |
> | Register **two** policies, not one | §39 ranks a second policy over the same evidence as the top add-on |
> | `claimBadge` → `proveCompliance`; `repoIdOf` → `stringIdOf` | Terminology; `repoIdOf` was never repo-specific |
>
> **A struct change re-keys every leaf.** `persistentCommit<Evidence>` commits to the whole struct, so
> one added field invalidates every anchored attestation and every outstanding proof. **Migrate before
> generating real proving keys or anchoring demo data.**
>
> Full register: [`../docs/07-alignment-delta.md`](../docs/07-alignment-delta.md).
> Target circuit: [`../docs/04-contract-spec.md`](../docs/04-contract-spec.md#target-v2).
>
> Everything below describes the package **as it exists today** and is accurate.

## Quick start

```bash
npm install
npm run compile      # compact compile --skip-zk, seconds
npm test             # 50 tests
npm run typecheck
```

`npm run compile` must run before `npm test` — the tests import the compiler's generated output from
`src/managed/`, which is gitignored.

## What other tracks need

```typescript
import { encodeEvidence, pureCircuits, policyId, EVIDENCE_SCHEMA } from '@zkaudit/contract';

const evidence = encodeEvidence({
  schema: EVIDENCE_SCHEMA,
  repo: 'acme/widget',
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  issuedAt: 1754582400,
  checks: { ciGreen: true, criticals: 0, highs: 2, vulnDeps: 0, coverage: 8734 },
});

const leaf = pureCircuits.leafOf(evidence, salt);            // anchor this
const nul  = pureCircuits.nullifierOf(leaf, policyId('production-ready'));
```

`leafOf` and `nullifierOf` are **pure circuits** — compiled from the same Compact source `claimBadge`
runs, callable from TypeScript with no context and no transaction. What you compute here is byte for
byte what the circuit checks. That is why nobody writes a second implementation: see
[docs/03-evidence-schema.md](../docs/03-evidence-schema.md), which names encoding drift as the
project's highest risk.

## Layout

| Path | What |
|---|---|
| `src/audit_registry.compact` | The contract |
| `src/encoding.ts` | Canonical JSON → `Evidence`. The only implementation. |
| `src/types.ts` | `Evidence`, `Policy`, `AuditPath` — derived from the compiler's output, not hand-written |
| `src/witnesses.ts` | Witness implementations and `AuditPrivateState` |
| `src/index.ts` | Public entry point |
| `src/test/simulator.ts` | Hand-rolled simulator over `@midnight-ntwrk/compact-runtime` |
| `src/test/fixtures.ts` | Deterministic test data |
| `src/test/audit_registry.test.ts` | 50 tests |
| `src/managed/` | Compiler output — gitignored, regenerate with `npm run compile` |

## Circuits

| Circuit | Caller | Effect |
|---|---|---|
| `attest(leaf)` | anchor only | Inserts into the attestations tree |
| `registerPolicy(id, policy)` | anchor only | Publishes thresholds, seeds the badge tally |
| `claimBadge(policyId) → Boolean` | vendor, locally | Membership + nullifier + policy predicate |
| `leafOf`, `nullifierOf`, `repoIdOf`, `anchorIdOf` | anyone, off-chain | Pure derivations |

The anchor is whoever deploys: the constructor seals `anchorIdOf(localSecret())` into the ledger.
Identity comes from a witness secret, **not** `ownPublicKey()` — the latter is prover-supplied and
therefore forgeable for authorization.

## Testing notes

There is no published Compact simulator package (`@openzeppelin-compact/contracts-simulator` 404s on
npm). `src/test/simulator.ts` threads `CircuitContext` between circuit calls by hand, which is all a
simulator is.

The suite includes **privacy assertions against real transcripts** — the leaf preimage, repo id,
commit, and salt are all checked to be absent from `proofData.publicTranscript`. That mechanizes the
checklist in [docs/02-threat-model.md](../docs/02-threat-model.md).

## Not done yet

- **The schema v2 migration** — see the banner at the top. This is the first thing to do, and it must
  precede the two items below.
- Real proving keys (`npm run compile:keys`) — minutes, not seconds. Generate once the contract stops
  changing; **both the tree depth (16) and the `Evidence` struct shape are baked into the key**, so
  generating before the v2 migration wastes the run.
- Deployment. Nothing has touched a devnet or testnet.

When migrating, the test suite will need more than fixture edits: the **privacy assertions must be
rewritten**, because v2's public set grows (vendor, product, artifact digest, timestamps). The existing
"absent from transcript" checks will pass while covering none of the new fields.

## Licence

Apache 2.0.
