import { describe, expect, it } from 'vitest';

import { encodeEvidence, pureCircuits } from '@zkuat/contract';
import {
  canonicalEvidenceFromGithub,
  parseGithubEvidence,
} from '../src/github-evidence.js';

const COMMIT = '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3';
const DIGEST = `sha256:${'8f739ab'.padEnd(64, '0')}`;

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
  it('accepts and normalizes the workflow document', () => {
    const parsed = parseGithubEvidence(
      doc({ commit: COMMIT.toUpperCase(), artifactDigest: DIGEST.toUpperCase() }),
    );
    expect(parsed.repository).toBe('acme-software/payment-engine');
    expect(parsed.commit).toBe(COMMIT);
    expect(parsed.artifactDigest).toBe(DIGEST);
    expect(parsed.vulnerabilities.high).toBe(3);
  });

  it('accepts a bare digest', () => {
    expect(parseGithubEvidence(doc({ artifactDigest: '0'.repeat(64) })).artifactDigest).toBe(
      '0'.repeat(64),
    );
  });

  it('rejects malformed identity and artifact fields', () => {
    expect(() => parseGithubEvidence(doc({ repository: 'payment-engine' }))).toThrow('owner/name');
    expect(() => parseGithubEvidence(doc({ commit: '1234' }))).toThrow('40-character hex');
    expect(() => parseGithubEvidence(doc({ artifactDigest: undefined }))).toThrow(
      'missing a usable artifactDigest',
    );
  });

  it('rejects invalid counts and command results', () => {
    expect(() =>
      parseGithubEvidence(
        doc({ vulnerabilities: { critical: -1, high: 0, moderate: 0, low: 0, total: 0 } }),
      ),
    ).toThrow('non-negative integer');
    expect(() =>
      parseGithubEvidence(
        doc({
          checks: {
            lint: { command: 'npm run lint', passed: 'yes' },
            build: { command: 'npm run build', passed: true },
          },
        }),
      ),
    ).toThrow('checks.lint.passed must be a boolean');
  });
});

describe('canonicalEvidenceFromGithub', () => {
  it('maps the unchanged artifact directly into schema v3 contract input', () => {
    const evidence = canonicalEvidenceFromGithub(doc(), {
      ...succeeded,
      receivedAt: 1_754_582_400,
    });
    expect(evidence).toMatchObject({
      schema: 'zkuat.evidence.v3',
      vendor: 'acme-software',
      product: 'payment-engine',
      artifactDigest: DIGEST,
      commit: COMMIT,
      vulns: { criticals: 0, highs: 3, vulnerableDependencies: 8 },
      checks: { lintPassed: true, buildPassed: true },
    });
    expect(evidence.validUntil - evidence.generatedAt).toBe(29 * 24 * 60 * 60);
  });

  it('rejects a failed run before producing contract input', () => {
    expect(() =>
      canonicalEvidenceFromGithub(doc(), { run: { id: 43, conclusion: 'failure' } }),
    ).toThrow('did not succeed');
  });

  it('encodes and commits without any signing layer', () => {
    const canonical = canonicalEvidenceFromGithub(doc(), {
      ...succeeded,
      receivedAt: 1_754_582_400,
    });
    const encoded = encodeEvidence(canonical);
    const leaf = pureCircuits.leafOf(encoded, new Uint8Array(32).fill(7));
    expect(leaf).toHaveLength(32);
  });
});
