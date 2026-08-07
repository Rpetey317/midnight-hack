/**
 * `kev` — how many findings appear in CISA's Known Exploited Vulnerabilities
 * catalogue.
 *
 * The most valuable single predicate in the schema, and it appears in every
 * Master Doc policy example (§20, §41): a known-exploited vulnerability is not
 * a theoretical finding, it is one someone is using right now.
 *
 * Two hops, because `npm audit` speaks GHSA and CISA speaks CVE:
 *
 *     npm audit  →  GHSA-xxxx-xxxx-xxxx
 *                        ↓  GitHub advisory API
 *                   CVE-2024-21538
 *                        ↓  set intersection
 *                   CISA KEV catalogue
 *
 * Both hops are network calls, and the whole check degrades to `unavailable`
 * rather than failing — a rate limit at 02:00 must not stop evidence
 * generation. **VERIFIED** 2026-08-07: the KEV feed returns 200 (1.58 MB) and
 * `GHSA-3xgq-45jj-v275` maps to `CVE-2024-21538`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CheckResult } from '@zkuat/attestor';

import { fetchJson } from '../exec.js';

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface KevCatalogue {
  catalogVersion?: string;
  vulnerabilities?: Array<{ cveID?: string }>;
}

interface Advisory {
  ghsa_id?: string;
  cve_id?: string | null;
}

/** The KEV catalogue as a CVE set, cached on disk for a day. */
export async function loadKevSet(
  cacheDir: string,
): Promise<{ cves: Set<string>; version?: string; error?: string }> {
  const cacheFile = path.join(cacheDir, 'kev.json');

  if (fs.existsSync(cacheFile)) {
    const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
    if (age < CACHE_TTL_MS) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as KevCatalogue;
      return { cves: toCveSet(cached), version: cached.catalogVersion };
    }
  }

  const { ok, body, error } = await fetchJson<KevCatalogue>(KEV_URL, 15_000);
  if (!ok || !body?.vulnerabilities) {
    // Serve a stale cache rather than nothing — a day-old KEV catalogue is a
    // far better answer than no answer, and the alternative is a stubbed zero.
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as KevCatalogue;
      return { cves: toCveSet(cached), version: cached.catalogVersion, error: `stale cache: ${error}` };
    }
    return { cves: new Set(), error: error ?? 'KEV feed returned no catalogue' };
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(body));
  return { cves: toCveSet(body), version: body.catalogVersion };
}

function toCveSet(catalogue: KevCatalogue): Set<string> {
  return new Set(
    (catalogue.vulnerabilities ?? [])
      .map((v) => v.cveID?.toUpperCase())
      .filter((id): id is string => Boolean(id)),
  );
}

/** GHSA → CVE, one call per advisory, cached on disk permanently (immutable). */
export async function resolveCve(
  ghsa: string,
  cacheDir: string,
): Promise<{ cve: string | null; error?: string }> {
  const cacheFile = path.join(cacheDir, 'advisories', `${ghsa}.json`);
  if (fs.existsSync(cacheFile)) {
    return { cve: (JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Advisory).cve_id ?? null };
  }

  const { ok, body, error } = await fetchJson<Advisory>(`https://api.github.com/advisories/${ghsa}`);
  if (!ok || !body) return { cve: null, error };

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ cve_id: body.cve_id ?? null }));
  return { cve: body.cve_id ?? null };
}

export async function checkKev(
  advisories: string[],
  cacheDir: string,
  stub?: number,
  /**
   * Did the advisory scan that produced `advisories` actually run?
   *
   * If `npm audit` failed, the list is empty because nothing was scanned, not
   * because nothing was found — and reporting a *measured* `kev: 0` from that
   * would be the single most dangerous lie this collector could tell. "No
   * known-exploited vulnerabilities" is precisely what a buyer's policy checks,
   * and precisely what an offline moment must not manufacture.
   */
  advisoriesReliable = true,
): Promise<CheckResult<number>> {
  const source = 'CISA KEV catalogue ∩ GHSA→CVE (api.github.com/advisories)';

  if (!advisoriesReliable) {
    return {
      value: stub ?? 0,
      status: stub === undefined ? 'unavailable' : 'stubbed',
      source,
      error: 'the advisory scan did not run, so there is no advisory list to cross-reference',
    };
  }

  // No advisories from a scan that DID run is a real measurement of zero.
  if (advisories.length === 0) {
    return { value: 0, status: 'measured', source, detail: { advisories: [], matched: [] } };
  }

  const { cves: kev, version, error: kevError } = await loadKevSet(cacheDir);
  if (kevError && kev.size === 0) {
    return {
      value: stub ?? 0,
      status: stub === undefined ? 'unavailable' : 'stubbed',
      source,
      error: `KEV catalogue unreachable: ${kevError}`,
    };
  }

  const matched: string[] = [];
  const unresolved: string[] = [];
  for (const ghsa of advisories) {
    const { cve, error } = await resolveCve(ghsa, cacheDir);
    if (!cve) {
      // No CVE id means either the advisory has none (common for npm-only
      // advisories) or the lookup failed. Only the second is a gap, and we
      // record it rather than quietly counting it as "not exploited".
      if (error) unresolved.push(ghsa);
      continue;
    }
    if (kev.has(cve.toUpperCase())) matched.push(cve.toUpperCase());
  }

  if (unresolved.length) {
    return {
      value: stub ?? matched.length,
      status: stub === undefined ? 'unavailable' : 'stubbed',
      source,
      error:
        `${unresolved.length} of ${advisories.length} advisories could not be resolved to a CVE ` +
        `(${unresolved.slice(0, 3).join(', ')}) — the count may be an undercount`,
      detail: { matched, unresolved, kevVersion: version },
    };
  }

  return {
    value: matched.length,
    status: 'measured',
    source,
    // PRIVATE: the specific CVEs. The buyer learns the count is zero, never
    // which exploited vulnerability was checked for.
    detail: { advisories, matched, kevVersion: version },
  };
}
