# `@zkuat/anchor` — the trust boundary

This is the only component that decides **whether a leaf deserves to be on chain.**

The contract cannot make that decision. `attest(leaf)` receives 32 opaque bytes and has no way to
distinguish an honestly-verified commitment from an arbitrary one — that is the point of the
commitment, and it is also the system's residual trust assumption
([02-threat-model.md](../docs/02-threat-model.md) §3). The mitigation is that this package stays small
enough to audit in an afternoon. **Scope creep here is a security regression.** If you are adding a
feature, add it to `cli/`.

## What it checks, in cost order

| # | Check | Where | Fails when |
|---|---|---|---|
| 1 | The DSSE signature is from an attestor key **we trust** | `trust.ts` → `verifyBundle` | the keyid is not in the trust list |
| 2 | The public predicate leaks nothing private | `@zkuat/attestor` `assertNoEvidenceLeak` | any key outside `{leaf, repo, sha, schema}`, or any private value inside one |
| 3 | The Sigstore **OIDC subject repo == predicate repo** | `sigstore.ts` | the cert names a different repo, a different commit, or a different leaf |
| 4 | This `(repo, commit)` is not already anchored | `receipt.ts` | a receipt exists and `--force` was not passed |

Then, and only then, `attest(leaf)` (`submit.ts`).

Check 1 is not optional plumbing. Without a trust list, `verifyBundle` checks the signature against
the key the bundle *carries* — internal consistency, and nothing about who signed. Anyone can generate
a keypair, sign "zero criticals", and ship the public half alongside.

Check 3 is the security-critical one. Without it, repo A can attest for repo B and the whole chain is
decorative.

## Honest status of the Sigstore path

**The full-chain path has never run against a real Fulcio certificate.**

`Rpetey317/midnight-hack` is private, so GitHub artifact attestations are plan-gated and
`actions/attest` has never gone green. Every committed fixture carries `"sigstore": null`. What exists:

- `@sigstore/verify` 4.1.2 wiring — signature → Fulcio chain → Rekor — written against the installed
  package's own type definitions, not from memory. Untested end to end.
- `assertRepoBinding` and `repoClaims` — the comparator that carries the security property, and the
  certificate-extension decoding it depends on. **Unit-tested**, including the v1 (raw ASCII) and v2
  (DER `UTF8String`) extension encodings, a mismatched repo, a mismatched commit, and a certificate
  with no repo claim at all.
- `assertLeafBinding` — the attestation's own predicate leaf must equal ours. Without it, a genuine
  attestation from the right repo for a *different* artifact would authorise anchoring anything: the
  repo binding proves who, not what.

The null case is never silently tolerated. A bundle with no Sigstore material requires
`--allow-unsigned`, and the output says `⚠ repo binding NOT CHECKED` rather than a checkmark.

The Definition-of-Done line *"Anchor rejects a bundle whose OIDC repo ≠ predicate repo"* is
deliberately left **unticked** in [05-implementation-plan.md](../docs/05-implementation-plan.md). The
logic is there and tested at the comparator; the certificate is not.

`gh attestation verify` is not an alternative — `gh` is 2.45.0 and the subcommand landed in 2.49.0.

## Usage

```bash
zkuat-anchor --bundle <path> --repo <owner/name> [flags]
```

| Flag | |
|---|---|
| `--bundle <path>` | signed bundle from the attestor **(required)** |
| `--repo <owner/name>` | the repository the evidence is about **(required)** — evidence carries vendor and product, not a repo |
| `--sha <40hex>` | commit; defaults to the evidence's own |
| `--trust <a,b>` | attestor public keys to accept; defaults to every `*.pub.json` in `demo/keys/` |
| `--allow-unsigned` | accept a bundle with no Sigstore attestation |
| `--force` | re-anchor a `(repo, commit)` already on file |
| `--trusted-root <p>` | a Sigstore `TrustedRoot` JSON instead of fetching over TUF (also `ZKUAT_SIGSTORE_TRUSTED_ROOT`) |

Also available as `zkuat anchor` from [`cli/`](../cli).

## The receipt

`.zkuat-receipts.json`, gitignored, mode 0600, keyed `<repo>@<sha>`:

```jsonc
{
  "acme-software/payment-engine@9f2a1b3c…": {
    "leaf": "14cbf361…",        // hex, 32 bytes
    "index": 0,                  // → pathForLeaf(BigInt(index), leaf)
    "txId": "00e2b225…",
    "repo": "acme-software/payment-engine",
    "sha": "9f2a1b3c…",
    "contractAddress": "21bbe885…",
    "anchoredAt": 1786060800,
    "sigstore": "unsigned"       // or "verified"
  }
}
```

**The index is the reason this file exists.** `findPathForLeaf` is an O(n) scan of the whole tree;
`pathForLeaf(index, leaf)` is a direct lookup, and the index is only knowable at anchor time — it is
the tree's `firstFree()` in the moment before the insert. `submit.ts` reads it before `attest()` and
then confirms it with `pathForLeaf` afterwards rather than trusting it. If that confirmation fails it
records `-1`, and the prover falls back to the scan.

**What a receipt must never contain:** the salt, or anything from `statement.evidence`. The anchor
operator sees a repository, a commit, and a commitment — not the findings. A receipt carrying the salt
would also unblind the commitment for anyone who read the file. There is a test.

## Install

Order is load-bearing. `@zkuat/contract` and `@zkuat/attestor` are `file:` dependencies, so npm
symlinks them without installing *their* dependencies:

```bash
npm --prefix ../contract install
npm --prefix ../attestor install
npm install
```

`postinstall` fails loudly if you skip a step.

### There is deliberately no `@midnight-ntwrk/*` dependency here

The SDK loads a WASM module. Two copies of it in one process means two class registries, and an object
minted by one fails every `instanceof` check in the other — a successful deploy followed by `expected
instance of StateValue` on the first circuit call. The `overrides` block keeps the *version* single;
it cannot keep the *instance* single across two `node_modules` trees.

So `submit.ts` reaches the SDK through [`contract/src/devnet/sdk.ts`](../contract/src/devnet/sdk.ts),
by relative source path, and the specifiers resolve from `contract/node_modules` where the rest of the
contract already resolves them. **Do not add `@midnight-ntwrk` packages to this `package.json`.** Add
a re-export to `sdk.ts` if you need another SDK symbol.

Verify with:

```bash
find node_modules -name onchain-runtime-v3   # must print nothing
```

## Tests

```bash
npm test         # 12 assertions, no chain
npm run typecheck
```

The chain half is exercised end to end by the devnet run in [`cli/README.md`](../cli/README.md) — it
needs a node, an indexer, a proof server, and real proving keys, so it is not a unit test.

## Known wart

All four demo fixtures share one commit (`9f2a1b3c…`), because they are synthetic scenarios rather than
four real builds. The one-anchor-per-`(repo, commit)` rule therefore rejects the second and later
fixtures under the same `--repo`. Give each a distinct `--repo` — `acme-software/passes-both` and so
on — or pass `--force`.
