import { timingSafeEqual } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Contract,
  POLICY_BANK_ID,
  POLICY_BANK_V1,
  POLICY_ENTERPRISE_ID,
  POLICY_ENTERPRISE_V1,
  deriveAnchorSecret,
  emptyPrivateState,
  encodeArtifactDigest,
  encodeEvidence,
  ledger,
  policyId,
  productId,
  pureCircuits,
  recordKey,
  vendorId,
  witnesses,
  type AuditPrivateState,
  type ComplianceRecord,
} from '@zkuat/contract';
import {
  CompiledContract,
  NodeZkConfigProvider,
  deployContract,
  findDeployedContract,
  httpClientProofProvider,
  levelPrivateStateProvider,
} from '@zkuat/contract/sdk';

import type { RuntimeConfig } from '../config.js';
import type { PolicySlug, PreparedEvidence } from '../evidence.js';
import { ensurePrivateDir } from '../storage.js';
import { SponsorWallet } from '../wallet.js';
import {
  assertSuccessfulCall,
  createPublicDataProvider,
  queryTransaction,
} from './indexer.js';

export const PRIVATE_STATE_ID = 'zkuatPrivateState';

function contractAssetsPath(): string {
  const contractEntry = fileURLToPath(import.meta.resolve('@zkuat/contract'));
  return path.join(path.dirname(contractEntry), 'managed', 'audit_registry');
}

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function retryDust<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      const detail = `${(error as Error).message ?? ''} ${(error as { cause?: Error }).cause?.message ?? ''}`;
      const shortage =
        detail.includes('Not enough Dust') ||
        detail.includes('Insufficient Funds') ||
        detail.includes('could not balance dust');
      if (!shortage || attempt === 12) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error('zkuat: transaction retry budget exhausted');
}

export interface AnchorReceipt {
  txId: string;
  leafIndex: number;
}

export interface ProofReceipt {
  txId: string;
  verdict: boolean;
}

export interface VerifiedProof extends ProofReceipt {
  record: {
    policyVersion: string;
    provenAt: string;
    validUntil: string;
    compliant: boolean;
  };
}

export class ChainClient {
  readonly wallet: SponsorWallet;
  private providers: any = null;
  private contract: any = null;
  private compiled: any = null;
  private readonly anchorSecret: Uint8Array;

  constructor(private readonly config: RuntimeConfig) {
    this.wallet = new SponsorWallet(config);
    this.anchorSecret = deriveAnchorSecret(config.sponsorSeed);
  }

  private compiledContract(): any {
    if (!this.compiled) {
      const assets = contractAssetsPath();
      this.compiled = CompiledContract.make('audit_registry', Contract).pipe(
        CompiledContract.withWitnesses(witnesses),
        CompiledContract.withCompiledFileAssets(assets),
      );
    }
    return this.compiled;
  }

  private async initializeProviders(): Promise<void> {
    if (this.providers) return;
    await this.wallet.syncAndEnsureDust();
    const assets = contractAssetsPath();
    const zkConfigProvider = new NodeZkConfigProvider(assets);
    ensurePrivateDir(path.join(this.config.storageDir, 'private-state'));
    const walletProvider = this.wallet.provider();
    this.providers = {
      privateStateProvider: levelPrivateStateProvider({
        midnightDbName: path.join(this.config.storageDir, 'private-state', 'zkuat'),
        privateStateStoreName: 'private-states',
        accountId: this.wallet.accountId(),
        privateStoragePasswordProvider: () => this.wallet.privateStatePassword(),
      }),
      publicDataProvider: createPublicDataProvider(this.config.indexer, this.config.indexerWS),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(this.config.proofServer, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };
  }

  async start(): Promise<void> {
    if (this.contract) return;
    if (!this.config.contractAddress) throw new Error('zkuat: contract address is not configured');
    await this.initializeProviders();
    this.contract = await findDeployedContract(this.providers, {
      contractAddress: this.config.contractAddress,
      compiledContract: this.compiledContract(),
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: emptyPrivateState,
    });
    await this.providers.privateStateProvider.setContractAddress(this.config.contractAddress);
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, emptyPrivateState);
    await this.assertAnchorIdentity();
  }

  private async readLedger() {
    if (!this.config.contractAddress) throw new Error('zkuat: contract address is not configured');
    const state = await this.providers.publicDataProvider.queryContractState(
      this.config.contractAddress,
    );
    if (!state) throw new Error('zkuat: configured contract was not found by the indexer');
    return ledger(state.data);
  }

  async assertAnchorIdentity(): Promise<void> {
    const state = await this.readLedger();
    const expected = pureCircuits.anchorIdOf(this.anchorSecret);
    if (!sameBytes(state.anchor, expected)) {
      throw new Error(
        'zkuat: sponsor seed does not derive the sealed anchor identity for this contract',
      );
    }
  }

  private async setPrivateState(state: AuditPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, state);
  }

  async anchor(prepared: PreparedEvidence): Promise<AnchorReceipt> {
    await this.start();
    const leaf = bytes(prepared.leafHex);
    const before = await this.readLedger();
    const leafIndex = Number(before.attestations.firstFree());
    await this.setPrivateState({
      secretKey: this.anchorSecret,
      evidence: null,
      salt: null,
      path: null,
    });
    const tx = await retryDust<any>(() => this.contract.callTx.attest(leaf));
    const txId = String(tx.public.txId);
    await this.waitForPath(leaf, leafIndex);
    return { txId, leafIndex };
  }

  async hasAnchoredLeaf(prepared: PreparedEvidence, preferredIndex?: number): Promise<boolean> {
    await this.start();
    const state = await this.readLedger();
    const leaf = bytes(prepared.leafHex);
    try {
      if (preferredIndex !== undefined && preferredIndex >= 0) {
        return Boolean(state.attestations.pathForLeaf(BigInt(preferredIndex), leaf));
      }
    } catch {}
    return Boolean(state.attestations.findPathForLeaf(leaf));
  }

  private async waitForPath(leaf: Uint8Array, preferredIndex?: number): Promise<any> {
    for (let attempt = 0; attempt < 60; attempt++) {
      const state = await this.readLedger();
      try {
        if (preferredIndex !== undefined && preferredIndex >= 0) {
          const direct = state.attestations.pathForLeaf(BigInt(preferredIndex), leaf);
          if (direct) return direct;
        }
      } catch {}
      const found = state.attestations.findPathForLeaf(leaf);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error('zkuat: anchored leaf did not appear in indexed contract state');
  }

  async prove(
    prepared: PreparedEvidence,
    policySlug: PolicySlug,
    preferredIndex?: number,
  ): Promise<ProofReceipt> {
    await this.start();
    const evidence = encodeEvidence(prepared.evidence);
    const salt = bytes(prepared.saltHex);
    const leaf = bytes(prepared.leafHex);
    const path = await this.waitForPath(leaf, preferredIndex);
    await this.setPrivateState({ secretKey: null, evidence, salt, path });
    const tx = await retryDust<any>(() =>
      this.contract.callTx.proveCompliance(
        vendorId(prepared.evidence.vendor),
        productId(prepared.evidence.product),
        encodeArtifactDigest(prepared.evidence.artifactDigest),
        policyId(policySlug),
      ),
    );
    return { txId: String(tx.public.txId), verdict: Boolean(tx.private.result) };
  }

  async verifyProof(
    prepared: PreparedEvidence,
    policySlug: PolicySlug,
    proof: ProofReceipt,
  ): Promise<VerifiedProof> {
    await this.start();
    if (!this.config.contractAddress) throw new Error('zkuat: contract address is not configured');
    let transaction = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      transaction = await queryTransaction(this.config.indexer, proof.txId);
      if (transaction) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (!transaction) throw new Error(`zkuat: transaction ${proof.txId} was not indexed`);
    assertSuccessfulCall(transaction, this.config.contractAddress, 'proveCompliance');

    const state = await this.readLedger();
    const key = recordKey(prepared.evidence.artifactDigest, policySlug);
    if (!state.records.member(key)) throw new Error('zkuat: compliance record was not written');
    const record = state.records.lookup(key) as ComplianceRecord;
    if (!sameBytes(record.artifactDigest, encodeArtifactDigest(prepared.evidence.artifactDigest))) {
      throw new Error('zkuat: indexed compliance record has the wrong artifact digest');
    }
    if (!sameBytes(record.policyId, policyId(policySlug))) {
      throw new Error('zkuat: indexed compliance record has the wrong policy');
    }
    if (record.compliant !== proof.verdict) {
      throw new Error('zkuat: private verdict and public record disagree');
    }
    return {
      ...proof,
      record: {
        policyVersion: String(record.policyVersion),
        provenAt: String(record.provenAt),
        validUntil: String(record.validUntil),
        compliant: record.compliant,
      },
    };
  }

  async deploy(): Promise<{ contractAddress: string; policyTxIds: string[] }> {
    await this.initializeProviders();
    const anchorState: AuditPrivateState = {
      secretKey: this.anchorSecret,
      evidence: null,
      salt: null,
      path: null,
    };
    const deployed = await retryDust(() =>
      deployContract(this.providers, {
        compiledContract: this.compiledContract(),
        args: [],
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: anchorState,
      }),
    );
    const contractAddress = deployed.deployTxData.public.contractAddress;
    await this.providers.privateStateProvider.setContractAddress(contractAddress);
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, anchorState);
    const policyTxIds: string[] = [];
    for (const [id, policy] of [
      [POLICY_BANK_ID, POLICY_BANK_V1],
      [POLICY_ENTERPRISE_ID, POLICY_ENTERPRISE_V1],
    ] as const) {
      const tx = await retryDust(() => deployed.callTx.registerPolicy(id, policy));
      policyTxIds.push(String(tx.public.txId));
    }
    return { contractAddress, policyTxIds };
  }

  async status() {
    return this.wallet.status();
  }

  async stop(): Promise<void> {
    await this.wallet.stop();
    this.providers = null;
    this.contract = null;
  }
}
