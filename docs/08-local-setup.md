# Local runtime setup and operations

Only the zkuat runtime and proof server run locally. Preview/Preprod RPC and
indexer services remain hosted.

## Prerequisites

- Docker Compose running with host networking and callable by the current user;
- permission to mount `/var/run/docker.sock` so the runtime container can manage
  the sibling proof-server container;
- a Preview or Preprod sponsor-wallet 24-word recovery phrase;
- unshielded NIGHT in that wallet so the SDK can register it and generate DUST;
- a deployed compatible evidence workflow in each repository used through the
  UI.

The container shares host networking because the runtime and proof-server URLs
are deliberately restricted to loopback. Enable host networking in Docker
Desktop if needed. Treat the Docker socket mount as root-equivalent access to
the host daemon and run only the published zkuat image or an image built from
trusted source.

Check the local tools:

```bash
docker version
docker compose version
```

## Runtime image

The publishing workflow compiles the contract with proving keys and packages all
required runtime assets. The root `compose.yml` pulls the current image
automatically.

No local Node.js or Compact installation is needed to run this image. The GHCR
package must be public for an unauthenticated pull; while it is private, log in
to `ghcr.io` with an account that has package read access.

Install the frontend separately only when developing it locally:

```bash
npm --prefix ui ci
```

## Create the private runtime configuration

```bash
cp runtime/.env.example runtime/.env
chmod 600 runtime/.env
```

Before deployment, set at least:

```dotenv
ZKUAT_NETWORK=preview
ZKUAT_SPONSOR_WALLET_SEED="<24-word-English-BIP-39-recovery-phrase>"
ZKUAT_RUNTIME_URL=http://127.0.0.1:4317
ZKUAT_ALLOWED_ORIGIN=https://zkuat.works
ZKUAT_PROOF_SERVER_URL=http://127.0.0.1:6300
ZKUAT_PROOF_SERVER_IMAGE=midnightntwrk/proof-server:8.1.0
```

The value must be a valid 24-word English BIP-39 recovery phrase. Keep it quoted
so dotenv and Compose preserve the spaces. The runtime validates its checksum
and decodes it to the original 32-byte wallet seed. The phrase grants control of
the sponsor wallet, so use a dedicated wallet and never commit or share this
file. `ZKUAT_RUNTIME_URL` combines host and port; there are no separate runtime
host/port variables. Runtime and proof-server URLs must remain loopback HTTP
origins.

For frontend development at `http://localhost:3000`, change the allowed origin:

```dotenv
ZKUAT_ALLOWED_ORIGIN=http://localhost:3000
```

## Deploy once

```bash
docker compose run --rm runtime deploy
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
docker compose up
```

The foreground logs print the loopback URL, `PAIRING CODE: 123456`, and allowed
origin. Leave Compose and the terminal running, open <https://zkuat.works/>, sign
in with GitHub, select a repository, request evidence, and enter the code on the
attester page.

For a detached container, follow the same log stream explicitly:

```bash
docker compose up --detach
docker compose logs --follow runtime
```

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
docker exec zkuat-runtime tsx src/cli.ts proof-server start
docker exec zkuat-runtime tsx src/cli.ts proof-server status
docker exec zkuat-runtime tsx src/cli.ts proof-server stop
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
├── jobs/
├── private-state/
├── wallet-state/
└── runtime.lock
```

Only one runtime process may hold the lock. A stale lock is removed when its PID
no longer exists. Nonterminal jobs are re-queued on startup; terminal jobs remain
available through the authenticated API.

The gitignored `runtime/.env` contains the sponsor recovery phrase; back it up
separately using an appropriate secret-storage mechanism. Job files contain raw
prepared evidence and salts, so do not upload the runtime state directory.

## Health and troubleshooting

Unauthenticated health check:

```bash
curl http://127.0.0.1:4317/v1/health
```

Common failures:

- **contract address missing**: set the hexadecimal address printed by deploy;
- **anchor identity mismatch**: the configured recovery phrase does not restore
  the sponsor wallet used to deploy that contract;
- **proof assets missing**: pull the current published image; for a source build,
  regenerate the assets with `npm --prefix contract run compile:keys` first;
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

These contributor checks require Node.js 22+, npm, and a compatible Compact
compiler; they are not runtime installation steps.

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
