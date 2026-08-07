/**
 * Shared test data. Deterministic — no randomness, so failures reproduce.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVIDENCE_SCHEMA, type CanonicalEvidence } from '@zkuat/contract';

import { generateAttestorKey } from '../keys.js';
import type { AttestorPrivateKey } from '../keys.js';
import type { CollectorReport, CheckResult } from '../report.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_DIR = path.resolve(HERE, '..', '..', '..', 'demo');

export const ATTESTOR = 'zkuat-attestor-v1';
export const GENERATED_AT = 1_786_060_800; // 2026-08-07T00:00:00Z
export const DAY = 86_400;

/** One keypair for the whole suite — generation is the slow part. */
export const KEY: AttestorPrivateKey = generateAttestorKey(ATTESTOR);
export const OTHER_KEY: AttestorPrivateKey = generateAttestorKey(ATTESTOR);

export const SALT = new Uint8Array(32).fill(0x51);

export function evidence(overrides: Partial<CanonicalEvidence> = {}): CanonicalEvidence {
  const base: CanonicalEvidence = {
    schema: EVIDENCE_SCHEMA,
    vendor: 'acme-software',
    product: 'payment-engine',
    // Stripped, not `sha256:`-prefixed. The prefix is accepted on input for
    // human legibility; `normalize` and the fixtures emit the bare 64 hex
    // characters, and those are the bytes that get committed.
    artifactDigest: '8f'.repeat(32),
    commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
    attestor: ATTESTOR,
    generatedAt: GENERATED_AT,
    validUntil: GENERATED_AT + 29 * DAY,
    vulns: { criticals: 0, highs: 3, kev: 0 },
    // 31337 is deliberately distinctive: if it ever shows up on a public
    // surface, a grep finds it instantly.
    deps: { forbidden: 0, vulnerable: 31_337 },
    config: {
      mfaRequired: true,
      branchProtected: true,
      buildProvenanceVerified: true,
      ciGreen: true,
    },
    coverage: 8734,
  };
  return {
    ...base,
    ...overrides,
    vulns: { ...base.vulns, ...overrides.vulns },
    deps: { ...base.deps, ...overrides.deps },
    config: { ...base.config, ...overrides.config },
  };
}

const measured = <T>(value: T): CheckResult<T> => ({
  value,
  status: 'measured',
  source: 'test',
});

export function report(
  overrides: {
    checks?: Partial<Record<keyof CollectorReport['checks'], CheckResult<unknown>>>;
    subject?: Partial<CollectorReport['subject']>;
    provenance?: Partial<CollectorReport['provenance']>;
  } = {},
): CollectorReport {
  const base: CollectorReport = {
    _type: 'zkuat.collector-report.v1',
    provenance: {
      collector: 'zkuat-collector',
      collectorVersion: '0.1.0',
      configHash: 'a'.repeat(64),
      collectedAt: GENERATED_AT,
      ...overrides.provenance,
    },
    subject: {
      vendor: 'acme-software',
      product: 'payment-engine',
      attestor: ATTESTOR,
      repo: 'acme-software/payment-engine',
      commit: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
      validDays: 29,
      ...overrides.subject,
    },
    checks: {
      artifactDigest: measured(`sha256:${'8f'.repeat(32)}`),
      criticals: measured(0),
      highs: measured(3),
      kev: measured(0),
      forbiddenDeps: measured(0),
      vulnDeps: measured(31_337),
      mfaRequired: measured(true),
      branchProtected: measured(true),
      buildProvenanceVerified: measured(true),
      ciGreen: measured(true),
      coverage: measured(8734),
    },
  };
  return {
    ...base,
    checks: { ...base.checks, ...overrides.checks } as CollectorReport['checks'],
  };
}
