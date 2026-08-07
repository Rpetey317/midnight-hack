/**
 * Read-only view of everything the chain makes public.
 *
 *     npm run devnet:inspect
 *
 * No wallet, no sync, no transaction — just a GraphQL query against the indexer,
 * so it returns in about a second. This is the buyer's view: run it at any point
 * to see exactly what an outside observer can learn.
 */
import * as fs from 'node:fs';

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

import { ledger } from '../managed/audit_registry/contract/index.js';
import { DEVNET, STATE_FILE } from './config.js';
import type { ComplianceRecord } from '../types.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const short = (b: Uint8Array) => `${hex(b).slice(0, 12)}…`;
const day = (unix: bigint) => new Date(Number(unix) * 1000).toISOString().slice(0, 10);

/** COMPLIANT / NOT COMPLIANT / EXPIRED — the states the buyer view distinguishes. */
function status(record: ComplianceRecord): string {
  if (!record.compliant) return '✗ NOT COMPLIANT';
  return Number(record.validUntil) * 1000 < Date.now() ? '⚠ EXPIRED' : '✓ COMPLIANT';
}

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(`\n❌ No deployment on file at ${STATE_FILE}.\n   Run: npm run devnet:deploy\n`);
    process.exit(1);
  }
  const { contractAddress, policies } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const slugById = new Map<string, string>(
    Object.entries(policies as Record<string, string>).map(([slug, id]) => [id, slug]),
  );

  const provider = indexerPublicDataProvider(DEVNET.indexer, DEVNET.indexerWS);
  const state = await provider.queryContractState(contractAddress);
  if (!state) {
    console.error(`\n❌ queryContractState returned null for ${contractAddress}.`);
    console.error('   The chain may have been reset — try: npm run devnet:deploy\n');
    process.exit(1);
  }
  const l = ledger(state.data);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Public ledger state — what any observer can read        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  contract  ${contractAddress}`);
  console.log(`  anchor    ${short(l.anchor)}\n`);

  console.log(`─── Policies (${l.policies.size()}) ─────────────────────────────────────\n`);
  for (const [id, p] of l.policies) {
    console.log(`  ${slugById.get(hex(id)) ?? short(id)}   v${p.version}  issuer ${short(p.issuer)}`);
    console.log(`    criticals ≤ ${p.maxCriticals}   highs ≤ ${p.maxHighs}   kev ≤ ${p.maxKev}   forbiddenDeps ≤ ${p.maxForbiddenDeps}`);
    const requires = [
      p.requireMfa && 'MFA',
      p.requireBranchProtection && 'branch protection',
      p.requireBuildProvenance && 'build provenance',
    ].filter(Boolean);
    console.log(`    requires: ${requires.length ? requires.join(', ') : '(nothing)'}`);
    console.log(`    max validity window: ${Number(p.maxAgeSeconds) / 86400} days\n`);
  }

  console.log(`─── Current records (${l.records.size()}) ────────────────────────────\n`);
  if (l.records.isEmpty()) {
    console.log('  (none — NO CURRENT PROOF for every artifact)\n');
  }
  for (const [, r] of l.records) {
    console.log(`  ${slugById.get(hex(r.policyId)) ?? short(r.policyId)}  →  ${status(r)}`);
    console.log(`    vendor ${short(r.vendorId)}   product ${short(r.productId)}`);
    console.log(`    artifact ${short(r.artifactDigest)}   policy v${r.policyVersion}`);
    console.log(`    evidence ${day(r.provenAt)}   valid until ${day(r.validUntil)}\n`);
  }

  console.log(`─── Timeline (${l.history.length()}, newest first) ────────────────────\n`);
  let n = 0;
  for (const r of l.history) {
    console.log(
      `  ${String(++n).padStart(2)}. ${day(r.provenAt)}  ` +
        `${(slugById.get(hex(r.policyId)) ?? short(r.policyId)).padEnd(14)} ` +
        `${r.compliant ? 'PASS' : 'FAIL'}  artifact ${short(r.artifactDigest)}`,
    );
  }
  if (n === 0) console.log('  (empty)');

  console.log(`\n─── Attestations ─────────────────────────────────────────\n`);
  console.log(`  leaves anchored: ${l.attestations.firstFree()}`);
  console.log(`  nullifiers used: ${l.claimed.size()}`);
  console.log(`  current root:    ${l.attestations.root().field.toString(16).slice(0, 12)}…\n`);

  console.log('  Note what is NOT here: no vulnerability counts, no dependency');
  console.log('  facts, no repository configuration, no commit, no evidence');
  console.log('  commitment. Those never leave the vendor.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
