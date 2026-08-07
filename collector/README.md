# `@zkuat/collector` — Track B

Runs supply-chain checks against a project and emits a **private** collector
report. The attestor normalizes and signs it; nothing here ever touches a chain.

## Install — `contract/` first

```bash
npm --prefix ../contract install      # ← required, and required FIRST
npm install
npx zkuat-collect --config zkuat.collector.json --out evidence-raw.json
```

`@zkuat/contract` reaches here through `@zkuat/attestor` as a `file:`
dependency, which npm symlinks without installing its dependencies. See
[`../attestor/README.md`](../attestor/README.md); `postinstall` catches it.

## What it measures

Every source below was verified reachable from a developer machine on
2026-08-07. Order is the value order for the two shipped §20 policies.

| Evidence field | Source | Notes |
|---|---|---|
| `artifactDigest` | streaming sha256 of `config.artifactPath` | **Mandatory** (§10). The only check that fails the run. |
| `criticals`, `highs` | `npm audit --json` → `metadata.vulnerabilities` | Exits **1 when it finds vulnerabilities** — the normal case. Read the JSON, ignore the code. |
| `vulnDeps` | count of entries in `vulnerabilities` | |
| `kev` | GHSA ids → `api.github.com/advisories` → CVE → ∩ CISA KEV catalogue | Two network hops. KEV cached 24 h; GHSA→CVE cached forever. |
| `forbiddenDeps` | `npm ls --all --json --package-lock-only` ∩ `config.forbiddenPackages` | §16. Reads the lockfile, so it works before `npm ci`. |
| `branchProtected` | `gh api repos/{o}/{r}/branches/{b}/protection` | A **404 is the answer `false`**, not an error. |
| `mfaRequired` | `gh api orgs/{owner}` → `two_factor_requirement_enabled` | Org-level only. A personal repo has no source — stubbed and labelled. |
| `ciGreen` | `gh api repos/{o}/{r}/commits/{sha}/check-runs` | All conclusions in {success, neutral, skipped}. No checks at all → `config.treatNoChecksAsGreen`. |
| `buildProvenanceVerified` | `gh api repos/{o}/{r}/attestations/sha256:{digest}` | **Presence only** — see below. |
| `coverage` | `coverage/coverage-summary.json`, else `lcov.info` | §18: *do not build a coverage pipeline for this.* |

### `buildProvenanceVerified` is a presence check, and says so

It asks GitHub whether an attestation *exists* for the digest. It does **not**
perform Sigstore verification, and in particular does not check that the OIDC
subject repo matches the predicate repo — the check
`../docs/05-implementation-plan.md` calls security-critical: *"without it, repo A
can attest for repo B and the whole trust chain is decorative."*

That verification is **Track C's anchor**, runs against our own predicate with
`@sigstore/verify`, and is where the trust decision is actually made. The
report's `source` field records the distinction so nobody reads more into the
value than it carries.

(`gh attestation verify` is not an option locally: `gh` here is 2.45.0 and the
subcommand landed in 2.49.0. The REST endpoint works on 2.45.)

## The degradation contract

Only `artifactDigest` can fail the run. Every other check degrades and says why:

```
✓ criticals                0            npm audit --json
~ mfaRequired              true         config (Rpetey317 is a User, not an organisation)
✗ branchProtected          false        gh api repos/…/protection
    ↳ proxyconnect tcp: dial tcp 127.0.0.1:1: connection refused
```

| Status | Means |
|---|---|
| `measured` | A real tool or API produced this. |
| `stubbed` | No source exists here; the value came from `config.stubs`. |
| `unavailable` | A source exists but failed — offline, rate-limited, unauthenticated. |

This is not laziness about error handling. This code runs at 02:00 the night
before a demo, on a laptop tethered to a phone, against a rate-limited API. A
collector that exits 1 because the CISA feed was slow is a collector that stops
the pitch. The honesty lives in the status field, and **`zkuat-attest` refuses
to sign a degraded report** unless someone passes `--allow-degraded` after
reading the list.

### An empty result is not the same as a clean result

Two bugs of this shape were found and fixed while exercising the offline path,
and both are worth knowing about before adding a check:

- **`kev`** must not report a measured `0` when `npm audit` failed. The advisory
  list is empty because nothing was scanned, not because nothing was found —
  and "no known-exploited vulnerabilities" is precisely what a buyer's policy
  checks. It now degrades when the scan did not run.
- **`forbiddenDeps`** must not report a measured `0` from `npm ls` output that
  parsed cleanly as `{"error":{"code":"ENOLOCK"}}`. That is valid JSON
  describing nothing, and claiming "none of the buyer's prohibited packages are
  present" having enumerated no packages is the same lie.

**When adding a check: an empty result and a failed measurement must never
produce the same status.**

## `detail` is private, and structurally so

Every check carries a `detail` field with the CVE identifiers, the matched
package names, and the total dependency count — exactly the over-disclosure this
project exists to prevent.

`normalize()` in `@zkuat/attestor` reads `.value` and nothing else. There is no
path from `detail` into the canonical evidence, the commitment, or the chain.
That is a property of the code, not a convention someone has to remember.

**The report file is written mode 0600. Do not attach it to an attestation, do
not upload it as a public CI artifact, do not paste it into an issue.**

## Config

See [`zkuat.collector.json`](zkuat.collector.json) for a worked example that
measures this repository. Keys starting with `_` are stripped before hashing, so
comments do not perturb `provenance.configHash`.

That hash pins **how** the facts were established and travels into the signed
statement — `../docs/02-threat-model.md` gap 4 asks for it, so a compliance
record can mean "ran collector v0.1.0 with config hash 0xabc…" rather than
something absolute. It covers `stubs` too, so a run that stubbed eight checks
hashes differently from one that measured them. That is the point.

`forbiddenPackages` is a **demo input** — keep it small and visible. A buyer's
real prohibited list would come from the buyer.

## Tests

```bash
npm test        # 27
```

Weighted toward the failure paths on purpose: the happy path runs on a developer
machine with a warm network, and the failure paths run at 02:00 — which is when
a wrong answer actually reaches a signature.
