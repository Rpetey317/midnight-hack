#!/usr/bin/env -S npx tsx
/**
 * Run the checks and write a collector report.
 *
 *     zkuat-collect --config zkuat.collector.json --out evidence-raw.json
 *
 * Then hand it to the attestor:
 *
 *     zkuat-attest --report evidence-raw.json --key attestor.key.json --out out/
 *
 * ⚠️ The report is PRIVATE. Its `detail` fields carry CVE identifiers, package
 *    names, and the dependency count. Do not attach it to an attestation, do
 *    not upload it as a public artifact, do not paste it into an issue.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { degradedChecks } from '@zkuat/attestor';

import { collect } from '../index.js';
import { loadConfig } from '../config.js';

const USAGE = `
Run supply-chain checks and emit a private collector report.

  zkuat-collect [flags]

  --config <file>   collector config (default zkuat.collector.json)
  --out <file>      report output (default evidence-raw.json)
  --commit <sha>    override the measured commit (CI passes GITHUB_SHA)
  --at <unix>       override collectedAt, for reproducible runs
  --cache <dir>     KEV / advisory cache (default <projectDir>/.zkuat-cache)
  --quiet           no summary, just write the file

Exit code is 0 whenever a report was produced, including a degraded one. Only
a missing artifact fails the run — §10 makes the digest mandatory. Read the
summary; the attestor will refuse to sign a degraded report without
--allow-degraded.
`;

function parse(argv: string[]): Map<string, string | boolean> {
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(arg.slice(2), next);
      i++;
    } else {
      flags.set(arg.slice(2), true);
    }
  }
  return flags;
}

async function main() {
  const flags = parse(process.argv.slice(2));
  if (flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const get = (name: string, fallback: string): string => {
    const raw = flags.get(name);
    return typeof raw === 'string' ? raw : fallback;
  };

  const configFile = path.resolve(get('config', 'zkuat.collector.json'));
  if (!fs.existsSync(configFile)) {
    throw new Error(`No config at ${configFile}. See collector/zkuat.collector.json for a worked example.`);
  }

  const { config, configHash } = loadConfig(configFile);
  const quiet = flags.has('quiet');

  if (!quiet) {
    console.log(`\n  config      ${configFile}`);
    console.log(`  configHash  ${configHash.slice(0, 16)}…   (pins how these facts were measured)`);
    console.log(`  project     ${config.projectDir}`);
    console.log(`  artifact    ${config.artifactPath}`);
    console.log(`  repo        ${config.repo}\n`);
    console.log('  running checks…\n');
  }

  const report = await collect(config, configHash, {
    commit: flags.has('commit') ? get('commit', '') : undefined,
    collectedAt: flags.has('at') ? Number(get('at', '')) : undefined,
    cacheDir: flags.has('cache') ? path.resolve(get('cache', '')) : undefined,
  });

  const outFile = path.resolve(get('out', 'evidence-raw.json'));
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  // 0600: `detail` holds the CVE list and the package names.
  fs.chmodSync(outFile, 0o600);

  if (quiet) return;

  const icon = { measured: '✓', stubbed: '~', unavailable: '✗' } as const;
  for (const [name, check] of Object.entries(report.checks)) {
    const shown = typeof check.value === 'string' ? `${check.value.slice(0, 20)}…` : String(check.value);
    console.log(`  ${icon[check.status]} ${name.padEnd(24)} ${shown.padEnd(12)} ${check.source}`);
    if (check.error) console.log(`      ↳ ${check.error}`);
  }

  const degraded = degradedChecks(report);
  console.log(`\n  ${11 - degraded.length} of 11 checks measured.`);
  if (degraded.length) {
    console.log(`  ${degraded.length} not measured: ${degraded.map(([n]) => n).join(', ')}`);
    console.log('  The attestor will refuse to sign these without --allow-degraded.');
  }
  console.log(`\n  ${outFile}   ⚠️  PRIVATE — carries CVE ids and package names, mode 0600\n`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  if (process.env.ZKUAT_DEBUG && err instanceof Error) console.error(err.stack);
  process.exit(1);
});
