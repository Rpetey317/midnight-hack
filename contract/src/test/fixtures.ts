/**
 * Shared test data. Deterministic — no randomness, so failures reproduce exactly.
 */
import {
  EVIDENCE_SCHEMA,
  encodeEvidence,
  type CanonicalEvidence,
} from '../encoding.js';
import type { Evidence } from '../types.js';

/** A byte pattern that is easy to spot in a hex-dumped transcript. */
export function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

export const ANCHOR_SECRET = bytes32(0xa1);
export const IMPOSTOR_SECRET = bytes32(0xbd);

export const SALT_A = bytes32(0x51);
export const SALT_B = bytes32(0x52);

export const VENDOR = 'acme-software';
export const PRODUCT = 'widget-api';
export const ATTESTOR = 'zkuat-attestor-v1';

export const DIGEST_A = 'sha256:' + '8f'.repeat(32);
export const DIGEST_B = 'sha256:' + '3c'.repeat(32);

const GENERATED_AT = 1_754_582_400;
const DAY = 24 * 60 * 60;

/**
 * Distinctive private values, so a leak into the public transcript is greppable
 * rather than lost among small integers. `criticals` stays 0 because both
 * policies require it, but nothing else needs to look plausible.
 */
const BASE: CanonicalEvidence = {
  schema: EVIDENCE_SCHEMA,
  vendor: VENDOR,
  product: PRODUCT,
  artifactDigest: DIGEST_A,
  commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
  attestor: ATTESTOR,
  generatedAt: GENERATED_AT,
  validUntil: GENERATED_AT + 29 * DAY, // inside both policies' 30-day window
  vulns: { criticals: 0, highs: 3, kev: 0 },
  deps: { forbidden: 0, vulnerable: 31_337 },
  config: {
    mfaRequired: true,
    branchProtected: true,
    buildProvenanceVerified: true,
    ciGreen: true,
  },
  coverage: 8734,
};

export function canonical(overrides: Partial<CanonicalEvidence> = {}): CanonicalEvidence {
  return {
    ...BASE,
    ...overrides,
    vulns: { ...BASE.vulns, ...overrides.vulns },
    deps: { ...BASE.deps, ...overrides.deps },
    config: { ...BASE.config, ...overrides.config },
  };
}

/** Passes both shipped policies. The happy path, and the demo's opening beat. */
export const PASSES_BOTH: Evidence = encodeEvidence(canonical());

/**
 * Passes BANK, fails ENTERPRISE — one forbidden dependency.
 *
 * This is the demo's strongest beat: the *same* evidence bundle, two independent
 * buyer policies, two different verdicts, and the buyer still sees no findings.
 */
export const BANK_ONLY: Evidence = encodeEvidence(canonical({ deps: { forbidden: 2, vulnerable: 0 } }));

/**
 * Passes ENTERPRISE, fails BANK — six high-severity findings against a limit of
 * five. The mirror image of BANK_ONLY.
 */
export const ENTERPRISE_ONLY: Evidence = encodeEvidence(
  canonical({ vulns: { criticals: 0, highs: 6, kev: 0 } }),
);

/** Fails both on criticals alone. */
export const FAILS_BOTH: Evidence = encodeEvidence(
  canonical({ vulns: { criticals: 2, highs: 1, kev: 0 } }),
);

/** Fails BANK on a known-exploited vulnerability. */
export const HAS_KEV: Evidence = encodeEvidence(
  canonical({ vulns: { criticals: 0, highs: 1, kev: 4242 } }),
);

/** Fails both — no verified build provenance. */
export const NO_PROVENANCE: Evidence = encodeEvidence(
  canonical({ config: { ...BASE.config, buildProvenanceVerified: false } }),
);

/** Fails ENTERPRISE — the primary branch is unprotected. */
export const NO_BRANCH_PROTECTION: Evidence = encodeEvidence(
  canonical({ config: { ...BASE.config, branchProtected: false } }),
);

/** A 400-day validity window — longer than either policy's 30 days allows. */
export const OVERLONG_WINDOW: Evidence = encodeEvidence(
  canonical({ validUntil: GENERATED_AT + 400 * DAY }),
);

/** A second artifact from the same vendor and product. */
export const OTHER_ARTIFACT: Evidence = encodeEvidence(canonical({ artifactDigest: DIGEST_B }));

/** Fresher evidence for the same artifact — the continuous-compliance case. */
export const REFRESHED: Evidence = encodeEvidence(
  canonical({ generatedAt: GENERATED_AT + 20 * DAY, validUntil: GENERATED_AT + 45 * DAY }),
);

/** Attested by somebody the strict policy does not accept. */
export const OTHER_ATTESTOR: Evidence = encodeEvidence(canonical({ attestor: 'rogue-scanner' }));
