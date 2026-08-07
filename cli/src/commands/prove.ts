/**
 * Prove a signed evidence bundle against one policy.
 *
 * The bundle is not optional and cannot be: it carries the salt, and the salt
 * is half of the commitment the attestor signed. Without it there is no
 * witness, no path, and no proof — ever. Losing a salt makes its evidence
 * unprovable permanently.
 *
 * The leaf must already be anchored. That separation is the point of the two
 * commands: anchoring is the operator's trust decision, proving is the vendor's
 * claim, and they are different people holding different secrets. `attest` needs
 * the anchor secret; this needs the evidence.
 */
import * as fs from 'node:fs';

import { connect, PRIVATE_STATE_ID, readLedger, receiptForLeaf, trustedKeyIds } from '@zkuat/anchor';
import { bundleToPrivateState, loadBundle } from '@zkuat/attestor';
import { parseArgs, required, str } from '@zkuat/attestor/src/cli/args.js';

import {
  encodeArtifactDigest,
  policyId,
  productId,
  recordKey,
  vendorId,
} from '../../../contract/src/encoding.js';
import type { AuditPrivateState } from '../../../contract/src/witnesses.js';

export const PROVE_USAGE = `
Prove an anchored evidence bundle against one policy.

  zkuat prove --bundle <path> --policy <slug> --artifact <digest> [flags]

  --bundle <path>     the signed bundle — carries the evidence and the salt
  --policy <slug>     bank-v1 | enterprise-v1
  --artifact <digest> 64-hex, optional sha256: prefix. What you claim publicly.
  --vendor <name>     defaults to the evidence's vendor
  --product <name>    defaults to the evidence's product

Exit 0 the predicate passed · 1 it failed · 2 the circuit rejected the call.
`;

/** Circuit assert messages that are outcomes to report, not crashes to trace. */
const KNOWN_ASSERTS = [
  'artifact mismatch',
  'vendor mismatch',
  'product mismatch',
  'not attested',
  'already proven',
  'attestor not accepted',
  'validity window exceeds policy',
  'path/leaf mismatch',
  'not anchor',
];

export async function runProve(argv: string[]): Promise<never | void> {
  const flags = parseArgs(argv);
  if (flags.has('help')) {
    console.log(PROVE_USAGE);
    return;
  }

  const file = required(flags, 'bundle', PROVE_USAGE);
  const policySlug = required(flags, 'policy', PROVE_USAGE);
  const artifact = required(flags, 'artifact', PROVE_USAGE);
  if (!fs.existsSync(file)) throw new Error(`no such bundle: ${file}`);

  // Verifies before returning — DSSE signature under a trusted key, statement
  // against the signed payload, and the leaf re-derived through the contract's
  // own pureCircuits.leafOf. A drifted schema fails here rather than as
  // "path/leaf mismatch" minutes into proof generation.
  const bundle = loadBundle(file);
  const { evidence, salt, leaf } = bundleToPrivateState(bundle, {
    trustedKeyIds: trustedKeyIds(),
  });

  const claimVendor = str(flags, 'vendor', bundle.statement.evidence.vendor);
  const claimProduct = str(flags, 'product', bundle.statement.evidence.product);
  // Throws on a malformed digest before any chain work happens.
  const artifactBytes = encodeArtifactDigest(artifact);
  const policyIdBytes = policyId(policySlug);

  const leafHex = Buffer.from(leaf).toString('hex');
  const receipt = receiptForLeaf(leafHex);
  if (!receipt) {
    throw new Error(
      `leaf ${leafHex.slice(0, 16)}… is not anchored. Run:\n\n` +
        `      zkuat anchor --bundle ${file} --repo <owner/name>\n`,
    );
  }

  console.log('\n─── Private evidence (never leaves this machine) ─────────\n');
  console.log(`  source             ${file}`);
  console.log(`  ✓ signature        verified under keyid ${bundle.attestorPublicKey.keyid.slice(0, 16)}…`);
  console.log(`  ✓ anchored         index ${receipt.index} · tx ${receipt.txId.slice(0, 16)}…`);
  if (bundle.demo) console.log('  ⚠ demo bundle      synthetic evidence, salt in cleartext');
  console.log('');
  console.log(`  claiming           ${claimVendor} / ${claimProduct}`);
  console.log(`  artifact           ${artifact}`);
  console.log(`  against policy     ${policySlug}`);
  console.log('');

  // secretKey: null — a vendor proving compliance is not the anchor, and never
  // invokes the localSecret witness.
  const proverState: AuditPrivateState = {
    secretKey: null,
    evidence: null,
    salt: null,
    path: null,
  };
  const { ctx, providers, contract, contractAddress } = await connect(proverState);

  try {
    const l = await readLedger(providers, contractAddress);
    // The index from the receipt turns an O(n) scan into a direct lookup. A
    // negative index means the anchor could not confirm one — fall back.
    const path =
      receipt.index >= 0
        ? l.attestations.pathForLeaf(BigInt(receipt.index), leaf)
        : l.attestations.findPathForLeaf(leaf);
    if (!path) throw new Error('leaf is not in the attestations tree — was the chain reset?');

    await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
      secretKey: null,
      evidence,
      salt,
      path,
    } satisfies AuditPrivateState);

    console.log(`─── Prove against ${policySlug} ${'─'.repeat(Math.max(0, 28 - policySlug.length))}\n`);

    let verdict: boolean;
    try {
      const tx = await contract.callTx.proveCompliance(
        vendorId(claimVendor),
        productId(claimProduct),
        artifactBytes,
        policyIdBytes,
      );
      verdict = tx.private.result as boolean;
    } catch (err: any) {
      const message = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
      const known = KNOWN_ASSERTS.find((m) => message.includes(m));
      if (!known) throw err;
      console.log(`  ⛔ REJECTED by the circuit: "${known}"\n`);
      console.log('  No record was written. The assert fired before the predicate.\n');
      await ctx.wallet.stop();
      process.exit(2);
    }

    console.log(`  → ${verdict ? '✓ PASS' : '✗ FAIL'}\n`);

    const after = await readLedger(providers, contractAddress);
    const key = recordKey(artifact, policySlug);
    const record = after.records.member(key) ? after.records.lookup(key) : undefined;

    console.log('─── Public record ────────────────────────────────────────\n');
    if (!record) {
      console.log('  (none)\n');
    } else {
      console.log(`  compliant       ${record.compliant}`);
      console.log(`  policy version  ${record.policyVersion}`);
      console.log(`  evidence date   ${day(record.provenAt)}`);
      console.log(`  valid until     ${day(record.validUntil)}\n`);
    }
    console.log(`  Next: zkuat status --artifact ${artifact.replace(/^sha256:/, '').slice(0, 16)}…\n`);

    await ctx.wallet.stop();
    process.exit(verdict ? 0 : 1);
  } catch (err) {
    await ctx.wallet.stop();
    throw err;
  }
}

const day = (unix: bigint) => new Date(Number(unix) * 1000).toISOString().slice(0, 10);
