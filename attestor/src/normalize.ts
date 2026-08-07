/**
 * Collector report → canonical v2 evidence.
 *
 * Master Doc §19 puts three jobs in the normalizer, in this order:
 *
 *     validate expected CI information
 *     generate canonical evidence
 *     sign evidence
 *
 * The first is the one that is easy to skip and the one that carries the trust.
 * A signature over unvalidated input just launders whatever the collector
 * emitted — and `../../docs/02-threat-model.md` is already explicit that the
 * attestor is an irreducible trust root. The least we can do is check that the
 * report is internally consistent and describes the thing it claims to.
 *
 * `detail` is never read here. Only `.value`. That is what keeps CVE
 * identifiers and package names out of the commitment by construction rather
 * than by discipline.
 */
import {
  EVIDENCE_SCHEMA,
  MAX_COVERAGE,
  THIRTY_DAYS_SECONDS,
  encodeArtifactDigest,
  encodeCommit,
  padString,
  type CanonicalEvidence,
} from '@zkuat/contract';

import { degradedChecks, type CollectorReport } from './report.js';

export interface NormalizeOptions {
  /**
   * Cross-check the report against what the build actually produced.
   *
   * In CI these come from the workflow (`GITHUB_SHA`, the `sha256sum` of the
   * built file) rather than from the collector, so a collector that measured
   * the wrong tree or a stale artifact is caught instead of signed.
   */
  expect?: {
    commit?: string;
    artifactDigest?: string;
    repo?: string;
  };
  /** Override `generatedAt` (unix seconds). Fixtures pin it for reproducibility. */
  generatedAt?: number;
  /**
   * The longest window any shipped policy grants. `proveCompliance` asserts
   * `validUntil <= generatedAt + maxAgeSeconds`, so a longer window here
   * produces evidence that is rejected in-circuit — after proof generation,
   * which is a slow way to learn about it.
   */
  maxWindowSeconds?: bigint;
}

const strip = (digest: string): string => digest.toLowerCase().replace(/^sha256:/, '');

/** Fail if a value did not come from a real source and nobody said that was OK. */
function requireInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`zkuat: report check "${name}" must be a non-negative integer, got ${value}`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`zkuat: report check "${name}" must be a boolean, got ${value}`);
  }
  return value;
}

export function normalize(
  report: CollectorReport,
  options: NormalizeOptions = {},
): CanonicalEvidence {
  if (report._type !== 'zkuat.collector-report.v1') {
    throw new Error(`zkuat: not a collector report (got "${report._type}")`);
  }

  const { subject, checks } = report;
  const expect = options.expect ?? {};

  // ── 1. Validate expected CI information (§19) ────────────────────────────

  if (expect.repo && expect.repo !== subject.repo) {
    throw new Error(
      `zkuat: report is for repo "${subject.repo}" but CI is running in "${expect.repo}"`,
    );
  }

  const commit = subject.commit.toLowerCase();
  if (expect.commit && strip(expect.commit).toLowerCase() !== commit) {
    throw new Error(
      `zkuat: report measured commit ${commit} but CI is building ` +
        `${expect.commit.toLowerCase()} — the collector ran against a different tree`,
    );
  }
  // encodeCommit enforces the 40-hex-char shape; calling it here surfaces a
  // malformed SHA before anything is signed.
  encodeCommit(commit);

  const digest = strip(checks.artifactDigest.value);
  if (expect.artifactDigest && strip(expect.artifactDigest) !== digest) {
    throw new Error(
      `zkuat: report digests ${digest} but the build produced ` +
        `${strip(expect.artifactDigest)} — the evidence is about a different artifact`,
    );
  }
  encodeArtifactDigest(digest);

  if (checks.artifactDigest.status !== 'measured') {
    // §10: every claim must refer to immutable artifact bytes. A stubbed digest
    // is a claim about nothing, and it is the one field with no honest fallback.
    throw new Error(
      `zkuat: artifactDigest is "${checks.artifactDigest.status}", not measured. ` +
        'The artifact digest is mandatory — there is nothing to prove without it.',
    );
  }

  // Slugs are hashed at a fixed 64-byte width; padString throws rather than
  // truncating, because a truncated identifier silently collides two vendors.
  for (const [field, slug] of [
    ['vendor', subject.vendor],
    ['product', subject.product],
    ['attestor', subject.attestor],
  ] as const) {
    if (!slug) throw new Error(`zkuat: report subject is missing "${field}"`);
    padString(slug);
  }

  // ── 2. Generate canonical evidence ───────────────────────────────────────

  const generatedAt = options.generatedAt ?? report.provenance.collectedAt;
  if (!Number.isInteger(generatedAt) || generatedAt <= 0) {
    throw new Error(`zkuat: generatedAt must be a positive unix timestamp, got ${generatedAt}`);
  }

  const validDays = subject.validDays;
  if (!Number.isInteger(validDays) || validDays <= 0) {
    throw new Error(`zkuat: subject.validDays must be a positive integer, got ${validDays}`);
  }
  const validUntil = generatedAt + validDays * 86_400;

  const maxWindow = options.maxWindowSeconds ?? THIRTY_DAYS_SECONDS;
  if (BigInt(validUntil - generatedAt) > maxWindow) {
    throw new Error(
      `zkuat: a ${validDays}-day validity window exceeds the ${maxWindow / 86_400n} days the ` +
        'shipped policies grant. proveCompliance would reject this in-circuit at step 5, ' +
        'after proof generation.',
    );
  }

  const coverage = requireInteger('coverage', checks.coverage.value);
  if (BigInt(coverage) > MAX_COVERAGE) {
    // encodeEvidence clamps, but silently clamping 87 (read as a raw percent)
    // to 10000 would look like 100% coverage rather than a unit mistake.
    throw new Error(
      `zkuat: coverage is ${coverage}, above the ${MAX_COVERAGE} ceiling. ` +
        'Coverage is percent × 100 — 87.34% is 8734, not 87.',
    );
  }

  return {
    schema: EVIDENCE_SCHEMA,
    vendor: subject.vendor,
    product: subject.product,
    artifactDigest: digest,
    commit,
    attestor: subject.attestor,
    generatedAt,
    validUntil,
    vulns: {
      criticals: requireInteger('criticals', checks.criticals.value),
      highs: requireInteger('highs', checks.highs.value),
      kev: requireInteger('kev', checks.kev.value),
    },
    deps: {
      forbidden: requireInteger('forbiddenDeps', checks.forbiddenDeps.value),
      vulnerable: requireInteger('vulnDeps', checks.vulnDeps.value),
    },
    config: {
      mfaRequired: requireBoolean('mfaRequired', checks.mfaRequired.value),
      branchProtected: requireBoolean('branchProtected', checks.branchProtected.value),
      buildProvenanceVerified: requireBoolean(
        'buildProvenanceVerified',
        checks.buildProvenanceVerified.value,
      ),
      ciGreen: requireBoolean('ciGreen', checks.ciGreen.value),
    },
    coverage,
  };
}

/**
 * Human-readable warning about every fact the collector did not actually
 * measure. Printed by `zkuat-attest` before it signs.
 *
 * A stubbed value is indistinguishable from a measured one once it is inside
 * the `Evidence` struct — the commitment covers the number, not its
 * provenance — so this line is the last point at which anyone can notice they
 * are about to sign a bundle that mostly came from a config file.
 */
export function degradationWarning(report: CollectorReport): string | null {
  const degraded = degradedChecks(report);
  if (!degraded.length) return null;
  const lines = degraded.map(
    ([name, check]) =>
      `    ${name.padEnd(24)} ${check.status.padEnd(12)} ${check.error ?? check.source}`,
  );
  return (
    `⚠️  ${degraded.length} of 11 checks were not measured:\n${lines.join('\n')}\n` +
    '    These values are indistinguishable from measured ones once signed.'
  );
}
