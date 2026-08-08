# Four-minute demo video

A demo-only screencast — no slides. `slides/slides.md` is a separate artifact: a
four-minute *pitch* whose live-demo block runs 2:00–3:30. This video spends all
four minutes on the product and reuses the deck's best lines.

Recorded against a **local Midnight devnet**, driving the **hosted UI at
zkuat.works**. Only the runtime is local — which is the architecture, not a
shortcut.

## Surfaces

| Surface | Shows |
| --- | --- |
| Browser | `zkuat.works` and GitHub |
| Terminal | runtime startup banner and `zkuat-runtime ledger` |
| Editor | `contract/src/audit_registry.compact` |

Wait times are cut in the edit. A warm job takes ~50–90s of real time (measured
below); the video never shows it.

## Beat sheet

### 0:00–0:18 — The problem · zkuat.works landing hero

> "Every enterprise security review asks the same thing: prove your code is
> healthy. Today that means handing over your source, your CI logs, and your
> vulnerability findings — a map of your weak points, sitting in fifty
> customers' shared drives. **The buyer never needed any of that. They needed a
> boolean.**"

The line the whole video rests on. Say it slowly, then stop.

### 0:18–0:45 — What CI measures · GitHub → `acme-payments-sdk` → `.github/workflows/generate-evidence.yml`

Scroll to the `evidence` object.

> "This is all zkuat asks of a vendor: a workflow in your own repo running your
> existing checks — `npm audit`, lint, build — and hashing the exact tarball
> you'd publish. That sha256 *is* the artifact identity; everything downstream
> is a claim about those bytes. **GitHub Actions is our trusted measurement
> environment — we don't prove your scanner was honest, we prove the policy was
> evaluated over the evidence it produced.**"

Adoption cost is near zero, and the trust assumption is stated by us, early,
unprompted.

### 0:45–1:15 — Everything that stays private · dashboard → repo → Request validation

The workflow dispatches; the JSON lands in the evidence panel. Hold on it long
enough to read a number.

> "The workflow runs and the artifact comes back to my browser. Read it —
> vulnerability counts, severities, commit SHA, tarball digest. **This is the
> document that never leaves my machine.**"

### 1:15–1:35 — Pairing · split: terminal banner + browser pairing field

> "There is no browser wallet in this product. A companion process on my machine
> holds the sponsor wallet and does the proving. The page pairs with it over
> loopback with a six-digit code — that's the authorization to spend on my
> behalf. The evidence goes from my browser straight to `127.0.0.1`. It never
> touches a server again."

### 1:35–2:10 — Proving · policy dropdown → **npm Zero Known Vulnerabilities v1** → Generate proof

Name the states as they land: `anchoring` → `confirming-anchor` →
`retrieving-merkle-path` → `proving-compliance` → `verifying-on-chain` →
`verified`.

> "The runtime salts the evidence and commits to it — `persistentCommit` over
> the exact struct the circuit reads. That commitment, and *only* that, goes
> into a historic Merkle tree on Midnight. Then it proves, locally, on my
> machine, that the committed evidence satisfies the policy the buyer published.
> **Two transactions. Everything after that is a read.**"

Pick the strictest policy on camera. `acme-payments-sdk` passes
`npm-zero-known-vulns-v1`, which allows zero findings of any severity.

### 2:10–2:40 — Why this needs Midnight · `audit_registry.compact` lines 273–279

> "Here is the entire protocol in six lines. The buyer's thresholds on the
> right. My real numbers on the left. And **`disclose()` wraps the conjunction,
> never the operands.** One boolean comes out. Disclose them individually and
> you've leaked which control failed. This is the thing a public chain cannot do
> — evaluate a predicate over data it never sees."

The technical payload. Placed after proving, when the viewer wants to know what
was proven. Do not rush it.

### 2:40–3:10 — The public record · browser result, then `zkuat-runtime ledger`

```bash
npx tsx src/cli.ts ledger rpetey317/acme-payments-sdk
```

> "Verified. Two transaction hashes. And this is the **complete public state of
> the contract**, read from the indexer with no wallet and no secrets — the way
> a buyer reads it. Vendor. Product. Artifact digest. Policy and version. Proven
> at, valid until. One boolean. **Scroll it: the vulnerability count is not in
> here. It was never sent.**"

The money shot. The claim is only credible with the whole ledger on screen. The
command loads its configuration with `requireSeed: false` — it genuinely holds
no secret, which is worth saying out loud.

### 3:10–3:35 — The negative case · pre-recorded cut, `acme-checkout-widget`

Same policy, so the comparison is apples-to-apples.

> "Same flow, a repository that doesn't meet the policy. The chain records
> `false` — so a buyer can tell **'not compliant'** from **'no proof at all'**.
> And notice what it still doesn't say: *which* control failed. That stayed
> private too."

### 3:35–4:00 — Close · back to the landing page

> "The contract, the four reference policies, the local runtime and the hosted
> app work today against a live Midnight node. The honest gaps: we trust GitHub
> Actions to run the measurement — signing that is next — and the public
> dashboard still reads our database, not the chain. **Prove your security
> posture. Disclose nothing.** That's zkuat."

Naming the gap yourself is worth more than a judge finding it.

## Lines to land

- "The verifier never needed the evidence. They needed a boolean."
- "Two transactions. Everything after that is a read."
- "`disclose()` wraps the conjunction, never the operands."
- "GitHub Actions is our trusted measurement environment."
- "No browser wallet anywhere."
- "The vulnerability count is not in here."

## Do not say, do not show

- Not "the proof shows `npm audit` ran honestly". It shows that committed
  private values satisfy the policy predicate.
- Not `/verify/[id]` or `/policies` as chain-backed. Both read Supabase rows and
  hard-coded fixtures, and the demo seeder inserts **synthetic** transaction
  hashes. Use `zkuat-runtime ledger` as the buyer view instead.
- Not "the evidence is private from everyone". Vercel's authenticated request
  path and the vendor's browser both see it. It is private from the chain, the
  auditor, and the public.
- Not "the contract checks whether a record has expired". It bounds
  `validUntil - generatedAt` against the policy; the reader judges expiry.

## Demo repositories

Two sibling repositories of this one, pushed to the vendor's GitHub account. The
on-chain `vendor` is the repository owner and `product` is the repository name,
both lowercased.

| Repository | `npm audit` | lint | build | vs `npm-zero-known-vulns-v1` |
| --- | --- | --- | --- | --- |
| `acme-payments-sdk` | 0 findings | pass | pass | **compliant** |
| `acme-checkout-widget` | 1 critical, 1 total | pass | pass | **not compliant** |

`acme-checkout-widget` pins `minimist@1.2.0`. Its own code lints and builds
cleanly, so the story is "the code is fine, the dependency isn't" — and its one
critical fails all four bundled policies, so any policy chosen on camera comes
back red.

Both use a root-level copy of `generate-evidence.yml` (this repository's own
copy sets `working-directory: ui` and audits a Next.js app, which takes minutes).
With a lockfile and no build tooling, their runs finish in well under a minute.

> Re-verify `npm audit` on `acme-checkout-widget` on recording day. If the
> advisory has been withdrawn, change its `lint` script to `exit 1` instead:
> deterministic, offline, and the on-chain effect is identical — `compliant:
> false` with no indication of which control failed.

## Recording-day checklist

1. Devnet up: `app-node` (9944), `app-indexer` (8088), `app-proof-server` (6300).
2. **Redeploy for a clean ledger** (~1 minute) so `compliance records` starts at
   zero on camera and the demo's own record appears live:
   `npm --prefix runtime run deploy`, then update `ZKUAT_CONTRACT_ADDRESS`.
   Skip this and the ledger shows earlier rehearsal records too — including ones
   whose artifact digests differ, because `npm pack` on a GitHub runner does not
   reproduce a local tarball byte for byte.
3. Clear stale jobs: `rm -f ~/.zkuat/runtime/jobs/*.json`.
4. Run one throwaway job per repository so the wallet is synced and the proof
   server is warm. A cold first job spends ~30s in `syncing-wallet` that a warm
   one skips entirely.
5. Sign out of zkuat.works and sign back in **immediately before recording** —
   the GitHub `provider_token` exists only on a fresh session
   (`ui/src/app/actions.ts`).
6. Restart the runtime last and use the newly printed pairing code; tokens are
   in-memory and do not survive a restart.
7. `ZKUAT_ALLOWED_ORIGIN` must be exactly `https://zkuat.works`, no path.
8. Terminal font large enough for the ledger dump; browser zoom up; bookmarks
   bar and notifications off.
9. Keep `~/.zkuat/runtime/jobs/` off camera — those files hold raw evidence and
   salts by design.

## Measured timings

Full jobs against the local devnet (6s blocks), runtime and proof server on the
same machine:

| Phase | Cold | Warm |
| --- | --- | --- |
| `syncing-wallet` | ~32s | skipped |
| `anchoring` → `confirming-anchor` | ~24s | ~21s |
| `proving-compliance` → `verified` | ~31s | ~29s |
| **total** | **~88s** | **~51s** |
