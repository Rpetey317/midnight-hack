/**
 * Deploy the zkuat compliance registry to the local devnet and register both
 * buyer policies.
 *
 *     npm run devnet:deploy
 *
 * Writes the contract address to `.zkuat-devnet.json` for `demo.ts` to pick up.
 *
 * ⚠️ LOCAL DEVNET ONLY — uses the well-known genesis seed. See config.ts.
 */
import * as fs from 'node:fs';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { Contract } from '../managed/audit_registry/contract/index.js';
import {
  POLICY_BANK_ID,
  POLICY_BANK_SLUG,
  POLICY_BANK_V1,
  POLICY_ENTERPRISE_ID,
  POLICY_ENTERPRISE_SLUG,
  POLICY_ENTERPRISE_V1,
} from '../encoding.js';
import { witnesses, type AuditPrivateState } from '../witnesses.js';
import {
  ANCHOR_SECRET,
  GENESIS_SEED,
  PRIVATE_STATE_ID,
  STATE_FILE,
  ZK_CONFIG_PATH,
} from './config.js';
import {
  createProviders,
  createWallet,
  ensureDust,
  unshieldedToken,
  waitForProofServer,
  withDustRetry,
} from './wallet.js';

// The wallet SDK needs a global WebSocket to sync.
// @ts-expect-error Node exposes no global WebSocket by default in this setup.
globalThis.WebSocket = WebSocket;

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Deploy zkuat compliance registry → local devnet         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(`${ZK_CONFIG_PATH}/keys/proveCompliance.prover`)) {
    console.error(
      '\n❌ No proving keys found.\n' +
        '   Run: npm run compile:keys\n' +
        '   (a --skip-zk build produces no keys/ directory, and deployment needs them)\n',
    );
    process.exit(1);
  }

  console.log('─── Proof server ─────────────────────────────────────────\n');
  if (!(await waitForProofServer())) {
    console.error('\n❌ Proof server not responding on :6300.\n' +
      '   Run: cd ../app && docker compose up -d\n');
    process.exit(1);
  }
  console.log('  Ready.\n');

  console.log('─── Wallet ───────────────────────────────────────────────\n');
  console.log('  Creating and syncing (this can take a minute)...');
  const ctx = await createWallet(GENESIS_SEED);
  const state = await ctx.wallet.waitForSyncedState();
  const address = ctx.unshieldedKeystore.getBech32Address();
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`  Address: ${address}`);
  console.log(`  Balance: ${balance.toLocaleString()} tNIGHT\n`);

  if (balance === 0n) {
    console.error(
      '\n❌ Genesis-seed wallet has zero NIGHT — the devnet preset may not have minted to it.\n' +
        '   Try: cd ../app && docker compose down -v && docker compose up -d\n',
    );
    await ctx.wallet.stop();
    process.exit(1);
  }

  console.log('─── DUST ─────────────────────────────────────────────────\n');
  await ensureDust(ctx);
  // Close the gap between the wallet's wall-clock DUST projection and what the
  // next block's timestamp actually accounts for.
  await new Promise((r) => setTimeout(r, 6000));
  console.log('');

  console.log('─── Deploy ───────────────────────────────────────────────\n');
  const providers = createProviders(ctx);

  const compiled = CompiledContract.make('audit_registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  // The deployer becomes the anchor: the constructor seals
  // anchorIdOf(localSecret()) into the ledger, so this private state must carry
  // the secret before the constructor runs.
  const initialPrivateState: AuditPrivateState = {
    secretKey: ANCHOR_SECRET,
    evidence: null,
    salt: null,
    path: null,
  };

  const deployed = await withDustRetry('deploy', () =>
    deployContract(providers as any, {
      compiledContract: compiled as any,
      args: [],
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState,
    }),
  );

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log(`  ✅ Deployed at ${contractAddress}\n`);

  console.log('─── Register buyer policies ──────────────────────────────\n');
  for (const [slug, id, policy] of [
    [POLICY_BANK_SLUG, POLICY_BANK_ID, POLICY_BANK_V1],
    [POLICY_ENTERPRISE_SLUG, POLICY_ENTERPRISE_ID, POLICY_ENTERPRISE_V1],
  ] as const) {
    console.log(`  ${slug} (${hex(id).slice(0, 16)}…)`);
    await withDustRetry(slug, () =>
      deployed.callTx.registerPolicy(id, policy),
    );
    console.log(`    registered.`);
  }
  console.log('');

  fs.writeFileSync(
    STATE_FILE,
    `${JSON.stringify(
      {
        network: 'undeployed',
        contractAddress,
        anchorAddress: address.toString(),
        policies: {
          [POLICY_BANK_SLUG]: hex(POLICY_BANK_ID),
          [POLICY_ENTERPRISE_SLUG]: hex(POLICY_ENTERPRISE_ID),
        },
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`  Saved to ${STATE_FILE}\n`);

  await ctx.wallet.stop();
  console.log('─── Done ─────────────────────────────────────────────────\n');
  console.log('  Next: npm run devnet:demo\n');
}

main().catch(async (err) => {
  console.error('\n❌ Deploy failed:\n');
  console.error(err);
  process.exit(1);
});
