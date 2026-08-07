/**
 * Local devnet configuration.
 *
 * ⚠️ LOCAL DEVNET ONLY. The seed below is the well-known genesis seed from the
 * node's `dev` chain preset, so the pre-minted NIGHT is immediately spendable
 * with no faucet. **Anyone running this devnet has full access to funds at this
 * seed.** Never use it against preview, preprod, mainnet, or anything holding
 * real value.
 *
 * The devnet itself is defined in `../../../app/docker-compose.yml` — node,
 * indexer, and proof-server, all pinned. See `docs/08-local-setup.md`.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENESIS_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';

export const DEVNET = {
  networkId: 'undeployed',
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node: 'ws://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
} as const;

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The compiler output directory: contains `contract/`, `keys/`, and `zkir/`.
 * `NodeZkConfigProvider` reads proving keys from here, so it must have been
 * produced by `npm run compile:keys` — a `--skip-zk` build has no `keys/`.
 */
export const ZK_CONFIG_PATH = path.resolve(here, '..', 'managed', 'audit_registry');

/** Where `deploy.ts` records the contract address for `demo.ts` to pick up. */
export const STATE_FILE = path.resolve(here, '..', '..', '.zkuat-devnet.json');

/** Identifier under which this contract's private state is stored. */
export const PRIVATE_STATE_ID = 'zkuatPrivateState';

/**
 * The SDK requires the private-state password to be at least 16 characters.
 * Local devnet only — set PRIVATE_STATE_PASSWORD for anything else.
 */
export const PRIVATE_STATE_PASSWORD =
  process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

/**
 * The anchor operator's secret. Whoever holds this at deployment becomes the
 * anchor permanently — the ledger field is `sealed`. Demo value; a real
 * deployment generates this randomly and keeps it out of the repo.
 */
export const ANCHOR_SECRET = new Uint8Array(32).fill(0xa1);
