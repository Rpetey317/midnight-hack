#!/usr/bin/env -S npx tsx
/**
 * Verify an evidence bundle, offline, with no chain and no network.
 *
 *     zkuat-verify-bundle demo/fixtures/bank-only/bundle.json
 *
 * Checks the DSSE signature, that the readable statement matches the signed
 * payload, and that the leaf re-derives through the contract's own
 * `pureCircuits.leafOf`. That last one is the interesting check: it is what
 * catches a Track A schema change, because a changed `Evidence` struct produces
 * a different commitment from identical JSON.
 *
 * Exit 0 on success, 1 on any failure — usable as a CI gate.
 */
import * as fs from 'node:fs';

import { encodeEvidence, pureCircuits } from '@zkuat/contract';

import { loadBundle, unhex32, verifyBundle } from '../bundle.js';
import { readPublicKey } from '../keys.js';
import { die, parseArgs, str } from './args.js';

const USAGE = `
Verify an evidence bundle offline.

  zkuat-verify-bundle <bundle.json> [flags]

  --trust <pub.json>   require this attestor public key (repeatable via commas)
  --quiet              exit code only

Without --trust the signature is checked against the key the bundle CARRIES,
which proves the bundle is internally consistent and nothing about who signed
it. Track C's anchor must pass --trust.
`;

async function main() {
  const argv = process.argv.slice(2);
  const flags = parseArgs(argv);
  if (flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const file = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'));
  if (!file) {
    console.error(`❌ Give me a bundle path.\n${USAGE}`);
    process.exit(1);
  }
  if (!fs.existsSync(file)) throw new Error(`No such bundle: ${file}`);

  const quiet = flags.has('quiet');
  const bundle = loadBundle(file);

  const trustedKeyIds = flags.has('trust')
    ? str(flags, 'trust', '')
        .split(',')
        .map((f) => readPublicKey(f.trim()).keyid)
    : undefined;

  verifyBundle(bundle, { trustedKeyIds });

  if (quiet) return;

  const { evidence } = bundle.statement;
  const leaf = pureCircuits.leafOf(encodeEvidence(evidence), unhex32(bundle.salt, 'salt'));

  console.log(`\n  ✓ signature      valid under keyid ${bundle.attestorPublicKey.keyid.slice(0, 16)}…`);
  console.log('  ✓ statement      matches the signed payload byte for byte');
  console.log(`  ✓ leaf           re-derives via pureCircuits.leafOf → ${Buffer.from(leaf).toString('hex').slice(0, 16)}…`);
  console.log(`  ✓ schema         ${bundle.statement.schema}`);
  console.log('');
  console.log(`  vendor / product ${evidence.vendor} / ${evidence.product}`);
  console.log(`  artifact         ${evidence.artifactDigest.slice(0, 24)}…`);
  console.log(`  evidence date    ${new Date(evidence.generatedAt * 1000).toISOString().slice(0, 10)}`);
  console.log(`  valid until      ${new Date(evidence.validUntil * 1000).toISOString().slice(0, 10)}`);

  const expired = evidence.validUntil * 1000 < Date.now();
  if (expired) {
    console.log('\n  ⚠️  This evidence is EXPIRED. A proof from it records validUntil in the past,');
    console.log('     and a correct buyer view renders it as EXPIRED. For demo fixtures, run');
    console.log('     `npm run fixtures:refresh` in attestor/.');
  }
  if (bundle.demo) {
    console.log('\n  ⚠️  demo: true — synthetic evidence, salt committed in cleartext.');
  }
  if (bundle.statement.collector?.synthetic) {
    console.log(`     scenario "${bundle.statement.collector.scenario}" — not a measurement.`);
  }
  console.log('');
}

main().catch(die);
