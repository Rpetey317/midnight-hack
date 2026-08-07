/**
 * Parser and degradation tests for each check.
 *
 * The failure paths get more attention than the happy paths on purpose. The
 * happy path runs on a developer's machine with a warm network; the failure
 * paths run at 02:00 against a rate-limited API on a tethered phone, and that
 * is when a wrong answer actually reaches a signature.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkArtifactDigest, sha256File } from '../checks/artifact.js';
import { checkCoverage, parseLcov, parseSummary } from '../checks/coverage.js';
import { checkForbiddenDeps, flattenTree, matches } from '../checks/forbidden.js';
import { checkKev } from '../checks/kev.js';
import { extractAdvisories, parseAudit } from '../checks/npm-audit.js';
import { hashConfig } from '../config.js';
import { parseJson } from '../exec.js';

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'zkuat-collector-'));

describe('artifact digest', () => {
  it('hashes a file', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'a.bin'), 'hello');
    // sha256("hello")
    expect(await sha256File(path.join(dir, 'a.bin'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('reports the sha256: prefix and the byte count', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'a.bin'), 'hello');
    const check = await checkArtifactDigest(path.join(dir, 'a.bin'));
    expect(check.status).toBe('measured');
    expect(check.value).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(check.detail).toEqual({ bytes: 5 });
  });

  it('throws on a missing artifact rather than degrading — §10 makes it mandatory', async () => {
    await expect(checkArtifactDigest(path.join(tmp(), 'nope.bin'))).rejects.toThrow(
      /artifact digest is mandatory/,
    );
  });

  it('refuses a directory, because two tools would not agree on how to hash one', async () => {
    await expect(checkArtifactDigest(tmp())).rejects.toThrow(/is a directory/);
  });
});

describe('npm audit parsing', () => {
  // Recorded from `npm audit --json` at auditReportVersion 2 (npm 11.12.1).
  const REPORT = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      'cross-spawn': {
        name: 'cross-spawn',
        severity: 'high',
        isDirect: false,
        via: [{ source: 1, title: 'ReDoS', url: 'https://github.com/advisories/GHSA-3xgq-45jj-v275', severity: 'high' }],
      },
      'internal-billing-lib': {
        name: 'internal-billing-lib',
        severity: 'critical',
        isDirect: true,
        via: ['cross-spawn'],
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 1, total: 2 } },
  });

  it('reads the counts out of metadata', () => {
    const facts = parseAudit(REPORT, 'test')!;
    expect(facts.criticals.value).toBe(1);
    expect(facts.highs.value).toBe(1);
    expect(facts.vulnDeps.value).toBe(2);
    expect(facts.scanned).toBe(true);
  });

  it('extracts GHSA identifiers for the KEV cross-reference', () => {
    expect(parseAudit(REPORT, 'test')!.advisories).toEqual(['GHSA-3XGQ-45JJ-V275']);
  });

  it('ignores string `via` entries, which are dependency names not advisories', () => {
    expect(extractAdvisories(JSON.parse(REPORT))).toHaveLength(1);
  });

  it('keeps package names in detail, where normalize() will never read them', () => {
    const detail = parseAudit(REPORT, 'test')!.criticals.detail as { packages: Array<{ name: string }> };
    expect(detail.packages.map((p) => p.name)).toContain('internal-billing-lib');
  });

  it('returns null on an unparseable dump rather than throwing', () => {
    expect(parseAudit('not json at all', 'test')).toBeNull();
    expect(parseAudit('{}', 'test')).toBeNull();
  });

  it('handles a clean project — zero vulnerabilities is a real measurement', () => {
    const clean = JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { critical: 0, high: 0, total: 0 } },
    });
    const facts = parseAudit(clean, 'test')!;
    expect(facts.criticals.status).toBe('measured');
    expect(facts.criticals.value).toBe(0);
    expect(facts.advisories).toEqual([]);
  });
});

describe('kev', () => {
  it('reports a measured zero when a scan ran and found no advisories', async () => {
    const check = await checkKev([], tmp(), undefined, true);
    expect(check).toMatchObject({ value: 0, status: 'measured' });
  });

  it('does NOT report a measured zero when the advisory scan failed', async () => {
    // The most dangerous lie available to this collector: "no known-exploited
    // vulnerabilities" manufactured from an audit that never ran. Found while
    // exercising the offline path.
    const check = await checkKev([], tmp(), undefined, false);
    expect(check.status).toBe('unavailable');
    expect(check.error).toMatch(/advisory scan did not run/);
  });

  it('uses a configured stub, and labels it as one, when the scan failed', async () => {
    const check = await checkKev([], tmp(), 0, false);
    expect(check).toMatchObject({ value: 0, status: 'stubbed' });
  });
});

describe('forbidden dependencies', () => {
  const TREE = {
    dependencies: {
      a: { version: '1.0.0', dependencies: { 'left-pad': { version: '1.3.0' } } },
      b: { version: '2.0.0', dependencies: { 'left-pad': { version: '1.3.0' } } },
      colors: { version: '1.4.0' },
    },
  };

  it('flattens the tree and de-duplicates shared dependencies', () => {
    // npm ls repeats a shared dependency at every use site; counting it twice
    // would double-report a single forbidden package.
    expect(flattenTree(TREE)).toEqual([
      { name: 'a', version: '1.0.0' },
      { name: 'b', version: '2.0.0' },
      { name: 'colors', version: '1.4.0' },
      { name: 'left-pad', version: '1.3.0' },
    ]);
  });

  it('matches by name, and by name@version when pinned', () => {
    const pkg = { name: 'colors', version: '1.4.0' };
    expect(matches(pkg, 'colors')).toBe(true);
    expect(matches(pkg, 'colors@1.4.0')).toBe(true);
    expect(matches(pkg, 'colors@1.4.44-liberty-2')).toBe(false);
    expect(matches(pkg, 'color')).toBe(false);
  });

  it('handles scoped packages, whose names contain an @', () => {
    const pkg = { name: '@scope/pkg', version: '1.0.0' };
    expect(matches(pkg, '@scope/pkg')).toBe(true);
    expect(matches(pkg, '@scope/pkg@1.0.0')).toBe(true);
    expect(matches(pkg, '@scope/pkg@2.0.0')).toBe(false);
  });

  it('measures zero for an empty prohibited list without shelling out', async () => {
    const check = await checkForbiddenDeps('/nonexistent', [], undefined);
    expect(check).toMatchObject({ value: 0, status: 'measured' });
  });

  it('degrades when npm ls produces nothing parseable', async () => {
    const check = await checkForbiddenDeps(tmp(), ['left-pad'], undefined);
    expect(check.status).not.toBe('measured');
    expect(check.error).toBeTruthy();
  });
});

describe('coverage', () => {
  it('reads coverage-summary.json as percent × 100', () => {
    expect(parseSummary(JSON.stringify({ total: { lines: { pct: 87.34 } } }))).toBe(8734);
  });

  it('computes lcov coverage over total lines, not the mean of per-file rates', () => {
    // A one-line file at 100% and a 99-line file at 0% is 1% coverage, not 50%.
    expect(parseLcov('LF:1\nLH:1\nend_of_record\nLF:99\nLH:0\nend_of_record\n')).toBe(100);
  });

  it('returns null on an lcov file with no lines recorded', () => {
    expect(parseLcov('TN:\nend_of_record\n')).toBeNull();
  });

  it('stubs when no report exists — §18 says do not build a coverage pipeline', () => {
    const check = checkCoverage(tmp(), 8734);
    expect(check).toMatchObject({ value: 8734, status: 'stubbed' });
    expect(check.source).toMatch(/no coverage report found/);
  });

  it('prefers a real report over the stub', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'coverage'));
    fs.writeFileSync(
      path.join(dir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 42.5 } } }),
    );
    expect(checkCoverage(dir, 8734)).toMatchObject({ value: 4250, status: 'measured' });
  });

  it('clamps to the schema ceiling', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'lcov.info'), 'LF:1\nLH:5\nend_of_record\n');
    expect(checkCoverage(dir).value).toBeLessThanOrEqual(10_000);
  });
});

describe('config hashing', () => {
  it('is insensitive to key order — the same config is the same hash', () => {
    expect(hashConfig({ a: 1, b: 2 })).toBe(hashConfig({ b: 2, a: 1 }));
  });

  it('changes when a stub is added, which is the point of pinning it', () => {
    // docs/02 gap 4: a record should mean "ran collector v0.1.0 with config
    // hash 0xabc…". A run that stubbed eight checks must not hash the same as
    // one that measured them.
    expect(hashConfig({ vendor: 'a', stubs: {} })).not.toBe(
      hashConfig({ vendor: 'a', stubs: { criticals: 0 } }),
    );
  });
});

describe('parseJson', () => {
  it('returns null instead of throwing on a truncated dump', () => {
    expect(parseJson('{"a":')).toBeNull();
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
});
