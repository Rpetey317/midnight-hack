import { EVIDENCE_SCHEMA, encodeEvidence, type CanonicalEvidence } from '../encoding.js';
import type { Evidence } from '../types.js';

export function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

export const ANCHOR_SECRET = bytes32(0xa1);
export const IMPOSTOR_SECRET = bytes32(0xbd);
export const SALT_A = bytes32(0x51);
export const SALT_B = bytes32(0x52);

export const VENDOR = 'acme-software';
export const PRODUCT = 'widget-api';
export const DIGEST_A = 'sha256:' + '8f'.repeat(32);
export const DIGEST_B = 'sha256:' + '3c'.repeat(32);

const GENERATED_AT = 1_754_582_400;
const DAY = 24 * 60 * 60;

const BASE: CanonicalEvidence = {
  schema: EVIDENCE_SCHEMA,
  vendor: VENDOR,
  product: PRODUCT,
  artifactDigest: DIGEST_A,
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  generatedAt: GENERATED_AT,
  validUntil: GENERATED_AT + 2 * DAY,
  vulns: { criticals: 0, highs: 0, totalVulnerabilities: 0 },
  checks: { lintPassed: true, buildPassed: true },
};

export function canonical(overrides: Partial<CanonicalEvidence> = {}): CanonicalEvidence {
  return {
    ...BASE,
    ...overrides,
    vulns: { ...BASE.vulns, ...overrides.vulns },
    checks: { ...BASE.checks, ...overrides.checks },
  };
}

export const PASSES_ALL: Evidence = encodeEvidence(canonical());

/** The baseline permits these highs; production and hotfix do not. */
export const BASELINE_ONLY: Evidence = encodeEvidence(
  canonical({ vulns: { ...BASE.vulns, highs: 3, totalVulnerabilities: 3 } }),
);

/** Production permits a small non-high total; zero-known-vulnerabilities does not. */
export const PRODUCTION_NOT_ZERO: Evidence = encodeEvidence(
  canonical({ vulns: { ...BASE.vulns, totalVulnerabilities: 3 } }),
);

/** Hotfix permits skipped lint while still requiring the build. */
export const HOTFIX_ONLY: Evidence = encodeEvidence(
  canonical({ vulns: { ...BASE.vulns, highs: 2, totalVulnerabilities: 2 }, checks: { ...BASE.checks, lintPassed: false } }),
);

export const FAILS_ALL: Evidence = encodeEvidence(
  canonical({ vulns: { ...BASE.vulns, criticals: 2 } }),
);

export const NO_LINT: Evidence = encodeEvidence(
  canonical({ checks: { ...BASE.checks, lintPassed: false } }),
);

export const NO_BUILD: Evidence = encodeEvidence(
  canonical({ checks: { ...BASE.checks, buildPassed: false } }),
);

export const OVERLONG_WINDOW: Evidence = encodeEvidence(
  canonical({ validUntil: GENERATED_AT + 31 * DAY }),
);

export const OTHER_ARTIFACT: Evidence = encodeEvidence(canonical({ artifactDigest: DIGEST_B }));

export const REFRESHED: Evidence = encodeEvidence(
  canonical({ generatedAt: GENERATED_AT + 20 * DAY, validUntil: GENERATED_AT + 22 * DAY }),
);
