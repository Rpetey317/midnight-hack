/**
 * `coverage` — percent × 100.
 *
 * §18 is blunt about this one: coverage is *"fine as a technical demo predicate
 * but a weak representation of software security"*, and neither shipped policy
 * mentions it. So this reads a report that already exists and stubs otherwise.
 * **Do not build a coverage pipeline for it.**
 *
 * Percent × 100 because canonical JSON admits integers only — 87.34% is 8734.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CheckResult } from '@zkuat/attestor';

/** `coverage/coverage-summary.json`, as written by istanbul/nyc/vitest. */
export function parseSummary(text: string): number | null {
  try {
    const pct = (JSON.parse(text) as { total?: { lines?: { pct?: number } } }).total?.lines?.pct;
    return typeof pct === 'number' ? Math.round(pct * 100) : null;
  } catch {
    return null;
  }
}

/**
 * lcov: total line coverage across all files, as `sum(LH) / sum(LF)`.
 *
 * Deliberately not the mean of per-file percentages — that weights a one-line
 * file the same as a thousand-line one and reads high.
 */
export function parseLcov(text: string): number | null {
  let found = 0;
  let hit = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('LF:')) found += Number(line.slice(3)) || 0;
    else if (line.startsWith('LH:')) hit += Number(line.slice(3)) || 0;
  }
  if (found === 0) return null;
  return Math.round((hit / found) * 10_000);
}

const CANDIDATES = [
  'coverage/coverage-summary.json',
  'coverage/lcov.info',
  'lcov.info',
] as const;

export function checkCoverage(projectDir: string, stub?: number): CheckResult<number> {
  for (const relative of CANDIDATES) {
    const file = path.join(projectDir, relative);
    if (!fs.existsSync(file)) continue;

    const text = fs.readFileSync(file, 'utf8');
    const value = relative.endsWith('.json') ? parseSummary(text) : parseLcov(text);
    if (value === null) continue;

    return {
      value: Math.min(Math.max(value, 0), 10_000),
      status: 'measured',
      source: relative,
      detail: { percent: value / 100 },
    };
  }

  return {
    value: stub ?? 0,
    status: 'stubbed',
    source: `config (no coverage report found; looked for ${CANDIDATES.join(', ')})`,
  };
}
