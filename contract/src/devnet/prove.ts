/**
 * Attest and prove a single evidence bundle you describe on the command line.
 *
 *     npm run devnet:prove -- --policy bank-v1 --criticals 0 --highs 3
 *
 * This is the manual-testing tool: change one fact, re-run, watch the verdict
 * move. It attests fresh evidence and then proves it against one policy, so
 * every invocation is a complete round trip.
 *
 * Run `npm run devnet:prove -- --help` for the full flag list.
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
// Track B, by relative source path rather than as a package dependency: the
// attestor already depends on @zkuat/contract, and adding the reverse edge to
// package.json would make the two mutually dependent and force a reinstall of
// the tree whose `overrides` block is what keeps devnet working at all.
import { bundleToPrivateState, loadBundle, unhex32 } from '../../../attestor/src/index.js';
import { ANCHOR_SECRET, GENESIS_SEED, PRIVATE_STATE_ID, STATE_FILE, ZK_CONFIG_PATH } from './config.js';
import { createProviders, createWallet, ensureDust, waitForProofServer, withDustRetry } from './wallet.js';

// @ts-expect-error wallet sync requires a global WebSocket
globalThis.WebSocket = WebSocket;

const HELP = `
Attest and prove one evidence bundle against one policy.

  npm run devnet:prove -- [flags]

Use a real signed bundle from Track B (recommended)
  --bundle <path>          a signed evidence bundle from @zkuat/attestor.
                           Verifies the DSSE signature and re-derives the leaf,
                           then attests and proves it. Every flag below that
                           describes evidence is ignored — the evidence is
                           whatever the attestor signed, which is the point.

      npm run devnet:prove -- --bundle ../demo/fixtures/bank-only/bundle.json --policy bank-v1
      npm run devnet:prove -- --bundle ../demo/fixtures/bank-only/bundle.json --policy enterprise-v1

  A bundle carries a fixed salt, so proving the same bundle against the same
  policy twice hits the replay guard ("already proven"). That is correct. To
  rehearse again, refresh the fixtures (new timestamp, new leaf, new nullifier):

      cd ../attestor && npm run fixtures:refresh

Identity (these go into the signed evidence)
  --policy <slug>          bank-v1 | enterprise-v1        (default bank-v1)
  --vendor <slug>          vendor identifier              (default acme-software)
  --product <slug>         product identifier             (default payment-engine)
  --artifact <hex|sha256:> 64 hex chars                   (default 8f739ab…)

Identity claimed publicly (defaults to matching the evidence above)
  --claim-vendor <slug>    assert a DIFFERENT vendor publicly
  --claim-product <slug>   assert a DIFFERENT product publicly
  --claim-artifact <hex>   assert a DIFFERENT artifact publicly
    Use these to exercise the identity binding: the circuit asserts the
    evidence matches the public claim, so a mismatch is rejected outright.

Vulnerability facts
  --criticals <n>          (default 0)
  --highs <n>              (default 3)
  --kev <n>                (default 0)

Dependency facts
  --forbidden-deps <n>     (default 0)
  --vuln-deps <n>          (default 4)

Configuration facts   (negate with --no-<name>)
  --mfa / --no-mfa                     (default on)
  --branch-protected / --no-...        (default on)
  --provenance / --no-provenance       (default on)
  --ci-green / --no-ci-green           (default on)

Other
  --valid-days <n>         validity window in days        (default 29)
  --help

Examples
  # Passes both policies
  npm run devnet:prove -- --policy bank-v1

  # One forbidden dependency: bank does not care, enterprise rejects
  npm run devnet:prove -- --policy enterprise-v1 --forbidden-deps 1

  # Six highs: bank caps at five, enterprise does not count them
  npm run devnet:prove -- --policy bank-v1 --highs 6

  # A policy requirement the evidence does not meet
  npm run devnet:prove -- --policy enterprise-v1 --no-branch-protected

  # Rejected before the predicate: the window exceeds the policy's 30 days
  npm run devnet:prove -- --valid-days 400

  # Rejected: filing a record under a vendor the attestor did not sign
  npm run devnet:prove -- --claim-vendor globex-corp
`;

function parseArgs(argv: string[]) {
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }
  return flags;
}

const args = parseArgs(process.argv.slice(2));
if (args.has('help')) {
  console.log(HELP);
  process.exit(0);
}

const num = (name: string, fallback: number): number => {
  const raw = args.get(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.error(`❌ --${name} must be a non-negative integer, got "${raw}"`);
    process.exit(1);
  }
  return parsed;
};
const str = (name: string, fallback: string): string => {
  const raw = args.get(name);
  return typeof raw === 'string' ? raw : fallback;
};
/** `--x` turns it on, `--no-x` turns it off, absent means the default. */
const bool = (name: string, fallback: boolean): boolean => {
  if (args.has(`no-${name}`)) return false;
  if (args.has(name)) return true;
  return fallback;
};

const POLICIES = {
  [POLICY_BANK_SLUG]: POLICY_BANK_ID,
  [POLICY_ENTERPRISE_SLUG]: POLICY_ENTERPRISE_ID,
} as const;

const policySlug = str('policy', POLICY_BANK_SLUG);
if (!(policySlug in POLICIES)) {
  console.error(`❌ Unknown policy "${policySlug}". Choose ${Object.keys(POLICIES).join(' or ')}.`);
  process.exit(1);
}
const policyIdBytes = POLICIES[policySlug as keyof typeof POLICIES];

/**
 * A signed bundle from Track B, when one was given.
 *
 * `bundleToPrivateState` verifies before returning: DSSE signature, statement
 * against the signed payload, and the leaf re-derived through the contract's
 * own `pureCircuits.leafOf`. A bundle that fails any of those errors here
 * rather than as "path/leaf mismatch" minutes into proof generation.
 */
const BUNDLE = args.has('bundle')
  ? (() => {
      const file = str('bundle', '');
      const loaded = loadBundle(file);
      bundleToPrivateState(loaded); // throws with a named reason
      return { file, ...loaded };
    })()
  : null;

const BUNDLE_EVIDENCE = BUNDLE?.statement.evidence;

const VENDOR = str('vendor', BUNDLE_EVIDENCE?.vendor ?? 'acme-software');
const PRODUCT = str('product', BUNDLE_EVIDENCE?.product ?? 'payment-engine');
const ARTIFACT = str(
  'artifact',
  BUNDLE_EVIDENCE?.artifactDigest ?? `sha256:${'8f739ab'.padEnd(64, '0')}`,
);

// What we assert publicly. Defaults to matching the evidence; override one of
// these to exercise the identity binding, which is what stops a prover filing a
// record under a name the attestor never signed.
const CLAIM_VENDOR = str('claim-vendor', VENDOR);
const CLAIM_PRODUCT = str('claim-product', PRODUCT);
const CLAIM_ARTIFACT = str('claim-artifact', ARTIFACT);

const now = Math.floor(Date.now() / 1000);

/**
 * The evidence to attest and prove.
 *
 * With `--bundle`, it is whatever the attestor signed — untouched, because
 * editing it would break the commitment the signature covers. Without one, it
 * is assembled from flags, which is the manual-testing path: change one fact,
 * re-run, watch the verdict move.
 */
const canonical: CanonicalEvidence = BUNDLE_EVIDENCE ?? {
  schema: EVIDENCE_SCHEMA,
  vendor: VENDOR,
  product: PRODUCT,
  artifactDigest: ARTIFACT,
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  attestor: 'zkuat-attestor-v1',
  generatedAt: now,
  validUntil: now + num('valid-days', 29) * 86400,
  vulns: { criticals: num('criticals', 0), highs: num('highs', 3), kev: num('kev', 0) },
  deps: { forbidden: num('forbidden-deps', 0), vulnerable: num('vuln-deps', 4) },
  config: {
    mfaRequired: bool('mfa', true),
    branchProtected: bool('branch-protected', true),
    buildProvenanceVerified: bool('provenance', true),
    ciGreen: bool('ci-green', true),
  },
  coverage: num('coverage', 8734),
};

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(`\n❌ No deployment on file.\n   Run: npm run devnet:deploy\n`);
    process.exit(1);
  }
  const { contractAddress } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  console.log('\n─── Private evidence (stays on this machine) ─────────────\n');
  if (BUNDLE) {
    console.log(`  source             ${BUNDLE.file}`);
    console.log(
      `  ✓ signature        verified under keyid ${BUNDLE.attestorPublicKey.keyid.slice(0, 16)}…`,
    );
    console.log('  ✓ leaf             re-derived via pureCircuits.leafOf');
    if (BUNDLE.demo) console.log('  ⚠ demo bundle      synthetic evidence, salt in cleartext');
    console.log('');
  }
  console.log(`  vendor / product   ${VENDOR} / ${PRODUCT}`);
  console.log(`  criticals ${canonical.vulns.criticals}   highs ${canonical.vulns.highs}   kev ${canonical.vulns.kev}`);
  console.log(`  forbiddenDeps ${canonical.deps.forbidden}   vulnDeps ${canonical.deps.vulnerable}`);
  console.log(
    `  mfa ${canonical.config.mfaRequired}   branchProtected ${canonical.config.branchProtected}   ` +
      `provenance ${canonical.config.buildProvenanceVerified}   ciGreen ${canonical.config.ciGreen}`,
  );
  console.log(`  validity window    ${(canonical.validUntil - canonical.generatedAt) / 86400} days`);
  const mismatches = [
    CLAIM_VENDOR !== VENDOR && `vendor: evidence "${VENDOR}" vs claim "${CLAIM_VENDOR}"`,
    CLAIM_PRODUCT !== PRODUCT && `product: evidence "${PRODUCT}" vs claim "${CLAIM_PRODUCT}"`,
    CLAIM_ARTIFACT !== ARTIFACT && 'artifact: evidence and claim differ',
  ].filter(Boolean) as string[];
  if (mismatches.length) {
    console.log('\n  ⚠ deliberate identity mismatch — expect the circuit to reject:');
    for (const m of mismatches) console.log(`      ${m}`);
  }
  console.log('');

  // encodeEvidence throws on malformed input before any chain work happens.
  const evidence = encodeEvidence(canonical);

  if (!(await waitForProofServer())) {
    console.error('❌ Proof server not responding on :6300. Run: npm run devnet:up\n');
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

  // A bundle's salt is fixed — it is half of the commitment the attestor signed,
  // so re-salting would invalidate the leaf. Otherwise a fresh salt per run, so
  // each invocation produces a distinct leaf and a distinct nullifier rather
  // than hitting "already proven" on the second go.
  let salt: Uint8Array;
  if (BUNDLE) {
    salt = unhex32(BUNDLE.salt, 'bundle.salt');
  } else {
    salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
  }

  const leaf = pureCircuits.leafOf(evidence, salt);
  console.log('─── Attest ───────────────────────────────────────────────\n');
  console.log(`  leaf ${Buffer.from(leaf).toString('hex').slice(0, 24)}…`);
  await providers.privateStateProvider.setContractAddress(contractAddress);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, anchorState);
  await withDustRetry('attest', () => contract.callTx.attest(leaf));
  console.log('  anchored.\n');

  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) throw new Error('queryContractState returned null');
  const path = ledger(state.data).attestations.findPathForLeaf(leaf);
  if (!path) throw new Error('leaf not found in the attestations tree after attest()');

  await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
    secretKey: null,
    evidence,
    salt,
    path,
  } satisfies AuditPrivateState);

  console.log(`─── Prove against ${policySlug} ${'─'.repeat(Math.max(0, 28 - policySlug.length))}\n`);
  let verdict: boolean;
  try {
    const tx = await withDustRetry('prove', () =>
      contract.callTx.proveCompliance(
        vendorIdOf(CLAIM_VENDOR),
        productIdOf(CLAIM_PRODUCT),
        encodeArtifactDigest(CLAIM_ARTIFACT),
        policyIdBytes,
      ),
    );
    verdict = tx.private.result as boolean;
  } catch (err: any) {
    // An assert failure is a legitimate outcome to observe manually — surface
    // the circuit's message rather than a stack trace.
    const message = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
    const known = [
      'artifact mismatch',
      'vendor mismatch',
      'product mismatch',
      'not attested',
      'already proven',
      'attestor not accepted',
      'validity window exceeds policy',
      'path/leaf mismatch',
      'not anchor',
    ].find((m) => message.includes(m));
    if (known) {
      console.log(`  ⛔ REJECTED by the circuit: "${known}"\n`);
      console.log('  No record was written. The assert fired before the predicate.\n');
      await ctx.wallet.stop();
      process.exit(2);
    }
    throw err;
  }

  console.log(`  → ${verdict ? '✓ PASS' : '✗ FAIL'}\n`);

  const after = await providers.publicDataProvider.queryContractState(contractAddress);
  const key = recordKey(CLAIM_ARTIFACT, policySlug);
  const record = after && ledger(after.data).records.member(key)
    ? ledger(after.data).records.lookup(key)
    : undefined;

  console.log('─── Public record ────────────────────────────────────────\n');
  if (!record) {
    console.log('  (none)\n');
  } else {
    console.log(`  compliant       ${record.compliant}`);
    console.log(`  policy version  ${record.policyVersion}`);
    console.log(`  evidence date   ${new Date(Number(record.provenAt) * 1000).toISOString().slice(0, 10)}`);
    console.log(`  valid until     ${new Date(Number(record.validUntil) * 1000).toISOString().slice(0, 10)}\n`);
  }
  console.log('  Run `npm run devnet:inspect` to see the full public view.\n');

  await ctx.wallet.stop();
  process.exit(verdict ? 0 : 1);
}

main().catch((err) => {
  console.error('\n❌ Failed:\n');
  console.error(err);
  process.exit(1);
});
