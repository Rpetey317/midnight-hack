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
`src/managed/`.

### ⚠️ The generated contract JS is committed — re-commit it when the contract changes

`src/managed/audit_registry/contract/` (`index.js` + `index.d.ts`, 140 KB) and `compiler/` are
**tracked in git**. Proving keys and ZKIR are not. Every other track imports `pureCircuits` through
`@zkuat/contract`, and a fresh clone, a GitHub Actions runner, and Track D's browser build have no
Compact toolchain to regenerate them with.

So after any edit to `audit_registry.compact`:

```bash
npm run compile && git add src/managed/audit_registry && npm test
```

Skipping this leaves Tracks B, C, and D building against a stale encoding — which fails as a
commitment mismatch three components downstream, not as a compile error here.

### Run it on a real chain

```bash
npm run compile:keys     # real proving keys, ~45s
npm run devnet:up        # node + indexer + proof-server (docker)
npm run devnet:deploy    # deploy + register both buyer policies
npm run devnet:demo      # attest → proveCompliance ×2 → read records
```

Full setup on a fresh machine, with troubleshooting: **[../docs/08-local-setup.md](../docs/08-local-setup.md)**.

### ⚠️ Do not drop the `overrides` block

```json
"overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }
```

`midnight-js-protocol@4.1.1` pins that package to exactly 3.0.0 while `compact-runtime@0.16.0` declares
`^3.0.0`, which floats to 3.1.0. npm installs both, each with its own WASM instance, and every circuit
call fails with `expected instance of StateValue`. Deployment succeeds, so the failure surfaces later
than you would expect. Any package combining `compact-runtime` with Midnight.js needs the same pin.

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
| `src/devnet/` | Devnet config, wallet/provider wiring, `deploy.ts`, `demo.ts` |
| `src/managed/` | Compiler output. `contract/` and `compiler/` are **committed**; `keys/` and `zkir/` are gitignored |

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

- **Public testnet.** Only the local devnet has been exercised; `src/devnet/config.ts` is devnet-only
  by design. `app/README.md` documents the multi-network flow if you need preview or preprod.
- Anchor key management. `src/devnet/config.ts` hardcodes a demo anchor secret; whoever deploys
  becomes the anchor permanently, because the ledger field is `sealed`.
- Wall-clock freshness enforcement. `maxAgeSeconds` bounds the validity window an attestor may grant
  (`validUntil <= generatedAt + maxAgeSeconds`), but whether evidence has *since* expired is the
  reader's judgement from `validUntil` in the public record.

## Licence

Apache 2.0.
