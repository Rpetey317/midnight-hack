# zkuat web application

This is the Next.js 16 frontend deployed at <https://zkuat.works/>. It handles
GitHub authentication, repository selection, evidence-workflow orchestration,
local-runtime pairing, proof-job progress, policy presentation, and the current
Supabase-backed dashboard/verifier experience.

It never contains the sponsor recovery phrase or wallet seed and does not
connect a browser wallet.

## Current routes

| Route | Purpose |
| --- | --- |
| `/` | Product explanation and GitHub sign-in |
| `/dashboard` | Authenticated repository workspace backed by Supabase |
| `/attester/[product]` | Pair the local runtime, dispatch evidence, inspect the returned JSON, select a policy, and run a proof job |
| `/policies` and `/policies/[id]` | Display the four bundled policy fixtures mirrored from `contract/src/encoding.ts` |
| `/verify` and `/verify/[id]` | Public lookup over Supabase `proof_activity` rows |
| `/auth/callback` | Supabase GitHub OAuth callback |

## Evidence and runtime flow

The `requestRepositoryEvidence` server action uses the signed-in user's GitHub
provider token to:

1. dispatch `generate-evidence.yml` on the repository's default branch with a
   request UUID;
2. poll the matching `workflow_dispatch` run for up to ten minutes;
3. require a successful conclusion;
4. download `zkuat-evidence-<request-id>`;
5. extract and parse `evidence.json` from the ZIP response.

The UI requires pairing before it enables the evidence request. The JSON and
run/artifact metadata are returned to the vendor's browser, which sends them
directly to the paired local runtime and polls the job until `verified`,
`rejected`, `failed`, or `cancelled`.

The browser stores the pairing token only in React state. A page reload or
runtime restart requires pairing again.

## Required target-repository workflow

Every repository selected in the UI must expose a compatible workflow file,
normally `.github/workflows/generate-evidence.yml`. It must:

- accept the optional `workflow_dispatch` input `request_id`;
- include the request ID in the run name so the UI can find the run;
- upload an artifact named `zkuat-evidence-<request-id>`;
- put `evidence.json` at the ZIP root;
- emit the exact schema accepted by `runtime/src/github-evidence.ts`.

This repository's workflow audits the `ui/` package. A different target
repository may adapt the measurement steps but must preserve the handoff schema.
`GITHUB_EVIDENCE_WORKFLOW` can override the workflow filename in the Vercel
environment.

## Configuration

The frontend requires:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# Optional; defaults to generate-evidence.yml
GITHUB_EVIDENCE_WORKFLOW=generate-evidence.yml
```

Supabase must have GitHub authentication configured and expose the existing
`midnight` schema used by the code. That schema contains `products`, `artifacts`,
and `proof_activity` tables with the columns represented in
`src/lib/queries.ts`. Database migrations and OAuth-provider configuration are
not currently included in this repository.

The GitHub session must expose a `provider_token` with enough access to list the
selected repository, dispatch its Actions workflow, inspect runs/artifacts, and
download the artifact. If the token is missing, sign out and complete GitHub
sign-in again.

The root Compose configuration accepts both the production origin
`https://zkuat.works` and local frontend origin `http://localhost:3000`.

## Install and run

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. Start `@zkuat/runtime` separately; an HTTPS or
localhost page cannot launch a native process or Docker container on the user's
machine.

## Checks

```bash
npm run lint
npm run build
```

## Current implementation boundary

The real runtime path submits and verifies Midnight transactions, but it does
not yet persist its final job into Supabase. Consequently:

- the completed result and transaction IDs are shown in the current attester
  session only;
- the dashboard's stored artifacts/proofs are not automatically updated by a
  real runtime job;
- public verifier pages read Supabase, not the Midnight indexer;
- policy pages render the hard-coded mirror in `src/lib/demo.ts`, not contract
  ledger state;
- the demo seeder creates synthetic audit rows and transaction hashes.

For a real proof job, the local runtime's successful transaction/indexer check
is authoritative. The hosted public verifier is presently a hackathon UI/read-
model demonstration, not an independent chain verifier.

## Privacy boundary

Raw evidence never reaches Midnight or the public verifier, but it does pass
through the authenticated Vercel server action and is rendered to the vendor's
browser before local proving. "Private" in the current implementation means
private from the chain, auditor, and unauthenticated public—not exclusively
local to the proof-server process.
