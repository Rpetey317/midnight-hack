# `@zkuat/runtime`

`@zkuat/runtime` is zkuat's local sponsor companion. The hosted browser UI pairs
with it over loopback; the runtime owns the sponsor wallet, filesystem private
state, Docker proof server, contract calls, and post-submit indexer checks.

The auditee starts this process on the machine where proving should occur; the
browser does not connect a wallet.

## Responsibilities

- accept only requests from the configured web origin;
- exchange the six-digit startup code for an in-memory bearer token;
- strictly parse the supplied GitHub evidence and matching run/artifact metadata;
- generate a fresh evidence salt and canonical Compact commitment;
- persist private jobs with owner-only permissions and process them serially;
- start or reuse the labeled `zkuat-proof-server` Docker container;
- derive and synchronize the sponsor wallet, register NIGHT for DUST generation
  when necessary, and persist wallet synchronization state;
- verify the configured contract's sealed anchor identity;
- submit `attest` and `proveCompliance`;
- verify transaction success and the indexed compliance record.

The runtime does not call GitHub. It validates the payload forwarded by the
paired frontend, so GitHub provenance is a hackathon trust assumption rather
than independently verified attestation.

## Requirements

- Docker Compose with host networking available to the current user;
- permission to mount `/var/run/docker.sock`, which lets the runtime container
  manage the sibling proof-server container;
- a Preview or Preprod seed with unshielded NIGHT available for DUST;
- network access to the selected Midnight RPC/indexer.

The runtime requires host networking because both configured local URLs are
loopback-only. Enable host networking in Docker Desktop if your installation
does not expose it by default. Mounting the Docker socket is effectively
root-equivalent access to the host Docker daemon; use the published zkuat image
or an image you built from trusted source.

## Configuration

The default configuration file is `~/.zkuat/runtime/.env`. Process environment
variables override values in the file.

```dotenv
ZKUAT_NETWORK=preview
ZKUAT_SPONSOR_WALLET_SEED=<32-to-128-hex-characters>
ZKUAT_CONTRACT_ADDRESS=<deployed-contract-address>
ZKUAT_RUNTIME_URL=http://127.0.0.1:4317
ZKUAT_ALLOWED_ORIGIN=https://zkuat.works
ZKUAT_PROOF_SERVER_URL=http://127.0.0.1:6300
ZKUAT_PROOF_SERVER_IMAGE=midnightntwrk/proof-server:8.1.0
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `ZKUAT_NETWORK` | Yes | `preview` or `preprod` |
| `ZKUAT_SPONSOR_WALLET_SEED` | Yes | 16–64 bytes encoded as hex; optional `0x` prefix is accepted |
| `ZKUAT_CONTRACT_ADDRESS` | For `start` | Hexadecimal address printed by `deploy` |
| `ZKUAT_RUNTIME_URL` | No | Loopback HTTP origin containing both bind host and port; default `http://127.0.0.1:4317` |
| `ZKUAT_ALLOWED_ORIGIN` | No | Exact browser origin allowed by CORS; default `https://zkuat.works` |
| `ZKUAT_PROOF_SERVER_URL` | No | Loopback HTTP origin; default `http://127.0.0.1:6300` |
| `ZKUAT_PROOF_SERVER_IMAGE` | No | Docker image; default `midnightntwrk/proof-server:8.1.0` |
| `ZKUAT_INDEXER_HTTP_URL` | No | Override the selected network's hosted GraphQL endpoint |
| `ZKUAT_INDEXER_WS_URL` | No | Override the selected network's hosted GraphQL WebSocket endpoint |
| `ZKUAT_NODE_URL` | No | Override the selected network's hosted RPC endpoint |
| `ZKUAT_STORAGE_DIR` | No | State root; default `~/.zkuat/runtime` |

Both local service URLs must use plain HTTP on `127.0.0.1`, `localhost`, or
loopback IPv6. Keep the env file mode `0600`. Never copy the seed into Vercel,
Supabase, browser storage, or source control.

## Configure and deploy

From the repository root:

```bash
mkdir -p ~/.zkuat/runtime
cp runtime/.env.example ~/.zkuat/runtime/.env
chmod 600 ~/.zkuat/runtime/.env
```

After setting the network and seed, deploy once:

```bash
docker compose run --rm runtime deploy
```

Deployment starts the proof server, deploys the contract with the derived anchor
identity, and submits four policy-registration calls for the bundled npm
reference policies. Copy the printed address into `ZKUAT_CONTRACT_ADDRESS`. The
runtime must continue using the same network and seed.

## Start the container

```bash
docker compose up
```

The image defaults to the `start` command. Compose runs it in the foreground and
streams the startup banner to the terminal:

```text
zkuat runtime listening at http://127.0.0.1:4317
PAIRING CODE: 123456
allowed origin: https://zkuat.works
```

Leave that terminal attached while using the UI. `start` acquires
`runtime.lock`, listens only on the configured loopback origin, prints a fresh
pairing code, and queues persisted nonterminal jobs for recovery. Pairing tokens
live only in process memory and are invalid after a restart.

If the container must run detached, start it and immediately follow its logs:

```bash
docker compose up --detach
docker compose logs --follow runtime
```

The pairing code remains in the retained Docker logs and can also be retrieved
without following:

```bash
docker compose logs runtime 2>&1 | grep "PAIRING CODE"
```

## Proof-server commands

While the runtime container is running:

```bash
docker exec zkuat-runtime tsx src/cli.ts proof-server start
docker exec zkuat-runtime tsx src/cli.ts proof-server status
docker exec zkuat-runtime tsx src/cli.ts proof-server stop
```

The runtime does not automatically stop the proof-server container on shutdown.
The explicit stop command only stops a container carrying the zkuat ownership
label; it refuses to control an unrelated container with the same name.

## Job lifecycle

Jobs move through validation, persistence, proof-server startup, wallet sync,
anchor identity checking, anchoring, Merkle-path confirmation, proving,
submission, and on-chain verification. One promise queue serializes all jobs
because they share a sponsor wallet and private-state store.

A successful policy predicate ends as `verified`; a valid proof with
`compliant=false` ends as `rejected`. Transport, proof, contract, or indexer
errors end as `failed`. Cancellation is observed between stages and cannot
reverse a transaction already submitted.

Each job normally creates two contract transactions. First-time DUST setup can
add a separate NIGHT-registration transaction before them. Indexer verification
polls for up to roughly two minutes and creates no transaction.

## HTTP API

Unauthenticated routes:

- `GET /v1/health`
- `POST /v1/pair` with `{ "code": "123456" }`

All remaining routes require `Authorization: Bearer <paired-token>`:

- `POST /v1/jobs`
- `GET /v1/jobs`
- `GET /v1/jobs/:id`
- `GET /v1/jobs/:id/events` using server-sent events
- `POST /v1/jobs/:id/cancel`
- `POST /v1/proof-server/start`
- `POST /v1/proof-server/stop`
- `GET /v1/proof-server/status`
- `GET /v1/wallet/status`

The job-creation body contains `evidence`, `requestId`, completed GitHub run
metadata, artifact metadata, and `policySlug`. Public job responses omit the raw
evidence, salt, Merkle path, and sponsor seed.

## Local state

The default state tree is:

```text
~/.zkuat/runtime/
├── .env
├── jobs/<uuid>.json
├── private-state/zkuat/
├── wallet-state/<network>.json
└── runtime.lock
```

Directories are forced to mode `0700`; JSON files and the process lock are mode
`0600`. Job files intentionally contain the prepared evidence, salt, and leaf,
so treat the entire storage directory as sensitive. Wallet state is a sync
cache, while Compact private state is password-protected using a value derived
from the sponsor seed.

## Development checks

Source development requires Node.js 22+, npm, the compatible Compact compiler,
and a repository-root image build:

```bash
npm --prefix contract ci
npm --prefix contract run compile:keys
docker build -f runtime/Dockerfile -t zkuat-runtime .
```

From `runtime/`, run:

```bash
npm run typecheck
npm test
```

The runtime tests use fakes for GitHub payloads, proof-server behavior, chain
jobs, and indexer responses; they do not submit live network transactions.

The release workflow performs those source-build steps and publishes
`ghcr.io/rpetey317/zkuat-runtime:latest`, including the proving keys and ZKIR.
The image must be built from the repository root because the runtime's local
package dependency resolves `../contract`.
