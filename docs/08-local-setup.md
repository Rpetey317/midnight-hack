# Local runtime setup and operations

Only the zkuat runtime and proof server run locally. Preview/Preprod RPC and
indexer services remain hosted.

## Prerequisites

- Node.js 22+ and npm;
- a compatible `compact` CLI/compiler on `PATH`;
- Docker running and callable by the current user;
- a Preview or Preprod sponsor-wallet seed;
- unshielded NIGHT in that wallet so the SDK can register it and generate DUST;
- a deployed compatible evidence workflow in each repository used through the
  UI.

Check the local tools:

```bash
node --version
npm --version
compact --version
docker version
```

## Install and compile

From the repository root:

```bash
npm --prefix contract ci
npm --prefix contract run compile:keys
npm --prefix runtime ci
```

`compile:keys` regenerates the ignored proving/verifying assets and ZKIR below
`contract/src/managed/audit_registry/`. The runtime cannot deploy or prove with
only the committed JavaScript bindings.

Install the frontend separately only when developing it locally:

```bash
npm --prefix ui ci
```

## Create the private runtime configuration

```bash
mkdir -p ~/.zkuat/runtime
cp runtime/.env.example ~/.zkuat/runtime/.env
chmod 600 ~/.zkuat/runtime/.env
```

Before deployment, set at least:

```dotenv
ZKUAT_NETWORK=preview
ZKUAT_SPONSOR_WALLET_SEED=<hex-seed>
ZKUAT_RUNTIME_URL=http://127.0.0.1:4317
ZKUAT_ALLOWED_ORIGIN=https://zkuat.works
ZKUAT_PROOF_SERVER_URL=http://127.0.0.1:6300
ZKUAT_PROOF_SERVER_IMAGE=midnightntwrk/proof-server:8.1.0
```

The seed must contain 16–64 bytes represented as hex. An optional `0x` prefix is
accepted. `ZKUAT_RUNTIME_URL` combines host and port; there are no separate
runtime host/port variables. Runtime and proof-server URLs must remain loopback
HTTP origins.

For frontend development at `http://localhost:3000`, change the allowed origin:

```dotenv
ZKUAT_ALLOWED_ORIGIN=http://localhost:3000
```

## Deploy once

```bash
npm --prefix runtime run deploy
```

This command:

1. starts/reuses the local Docker proof server;
2. derives the sponsor wallet and waits for synchronization/DUST;
3. derives the Compact anchor witness from the same seed;
4. submits the contract deployment;
5. submits `registerPolicy` for each of the four bundled npm reference policies.

Copy the printed address into the env file:

```dotenv
ZKUAT_CONTRACT_ADDRESS=<hex-address>
```

Keep the same network and seed. The contract's sealed anchor identity makes a
different seed unable to attest or administer policies.

On first wallet use the SDK may submit a separate NIGHT UTXO registration
transaction before these five contract transactions and then wait for DUST to
accrue.

## Start and pair

```bash
npm --prefix runtime start
```

The terminal prints the loopback URL, six-digit pairing code, and allowed
origin. Leave the process running, open <https://zkuat.works/>, sign in with
GitHub, select a repository, request evidence, and enter the pairing code on the
attester page.

A web page cannot start the runtime or Docker on the user's machine. Pairing
only works after this process is running. Pairing tokens are not persisted, so
restart or page reload requires a new pairing.

## Run a proof

After evidence retrieval and pairing:

1. select one of the four bundled npm policies;
2. click **Generate proof**;
3. keep the tab and runtime process open while the job polls;
4. inspect the displayed anchor transaction, proof transaction, and final
   indexed record verdict.

The job is stored locally even though the UI polling state is transient. Real
completed jobs are not currently copied into Supabase, so the public verifier
will not automatically list them.

## Proof-server operations

```bash
cd runtime
npx tsx src/cli.ts proof-server start
npx tsx src/cli.ts proof-server status
npx tsx src/cli.ts proof-server stop
```

The runtime uses container name `zkuat-proof-server` and label
`works.zkuat.runtime=true`. It refuses to stop or reuse an existing unlabelled
container with that name. Its published port is bound to `127.0.0.1`.

Stopping the runtime does not stop the proof server. Stop it explicitly when it
is no longer needed.

## State and recovery

Default state:

```text
~/.zkuat/runtime/
├── .env
├── jobs/
├── private-state/
├── wallet-state/
└── runtime.lock
```

Only one runtime process may hold the lock. A stale lock is removed when its PID
no longer exists. Nonterminal jobs are re-queued on startup; terminal jobs remain
available through the authenticated API.

Back up the seed separately using an appropriate secret-storage mechanism. Job
files contain raw prepared evidence and salts, so do not upload the runtime
directory or put it in the repository.

## Health and troubleshooting

Unauthenticated health check:

```bash
curl http://127.0.0.1:4317/v1/health
```

Common failures:

- **contract address missing**: set the hexadecimal address printed by deploy;
- **anchor identity mismatch**: the configured seed does not match the deployer
  seed for that contract;
- **proof assets missing**: rerun `npm --prefix contract run compile:keys` and
  reinstall/relink runtime dependencies if needed;
- **proof server not ready**: inspect Docker and the named container, then use the
  status command;
- **wallet waits for DUST**: confirm the seed has unshielded NIGHT and allow time
  after first registration;
- **origin is not allowed**: make `ZKUAT_ALLOWED_ORIGIN` exactly match the page's
  origin, without a path;
- **pairing fails after restart**: use the newly printed code;
- **workflow/artifact mismatch**: verify the target repository implements the
  request-ID run name and artifact conventions;
- **job stays near verification**: hosted indexer finality/availability can lag;
  the runtime retries for roughly two minutes.

## Development verification

```bash
npm --prefix contract run typecheck
npm --prefix contract test
npm --prefix runtime run typecheck
npm --prefix runtime test
npm --prefix ui run lint
npm --prefix ui run build
```

Contract and runtime unit/simulator tests do not replace a funded live-network
deployment test.
