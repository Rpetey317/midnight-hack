/**
 * The on-chain half: connect to the deployed registry and insert a leaf.
 *
 * All of the wallet, DUST, and provider plumbing already exists in
 * `contract/src/devnet/wallet.ts` — this file is the sequence from
 * `contract/src/devnet/prove.ts`, with the evidence handling removed and one
 * line added: read `firstFree()` *before* the insert, because that is the
 * leaf's index and it is unknowable afterwards without a scan.
 *
 * ⚠️ LOCAL DEVNET ONLY. The wallet is the well-known genesis seed from the
 * node's `dev` preset — see `contract/src/devnet/config.ts`.
 */
import * as fs from 'node:fs';

// Everything below is imported by relative source path rather than as a package
// dependency, and that is load-bearing, not stylistic. `@midnight-ntwrk/*` must
// resolve from `contract/node_modules` so the process holds exactly one WASM
// instance — see the header of `contract/src/devnet/sdk.ts`. Installing the SDK
// into this package instead produces a second copy and a first circuit call
// that dies with `expected instance of StateValue`.
import {
  CompiledContract,
  findDeployedContract,
  indexerPublicDataProvider,
} from '../../contract/src/devnet/sdk.js';
import { Contract, ledger } from '../../contract/src/managed/audit_registry/contract/index.js';
import { witnesses, type AuditPrivateState } from '../../contract/src/witnesses.js';
import {
  ANCHOR_SECRET,
  DEVNET,
  GENESIS_SEED,
  PRIVATE_STATE_ID,
  STATE_FILE,
  ZK_CONFIG_PATH,
} from '../../contract/src/devnet/config.js';
import {
  createProviders,
  createWallet,
  ensureDust,
  waitForProofServer,
  withDustRetry,
} from '../../contract/src/devnet/wallet.js';

// Re-exported so the CLI can name the private-state slot without reaching into
// contract/src/devnet/ itself.
export { DEVNET, PRIVATE_STATE_ID } from '../../contract/src/devnet/config.js';

export interface Deployment {
  contractAddress: string;
  policies: Record<string, string>;
}

/** Read `contract/.zkuat-devnet.json`, written by `npm run devnet:deploy`. */
export function deployment(): Deployment {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      `no deployment on file at ${STATE_FILE}. Run: npm --prefix contract run devnet:deploy`,
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Deployment;
}

export type Connection = Awaited<ReturnType<typeof connect>>;

/**
 * Wallet + providers + a handle on the deployed contract.
 *
 * `privateState.secretKey` decides what you are allowed to call: the anchor
 * secret satisfies `requireAnchor()` and is needed by `attest` and
 * `registerPolicy`; a vendor proving compliance passes `null` and never
 * invokes the witness at all.
 */
export async function connect(privateState: AuditPrivateState) {
  const { contractAddress } = deployment();

  if (!(await waitForProofServer())) {
    throw new Error('proof server not responding on :6300. Run: npm --prefix contract run devnet:up');
  }

  const ctx = await createWallet(GENESIS_SEED);
  await ctx.wallet.waitForSyncedState();
  await ensureDust(ctx);
  // The wallet's DUST balance is a projection; the tx builder spends only what
  // the next block's timestamp accounts for, which lags wall-clock by about one
  // block on a fresh devnet. Removing this reintroduces a flaky first call.
  await new Promise((r) => setTimeout(r, 6000));

  const providers = createProviders(ctx);
  const compiled = CompiledContract.make('audit_registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  const contract = await findDeployedContract(providers as any, {
    contractAddress,
    compiledContract: compiled as any,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  });

  await providers.privateStateProvider.setContractAddress(contractAddress);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, privateState);

  return { ctx, providers, contract, contractAddress };
}

/**
 * The public ledger, with no wallet at all — one GraphQL round trip, about a
 * second. This is the buyer's access path: everything readable here is
 * everything an outside observer can learn.
 */
export async function queryLedger(contractAddress: string): Promise<ReturnType<typeof ledger>> {
  const provider = indexerPublicDataProvider(DEVNET.indexer, DEVNET.indexerWS);
  const state = await provider.queryContractState(contractAddress);
  if (!state) {
    throw new Error(
      `queryContractState returned null for ${contractAddress}. The chain may have been ` +
        'reset — try: npm --prefix contract run devnet:deploy',
    );
  }
  return ledger(state.data);
}

/** The same read, reusing an already-connected provider bag. */
export async function readLedger(
  providers: Connection['providers'],
  contractAddress: string,
): Promise<ReturnType<typeof ledger>> {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) throw new Error(`queryContractState returned null for ${contractAddress}`);
  return ledger(state.data);
}

export interface AnchorResult {
  index: number;
  txId: string;
  contractAddress: string;
}

/**
 * Insert a leaf into the attestations tree and record where it landed.
 *
 * `insert()`, not `insertHash()` — the latter publishes the value you pass, and
 * the leaf is a commitment over private evidence.
 */
export async function anchorLeaf(leaf: Uint8Array): Promise<AnchorResult> {
  const anchorState: AuditPrivateState = {
    secretKey: ANCHOR_SECRET,
    evidence: null,
    salt: null,
    path: null,
  };
  const { ctx, providers, contract, contractAddress } = await connect(anchorState);

  try {
    // The index the leaf is about to occupy. Read before the insert, because
    // afterwards recovering it means scanning the tree.
    const before = await readLedger(providers, contractAddress);
    const index = Number(before.attestations.firstFree());

    const tx = await withDustRetry('attest', () => contract.callTx.attest(leaf));

    // Confirm the index we recorded is the one the tree actually used. This is
    // the first call to pathForLeaf anywhere in the project, so verify it
    // rather than trust it.
    const after = await readLedger(providers, contractAddress);
    let confirmed = index;
    try {
      if (!after.attestations.pathForLeaf(BigInt(index), leaf)) throw new Error('no path');
    } catch {
      const path = after.attestations.findPathForLeaf(leaf);
      if (!path) throw new Error('leaf not found in the attestations tree after attest()');
      console.warn(
        `  ⚠ firstFree() said index ${index} but pathForLeaf rejected it; ` +
          'falling back to the O(n) scan. The receipt index may be wrong.',
      );
      confirmed = -1;
    }

    return { index: confirmed, txId: String(tx.public.txId), contractAddress };
  } finally {
    await ctx.wallet.stop();
  }
}
