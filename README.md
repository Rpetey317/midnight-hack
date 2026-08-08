# zkuat

zkuat is a hackathon implementation of privacy-preserving software compliance
on Midnight. A repository workflow measures a build, a companion process on the
vendor's machine turns the resulting JSON into private Compact input, and the
chain publishes only the artifact identity, policy, validity window, and
compliance verdict.

The hosted application is available at <https://zkuat.works/>. Neither the
auditee nor the auditor connects a browser wallet. One locally configured
sponsor wallet pays DUST for deployment and proof transactions.

## Repository map

| Path | Current responsibility |
| --- | --- |
| `ui/` | Next.js 16 application deployed on Vercel; GitHub OAuth, repository selection, workflow dispatch/artifact retrieval, local-runtime pairing, and the Supabase-backed demo/read-model UI |
| `runtime/` | `@zkuat/runtime`, a loopback-only Node.js companion; validates evidence, manages the Docker proof server and sponsor wallet, submits transactions, and verifies results through the Midnight indexer |
| `contract/` | `@zkuat/contract`; Compact source, generated bindings, canonical evidence encoding, witnesses, bundled policies, and simulator tests |
| `.github/workflows/generate-evidence.yml` | The compatible evidence workflow for this repository; it audits the `ui/` package and uploads `evidence.json` |
| `docs/` | Current architecture, evidence, contract, setup, and product documentation |

The runtime contains all local collection, proof-server, wallet, transaction,
and verification responsibilities. Evidence is not signed by zkuat; the
hackathon trust model accepts GitHub Actions as the measurement environment.

## Implemented flow

1. The signed-in vendor selects a repository in the hosted UI.
2. A Vercel server action dispatches `generate-evidence.yml` with a request UUID,
   polls the matching run, downloads its one-day artifact, and returns the JSON
   and run metadata to the vendor's browser.
3. The browser pairs with `http://127.0.0.1:4317` using the six-digit code printed
   by the local runtime.
4. The runtime validates the evidence and supplied GitHub metadata, records a
   policy-specific validity window, adds a fresh salt, and persists the
   private job with owner-only filesystem permissions.
5. The runtime starts or reuses its labeled Docker proof-server container and
   synchronizes the sponsor wallet.
6. `attest(leaf)` anchors the evidence commitment in the contract's historic
   Merkle tree.
7. `proveCompliance(...)` proves membership and evaluates the selected public
   policy, then writes the public compliance record.
8. The runtime polls the hosted indexer, checks the successful
   `proveCompliance` call, and verifies the indexed record fields and verdict.

Raw evidence is private from the chain and public verifier, but it is visible to
the authenticated Vercel request path and the vendor's browser before being sent
to the local runtime. The runtime does not independently fetch the artifact from
GitHub.

## Transaction count

Each proof job makes exactly two contract calls:

1. `attest`
2. `proveCompliance`

The final verification is an indexer read, not a third transaction. On a
sponsor wallet's first use, the wallet SDK may also submit a one-time NIGHT UTXO
registration transaction so the wallet can generate DUST. Initial deployment is
one contract deployment plus four `registerPolicy` transactions.

## Quick start

Requirements:

- Node.js 22 or newer and npm;
- the Compact CLI/compiler on `PATH`;
- Docker;
- a Preview or Preprod sponsor seed with unshielded NIGHT available for DUST.

From the repository root:

```bash
npm --prefix contract ci
npm --prefix contract run compile:keys
npm --prefix runtime ci

mkdir -p ~/.zkuat/runtime
cp runtime/.env.example ~/.zkuat/runtime/.env
chmod 600 ~/.zkuat/runtime/.env
```

Set `ZKUAT_NETWORK` and `ZKUAT_SPONSOR_WALLET_SEED` in the private env file.
Deploy once:

```bash
npm --prefix runtime run deploy
```

Copy the printed hexadecimal address into `ZKUAT_CONTRACT_ADDRESS`, then start
the companion:

```bash
npm --prefix runtime start
```

Open <https://zkuat.works/>, request evidence, enter the printed pairing code,
select a policy, and start the proof job. The sponsor seed stays in
`~/.zkuat/runtime/.env`; never put it in Vercel or a `NEXT_PUBLIC_*` variable.

## Verification during development

```bash
npm --prefix contract run typecheck
npm --prefix contract test
npm --prefix runtime run typecheck
npm --prefix runtime test
npm --prefix ui run lint
npm --prefix ui run build
```

## Current hackathon limitations

- The hosted dashboard, policy pages, and public verifier read Supabase rows and
  local UI policy fixtures; they do not query Midnight directly.
- A completed runtime job is displayed in the current browser session but is not
  yet copied into the UI's `artifacts` or `proof_activity` tables.
- The UI contains a demo seeder with synthetic transaction hashes. The local
  runtime's indexer verification is the authoritative check for a real job.
- Policy registration is fixed to the four bundled npm reference policies during deploy.
- One local sponsor wallet and one serialized filesystem-backed job queue are
  intentional hackathon tradeoffs.

See [the documentation index](docs/README.md),
[runtime operations](runtime/README.md), [the contract package](contract/README.md),
and [the frontend package](ui/README.md).
