/**
 * `criticals`, `highs`, `vulnDeps` — and the GHSA ids the KEV check needs.
 *
 * `npm audit --json` exits **1 when it finds vulnerabilities**, which is the
 * normal case for any real project. Treating a non-zero exit as failure here
 * would mean the collector degrades to stubs precisely when it has something to
 * report. So this reads the JSON and ignores the exit code.
 *
 * The GHSA identifiers go into `detail`, which is PRIVATE: `normalize()` reads
 * `.value` and nothing else, so a CVE id physically cannot reach the
 * commitment. That separation is the whole product — the buyer learns
 * `criticals == 0`, never *which* advisory.
 */
import type { CheckResult } from '@zkuat/attestor';

import { parseJson, run } from '../exec.js';

/** The shape of `npm audit --json` at `auditReportVersion: 2` (npm 7+). */
interface AuditReport {
  auditReportVersion?: number;
  vulnerabilities?: Record<
    string,
    {
      name?: string;
      severity?: string;
      isDirect?: boolean;
      via?: Array<string | { source?: number; title?: string; url?: string; severity?: string }>;
    }
  >;
  metadata?: {
    vulnerabilities?: Record<string, number>;
  };
}

export interface AuditFacts {
  criticals: CheckResult<number>;
  highs: CheckResult<number>;
  vulnDeps: CheckResult<number>;
  /** GHSA identifiers found, for the KEV cross-reference. Never published. */
  advisories: string[];
  /**
   * Whether the scan ran at all.
   *
   * An empty `advisories` from a failed audit and an empty one from a clean
   * project are the same array and completely different facts. The KEV check
   * needs to tell them apart, or an offline moment manufactures a measured
   * "no known-exploited vulnerabilities" — the exact claim buyers rely on.
   */
  scanned: boolean;
}

const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/gi;

export function extractAdvisories(report: AuditReport): string[] {
  const ids = new Set<string>();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via === 'string') continue; // a transitive dependency name
      for (const match of (via.url ?? '').matchAll(GHSA)) ids.add(match[0].toUpperCase());
    }
  }
  return [...ids].sort();
}

export function parseAudit(stdout: string, source: string): AuditFacts | null {
  const report = parseJson<AuditReport>(stdout);
  if (!report?.metadata?.vulnerabilities) return null;

  const counts = report.metadata.vulnerabilities;
  const entries = Object.entries(report.vulnerabilities ?? {});
  const advisories = extractAdvisories(report);

  // `detail` carries the package names and advisory ids — exactly the
  // over-disclosure the protocol exists to prevent, and exactly why it stays
  // in the report and out of the evidence.
  const detail = {
    packages: entries.map(([name, v]) => ({ name, severity: v.severity, direct: v.isDirect })),
    advisories,
  };

  return {
    criticals: { value: counts.critical ?? 0, status: 'measured', source, detail },
    highs: { value: counts.high ?? 0, status: 'measured', source, detail },
    vulnDeps: { value: entries.length, status: 'measured', source, detail },
    advisories,
    scanned: true,
  };
}

export async function checkNpmAudit(
  projectDir: string,
  stubs: { criticals?: number; highs?: number; vulnDeps?: number },
): Promise<AuditFacts> {
  const source = 'npm audit --json';
  const result = await run('npm', ['audit', '--json'], { cwd: projectDir, timeout: 120_000 });

  const parsed = parseAudit(result.stdout, source);
  if (parsed) return parsed;

  const error =
    result.failure ??
    `npm audit produced no parseable report (exit ${result.code}): ` +
      `${(result.stderr || result.stdout).slice(0, 200)}`;

  const degraded = <T>(value: T, stub: T | undefined): CheckResult<T> => ({
    value: stub ?? value,
    status: stub === undefined ? 'unavailable' : 'stubbed',
    source,
    error,
  });

  return {
    criticals: degraded(0, stubs.criticals),
    highs: degraded(0, stubs.highs),
    vulnDeps: degraded(0, stubs.vulnDeps),
    advisories: [],
    scanned: false,
  };
}
