#!/usr/bin/env -S npx tsx
/**
 * Generate the committed demo fixtures.
 *
 *     npm run fixtures            # deterministic: fixed generatedAt, stable leaves
 *     npm run fixtures:refresh    # re-stamp to now and re-sign
 *
 * ⚠️ RUN `fixtures:refresh` BEFORE THE PITCH.
 *
 * Fixtures are committed with a pinned `generatedAt` so their leaves are stable
 * and a diff means something. But `validUntil` is 29 days after that pin, so a
 * fixture eventually renders as EXPIRED in the buyer view — which is correct
 * behaviour and a terrible thing to discover on stage. Refresh re-stamps to now.
 *
 * Every fixture goes through the same `normalize()` the live pipeline uses, so
 * a validation rule that would reject real collector output rejects a fixture
 * too. The only difference between this and the live path is where the report
 * comes from.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POLICY_BANK_SLUG, POLICY_ENTERPRISE_SLUG, recordKey } from '@zkuat/contract';

import { buildBundle, unhex32, verifyBundle, writeBundle } from '../bundle.js';
import { readPrivateKey } from '../keys.js';
import { normalize } from '../normalize.js';
import { buildPredicate } from '../predicate.js';
import { loadScenarioBase, loadScenarios, patchReport, synthesizeReport } from '../scenario.js';
import type { CollectorReport } from '../report.js';
import { bool, die, parseArgs, str } from './args.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.resolve(HERE, '..', '..', '..', 'demo');

/**
 * The pinned timestamp for deterministic builds: **2026-08-07T00:00:00Z**.
 *
 * Deliberately *not* the `1_754_582_400` in `contract/src/test/fixtures.ts` —
 * that value is 2025-08-07, a year in the past. Harmless there, because the
 * simulator never compares a timestamp to a wall clock. Not harmless here: a
 * fixture stamped a year ago has a `validUntil` a year ago, so the buyer view
 * correctly renders every demo fixture as EXPIRED.
 *
 * Even this pin goes stale. `npm run fixtures:refresh` re-stamps to now, and
 * the fixture test asserts the committed fixtures are still in date.
 */
const PINNED_GENERATED_AT = 1_786_060_800;

const USAGE = `
Generate the demo evidence fixtures from demo/scenarios/.

  npm run fixtures -- [flags]

  --now              stamp generatedAt to the current time and re-sign
                     (this is what fixtures:refresh does — run it before the pitch)
  --at <unix>        stamp a specific timestamp
  --key <file>       attestor private key
                     (default demo/keys/zkuat-attestor-v1.key.json)
  --scenarios <dir>  scenario directory (default demo/scenarios)
  --out <dir>        fixture output directory (default demo/fixtures)
  --from-report <f>  patch scenarios onto a REAL collector report instead of
                     synthesizing one from _base.json:

                       cd collector && npx zkuat-collect --out /tmp/report.json
                       cd ../attestor && npm run fixtures -- --from-report /tmp/report.json

                     Every fact the scenario does not override is then a real
                     measurement, and each overridden check records what was
                     actually measured in its detail. The report stays marked
                     synthetic either way.
`;

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const scenarioDir = path.resolve(str(flags, 'scenarios', path.join(DEMO, 'scenarios')));
  const outDir = path.resolve(str(flags, 'out', path.join(DEMO, 'fixtures')));
  const keyFile = path.resolve(
    str(flags, 'key', path.join(DEMO, 'keys', 'zkuat-attestor-v1.key.json')),
  );

  if (!fs.existsSync(keyFile)) {
    throw new Error(
      `No attestor key at ${keyFile}.\n   Generate one:\n` +
        `     npm run keygen -- --attestor zkuat-attestor-v1 --out ${path.join(DEMO, 'keys')}`,
    );
  }

  const generatedAt = flags.has('at')
    ? Number(str(flags, 'at', ''))
    : bool(flags, 'now', false)
      ? Math.floor(Date.now() / 1000)
      : PINNED_GENERATED_AT;
  if (!Number.isInteger(generatedAt) || generatedAt <= 0) {
    throw new Error(`--at must be a unix timestamp in seconds, got "${flags.get('at')}"`);
  }

  const key = readPrivateKey(keyFile);
  const base = loadScenarioBase(scenarioDir);
  const scenarios = loadScenarios(scenarioDir);
  if (!scenarios.length) throw new Error(`No scenarios found in ${scenarioDir}`);

  const measured: CollectorReport | null = flags.has('from-report')
    ? (JSON.parse(fs.readFileSync(path.resolve(str(flags, 'from-report', '')), 'utf8')) as CollectorReport)
    : null;

  console.log(`\n  attestor    ${key.attestor}  (keyid ${key.keyid.slice(0, 16)}…)`);
  console.log(`  generatedAt ${generatedAt}  ${new Date(generatedAt * 1000).toISOString()}`);
  console.log(
    `  validUntil  ${new Date((generatedAt + base.subject.validDays * 86400) * 1000).toISOString()}`,
  );
  if (!bool(flags, 'now', false) && !flags.has('at')) {
    console.log('  (pinned timestamp — run `npm run fixtures:refresh` before the pitch)');
  }
  console.log('');

  const index: Array<Record<string, unknown>> = [];

  if (measured) {
    console.log(`  source      ${str(flags, 'from-report', '')}  (real collector report, patched)\n`);
  }

  for (const scenario of scenarios) {
    const report = measured
      ? patchReport({ ...measured, provenance: { ...measured.provenance, collectedAt: generatedAt } }, scenario)
      : synthesizeReport(base, scenario, generatedAt);
    const evidence = normalize(report, { generatedAt });
    const salt = unhex32(scenario.salt, `scenario "${scenario.name}" salt`);

    const bundle = buildBundle({
      evidence,
      key,
      salt,
      attestedAt: generatedAt,
      demo: true,
      collector: {
        name: report.provenance.collector,
        version: report.provenance.collectorVersion,
        configHash: report.provenance.configHash,
        synthetic: true,
        scenario: scenario.name,
      },
    });

    // Belt and braces: verify what we just wrote, through the same code path
    // Track C will use. A fixture that does not verify is worse than no fixture.
    verifyBundle(bundle, { trustedKeyIds: [key.keyid] });

    const predicate = buildPredicate(bundle, {
      repo: report.subject.repo,
      sha: report.subject.commit,
    });

    const dir = path.join(outDir, scenario.name);
    fs.mkdirSync(dir, { recursive: true });
    // The canonical evidence, pretty-printed, purely so a human can read the
    // fixture. The SIGNED form is bundle.envelope.payload — key-sorted and
    // whitespace-free. Editing this file changes nothing and verifies nothing.
    fs.writeFileSync(
      path.join(dir, 'evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    writeBundle(path.join(dir, 'bundle.json'), bundle);
    fs.writeFileSync(
      path.join(dir, 'predicate.json'),
      `${JSON.stringify(predicate, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(dir, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    const hexKey = (slug: string) =>
      Buffer.from(recordKey(evidence.artifactDigest, slug)).toString('hex');

    index.push({
      name: scenario.name,
      title: scenario.title,
      why: scenario.why,
      leaf: bundle.leaf,
      artifactDigest: evidence.artifactDigest,
      recordKeys: {
        [POLICY_BANK_SLUG]: hexKey(POLICY_BANK_SLUG),
        [POLICY_ENTERPRISE_SLUG]: hexKey(POLICY_ENTERPRISE_SLUG),
      },
    });

    console.log(`  ✓ ${scenario.name.padEnd(18)} leaf ${bundle.leaf.slice(0, 16)}…`);
    console.log(`    ${scenario.title}`);
  }

  fs.writeFileSync(
    path.join(outDir, 'index.json'),
    `${JSON.stringify({ generatedAt, attestor: key.attestor, keyid: key.keyid, fixtures: index }, null, 2)}\n`,
  );

  console.log(`\n  ${scenarios.length} fixtures written to ${outDir}`);
  console.log('  index.json carries the leaves and the buyer-side record keys.\n');
}

main().catch(die);
