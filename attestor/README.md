# `@zkuat/attestor` — Track B

Normalizes collector output into canonical v2 evidence, signs it, and splits the
result into the two documents the protocol depends on being different.

## Install — `contract/` first

```bash
npm --prefix ../contract install      # ← required, and required FIRST
npm install
npm test
```

`@zkuat/contract` is a `file:` dependency, so npm **symlinks** it and does not
install its dependencies. Node then resolves that symlink to its real path and
looks for `@midnight-ntwrk/compact-runtime` inside `contract/`, where nothing
has been installed. `postinstall` checks for this and says so; without it the
failure is a runtime `ERR_MODULE_NOT_FOUND` pointing at a generated file,
several commands after the mistake.

No Compact toolchain is needed — `contract/src/managed/audit_registry/contract/`
is committed. Verified against a genuinely fresh copy of the repo, which is the
only way this shows up.

```
collector report                          PRIVATE (CVE ids, package names)
       │
       │  normalize()   validate CI inputs → canonical evidence
       ▼
  bundle.json                             PRIVATE (evidence, salt, leaf, sig)
       │
       ├──────────────► the vendor          proveCompliance witnesses
       │
       ▼
  predicate.json                           PUBLIC  { leaf, repo, sha, schema }
       │
       └──────────────► actions/attest → Sigstore → Rekor → the world
```

## The split is the design

GitHub attestations are world-readable through Rekor, a public transparency log.
Putting evidence in the predicate would publish our vulnerability findings to
it — leaking exactly what the protocol exists to protect
(`../docs/01-architecture.md`).

So the predicate carries the **leaf and nothing else**. The leaf is a
salt-blinded commitment, so it discloses nothing without the salt, and the salt
lives only in `bundle.json`.

`assertNoEvidenceLeak()` enforces this, and `.github/workflows/attest.yml` runs
it as a gate before `actions/attest`. It is the mechanized form of the Track B
line in the privacy checklist in `../docs/02-threat-model.md`.

## Two signature layers

| Layer | Signs | Where | Status |
|---|---|---|---|
| **Attestor** (Master Doc §9) | the statement: canonical evidence **+** the leaf | offline, ed25519 DSSE via `node:crypto` | shipped |
| **Sigstore** (`docs/01`) | `{ leaf, repo, sha, schema }` | `actions/attest`, GitHub OIDC → Fulcio → Rekor | slot present (`bundle.sigstore`), not exercised |

The attestor signs a **statement**, not the bare evidence, so the leaf is
attestor-bound too: one evidence document paired with one commitment, and
neither swappable under the same signature.

The **salt is deliberately outside the signed payload**. Signing it would make
it a natural thing to quote when presenting a signature, and the salt is the one
value whose publication unblinds the commitment. The binding that matters —
`evidence + salt → leaf → tree` — is enforced in-circuit by `proveCompliance`.

## No reimplementation of the encoding

`../docs/03-evidence-schema.md` names encoding drift between components as the
project's highest risk. This package closes it by calling the compiler's own
output:

```typescript
import { encodeEvidence, pureCircuits } from '@zkuat/contract';
const leaf = pureCircuits.leafOf(encodeEvidence(canonical), salt);
```

`pureCircuits` is compiled from the same Compact source `proveCompliance` runs,
so what this commits to is byte for byte what the circuit checks. **Do not write
a second sha256, a second slug padder, or a second policy table.**

## What Tracks C and D import

```typescript
import { loadBundle, bundleToPrivateState } from '@zkuat/attestor';
import { ledger } from '@zkuat/contract';

const bundle = loadBundle('demo/fixtures/bank-only/bundle.json');
const { evidence, salt, leaf } = bundleToPrivateState(bundle);   // verifies first

// ... the anchor submits attest(leaf) ...

const path = ledger(state.data).attestations.findPathForLeaf(leaf);
await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
  secretKey: null,          // a vendor holds no anchor secret
  evidence, salt, path,
});
```

`bundleToPrivateState` returns exactly the fields `AuditPrivateState` needs, and
verifies before returning them — an unverified bundle otherwise fails as
`path/leaf mismatch` minutes into proof generation.

**Track C:** pass `trustedKeyIds`. Without it, `verifyBundle` checks the
signature against the key the bundle *carries*, which proves internal
consistency and nothing about who signed. There is a test showing a foreign key
re-signing a statement passes without it and fails with it.

## CLI

```bash
npm run keygen -- --attestor zkuat-attestor-v1 --out ../demo/keys
npm run attest -- --report evidence-raw.json --key ../demo/keys/zkuat-attestor-v1.key.json --out out/
npm run verify -- ../demo/fixtures/bank-only/bundle.json --trust ../demo/keys/zkuat-attestor-v1.pub.json
npm run fixtures                 # regenerate the demo fixtures, pinned timestamp
npm run fixtures:refresh         # ⚠️ run before the pitch — re-stamps to now
```

`zkuat-attest` **refuses to sign a report with unmeasured checks** unless given
`--allow-degraded`, and prints the list first. A stubbed value is
indistinguishable from a measured one once it is inside the commitment, so that
prompt is the last point at which anyone can notice.

## Canonical JSON

Keys sorted, no insignificant whitespace, **integers only** — the rule that
makes `coverage` percent × 100. A float in a signed payload is a signature that
verifies on the machine that produced it and nowhere else, because
shortest-representation printing differs across languages.

Note that `docs/03`'s example evidence JSON is printed in *field* order for
legibility while the signed form is *key-sorted*. Both are correct; only one
gets hashed. Do not "fix" either to match the other.

## Bundle format

```jsonc
{
  "_type": "zkuat.bundle.v1",
  "demo": true,                    // synthetic — see demo/README.md
  "salt": "<hex32>",               // PRIVATE. Lose it and the evidence is unprovable forever.
  "leaf": "<hex32>",
  "statement": {                   // the signed document
    "_type": "zkuat.attestation.v1",
    "schema": "zkuat.evidence.v2",
    "evidence": { /* canonical evidence */ },
    "leaf": "<hex32>",
    "attestor": "zkuat-attestor-v1",
    "attestedAt": 1786060800,
    "collector": { "name": "…", "version": "…", "configHash": "<hex32>" }
  },
  "envelope": {                    // DSSE, ed25519
    "payloadType": "application/vnd.zkuat.statement+json",
    "payload": "<base64 canonical statement>",
    "signatures": [{ "keyid": "<hex32>", "sig": "<base64>" }]
  },
  "attestorPublicKey": { "alg": "ed25519", "attestor": "…", "keyid": "…", "spki": "<base64>" },
  "sigstore": null                 // filled by attest.yml if it ever runs
}
```

`statement.collector.configHash` answers gap 4 in
`../docs/02-threat-model.md` — *"a vendor could configure a scanner with every
rule disabled and honestly attest zero findings"* — so a record can mean "ran
collector v0.1.0 with config hash 0xabc…" rather than something absolute. It
lives in the private statement because adding it to `Evidence` would re-key
every leaf.

## Tests

```bash
npm test        # 138
```

Canonical-JSON determinism, DSSE round trip and tamper detection, leaf agreement
with `pureCircuits`, the predicate leak guard, every `normalize` rejection, and
**every committed fixture re-verifying**.

That last one is the tripwire for a Track A schema change: `Evidence` is
committed to as a whole, so one added field changes every leaf, and these tests
fail here in seconds instead of silently at the integration checkpoint.
