/**
 * Single physical Midnight SDK entry point for packages that execute this
 * contract. Keeping generated contract values and SDK consumers on the same
 * dependency tree avoids duplicate WASM class registries.
 */
import { WebSocket } from 'ws';

// @ts-expect-error the wallet/indexer SDK expects the ws implementation globally
globalThis.WebSocket = WebSocket;

export { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
export { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
export { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
export { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
export { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
export { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
export { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
export * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
export {
  WalletFacade,
  DustWallet,
  HDWallet,
  Roles,
  ShieldedWallet,
  createKeystore,
  NoOpTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk';
export { ContractState } from '@midnight-ntwrk/compact-runtime';
export * as Rx from 'rxjs';
