import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DustWallet,
  HDWallet,
  NoOpTransactionHistoryStorage,
  PublicKey,
  Roles,
  Rx,
  ShieldedWallet,
  UnshieldedWallet,
  WalletFacade,
  createKeystore,
  getNetworkId,
  ledger,
  setNetworkId,
} from '@zkuat/contract/sdk';

import type { RuntimeConfig } from './config.js';
import { atomicJsonWrite, ensurePrivateDir, readJson } from './storage.js';

interface PersistedWalletState {
  shielded?: unknown;
  unshielded?: unknown;
  dust?: string;
}

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('zkuat: invalid sponsor wallet seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('zkuat: wallet key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

export interface SponsorWalletStatus {
  started: boolean;
  synced: boolean;
  address: string | null;
  night: string | null;
  dust: string | null;
}

export class SponsorWallet {
  private context: {
    wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
    shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
    dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
    unshieldedKeystore: ReturnType<typeof createKeystore>;
  } | null = null;

  private readonly stateFile: string;

  constructor(private readonly config: RuntimeConfig) {
    this.stateFile = path.join(config.storageDir, 'wallet-state', `${config.network}.json`);
  }

  private loadState(): PersistedWalletState {
    return readJson<PersistedWalletState>(this.stateFile) ?? {};
  }

  private statePassword(): string {
    const digest = createHash('sha256')
      .update('zkuat:private-state:v1', 'utf8')
      .update(Buffer.from(this.config.sponsorSeed, 'hex'))
      .digest('hex');
    // The provider requires at least three character classes. The secret hash
    // supplies the entropy; this fixed prefix satisfies the format policy.
    return `Zk!${digest}`;
  }

  async start(): Promise<void> {
    if (this.context) return;
    setNetworkId(this.config.network);
    const keys = deriveKeys(this.config.sponsorSeed);
    const networkId = getNetworkId();
    const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
    const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
    const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);
    const saved = this.loadState();

    const configuration = {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: this.config.indexer,
        indexerWsUrl: this.config.indexerWS,
      },
      provingServerUrl: new URL(this.config.proofServer),
      relayURL: new URL(this.config.node.replace(/^http/, 'ws')),
      txHistoryStorage: new NoOpTransactionHistoryStorage(),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    };

    const wallet = await WalletFacade.init({
      configuration,
      shielded: async (walletConfig) => {
        const factory = ShieldedWallet(walletConfig);
        if (saved.shielded !== undefined) {
          try {
            return await (factory as any).restore(saved.shielded);
          } catch {
            // SDK state formats may change; from-seed sync is always safe.
          }
        }
        return factory.startWithSecretKeys(shieldedSecretKeys);
      },
      unshielded: async (walletConfig) => {
        const factory = UnshieldedWallet(walletConfig);
        if (saved.unshielded !== undefined) {
          try {
            return await (factory as any).restore(saved.unshielded);
          } catch {
            // Fall back below.
          }
        }
        return factory.startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
      },
      dust: async (walletConfig) => {
        const factory = DustWallet(walletConfig);
        if (saved.dust !== undefined) {
          try {
            return await factory.restore(saved.dust);
          } catch {
            // Fall back below.
          }
        }
        return factory.startWithSecretKey(
          dustSecretKey,
          ledger.LedgerParameters.initialParameters().dust,
        );
      },
    });

    await wallet.start(shieldedSecretKeys, dustSecretKey);
    this.context = { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
  }

  async syncAndEnsureDust(): Promise<void> {
    await this.start();
    const context = this.requiredContext();
    const state = await context.wallet.waitForSyncedState();
    await this.persist();

    const unregistered = state.unshielded.availableCoins.filter(
      (coin: { meta?: { registeredForDustGeneration?: boolean } }) =>
        !coin.meta?.registeredForDustGeneration,
    );
    if (unregistered.length > 0) {
      const recipe = await context.wallet.registerNightUtxosForDustGeneration(
        unregistered,
        context.unshieldedKeystore.getPublicKey(),
        (payload) => context.unshieldedKeystore.signData(payload),
      );
      await context.wallet.submitTransaction(await context.wallet.finalizeRecipe(recipe));
    }

    if (state.dust.balance(new Date()) === 0n) {
      await Rx.firstValueFrom(
        context.wallet.state().pipe(
          Rx.throttleTime(5_000),
          Rx.filter((next) => next.isSynced && next.dust.balance(new Date()) > 0n),
        ),
      );
    }
    await this.persist();
  }

  provider() {
    const context = this.requiredContext();
    return {
      getCoinPublicKey: () => context.shieldedSecretKeys.coinPublicKey,
      getEncryptionPublicKey: () => context.shieldedSecretKeys.encryptionPublicKey,
      async balanceTx(tx: unknown, ttl?: Date) {
        const recipe = await context.wallet.balanceUnboundTransaction(
          tx as never,
          {
            shieldedSecretKeys: context.shieldedSecretKeys,
            dustSecretKey: context.dustSecretKey,
          },
          { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
        );
        return context.wallet.finalizeRecipe(recipe);
      },
      submitTx: (tx: unknown) => context.wallet.submitTransaction(tx as never) as never,
    };
  }

  accountId(): string {
    return this.requiredContext().unshieldedKeystore.getBech32Address().toString();
  }

  privateStatePassword(): string {
    return this.statePassword();
  }

  async status(): Promise<SponsorWalletStatus> {
    if (!this.context) {
      return { started: false, synced: false, address: null, night: null, dust: null };
    }
    const context = this.context;
    const state = await Rx.firstValueFrom(context.wallet.state().pipe(Rx.take(1)));
    return {
      started: true,
      synced: state.isSynced,
      address: context.unshieldedKeystore.getBech32Address().toString(),
      night: String(state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n),
      dust: String(state.dust.balance(new Date())),
    };
  }

  async persist(): Promise<void> {
    if (!this.context) return;
    const state: PersistedWalletState = {};
    try {
      state.shielded = await this.context.wallet.shielded.serializeState();
    } catch {}
    try {
      state.unshielded = await this.context.wallet.unshielded.serializeState();
    } catch {}
    try {
      state.dust = await this.context.wallet.dust.serializeState();
    } catch {}
    ensurePrivateDir(path.dirname(this.stateFile));
    atomicJsonWrite(this.stateFile, state);
  }

  async stop(): Promise<void> {
    if (!this.context) return;
    await this.persist();
    await this.context.wallet.stop();
    this.context = null;
  }

  private requiredContext(): NonNullable<SponsorWallet['context']> {
    if (!this.context) throw new Error('zkuat: sponsor wallet has not started');
    return this.context;
  }
}
