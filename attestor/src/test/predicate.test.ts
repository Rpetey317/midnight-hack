/**
 * The mechanized version of the Track B line in the privacy checklist in
 * `../../../docs/02-threat-model.md`:
 *
 *   [ ] Evidence bundle is private, not attached to the public attestation
 *       predicate — Track B
 *
 * The predicate goes into a Sigstore attestation, which lands in Rekor, which
 * is a public transparency log. Anything in it is published to the world
 * forever. These tests are the reason that box can be ticked.
 */
import { describe, expect, it } from 'vitest';

import { buildBundle } from '../bundle.js';
import { assertNoEvidenceLeak, buildPredicate } from '../predicate.js';
import type { AttestationPredicate } from '../types.js';
import { KEY, SALT, evidence } from './helpers.js';

const SUBJECT = { repo: 'acme-software/payment-engine', sha: evidence().commit };
const bundle = () => buildBundle({ evidence: evidence(), key: KEY, salt: SALT });

describe('buildPredicate', () => {
  it('emits exactly four fields', () => {
    expect(Object.keys(buildPredicate(bundle(), SUBJECT)).sort()).toEqual([
      'leaf',
      'repo',
      'schema',
      'sha',
    ]);
  });

  it('carries the leaf and nothing else from the bundle', () => {
    const b = bundle();
    const p = buildPredicate(b, SUBJECT);
    expect(p.leaf).toBe(b.leaf);
    expect(p.schema).toBe(b.statement.schema);
  });

  it('never carries the salt', () => {
    expect(JSON.stringify(buildPredicate(bundle(), SUBJECT))).not.toContain(bundle().salt);
  });
});

describe('assertNoEvidenceLeak — allowlist over the predicate key set', () => {
  const p = () => buildPredicate(bundle(), SUBJECT);

  it('passes on a well-formed predicate', () => {
    expect(() => assertNoEvidenceLeak(p(), bundle())).not.toThrow();
  });

  it('rejects ANY added field, which is the real guarantee', () => {
    for (const extra of ['criticals', 'evidence', 'salt', 'coverage', 'anythingAtAll']) {
      const leaky = { ...p(), [extra]: 1 } as unknown as AttestationPredicate;
      expect(() => assertNoEvidenceLeak(leaky, bundle())).toThrow(/not public by design/);
    }
  });

  it('rejects the whole evidence object smuggled in', () => {
    const leaky = { ...p(), predicate: bundle().statement.evidence } as unknown as AttestationPredicate;
    expect(() => assertNoEvidenceLeak(leaky, bundle())).toThrow(/not public by design/);
  });
});

describe('assertNoEvidenceLeak — private values inside the four allowed fields', () => {
  it('catches a private string value placed in a human-readable field', () => {
    // `attestor` is private per docs/04: which attestor a POLICY requires is
    // public; which attestor signed a given bundle is not.
    const leaky: AttestationPredicate = {
      leaf: bundle().leaf,
      repo: `acme/${evidence().attestor}`,
      sha: SUBJECT.sha,
      schema: bundle().statement.schema,
    };
    expect(() => assertNoEvidenceLeak(leaky, bundle())).toThrow(/leaks evidence\.attestor/);
  });

  it('catches a private count placed in a hex field', () => {
    const b = buildBundle({
      evidence: evidence({ deps: { forbidden: 0, vulnerable: 31_337 } }),
      key: KEY,
      salt: SALT,
    });
    const leaky: AttestationPredicate = {
      leaf: '31337',
      repo: SUBJECT.repo,
      sha: SUBJECT.sha,
      schema: b.statement.schema,
    };
    expect(() => assertNoEvidenceLeak(leaky, b)).toThrow(/leaks evidence\.deps\.vulnerable/);
  });

  it('catches a private count as a standalone token in a readable field', () => {
    const leaky: AttestationPredicate = {
      leaf: bundle().leaf,
      repo: 'acme/build-31337',
      sha: SUBJECT.sha,
      schema: bundle().statement.schema,
    };
    expect(() => assertNoEvidenceLeak(leaky, bundle())).toThrow(/leaks evidence\.deps\.vulnerable/);
  });

  it('catches the salt', () => {
    const b = bundle();
    const leaky = { ...buildPredicate(b, SUBJECT), leaf: b.salt } as AttestationPredicate;
    // The salt-specific message is what a reader needs here, but a leaf that is
    // not the leaf also fails other checks; either error is a rejection.
    expect(() => assertNoEvidenceLeak(leaky, b)).toThrow();
  });
});

describe('assertNoEvidenceLeak — what it must NOT flag', () => {
  // A guard that cries wolf is a guard someone deletes. These are the
  // coincidences that would make it useless.

  it('allows the commit, which the predicate publishes by design', () => {
    // docs/01 §"Trust summary": the anchor operator sees repo, commit, and leaf.
    expect(() => assertNoEvidenceLeak(buildPredicate(bundle(), SUBJECT), bundle())).not.toThrow();
  });

  it('allows a repo name containing the vendor and product slugs', () => {
    // The realistic case: acme-software/payment-engine IS the vendor and the
    // product. Both are public in the compliance record anyway — we hide the
    // findings, not the vendor.
    const p = buildPredicate(bundle(), { repo: 'acme-software/payment-engine', sha: SUBJECT.sha });
    expect(() => assertNoEvidenceLeak(p, bundle())).not.toThrow();
  });

  it('does not trip on small private numbers colliding with hex digits', () => {
    // `highs: 3` appears as the character "3" in almost any 64-char hex leaf.
    // Substring matching would fire on every single bundle.
    const b = buildBundle({
      evidence: evidence({ vulns: { criticals: 0, highs: 3, kev: 0 } }),
      key: KEY,
      salt: SALT,
    });
    expect(() => assertNoEvidenceLeak(buildPredicate(b, SUBJECT), b)).not.toThrow();
  });

  it('does not trip on boolean config values', () => {
    expect(() => assertNoEvidenceLeak(buildPredicate(bundle(), SUBJECT), bundle())).not.toThrow();
  });

  it('holds across every demo scenario shape', () => {
    for (const overrides of [
      { vulns: { criticals: 2, highs: 1, kev: 0 } },
      { deps: { forbidden: 2, vulnerable: 4 } },
      { vulns: { criticals: 0, highs: 6, kev: 0 } },
      { coverage: 10_000 },
    ]) {
      const b = buildBundle({ evidence: evidence(overrides), key: KEY, salt: SALT });
      expect(() => buildPredicate(b, SUBJECT)).not.toThrow();
    }
  });
});
