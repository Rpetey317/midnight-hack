# `demo/` — signed evidence fixtures

> ## ⚠️ Everything here is synthetic demo data
>
> **The bundles carry their salts in cleartext, in a git repository, and the
> attestor's private key is committed next to them.**
>
> That is fine for evidence about artifacts that do not exist, and catastrophic
> for real evidence: the salt is what blinds the commitment, so publishing it
> lets anyone holding the public leaf recover the findings. Every bundle here
> carries `"demo": true` and `statement.collector.synthetic: true` so the
> distinction is a field rather than a convention.
>
> The committed key follows the same precedent as
> `contract/src/devnet/config.ts`, which commits the devnet genesis seed and the
> anchor secret with the same warning. A real attestor keeps its key in a KMS.

## What is here

```
demo/
├── keys/
│   ├── zkuat-attestor-v1.pub.json    verify with this
│   └── zkuat-attestor-v1.key.json    DEMO KEY — see the warning above
├── scenarios/
│   ├── _base.json                    baseline facts + subject
│   └── <name>.json                   deviations, keyed on collector check names
└── fixtures/
    ├── index.json                    leaves + buyer-side record keys
    └── <name>/
        ├── bundle.json               PRIVATE — evidence, salt, leaf, signature
        ├── predicate.json            PUBLIC  — { leaf, repo, sha, schema }
        ├── evidence.json             the canonical evidence, pretty-printed
        └── report.json               the collector report it came from
```

`evidence.json` is for reading. The **signed** form is `bundle.envelope.payload`
— key-sorted, whitespace-free base64. Editing `evidence.json` changes nothing
and verifies nothing.

## The four scenarios

| Fixture | bank-v1 | enterprise-v1 | Why it exists |
|---|---|---|---|
| `passes-both` | ✓ PASS | ✓ PASS | Demo beats 3–4. The happy path. |
| `bank-only` | ✓ PASS | ✗ FAIL | **Beat 5, the differentiator.** Two forbidden dependencies: the bank policy does not constrain them, the enterprise policy requires zero. One evidence bundle, two independently defined policies, two verdicts — and the buyer still sees no findings. |
| `enterprise-only` | ✗ FAIL | ✓ PASS | The mirror image. Six highs against the bank's limit of five. Proves the contrast is a property of the policies, not an accident of one bundle. |
| `fails-both` | ✗ FAIL | ✗ FAIL | **Beat 6, the negative case.** Two criticals. `proveCompliance` returns `false` rather than reverting and records it: the protocol does not lie. |

All four verdicts are asserted in `attestor/src/test/fixtures.test.ts` and were
confirmed on the local devnet with real ZK proofs.

**Each fixture uses a distinct artifact digest, deliberately.** `records` is
keyed on `(artifactDigest, policyId)` and `insert` replaces, so fixtures sharing
one digest would silently overwrite each other's records — proving `fails-both`
would clobber `passes-both`'s COMPLIANT entry and the buyer dashboard would show
one artifact instead of four. There is a test for this.

## Using a fixture

Offline, no chain:

```bash
cd attestor
npm run verify -- ../demo/fixtures/bank-only/bundle.json \
  --trust ../demo/keys/zkuat-attestor-v1.pub.json
```

End to end with real ZK proofs, against the local devnet:

```bash
cd contract
npm run devnet:up && npm run devnet:deploy
npm run devnet:prove -- --bundle ../demo/fixtures/bank-only/bundle.json --policy bank-v1        # PASS
npm run devnet:prove -- --bundle ../demo/fixtures/bank-only/bundle.json --policy enterprise-v1  # FAIL
npm run devnet:inspect
```

From TypeScript — this is what Tracks C and D import:

```typescript
import { loadBundle, bundleToPrivateState } from '@zkuat/attestor';

const bundle = loadBundle('demo/fixtures/bank-only/bundle.json');
const { evidence, salt, leaf } = bundleToPrivateState(bundle);   // verifies first
```

## ⚠️ Before the pitch: refresh the fixtures

```bash
cd attestor && npm run fixtures:refresh
```

Fixtures are committed with a **pinned** `generatedAt` so their leaves are
stable and a diff means something. `validUntil` is 29 days after that pin, so a
committed fixture eventually renders as **EXPIRED** in the buyer view. That is
correct behaviour and a terrible thing to discover on stage.

`fixtures.test.ts` fails once the committed fixtures pass their expiry, so a
green test suite is the check.

Refreshing also gives every fixture a new leaf and a new nullifier, which is how
to **rehearse the demo more than once**: proving the same bundle against the
same policy twice hits the replay guard (`already proven`). Refresh, re-anchor,
rehearse. The alternative is `npm run devnet:reset && npm run devnet:deploy`.

## Regenerating

```bash
cd attestor
npm run fixtures                     # deterministic, pinned timestamp
npm run fixtures:refresh             # stamped to now
```

Fixtures are built from `demo/scenarios/` through the **same** `normalize()` the
live pipeline uses, so a validation rule that would reject real collector output
rejects a fixture too.

To build them on genuinely measured facts, with only the demo-relevant numbers
restated:

```bash
cd collector && npx zkuat-collect --out /tmp/report.json
cd ../attestor && npm run fixtures -- --from-report /tmp/report.json
```

Each overridden check then records what was actually measured in its `detail`,
and the report stays marked `synthetic` either way.

**After any change to `Evidence` in the contract, regenerate.** The struct is
committed to as a whole, so one added field changes every leaf. The fixture
tests fail loudly when that happens.
