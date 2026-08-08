import { describe, expect, it } from 'vitest';

import { encodeEvidence, pureCircuits } from '@zkuat/contract';
import { prepareEvidence, type RuntimeJobInput } from '../src/evidence.js';

const requestId = '12345678-1234-1234-1234-123456789abc';
const input = (overrides: Partial<RuntimeJobInput> = {}): RuntimeJobInput => ({
  evidence: {
    repository: 'acme/payment-engine',
    commit: 'ab'.repeat(20),
    artifactDigest: `sha256:${'cd'.repeat(32)}`,
    vulnerabilities: { critical: 0, high: 2, moderate: 1, low: 0, total: 3 },
    checks: {
      lint: { command: 'npm run lint', passed: true },
      build: { command: 'npm run build', passed: true },
    },
  },
  requestId,
  run: { id: 42, url: 'https://github.com/acme/payment-engine/actions/runs/42', status: 'completed', conclusion: 'success' },
  artifact: { id: 9, name: `zkuat-evidence-${requestId}` },
  policySlug: 'npm-ci-baseline-v1',
  ...overrides,
});

describe('prepareEvidence', () => {
  it('creates private contract input and a fresh blinded leaf', () => {
    const prepared = prepareEvidence(input(), 1_754_582_400);
    expect(prepared.evidence.schema).toBe('zkuat.evidence.v4');
    expect(prepared.evidence.vulns.totalVulnerabilities).toBe(3);
    expect(prepared.evidence.validUntil - prepared.evidence.generatedAt).toBe(30 * 24 * 60 * 60);
    expect(prepared.saltHex).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.leafHex).toMatch(/^[0-9a-f]{64}$/);
    const leaf = pureCircuits.leafOf(
      encodeEvidence(prepared.evidence),
      Uint8Array.from(Buffer.from(prepared.saltHex, 'hex')),
    );
    expect(Buffer.from(leaf).toString('hex')).toBe(prepared.leafHex);
  });

  it('uses a fresh salt for every job', () => {
    expect(prepareEvidence(input(), 1).saltHex).not.toBe(prepareEvidence(input(), 1).saltHex);
  });

  it.each([
    ['npm-ci-baseline-v1', 30],
    ['npm-production-release-v1', 7],
    ['npm-zero-known-vulns-v1', 3],
    ['npm-emergency-hotfix-v1', 2],
  ] as const)('uses the %s validity window', (policySlug, validDays) => {
    const prepared = prepareEvidence(input({ policySlug }), 1);
    expect(prepared.evidence.validUntil - prepared.evidence.generatedAt).toBe(
      validDays * 24 * 60 * 60,
    );
  });

  it('rejects mismatched GitHub artifact metadata', () => {
    expect(() => prepareEvidence(input({ artifact: { id: 9, name: 'wrong' } }), 1)).toThrow(
      'expected artifact',
    );
  });

  it('binds the GitHub run URL to the evidence repository and run id', () => {
    expect(() =>
      prepareEvidence(
        input({
          run: {
            id: 42,
            url: 'https://github.com/other/repository/actions/runs/42',
            status: 'completed',
            conclusion: 'success',
          },
        }),
        1,
      ),
    ).toThrow('does not match');
  });

  it('rejects non-successful runs before spending fees', () => {
    expect(() =>
      prepareEvidence(
        input({ run: { id: 42, url: 'https://example.test', status: 'completed', conclusion: 'failure' } }),
        1,
      ),
    ).toThrow('not a successful completed run');
  });
});
