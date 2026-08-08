# zkuat

zkuat turns the JSON artifact produced by `.github/workflows/generate-evidence.yml` into a
private Midnight contract input, generates a proof on the user's machine, pays
the two required transactions from one local sponsor wallet, and verifies the
result through the hosted indexer.

The deployed site remains the user interface. It dispatches the repository
workflow and retrieves `evidence.json`; it never holds the sponsor wallet seed.
`@zkuat/runtime` is the loopback-only companion process that owns the wallet,
the local Docker proof server, private evidence, and transaction submission.

## Packages

| Path | Purpose |
| --- | --- |
| `ui/` | Existing Next.js application deployed at <https://zkuat.works/> |
| `runtime/` | Evidence validation, local proof server, jobs, sponsor wallet, chain calls, and verification API |
| `contract/` | Compact contract, witnesses, canonical encoding, policies, and generated contract code |

The former signing, anchor-service, relayer, and standalone CLI packages have
been removed. Evidence is not signed locally; it is parsed directly and used as
private contract input. The contract's sealed anchor check remains in place.

## Runtime setup

Requirements: Node.js 22+, Docker, and a funded Preview or Preprod Midnight
wallet seed.

```bash
npm --prefix contract install
npm --prefix contract run compile:keys
npm --prefix runtime install

mkdir -p ~/.zkuat/runtime
cp runtime/.env.example ~/.zkuat/runtime/.env
chmod 600 ~/.zkuat/runtime/.env
```

Set the sponsor seed and network in `~/.zkuat/runtime/.env`, then deploy once:

```bash
npm --prefix runtime run deploy
```

Copy the printed address into `ZKUAT_CONTRACT_ADDRESS`, then start the runtime:

```bash
npm --prefix runtime start
```

The runtime prints a six-digit pairing code. It binds only to the loopback URL
configured by `ZKUAT_RUNTIME_URL` and accepts browser requests only from
`ZKUAT_ALLOWED_ORIGIN`.

## Per-proof transaction flow

1. `attest(leaf)` anchors the salted evidence commitment.
2. `proveCompliance(...)` generates and submits the zero-knowledge proof and
   writes the public compliance record.
3. The runtime queries the transaction and contract record through the indexer.
   This verification is read-only and does not create a third transaction.

That is exactly two transactions per requested proof. Contract deployment and
the two initial policy registrations are one-time setup transactions.

See [runtime/README.md](runtime/README.md) for API and operations, and
[docs/README.md](docs/README.md) for architecture and contract details.
