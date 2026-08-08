/**
 * The Master-Doc-v2 §4–§5 adapter.
 *
 * The load-bearing assertions here are the *negative* ones. A wrong value in
 * this module does not crash anything — it produces a signed bundle and a
 * public compliance record asserting a fact nobody measured, which is the one
 * failure mode ../../../docs/02-threat-model.md says the protocol cannot
 * detect after the fact.
 *
 * `probeRepository` is left off throughout: these tests must not shell out to
 * `gh`, and the un-probed path is exactly what a machine without `gh` gets.
 */
import { describe, expect, it } from 'vitest';

import {
  buildBundle,
  degradedChecks,
  generateAttestorKey,
  normalize,
  publicHalf,
  verifyBundle,
} from '@zkuat/attestor';

import {
  GITHUB_ATTESTOR_SLUG,
  parseGithubEvidence,
  reportFromGithubEvidence,
} from '../github-evidence.js';

const COMMIT = '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3';
const DIGEST = `sha256:${'8f739ab'.padEnd(64, '0')}`;

/** What `.github/workflows/attest.yml` uploads. */
const doc = (over: Record<string, unknown> = {}) => ({
  repository: 'acme-software/payment-engine',
  commit: COMMIT,
  artifactDigest: DIGEST,
  vulnerabilities: { critical: 0, high: 3, moderate: 4, low: 1, total: 8 },
  checks: {
    lint: { command: 'npm run lint', passed: true },
    build: { command: 'npm run build', passed: true },
  },
  ...over,
});

const succeeded = { run: { id: 42, url: 'https://gh/run/42', conclusion: 'success' } };

describe('parseGithubEvidence', () => {
  it('accepts the document the workflow emits', () => {
    const parsed = parseGithubEvidence(doc());
    expect(parsed.repository).toBe('acme-software/payment-engine');
    expect(parsed.commit).toBe(COMMIT);
    expect(parsed.vulnerabilities.high).toBe(3);
    expect(parsed.checks).toEqual({
      lint: { command: 'npm run lint', passed: true },
      build: { command: 'npm run build', passed: true },
    });
  });

  it('lowercases the commit and digest so the encoder sees a stable form', () => {
    const parsed = parseGithubEvidence(
      doc({ commit: COMMIT.toUpperCase(), artifactDigest: DIGEST.toUpperCase() }),
    );
    expect(parsed.commit).toBe(COMMIT);
    expect(parsed.artifactDigest).toBe(DIGEST);
  });

  it('accepts a bare 64-hex digest without the sha256: prefix', () => {
    expect(parseGithubEvidence(doc({ artifactDigest: '0'.repeat(64) })).artifactDigest).toBe(
      '0'.repeat(64),
    );
  });

  it('rejects a repository that is not owner/name', () => {
    expect(() => parseGithubEvidence(doc({ repository: 'payment-engine' }))).toThrow(
      /must be "owner\/name"/,
    );
  });

  it('rejects a short commit — encodeCommit needs all 40 characters', () => {
    expect(() => parseGithubEvidence(doc({ commit: '9f2a1b3c' }))).toThrow(/40-character hex/);
  });

  it('rejects a missing artifactDigest rather than inventing one', () => {
    // §10: a claim about no particular artifact bytes is not a claim. This is
    // the field with no honest fallback.
    expect(() => parseGithubEvidence(doc({ artifactDigest: undefined }))).toThrow(
      /missing a usable artifactDigest/,
    );
  });

  it('rejects negative and fractional counts', () => {
    expect(() =>
      parseGithubEvidence(doc({ vulnerabilities: { critical: -1, high: 0, moderate: 0, low: 0, total: 0 } })),
    ).toThrow(/non-negative integer/);
    expect(() =>
      parseGithubEvidence(doc({ vulnerabilities: { critical: 0.5, high: 0, moderate: 0, low: 0, total: 0 } })),
    ).toThrow(/non-negative integer/);
  });

  it('rejects a non-object, including an array', () => {
    expect(() => parseGithubEvidence(null)).toThrow(/must be a JSON object/);
    expect(() => parseGithubEvidence([doc()])).toThrow(/must be a JSON object/);
  });

  it('rejects missing or malformed workflow check results', () => {
    expect(() => parseGithubEvidence(doc({ checks: undefined }))).toThrow(/missing a checks object/);
    expect(() =>
      parseGithubEvidence(
        doc({
          checks: {
            lint: { command: 'npm run lint', passed: 'yes' },
            build: { command: 'npm run build', passed: true },
          },
        }),
      ),
    ).toThrow(/checks\.lint\.passed must be a boolean/);
  });
});

describe('reportFromGithubEvidence', () => {
  it('maps repository to vendor and product', async () => {
    const report = await reportFromGithubEvidence(doc(), succeeded);
    expect(report.subject.vendor).toBe('acme-software');
    expect(report.subject.product).toBe('payment-engine');
    expect(report.subject.attestor).toBe(GITHUB_ATTESTOR_SLUG);
  });

  it('carries the measured severity counts through', async () => {
    const { checks } = await reportFromGithubEvidence(doc(), succeeded);
    expect(checks.criticals).toMatchObject({ value: 0, status: 'measured' });
    expect(checks.highs).toMatchObject({ value: 3, status: 'measured' });
    expect(checks.vulnDeps).toMatchObject({ value: 8, status: 'measured' });
    expect(checks.artifactDigest.status).toBe('measured');
  });

  it('reports kev as unavailable, NOT a measured zero', async () => {
    // The whole point of this module. `npm audit` establishes no KEV fact, and
    // a measured-looking 0 would put "no known-exploited vulnerabilities" into
    // a public compliance record on the strength of nothing.
    const { checks } = await reportFromGithubEvidence(doc(), succeeded);
    expect(checks.kev.status).toBe('unavailable');
    expect(checks.kev.error).toMatch(/does not cross-reference the CISA/);
  });

  it('reports forbiddenDeps as unavailable, NOT a measured zero', async () => {
    const { checks } = await reportFromGithubEvidence(doc(), succeeded);
    expect(checks.forbiddenDeps.status).toBe('unavailable');
    expect(checks.forbiddenDeps.error).toMatch(/no prohibited-package list/);
  });

  it('derives ciGreen from the run conclusion and lint/build results', async () => {
    const ok = await reportFromGithubEvidence(doc(), succeeded);
    expect(ok.checks.ciGreen).toMatchObject({ value: true, status: 'measured' });
    expect(ok.checks.buildProvenanceVerified).toMatchObject({ value: true, status: 'measured' });

    const lintFailed = await reportFromGithubEvidence(
      doc({
        checks: {
          lint: { command: 'npm run lint', passed: false },
          build: { command: 'npm run build', passed: true },
        },
      }),
      succeeded,
    );
    expect(lintFailed.checks.ciGreen).toMatchObject({ value: false, status: 'measured' });
    expect(lintFailed.checks.buildProvenanceVerified.value).toBe(true);

    const failed = await reportFromGithubEvidence(doc(), {
      run: { id: 43, conclusion: 'failure' },
    });
    expect(failed.checks.ciGreen).toMatchObject({ value: false, status: 'measured' });
    expect(failed.checks.buildProvenanceVerified.value).toBe(false);
  });

  it('never lets buildProvenanceVerified read as a Sigstore check', async () => {
    // anchor/ does the real verification. Anyone reading this report must not
    // conclude a bundle was validated against Fulcio and Rekor.
    const { checks } = await reportFromGithubEvidence(doc(), succeeded);
    expect(checks.buildProvenanceVerified.source).toMatch(/NOT a Sigstore bundle verification/);
  });

  it('degrades rather than guessing when no run conclusion is supplied', async () => {
    const { checks } = await reportFromGithubEvidence(doc());
    expect(checks.ciGreen.status).toBe('unavailable');
    expect(checks.buildProvenanceVerified.status).toBe('unavailable');
  });

  it('leaves repository configuration unmeasured when gh is not probed', async () => {
    const { checks } = await reportFromGithubEvidence(doc(), succeeded);
    expect(checks.branchProtected.status).toBe('unavailable');
    expect(checks.mfaRequired.status).toBe('unavailable');
  });

  it('pins how it mapped, so a record means "measured by X configured as Y"', async () => {
    const a = await reportFromGithubEvidence(doc(), { ...succeeded, validDays: 29 });
    const b = await reportFromGithubEvidence(doc(), { ...succeeded, validDays: 7 });
    expect(a.provenance.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.provenance.configHash).not.toBe(b.provenance.configHash);
  });

  it('stays inside the 30-day window both shipped policies grant', async () => {
    const { subject } = await reportFromGithubEvidence(doc(), succeeded);
    expect(subject.validDays).toBeLessThanOrEqual(30);
  });
});

describe('the report the adapter emits is one the attestor accepts', () => {
  it('normalizes to canonical v2 evidence', async () => {
    // The integration assertion: if this drifts, the adapter emits something
    // that only fails minutes later inside normalize() or the circuit.
    const report = await reportFromGithubEvidence(doc(), { ...succeeded, collectedAt: 1_754_582_400 });
    const evidence = normalize(report);

    expect(evidence.schema).toBe('zkuat.evidence.v2');
    expect(evidence.vendor).toBe('acme-software');
    expect(evidence.product).toBe('payment-engine');
    expect(evidence.commit).toBe(COMMIT);
    expect(evidence.artifactDigest).toBe(DIGEST.replace(/^sha256:/, ''));
    expect(evidence.vulns).toEqual({ criticals: 0, highs: 3, kev: 0 });
    expect(evidence.validUntil).toBeGreaterThan(evidence.generatedAt);
  });

  it('surfaces every unmeasured fact to whoever is about to sign', async () => {
    const report = await reportFromGithubEvidence(doc(), succeeded);
    const names = degradedChecks(report).map(([name]) => name);

    // Nothing may pass through this adapter looking measured when it is not.
    expect(names).toEqual(
      expect.arrayContaining(['kev', 'forbiddenDeps', 'branchProtected', 'mfaRequired', 'coverage']),
    );
  });

  it('reaches a signed, verifiable bundle — the whole v2 seam', async () => {
    // The end-to-end assertion. `buildBundle` calls encodeEvidence and
    // pureCircuits.leafOf, so this exercises the real commitment the circuit
    // checks against, not a re-derivation of it. If the adapter ever emits
    // something the encoder rejects — a bad digest width, a 39-character
    // commit, a validity window past the policy — it fails here rather than
    // minutes into proof generation.
    const key = generateAttestorKey(GITHUB_ATTESTOR_SLUG);
    const report = await reportFromGithubEvidence(doc(), {
      ...succeeded,
      collectedAt: 1_754_582_400,
    });

    const bundle = buildBundle({ evidence: normalize(report), key });

    expect(bundle.leaf).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.statement.leaf).toBe(bundle.leaf);
    expect(verifyBundle(bundle, { trustedKeyIds: [publicHalf(key).keyid] })).toBe(true);
  });
});
