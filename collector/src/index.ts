/**
 * `@zkuat/collector` — runs the checks, emits a private collector report.
 *
 *     import { collect, loadConfig } from '@zkuat/collector';
 *
 *     const { config, configHash } = loadConfig('zkuat.collector.json');
 *     const report = await collect(config, configHash);
 *
 * The report is the attestor's input. It is **private and stays private**: its
 * `detail` fields carry CVE identifiers, package names, and dependency counts —
 * exactly the over-disclosure this project exists to prevent. `normalize()` in
 * `@zkuat/attestor` reads `.value` and nothing else, so there is no path from
 * `detail` into the evidence commitment or the chain.
 *
 * ## The degradation contract
 *
 * Only `artifactDigest` is allowed to fail the run — §10 makes it mandatory,
 * and a claim about no particular artifact bytes is not a claim. Every other
 * check degrades to `stubbed` or `unavailable` and says why.
 *
 * That is not laziness about error handling. This code runs at 02:00 the night
 * before a demo, on a laptop tethered to a phone, against a rate-limited API.
 * A collector that exits 1 because the CISA feed was slow is a collector that
 * stops the pitch. The honesty lives in the status field, and `zkuat-attest`
 * refuses to sign a degraded report unless someone passes `--allow-degraded`
 * after reading the list.
 */
import * as path from 'node:path';

import type { CollectorReport } from '@zkuat/attestor';

import { checkArtifactDigest } from './checks/artifact.js';
import { checkBuildProvenance } from './checks/provenance.js';
import { checkCiGreen, checkBranchProtected, checkMfaRequired, repoMetadata } from './checks/repo.js';
import { checkCoverage } from './checks/coverage.js';
import { checkForbiddenDeps } from './checks/forbidden.js';
import { checkKev } from './checks/kev.js';
import { checkNpmAudit } from './checks/npm-audit.js';
import { run } from './exec.js';
import type { CollectorConfig } from './config.js';

export const COLLECTOR_NAME = 'zkuat-collector';
export const COLLECTOR_VERSION = '0.1.0';

/** HEAD of the project directory, when the config does not pin a commit. */
export async function resolveCommit(projectDir: string, configured?: string): Promise<string> {
  if (configured) return configured.toLowerCase();
  const result = await run('git', ['rev-parse', 'HEAD'], { cwd: projectDir, timeout: 10_000 });
  const sha = result.stdout.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      `zkuat: could not read HEAD in ${projectDir} (${result.failure ?? result.stderr.trim()}). ` +
        'Set config.commit explicitly, or pass --commit.',
    );
  }
  return sha;
}

export interface CollectOptions {
  /** Where to cache the CISA KEV catalogue and GHSA lookups. */
  cacheDir?: string;
  /** Override the measured commit — in CI this comes from GITHUB_SHA. */
  commit?: string;
  /** Unix seconds. Defaults to now. */
  collectedAt?: number;
}

export async function collect(
  config: CollectorConfig,
  configHash: string,
  options: CollectOptions = {},
): Promise<CollectorReport> {
  const cacheDir = options.cacheDir ?? path.join(config.projectDir, '.zkuat-cache');
  const collectedAt = options.collectedAt ?? Math.floor(Date.now() / 1000);
  const commit = await resolveCommit(config.projectDir, options.commit ?? config.commit);
  const { stubs } = config;

  // Mandatory and first: everything downstream is a claim *about* these bytes,
  // and the provenance check needs the digest to ask GitHub about.
  const artifactDigest = await checkArtifactDigest(config.artifactPath);

  // One `gh api repos/…` call feeds two checks; do it once.
  const meta = await repoMetadata(config.repo);

  // Independent, and every one of them is I/O bound. Running them together
  // turns a ~30s serial walk into a few seconds, which matters when someone is
  // iterating on a config at midnight.
  const [audit, forbiddenDeps, branchProtected, mfaRequired, ciGreen, buildProvenanceVerified] =
    await Promise.all([
      checkNpmAudit(config.projectDir, stubs),
      checkForbiddenDeps(config.projectDir, config.forbiddenPackages, stubs.forbiddenDeps),
      checkBranchProtected(config.repo, meta.defaultBranch, stubs.branchProtected),
      checkMfaRequired(config.repo, meta.ownerType, stubs.mfaRequired),
      checkCiGreen(config.repo, commit, config.treatNoChecksAsGreen ?? false, stubs.ciGreen),
      checkBuildProvenance(config.repo, artifactDigest.value, stubs.buildProvenanceVerified),
    ]);

  // Depends on the advisory ids npm audit found, so it runs after. `scanned`
  // matters: an empty advisory list from a FAILED audit must not become a
  // measured "no known-exploited vulnerabilities".
  const kev = await checkKev(audit.advisories, cacheDir, stubs.kev, audit.scanned);

  return {
    _type: 'zkuat.collector-report.v1',
    provenance: {
      collector: COLLECTOR_NAME,
      collectorVersion: COLLECTOR_VERSION,
      configHash,
      collectedAt,
    },
    subject: {
      vendor: config.vendor,
      product: config.product,
      attestor: config.attestor,
      repo: config.repo,
      commit,
      validDays: config.validDays,
    },
    checks: {
      artifactDigest,
      criticals: audit.criticals,
      highs: audit.highs,
      kev,
      forbiddenDeps,
      vulnDeps: audit.vulnDeps,
      mfaRequired,
      branchProtected,
      buildProvenanceVerified,
      ciGreen,
      coverage: checkCoverage(config.projectDir, stubs.coverage),
    },
  };
}

export { hashConfig, loadConfig, type CollectorConfig } from './config.js';
export { fetchJson, ghApi, parseJson, run } from './exec.js';
export { sha256File } from './checks/artifact.js';
