# `@zkuat/cli` — anchor, prove, status

The fallback proof path. If wallet wiring dies at 12:40, these three commands still execute the whole
protocol against a real chain with real ZK proofs; the pitch then *describes* the vendor/buyer
asymmetry instead of showing it. A degraded demo, not a failed one.

They also map onto the three roles, which is the clearest way to read them:

| Command | Role | Holds | Sees |
|---|---|---|---|
| `anchor` | operator | the anchor secret | repo, commit, a commitment — **not the findings** |
| `prove` | vendor | the evidence and its salt | everything, privately |
| `status` | buyer | nothing | a verdict, a policy, two dates |

⚠️ **Local devnet only.** The wallet is the well-known genesis seed from the node's `dev` preset.
Never point this at preview, preprod, or anything holding value.

## Install

Order is load-bearing — every package below is a `file:` dependency, which npm symlinks without
installing its own dependencies:

```bash
npm --prefix ../contract install
npm --prefix ../attestor install
npm --prefix ../anchor   install
npm install
```

`postinstall` fails loudly if you skip a step. There is deliberately no `@midnight-ntwrk/*` dependency
here — see [`anchor/README.md`](../anchor/README.md#there-is-deliberately-no-midnight-ntwrk-dependency-here).

## Prerequisites

```bash
npm --prefix ../contract run devnet:up        # node, indexer, proof server
npm --prefix ../contract run compile:keys     # real proving keys, ~45 s
npm --prefix ../contract run devnet:deploy    # writes contract/.zkuat-devnet.json
```

## The three commands

### `zkuat anchor` — the operator

```bash
zkuat anchor --bundle ../demo/fixtures/bank-only/bundle.json \
             --repo acme-software/payment-engine --allow-unsigned
```

Verifies the bundle against a trusted attestor key, builds the four-key public predicate, checks the
Sigstore repo binding, enforces one anchor per `(repo, commit)`, submits `attest(leaf)`, and writes a
receipt recording the **leaf index**. Flags and the trust model: [`anchor/README.md`](../anchor/README.md).

`--allow-unsigned` is required for the committed fixtures — the repo is private, so nothing here is
Sigstore-signed. The output says `⚠ repo binding NOT CHECKED`, and means it.

### `zkuat prove` — the vendor

```bash
zkuat prove --bundle <path> --policy <bank-v1|enterprise-v1> --artifact <64-hex digest>
            [--vendor <name>] [--product <name>]
```

The bundle is **not optional and cannot be**: it carries the salt, and the salt is half of the
commitment the attestor signed. Without it there is no witness, no path, and no proof — ever. Losing a
salt makes its evidence unprovable permanently.

The leaf must already be anchored. That separation is the point: anchoring is the operator's trust
decision, proving is the vendor's claim, and they are different people holding different secrets.
`prove` runs with `secretKey: null` and never invokes the anchor witness.

`--vendor` / `--product` default to the evidence's own. Override one to watch the identity binding
reject the call — that is what stops a prover filing a record under a name the attestor never signed.

**Exit codes:** `0` the predicate passed · `1` it failed · `2` the circuit rejected the call.

The difference between 1 and 2 matters. `1` means a record *was written* saying `compliant: false` —
a non-compliant artifact is a legitimate, publicly recorded outcome, not an error. `2` means an assert
fired before the predicate and **no record exists**.

### `zkuat status` — the buyer

```bash
zkuat status --artifact <digest> [--policy <slug>]
```

One GraphQL query, no wallet, no proving, back in about a second. This is the entire public surface.

`--artifact` alone does not determine a record — the key is `recordKeyOf(artifactDigest, policyId)`,
so an artifact has one record *per policy*. Printing a row per registered policy is what makes the
two-policy contrast visible. Exit `0` if any policy is compliant, `1` otherwise.

## Verified end to end

Against a local devnet with real ZK proofs, 2026-08-07:

```
$ zkuat anchor --bundle ../demo/fixtures/bank-only/bundle.json \
               --repo acme-software/payment-engine --allow-unsigned
  ✓ attestor key     b19e0659001c81e2… (in the trust list)
  ✓ leaf             re-derived via pureCircuits.leafOf
  ✓ predicate        {leaf, repo, sha, schema} — no evidence leaked
  ⚠ repo binding     NOT CHECKED — offline-signed bundle
  anchored at index  0

$ zkuat prove --bundle ../demo/fixtures/bank-only/bundle.json --policy bank-v1 --artifact 7c41d9e2…
  → ✓ PASS                                                            exit 0

$ zkuat prove --bundle ../demo/fixtures/bank-only/bundle.json --policy enterprise-v1 --artifact 7c41d9e2…
  → ✗ FAIL                                                            exit 1

$ zkuat status --artifact 7c41d9e2…
  bank-v1         ✓ COMPLIANT      evidence 2026-08-07  valid until 2026-09-05  (policy v1)
  enterprise-v1   ✗ NOT COMPLIANT  evidence 2026-08-07  valid until 2026-09-05  (policy v1)
```

**The same signed evidence, two policies, opposite verdicts, and the buyer learns only the verdicts.**

Also confirmed: a second fixture anchored at index **1** and proven from it, so `pathForLeaf(index,
leaf)` works off the recorded index rather than passing by luck at zero; re-proving the same
`(leaf, policy)` exits `2` with `⛔ REJECTED by the circuit: "already proven"`; and
`npm --prefix ../contract run devnet:inspect` — Track A's independent reader — reports the same three
records, two leaves, and three nullifiers.

## Negative cases, all rejected before any chain work

```bash
# sigstore: null without --allow-unsigned
zkuat anchor --bundle ../demo/fixtures/bank-only/bundle.json --repo acme-software/payment-engine

# an attestor key outside the trust list
zkuat anchor --bundle … --repo … --allow-unsigned --trust /dev/null

# a (repo, commit) already anchored          → "already anchored … Pass --force"
# a bundle that was never anchored           → "leaf … is not anchored. Run: zkuat anchor …"
# a malformed artifact digest                → "artifactDigest must be 64 hex characters"
```

All exit `1`.

## Before the pitch

**Pre-anchor everything.** Live-anchoring on stage adds a network round trip and a failure mode for
zero narrative gain.

If the fixtures have gone stale, refresh them first — committed fixtures carry a pinned `generatedAt`
and eventually render as EXPIRED in the buyer view:

```bash
npm --prefix ../attestor run fixtures:refresh
```

Refreshing also yields new leaves and nullifiers, which is how to rehearse more than once past the
replay guard.
