/**
 * Shared test data. Deterministic — no randomness, so failures reproduce exactly.
 */
import { encodeEvidence, policyId, type CanonicalEvidence, EVIDENCE_SCHEMA } from '../encoding.js';
import type { Evidence, Policy } from '../types.js';

/** A byte pattern that is easy to spot in a hex-dumped transcript. */
export function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

export const ANCHOR_SECRET = bytes32(0xa1);
export const IMPOSTOR_SECRET = bytes32(0xbd);

export const SALT_A = bytes32(0x51);
export const SALT_B = bytes32(0x52);

/** The one policy we ship. See ../../../docs/03-evidence-schema.md. */
export const PRODUCTION_READY: Policy = {
  maxCriticals: 0n,
  maxHighs: 5n,
  maxVulnDeps: 0n,
  minCoverage: 7000n,
  requireCiGreen: true,
};

export const PRODUCTION_READY_ID = policyId('production-ready');

const BASE_CANONICAL: CanonicalEvidence = {
  schema: EVIDENCE_SCHEMA,
  repo: 'acme/widget',
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  issuedAt: 1_754_582_400,
  checks: { ciGreen: true, criticals: 0, highs: 2, vulnDeps: 0, coverage: 8734 },
};

export function canonical(overrides: Partial<CanonicalEvidence['checks']> = {}): CanonicalEvidence {
  return { ...BASE_CANONICAL, checks: { ...BASE_CANONICAL.checks, ...overrides } };
}

/** Passes production-ready: 0 criticals, 2 highs, 0 vulnerable deps, 87.34% coverage, CI green. */
export const COMPLIANT: Evidence = encodeEvidence(canonical());

/** Fails on criticals alone — everything else still passes. */
export const NON_COMPLIANT: Evidence = encodeEvidence(canonical({ criticals: 2 }));

/** Fails on coverage alone (61.20% against a 70% floor). */
export const LOW_COVERAGE: Evidence = encodeEvidence(canonical({ coverage: 6120 }));

/** Fails on CI status alone. */
export const CI_RED: Evidence = encodeEvidence(canonical({ ciGreen: false }));

/** A distinct second repo, for tests that need more than one anchored leaf. */
export const OTHER_REPO: Evidence = encodeEvidence({
  ...BASE_CANONICAL,
  repo: 'globex/gadget',
  commit: '0123456789abcdef0123456789abcdef01234567',
});
