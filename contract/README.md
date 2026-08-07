# `@zkaudit/contract` — Track A

The Compact contract, its TypeScript witnesses, the canonical encoding, and the simulator tests.

This package is the **integration surface for every other track**. Tracks B, C, and D import from
here rather than reimplementing the commitment scheme.

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
| `claimBadge(policyId) → Boolean` | repo owner, locally | Membership + nullifier + policy predicate |
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

- Real proving keys (`npm run compile:keys`) — minutes, not seconds. Generate once the contract stops
  changing; the tree depth (16) is baked into the key.
- Deployment. Nothing has touched a devnet or testnet.

## Licence

Apache 2.0.
