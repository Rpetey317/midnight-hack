# `@zkuat/contract` — Track A

The Compact contract, its TypeScript witnesses, the canonical encoding, and the simulator tests.
Schema **v2**, 87 tests green.

This package is the **integration surface for every other track**. Tracks B, C, and D import from
here rather than reimplementing the commitment scheme.

## Quick start

```bash
npm install
npm run compile      # compact compile --skip-zk, seconds
npm test             # 87 tests
npm run typecheck
```

`npm run compile` must run before `npm test` — the tests import the compiler's generated output from
`src/managed/`, which is gitignored.

## What other tracks need

```typescript
import {
  encodeEvidence, pureCircuits, recordKey,
  POLICY_BANK_ID, POLICY_ENTERPRISE_ID, EVIDENCE_SCHEMA,
} from '@zkuat/contract';

const evidence = encodeEvidence({
  schema: EVIDENCE_SCHEMA,
  vendor: 'acme-software',
  product: 'widget-api',
  artifactDigest: 'sha256:8f73…',
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  attestor: 'zkuat-attestor-v1',
  generatedAt: 1754582400,
  validUntil: 1757088000,
  vulns:  { criticals: 0, highs: 3, kev: 0 },
  deps:   { forbidden: 0, vulnerable: 0 },
  config: { mfaRequired: true, branchProtected: true, buildProvenanceVerified: true, ciGreen: true },
  coverage: 8734,
});

const leaf = pureCircuits.leafOf(evidence, salt);              // the anchor attests this
const nul  = pureCircuits.nullifierOf(leaf, POLICY_BANK_ID);
const key  = recordKey('sha256:8f73…', 'bank-v1');             // the buyer's lookup into `records`
```

`leafOf`, `nullifierOf`, and `recordKeyOf` are **pure circuits** — compiled from the same Compact
source `proveCompliance` runs, callable from TypeScript with no context and no transaction. What you
compute here is byte for byte what the circuit checks. That is why nobody writes a second
implementation: see [docs/03-evidence-schema.md](../docs/03-evidence-schema.md), which names encoding
drift as the project's highest risk.

## Layout

| Path | What |
|---|---|
| `src/audit_registry.compact` | The contract |
| `src/encoding.ts` | Canonical JSON → `Evidence`, identifier derivation, both shipped policies. The only implementation. |
| `src/types.ts` | `Evidence`, `Policy`, `ComplianceRecord`, `AuditPath` — derived from the compiler's output, not hand-written |
| `src/witnesses.ts` | Witness implementations and `AuditPrivateState` |
| `src/index.ts` | Public entry point |
| `src/test/simulator.ts` | Hand-rolled simulator over `@midnight-ntwrk/compact-runtime` |
| `src/test/fixtures.ts` | Deterministic test data, including the two-policy contrast bundles |
| `src/test/audit_registry.test.ts` | 87 tests |
| `src/managed/` | Compiler output — gitignored, regenerate with `npm run compile` |

## Circuits

| Circuit | Caller | Effect |
|---|---|---|
| `attest(leaf)` | anchor only | Inserts a blinded evidence commitment into the tree |
| `registerPolicy(id, policy)` | anchor only | Publishes a buyer's thresholds |
| `proveCompliance(vendorId, productId, artifactDigest, policyId) → Boolean` | vendor, locally | The protocol |
| `leafOf`, `nullifierOf`, `recordKeyOf`, `stringIdOf`, `anchorIdOf` | anyone, off-chain | Pure derivations |

**Public:** vendor, product, artifact digest, policy id and version, evidence dates, verdict.
**Private:** every vulnerability count, every dependency fact, every configuration boolean, the commit,
the attestor, the salt, the leaf, and the path siblings.

The anchor is whoever deploys: the constructor seals `anchorIdOf(localSecret())` into the ledger.
Identity comes from a witness secret, **not** `ownPublicKey()` — the latter is prover-supplied and
therefore forgeable for authorization.

## Two shipped policies

Both are evaluated over the same evidence bundle, which is the point.

```
POLICY_BANK_V1        criticals == 0,  highs <= 5,  kev == 0,  requireBuildProvenance
POLICY_ENTERPRISE_V1  criticals == 0,  forbiddenDeps == 0,  requireBranchProtection,
                      requireBuildProvenance
```

A policy field with no threshold is set to `MAX_U32`, not zero — zero means "at most zero", the
strictest possible bound. This is the easiest way to write a policy that accidentally rejects
everything.

## Testing notes

There is no published Compact simulator package (`@openzeppelin-compact/contracts-simulator` 404s on
npm). `src/test/simulator.ts` threads `CircuitContext` between circuit calls by hand, which is all a
simulator is.

**The privacy tests assert against public ledger state, not just the transcript.** That distinction is
load-bearing and was learned the hard way: deliberately leaking a private field into a
`ComplianceRecord` produced a completely clean `proofData` — the value appeared in none of
`publicTranscript`, `input`, `output`, or `privateTranscriptOutputs` — while sitting readable in
`ledger.records`. A transcript-only privacy test passes while you publish what you meant to hide.

## Not done yet

- Real proving keys (`npm run compile:keys`) — minutes, not seconds. Safe to generate now that the
  struct is settled; tree depth (16) and the struct shape are both baked into the key.
- Deployment. Nothing has touched a devnet or testnet.
- Wall-clock freshness enforcement. `maxAgeSeconds` bounds the validity window an attestor may grant
  (`validUntil <= generatedAt + maxAgeSeconds`), but whether evidence has *since* expired is the
  reader's judgement from `validUntil` in the public record.

## Licence

Apache 2.0.
