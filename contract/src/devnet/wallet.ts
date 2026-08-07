/**
 * Wallet construction and provider wiring for the local devnet.
 *
 * Adapted from `app/src/wallet.ts` and `app/src/deploy.ts`, which are the
 * `create-mn-app` scaffold's versions and carry the hard-won details — the
 * DUST-registration double-signing trap, the block-timestamp lag before the
 * first transaction, the provider shapes that changed in Midnight.js 4.1.x.
 * Simplified here: one network, no state cache, no faucet polling.
 */
import { Buffer } from 'node:buffer';

import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
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
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import * as Rx from 'rxjs';

import { DEVNET, PRIVATE_STATE_PASSWORD, ZK_CONFIG_PATH } from './config.js';

export { unshieldedToken };

export interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
}

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

/** Poll the proof server from the host before submitting anything that needs proofs. */
export async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(DEVNET.proofServer, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      // Anything other than "nothing is listening" means it is up and simply
      // does not like a bare GET — which is fine.
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') {
        return true;
      }
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

export async function createWallet(seed: string): Promise<WalletContext> {
  setNetworkId(DEVNET.networkId as any);

  const keys = deriveKeys(seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const wallet = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: DEVNET.indexer,
        indexerWsUrl: DEVNET.indexerWS,
      },
      provingServerUrl: new URL(DEVNET.proofServer),
      relayURL: new URL(DEVNET.node.replace(/^http/, 'ws')),
      txHistoryStorage: new NoOpTransactionHistoryStorage(),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    shielded: async (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: async (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: async (config) =>
      DustWallet(config).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/**
 * Register NIGHT UTXOs for DUST generation and wait for a positive balance.
 *
 * The `signDustRegistration` callback already produces a recipe with N
 * signatures matching N inputs. Do **not** call `signRecipe` afterwards — that
 * double-signs and the chain rejects with `InputsSignaturesLengthMismatch`
 * (custom error 192).
 */
export async function ensureDust(ctx: WalletContext): Promise<void> {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  const unregistered = state.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  if (unregistered.length > 0) {
    console.log(`  Registering ${unregistered.length} NIGHT UTXOs for DUST generation...`);
    const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      ctx.unshieldedKeystore.getPublicKey(),
      (payload) => ctx.unshieldedKeystore.signData(payload),
    );
    await ctx.wallet.submitTransaction(await ctx.wallet.finalizeRecipe(recipe));
  }

  if (state.dust.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST...');
    await Rx.firstValueFrom(
      ctx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
  console.log('  DUST ready.');
}

export function createProviders(ctx: WalletContext) {
  const walletProvider = {
    // In Midnight.js 4.1.x the WalletProvider interface returns the key objects
    // directly — no longer hex strings.
    getCoinPublicKey: () => ctx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => ctx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      // balanceUnboundTransaction -> finalizeRecipe is the complete balancing
      // path in wallet-sdk 1.x; the earlier explicit signRecipe step is gone.
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => ctx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'zkuat-state',
      accountId: ctx.unshieldedKeystore.getBech32Address().toString(),
      privateStoragePasswordProvider: () => PRIVATE_STATE_PASSWORD,
    }),
    publicDataProvider: indexerPublicDataProvider(DEVNET.indexer, DEVNET.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(DEVNET.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

/**
 * Retry a transaction through the DUST-shortage window.
 *
 * The wallet's reported DUST balance is a *time projection* of what its
 * registered NIGHT will eventually generate; the tx builder spends only what the
 * next block's timestamp accounts for, which lags wall-clock by about one block
 * on a fresh devnet. A short pause before the first attempt closes the common
 * case; this loop covers the outliers.
 */
export async function withDustRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 20,
  delayMs = 5000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const message = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
      const isDustShortage =
        message.includes('Not enough Dust') ||
        message.includes('Insufficient Funds') ||
        message.includes('could not balance dust');

      if (!isDustShortage || attempt === maxAttempts) throw err;
      if (attempt > 1) console.log(`  ${label}: still generating DUST (attempt ${attempt})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`${label}: exhausted DUST retries`);
}
