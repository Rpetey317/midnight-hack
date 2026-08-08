# @zkuat/runtime

The runtime is a local, loopback-only companion for <https://zkuat.works/>. It
owns the sponsor wallet, starts the Docker proof server, persists private jobs,
submits both blockchain transactions, and verifies the resulting transaction
and compliance record through the hosted indexer.

There is no hosted relayer and no browser wallet connection.

## Configuration

By default configuration is read from `~/.zkuat/runtime/.env`:

```dotenv
ZKUAT_NETWORK=preview
ZKUAT_SPONSOR_WALLET_SEED=<32-to-128-hex-characters>
ZKUAT_CONTRACT_ADDRESS=<deployed-contract-address>
ZKUAT_RUNTIME_URL=http://127.0.0.1:4317
ZKUAT_ALLOWED_ORIGIN=https://zkuat.works
ZKUAT_PROOF_SERVER_URL=http://127.0.0.1:6300
ZKUAT_PROOF_SERVER_IMAGE=midnightntwrk/proof-server:8.1.0
```

Optional hosted-service overrides are `ZKUAT_INDEXER_HTTP_URL`,
`ZKUAT_INDEXER_WS_URL`, and `ZKUAT_NODE_URL`. `ZKUAT_STORAGE_DIR` changes the
private state directory.

The runtime and proof-server URLs must use a loopback hostname. Keep the env
file mode `0600`; never copy the sponsor seed into Vercel.

## Commands

```bash
npm run deploy
npm start
npx tsx src/cli.ts proof-server start
npx tsx src/cli.ts proof-server status
npx tsx src/cli.ts proof-server stop
```

`deploy` derives the contract anchor secret from the sponsor seed, deploys the
contract, and registers `bank-v1` and `enterprise-v1`. Deployment and runtime
must use the same seed.

## HTTP API

Unauthenticated:

- `GET /v1/health`
- `POST /v1/pair` with `{ "code": "123456" }`

All other routes require `Authorization: Bearer <paired-token>`:

- `POST /v1/jobs` submits the GitHub evidence response plus `policySlug`.
- `GET /v1/jobs` and `GET /v1/jobs/:id` return redacted job state.
- `GET /v1/jobs/:id/events` streams state using server-sent events.
- `POST /v1/jobs/:id/cancel` requests cancellation between stages.
- `/v1/proof-server/start|stop|status` manages only the labeled runtime container.
- `GET /v1/wallet/status` returns address and balances, never key material.

Jobs are serialized because they share one wallet and private-state store. Job
files, wallet state, and Compact private state are kept below
`~/.zkuat/runtime` with owner-only permissions. Public job responses omit the
evidence, salt, Merkle path, and wallet seed.
