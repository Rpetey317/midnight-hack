import { describe, expect, it } from 'vitest';

import { EVIDENCE_SCHEMA, THIRTY_DAYS_SECONDS } from '@zkuat/contract';

import { degradationWarning, normalize } from '../normalize.js';
import { GENERATED_AT, evidence, report } from './helpers.js';

describe('normalize — happy path', () => {
  it('produces canonical v2 evidence from a clean report', () => {
    expect(normalize(report())).toEqual(evidence());
  });

  it('reads only .value, never .detail', () => {
    // The structural reason CVE identifiers and package names cannot reach the
    // commitment. detail is where the collector puts them; normalize never
    // looks at it, so there is no path from detail to the chain.
    const withDetail = report({
      checks: {
        criticals: {
          value: 0,
          status: 'measured',
          source: 'npm audit --json',
          detail: ['CVE-2024-21538', 'internal-billing-lib'],
        },
      },
    });
    expect(JSON.stringify(normalize(withDetail))).not.toContain('CVE-2024-21538');
    expect(JSON.stringify(normalize(withDetail))).not.toContain('internal-billing-lib');
  });

  it('strips the sha256: prefix from the digest', () => {
    expect(normalize(report()).artifactDigest).toBe('8f'.repeat(32));
  });

  it('derives validUntil from validDays', () => {
    const ev = normalize(report({ subject: { validDays: 7 } }));
    expect(ev.validUntil - ev.generatedAt).toBe(7 * 86_400);
  });

  it('honours an explicit generatedAt, for reproducible fixtures', () => {
    expect(normalize(report(), { generatedAt: 1_700_000_000 }).generatedAt).toBe(1_700_000_000);
  });

  it('stamps the schema the contract expects', () => {
    expect(normalize(report()).schema).toBe(EVIDENCE_SCHEMA);
  });
});

describe('normalize — CI input validation (Master Doc §19)', () => {
  it('rejects a report from a different repo than CI is building', () => {
    expect(() => normalize(report(), { expect: { repo: 'evil/other' } })).toThrow(
      /but CI is running in/,
    );
  });

  it('rejects a report measured against a different commit', () => {
    // The collector ran against a stale tree. Signing this would authenticate
    // facts about code that is not what was built.
    expect(() => normalize(report(), { expect: { commit: 'a'.repeat(40) } })).toThrow(
      /ran against a different tree/,
    );
  });

  it('rejects a digest that is not what the build produced', () => {
    expect(() => normalize(report(), { expect: { artifactDigest: '3c'.repeat(32) } })).toThrow(
      /a different artifact/,
    );
  });

  it('accepts matching CI inputs, including a sha256: prefix mismatch in form only', () => {
    expect(() =>
      normalize(report(), {
        expect: {
          repo: 'acme-software/payment-engine',
          commit: evidence().commit.toUpperCase(),
          artifactDigest: `sha256:${'8f'.repeat(32)}`,
        },
      }),
    ).not.toThrow();
  });

  it('refuses a stubbed artifact digest — §10 makes it mandatory', () => {
    const stubbed = report({
      checks: {
        artifactDigest: { value: `sha256:${'8f'.repeat(32)}`, status: 'stubbed', source: 'config' },
      },
    });
    expect(() => normalize(stubbed)).toThrow(/artifact digest is mandatory/);
  });

  it('rejects a malformed commit SHA', () => {
    expect(() => normalize(report({ subject: { commit: 'abc123' } }))).toThrow(/40-character hex/);
  });

  it('rejects a malformed artifact digest', () => {
    const bad = report({
      checks: { artifactDigest: { value: 'sha256:nothex', status: 'measured', source: 't' } },
    });
    expect(() => normalize(bad)).toThrow(/64 hex characters/);
  });

  it('rejects an over-long identifier rather than truncating it', () => {
    // Truncation would silently collide two vendors into one identity.
    expect(() => normalize(report({ subject: { vendor: 'v'.repeat(65) } }))).toThrow(/64-byte limit/);
  });

  it('rejects a missing subject field', () => {
    expect(() => normalize(report({ subject: { product: '' } }))).toThrow(/missing "product"/);
  });
});

describe('normalize — validity window', () => {
  it('rejects a window longer than the shipped policies grant', () => {
    // proveCompliance step 5 asserts validUntil <= generatedAt + maxAgeSeconds.
    // Catching it here saves discovering it after proof generation.
    expect(() => normalize(report({ subject: { validDays: 400 } }))).toThrow(
      /exceeds the 30 days/,
    );
  });

  it('accepts exactly the policy maximum', () => {
    const days = Number(THIRTY_DAYS_SECONDS / 86_400n);
    expect(() => normalize(report({ subject: { validDays: days } }))).not.toThrow();
  });

  it('rejects a non-positive validDays', () => {
    expect(() => normalize(report({ subject: { validDays: 0 } }))).toThrow(/positive integer/);
  });

  it('rejects a non-positive generatedAt', () => {
    expect(() => normalize(report(), { generatedAt: 0 })).toThrow(/positive unix timestamp/);
  });
});

describe('normalize — value validation', () => {
  it('rejects a non-integer count', () => {
    const bad = report({ checks: { highs: { value: 3.5, status: 'measured', source: 't' } } });
    expect(() => normalize(bad)).toThrow(/non-negative integer/);
  });

  it('rejects a negative count', () => {
    const bad = report({ checks: { kev: { value: -1, status: 'measured', source: 't' } } });
    expect(() => normalize(bad)).toThrow(/non-negative integer/);
  });

  it('rejects a non-boolean config flag', () => {
    const bad = report({ checks: { ciGreen: { value: 'yes', status: 'measured', source: 't' } } });
    expect(() => normalize(bad)).toThrow(/must be a boolean/);
  });

  it('rejects raw-percent coverage instead of silently clamping it', () => {
    // encodeEvidence clamps to 10000. Clamping 87 read as a raw percent would
    // publish "100% coverage" from a unit mistake.
    const bad = report({ checks: { coverage: { value: 20_000, status: 'measured', source: 't' } } });
    expect(() => normalize(bad)).toThrow(/percent × 100/);
  });

  it('rejects a document that is not a collector report', () => {
    expect(() => normalize({ _type: 'nope' } as never)).toThrow(/not a collector report/);
  });
});

describe('degradationWarning', () => {
  it('is silent when everything was measured', () => {
    expect(degradationWarning(report())).toBeNull();
  });

  it('names every check that was not measured', () => {
    const degraded = report({
      checks: {
        mfaRequired: { value: true, status: 'stubbed', source: 'config' },
        kev: { value: 0, status: 'unavailable', source: 'CISA KEV', error: 'offline' },
      },
    });
    const warning = degradationWarning(degraded)!;
    expect(warning).toContain('mfaRequired');
    expect(warning).toContain('kev');
    expect(warning).toContain('offline');
    expect(warning).toContain('2 of 11');
  });

  it('says why it matters — a signed stub is indistinguishable from a measurement', () => {
    const degraded = report({
      checks: { coverage: { value: 8734, status: 'stubbed', source: 'config' } },
    });
    expect(degradationWarning(degraded)).toContain('indistinguishable from measured');
  });
});

describe('normalize — timestamps come from the report when not overridden', () => {
  it('uses provenance.collectedAt', () => {
    expect(normalize(report()).generatedAt).toBe(GENERATED_AT);
  });
});
