/**
 * End-to-end demo against the local devnet.
 *
 *     npm run devnet:demo
 *
 * Runs the whole protocol as the two roles:
 *
 *   attestor/anchor  → attest(leaf)          a blinded evidence commitment
 *   vendor           → proveCompliance(...)  against BOTH buyer policies
 *   buyer            → reads ledger.records  and sees only the verdict
 *
 * The headline: one evidence bundle, two independently-defined buyer policies,
 * two different verdicts, and nothing about the findings reaches the chain.
 *
 * ⚠️ LOCAL DEVNET ONLY — uses the well-known genesis seed. See config.ts.
 */
import * as fs from 'node:fs';
import { WebSocket } from 'ws';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { Contract, ledger, pureCircuits } from '../managed/audit_registry/contract/index.js';
import {
  EVIDENCE_SCHEMA,
  POLICY_BANK_ID,
  POLICY_BANK_SLUG,
  POLICY_ENTERPRISE_ID,
  POLICY_ENTERPRISE_SLUG,
  encodeArtifactDigest,
  encodeEvidence,
  productId as productIdOf,
  recordKey,
  vendorId as vendorIdOf,
  type CanonicalEvidence,
} from '../encoding.js';
import { witnesses, type AuditPrivateState } from '../witnesses.js';
import type { ComplianceRecord, Evidence, Ledger } from '../types.js';
import { ANCHOR_SECRET, GENESIS_SEED, PRIVATE_STATE_ID, STATE_FILE, ZK_CONFIG_PATH } from './config.js';
import {
  createProviders,
  createWallet,
  ensureDust,
  waitForProofServer,
  withDustRetry,
} from './wallet.js';

// @ts-expect-error wallet sync requires a global WebSocket
globalThis.WebSocket = WebSocket;

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const short = (b: Uint8Array) => `${hex(b).slice(0, 12)}…`;
const iso = (unixSeconds: bigint) => new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);

const VENDOR = 'acme-software';
const PRODUCT = 'payment-engine';
const ARTIFACT = `sha256:${'8f739ab'.padEnd(64, '0')}`;

/**
 * The vendor's private evidence. Passes the bank policy; fails the enterprise
 * policy on a single forbidden dependency — which is the contrast worth showing.
 */
const CANONICAL: CanonicalEvidence = {
  schema: EVIDENCE_SCHEMA,
  vendor: VENDOR,
  product: PRODUCT,
  artifactDigest: ARTIFACT,
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  attestor: 'zkuat-attestor-v1',
  generatedAt: Math.floor(Date.now() / 1000),
  validUntil: Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60,
  vulns: { criticals: 0, highs: 3, kev: 0 },
  deps: { forbidden: 1, vulnerable: 4 },
  config: {
    mfaRequired: true,
    branchProtected: true,
    buildProvenanceVerified: true,
    ciGreen: true,
  },
  coverage: 8734,
};

const SALT = new Uint8Array(32);
SALT.set([0x7a, 0x1c, 0x9e, 0x44]); // deterministic for a repeatable demo

function printPrivateEvidence(ev: Evidence): void {
  console.log('  ┌─ PRIVATE — never written to Midnight ────────────────┐');
  console.log(`  │  critical vulnerabilities   ${String(ev.criticals).padEnd(24)}│`);
  console.log(`  │  high vulnerabilities       ${String(ev.highs).padEnd(24)}│`);
  console.log(`  │  known exploited (KEV)      ${String(ev.kev).padEnd(24)}│`);
  console.log(`  │  forbidden dependencies     ${String(ev.forbiddenDeps).padEnd(24)}│`);
  console.log(`  │  vulnerable dependencies    ${String(ev.vulnDeps).padEnd(24)}│`);
  console.log(`  │  MFA required               ${String(ev.mfaRequired).padEnd(24)}│`);
  console.log(`  │  branch protected           ${String(ev.branchProtected).padEnd(24)}│`);
  console.log(`  │  build provenance verified  ${String(ev.buildProvenanceVerified).padEnd(24)}│`);
  console.log(`  │  coverage                   ${`${Number(ev.coverage) / 100}%`.padEnd(24)}│`);
  console.log('  └──────────────────────────────────────────────────────┘\n');
}

function printRecord(label: string, record: ComplianceRecord | undefined): void {
  if (!record) {
    console.log(`  ${label}: NO CURRENT PROOF\n`);
    return;
  }
  const expired = Number(record.validUntil) * 1000 < Date.now();
  const status = record.compliant ? (expired ? 'EXPIRED' : '✓ COMPLIANT') : '✗ NOT COMPLIANT';
  console.log(`  ${label}`);
  console.log(`    vendor          ${short(record.vendorId)}  (${VENDOR})`);
  console.log(`    product         ${short(record.productId)}  (${PRODUCT})`);
  console.log(`    artifact        ${short(record.artifactDigest)}`);
  console.log(`    policy version  ${record.policyVersion}`);
  console.log(`    evidence date   ${iso(record.provenAt)}`);
  console.log(`    valid until     ${iso(record.validUntil)}`);
  console.log(`    status          ${status}\n`);
}

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(`\n❌ No deployment on file at ${STATE_FILE}.\n   Run: npm run devnet:deploy\n`);
    process.exit(1);
  }
  const { contractAddress } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  zkuat — end-to-end on local devnet                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  Contract: ${contractAddress}\n`);

  if (!(await waitForProofServer())) {
    console.error('❌ Proof server not responding on :6300.\n');
    process.exit(1);
  }

  const ctx = await createWallet(GENESIS_SEED);
  await ctx.wallet.waitForSyncedState();
  await ensureDust(ctx);
  await new Promise((r) => setTimeout(r, 6000));

  const providers = createProviders(ctx);
  const compiled = CompiledContract.make('audit_registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  const anchorState: AuditPrivateState = {
    secretKey: ANCHOR_SECRET,
    evidence: null,
    salt: null,
    path: null,
  };

  const contract = await findDeployedContract(providers as any, {
    contractAddress,
    compiledContract: compiled as any,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: anchorState,
  });

  const readLedger = async (): Promise<Ledger> => {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    if (!state) throw new Error(`queryContractState returned null for ${contractAddress}`);
    return ledger(state.data);
  };

  // ── 1. The vendor's CI produced evidence. It stays here. ──────────────────
  console.log('─── 1. Private evidence (vendor machine only) ────────────\n');
  const evidence = encodeEvidence(CANONICAL);
  printPrivateEvidence(evidence);

  // ── 2. The attestor signs a commitment; the anchor inserts it. ────────────
  console.log('─── 2. Attestor anchors a blinded commitment ─────────────\n');
  const leaf = pureCircuits.leafOf(evidence, SALT);
  console.log(`  leaf = leafOf(evidence, salt) = ${short(leaf)}`);
  console.log('  Submitting attest()... (generating a real ZK proof)');

  await providers.privateStateProvider.setContractAddress(contractAddress);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, anchorState);
  await withDustRetry('attest', () => contract.callTx.attest(leaf));
  console.log('  Anchored.\n');

  // ── 3. The vendor proves compliance, locally, against both policies. ──────
  const afterAttest = await readLedger();
  const path = afterAttest.attestations.findPathForLeaf(leaf);
  if (!path) throw new Error('leaf not found in the attestations tree after attest()');

  const vendorState: AuditPrivateState = {
    secretKey: null, // a vendor holds no anchor secret
    evidence,
    salt: SALT,
    path,
  };

  console.log('─── 3. Vendor proves compliance (local proving) ──────────\n');
  const verdicts: Record<string, boolean> = {};
  for (const [slug, id] of [
    [POLICY_BANK_SLUG, POLICY_BANK_ID],
    [POLICY_ENTERPRISE_SLUG, POLICY_ENTERPRISE_ID],
  ] as const) {
    await providers.privateStateProvider.set(PRIVATE_STATE_ID, vendorState);
    console.log(`  proveCompliance against ${slug}...`);
    const tx = await withDustRetry(slug, () =>
      contract.callTx.proveCompliance(
        vendorIdOf(VENDOR),
        productIdOf(PRODUCT),
        encodeArtifactDigest(ARTIFACT),
        id,
      ),
    );
    // `private` is privacy-sensitive — read only the boolean, never log the object.
    const ok = tx.private.result as boolean;
    verdicts[slug] = ok;
    console.log(`    → ${ok ? 'PASS' : 'FAIL'}\n`);
  }

  // ── 4. What the buyer can see. ────────────────────────────────────────────
  console.log('─── 4. Buyer view — public ledger state ──────────────────\n');
  const finalLedger = await readLedger();
  const lookup = (slug: string): ComplianceRecord | undefined => {
    const key = recordKey(ARTIFACT, slug);
    return finalLedger.records.member(key) ? finalLedger.records.lookup(key) : undefined;
  };
  printRecord(`Bank Procurement v1      [${POLICY_BANK_SLUG}]`, lookup(POLICY_BANK_SLUG));
  printRecord(`Enterprise Standard v1   [${POLICY_ENTERPRISE_SLUG}]`, lookup(POLICY_ENTERPRISE_SLUG));

  console.log(`  Records on chain: ${finalLedger.records.size()}`);
  console.log(`  Timeline entries: ${finalLedger.history.length()}`);
  console.log(`  Attestations:     ${finalLedger.attestations.firstFree()}\n`);

  // ── 5. Confirm the private values are genuinely absent. ───────────────────
  console.log('─── 5. What the chain does NOT know ──────────────────────\n');
  const publicBlob = JSON.stringify(
    [...finalLedger.records].map(([k, r]) => [k, r]),
    (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? hex(v) : v,
  );
  const secrets: [string, string][] = [
    ['commit', hex(evidence.commitId)],
    ['attestor', hex(evidence.attestorId)],
    ['salt', hex(SALT)],
    ['evidence commitment', hex(leaf)],
  ];
  for (const [label, value] of secrets) {
    const present = publicBlob.includes(value);
    console.log(`  ${present ? '❌' : '✓'} ${label.padEnd(20)} ${present ? 'LEAKED' : 'absent'}`);
  }
  for (const [label, value] of [
    ['high vulnerabilities', evidence.highs],
    ['forbidden dependencies', evidence.forbiddenDeps],
    ['vulnerable dependencies', evidence.vulnDeps],
    ['coverage', evidence.coverage],
  ] as const) {
    // Counts are small integers; check they are absent as distinct values in the
    // serialized public records rather than as substrings of unrelated hex.
    const present = JSON.parse(publicBlob).flat(2).includes(value.toString());
    console.log(`  ${present ? '❌' : '✓'} ${label.padEnd(20)} ${present ? 'LEAKED' : 'absent'}`);
  }

  console.log('\n─── Summary ──────────────────────────────────────────────\n');
  console.log('  One evidence bundle. Two buyer policies, defined independently.');
  console.log(
    `  ${POLICY_BANK_SLUG}: ${verdicts[POLICY_BANK_SLUG] ? 'PASS' : 'FAIL'}   ` +
      `${POLICY_ENTERPRISE_SLUG}: ${verdicts[POLICY_ENTERPRISE_SLUG] ? 'PASS' : 'FAIL'}`,
  );
  console.log('  The buyer learns the verdict. Not the findings.\n');

  await ctx.wallet.stop();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Demo failed:\n');
  console.error(err);
  process.exit(1);
});
