/**
 * The Midnight SDK symbols the devnet scripts use, re-exported from inside this
 * package.
 *
 * ## Why this file exists
 *
 * The SDK loads a WASM module (`onchain-runtime-v3`). Two copies of it in one
 * process means two class registries, and an object minted by one fails every
 * `instanceof` check in the other — the failure mode is a successful deploy
 * followed by `expected instance of StateValue` on the first circuit call. The
 * `overrides` block in this package's `package.json` keeps the *version*
 * single; this file keeps the *instance* single.
 *
 * Packages outside `contract/` (the anchor, the CLI) cannot import
 * `@midnight-ntwrk/*` from their own trees: npm would install a second physical
 * copy under `<pkg>/node_modules`, Node would resolve it to a different real
 * path, and the two would not share a WASM instance. Importing this module by
 * relative source path instead makes the specifiers resolve from
 * `contract/node_modules`, where the rest of the contract already resolves
 * them.
 *
 * Nothing in this file has behaviour of its own. Add a re-export when an
 * out-of-tree caller needs another SDK symbol; do not add SDK dependencies to
 * the packages that consume it.
 */
import { WebSocket } from 'ws';

export { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
export { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
export { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

/**
 * Wallet sync needs a global `WebSocket`; Node has one natively from 22, but
 * the SDK is exercised against `ws` and this is the configuration the devnet
 * scripts have always run. Set on import so callers cannot forget.
 */
// @ts-expect-error assigning the ws implementation over the global
globalThis.WebSocket = WebSocket;
