# Runtime setup

The chain node and indexer are hosted Preview/Preprod services. Docker is used
only for the local proof server.

## Install and compile

```bash
npm --prefix contract install
npm --prefix contract run compile:keys
npm --prefix collector install
npm --prefix runtime install
```

## Create private configuration

```bash
mkdir -p ~/.zkuat/runtime
cp runtime/.env.example ~/.zkuat/runtime/.env
chmod 600 ~/.zkuat/runtime/.env
```

Edit the file with a funded sponsor wallet seed and `preview` or `preprod`.
`ZKUAT_RUNTIME_URL` contains both the bind address and port; there are no
separate host/port variables. It must remain loopback-only.

## Deploy once

```bash
npm --prefix runtime run deploy
```

Add the printed contract address to the env file. Deployment seals an anchor
identity derived from the same sponsor seed and registers both bundled policies.

## Start

```bash
npm --prefix runtime start
```

Open <https://zkuat.works/>, request GitHub evidence, and pair it with the code
printed by the runtime. The browser never receives the sponsor seed.

Runtime state is in `~/.zkuat/runtime`: job JSON, wallet synchronization state,
Compact private state, and a process lock. Stop with Ctrl-C; nonterminal jobs are
queued for recovery on the next start.
