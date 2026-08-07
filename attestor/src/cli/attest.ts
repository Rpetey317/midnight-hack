#!/usr/bin/env -S npx tsx
/**
 * Normalize a collector report, sign it, and emit the two documents.
 *
 *     zkuat-attest --report evidence-raw.json --key attestor.key.json --out out/
 *
 * Writes:
 *
 *     out/bundle.json      PRIVATE — evidence, salt, leaf, signature.
 *                          Never publish. Never attach to an attestation.
 *     out/predicate.json   PUBLIC  — { leaf, repo, sha, schema }.
 *                          This is what actions/attest signs into Rekor.
 *
 * The split is the privacy design. `assertNoEvidenceLeak` runs before the
 * predicate is written, so a mistake here fails the command rather than
 * publishing findings to a public transparency log.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildBundle, verifyBundle, writeBundle } from '../bundle.js';
import { readPrivateKey } from '../keys.js';
import { degradationWarning, normalize } from '../normalize.js';
import { buildPredicate } from '../predicate.js';
import type { CollectorReport } from '../report.js';
import { bool, die, parseArgs, required, str } from './args.js';

const USAGE = `
Normalize, sign, and split a collector report.

  zkuat-attest --report <file> --key <file> [flags]

  --report <file>    collector report JSON (from zkuat-collect)
  --key <file>       attestor ed25519 private key
  --out <dir>        output directory (default .)

Cross-checks against what the build actually produced. In CI, pass these from
the workflow rather than trusting the report:
  --expect-commit <sha>       GITHUB_SHA
  --expect-digest <sha256>    sha256sum of the built artifact
  --expect-repo <owner/repo>  GITHUB_REPOSITORY

  --at <unix>        override generatedAt (default: the report's collectedAt)
  --allow-degraded   sign even when checks were stubbed or unavailable
  --print-evidence   echo the canonical evidence to stdout

⚠️  bundle.json is PRIVATE. It carries the salt, and the salt is what blinds
    the commitment. Upload it as a private artifact with short retention, hand
    it to the vendor, and never attach it to an attestation predicate.
`;

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const reportFile = required(flags, 'report', USAGE);
  const keyFile = required(flags, 'key', USAGE);
  const outDir = path.resolve(str(flags, 'out', '.'));

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as CollectorReport;
  const key = readPrivateKey(keyFile);

  const warning = degradationWarning(report);
  if (warning) {
    console.error(`\n${warning}\n`);
    if (!bool(flags, 'allow-degraded', false)) {
      throw new Error(
        'Refusing to sign a report with unmeasured checks. Pass --allow-degraded if the ' +
          'stubs above are deliberate — but read them first: once signed, a stubbed value is ' +
          'indistinguishable from a measured one.',
      );
    }
    console.error('  --allow-degraded given; signing anyway.\n');
  }

  const evidence = normalize(report, {
    generatedAt: flags.has('at') ? Number(str(flags, 'at', '')) : undefined,
    expect: {
      commit: flags.has('expect-commit') ? str(flags, 'expect-commit', '') : undefined,
      artifactDigest: flags.has('expect-digest') ? str(flags, 'expect-digest', '') : undefined,
      repo: flags.has('expect-repo') ? str(flags, 'expect-repo', '') : undefined,
    },
  });

  if (bool(flags, 'print-evidence', false)) {
    console.log(JSON.stringify(evidence, null, 2));
  }

  const bundle = buildBundle({
    evidence,
    key,
    collector: {
      name: report.provenance.collector,
      version: report.provenance.collectorVersion,
      configHash: report.provenance.configHash,
      ...(report.provenance.synthetic ? { synthetic: true } : {}),
      ...(report.provenance.scenario ? { scenario: report.provenance.scenario } : {}),
    },
  });
  verifyBundle(bundle, { trustedKeyIds: [key.keyid] });

  const predicate = buildPredicate(bundle, {
    repo: report.subject.repo,
    sha: report.subject.commit,
  });

  fs.mkdirSync(outDir, { recursive: true });
  const bundlePath = path.join(outDir, 'bundle.json');
  const predicatePath = path.join(outDir, 'predicate.json');
  // 0600 on the bundle: it holds the salt, and losing control of the salt
  // unblinds the commitment for anyone holding the public leaf.
  writeBundle(bundlePath, bundle);
  fs.chmodSync(bundlePath, 0o600);
  fs.writeFileSync(predicatePath, `${JSON.stringify(predicate, null, 2)}\n`);

  console.log(`\n  vendor / product   ${evidence.vendor} / ${evidence.product}`);
  console.log(`  artifact           ${evidence.artifactDigest.slice(0, 24)}…`);
  console.log(`  commit             ${evidence.commit.slice(0, 12)}…`);
  console.log(`  evidence date      ${new Date(evidence.generatedAt * 1000).toISOString().slice(0, 10)}`);
  console.log(`  valid until        ${new Date(evidence.validUntil * 1000).toISOString().slice(0, 10)}`);
  console.log(`  leaf               ${bundle.leaf}`);
  console.log(`  attestor keyid     ${key.keyid.slice(0, 16)}…\n`);
  console.log(`  ${bundlePath}     PRIVATE — salt + evidence, mode 0600`);
  console.log(`  ${predicatePath}  public  — leaf + repo + sha + schema\n`);
}

main().catch(die);
