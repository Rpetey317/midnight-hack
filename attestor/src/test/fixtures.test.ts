/**
 * The committed demo fixtures must verify.
 *
 * This is the tripwire for a Track A schema change. `Evidence` is committed to
 * by `persistentCommit` over the whole struct, so adding, removing, or
 * reordering one field changes every leaf. When that happens these tests fail
 * here — loudly, in seconds, with a message that says what to do — instead of
 * silently at the integration checkpoint or, worse, on stage.
 *
 * Fix: `cd attestor && npm run fixtures`, then re-anchor.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_SCHEMA,
  POLICY_BANK_SLUG,
  POLICY_BANK_V1,
  POLICY_ENTERPRISE_SLUG,
  POLICY_ENTERPRISE_V1,
  encodeEvidence,
  pureCircuits,
  recordKey,
  type Evidence,
  type Policy,
} from '@zkuat/contract';

import { loadBundle, unhex32, verifyBundle } from '../bundle.js';
import { readPublicKey } from '../keys.js';
import { assertNoEvidenceLeak } from '../predicate.js';
import type { AttestationPredicate } from '../types.js';
import { DEMO_DIR } from './helpers.js';

const FIXTURES = path.join(DEMO_DIR, 'fixtures');
const PUB = path.join(DEMO_DIR, 'keys', 'zkuat-attestor-v1.pub.json');

const names = fs.existsSync(FIXTURES)
  ? fs
      .readdirSync(FIXTURES, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

const read = (name: string, file: string) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name, file), 'utf8'));

/**
 * The contract's own predicate, evaluated in TypeScript.
 *
 * Mirrors step 6 of `proveCompliance` (see docs/04). It is *not* a second
 * implementation of anything the circuit commits to — the commitment comes from
 * `pureCircuits.leafOf` — it just predicts the verdict so a fixture's stated
 * demo role is checked rather than asserted in a comment.
 */
function satisfies(ev: Evidence, p: Policy): boolean {
  return (
    ev.criticals <= p.maxCriticals &&
    ev.highs <= p.maxHighs &&
    ev.kev <= p.maxKev &&
    ev.forbiddenDeps <= p.maxForbiddenDeps &&
    (!p.requireMfa || ev.mfaRequired) &&
    (!p.requireBranchProtection || ev.branchProtected) &&
    (!p.requireBuildProvenance || ev.buildProvenanceVerified)
  );
}

describe('committed fixtures', () => {
  it('exist — run `npm run fixtures` if this fails', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it('include the four the demo script depends on', () => {
    expect(names).toEqual(['bank-only', 'enterprise-only', 'fails-both', 'passes-both']);
  });

  describe.each(names)('%s', (name) => {
    const bundle = () => loadBundle(path.join(FIXTURES, name, 'bundle.json'));

    it('verifies against the committed attestor public key', () => {
      expect(verifyBundle(bundle(), { trustedKeyIds: [readPublicKey(PUB).keyid] })).toBe(true);
    });

    it('re-derives its leaf through the contract — the schema-drift tripwire', () => {
      const b = bundle();
      const leaf = pureCircuits.leafOf(
        encodeEvidence(b.statement.evidence),
        unhex32(b.salt, 'salt'),
      );
      expect(Buffer.from(leaf).toString('hex')).toBe(b.leaf);
    });

    it('is on the schema this build targets', () => {
      expect(bundle().statement.schema).toBe(EVIDENCE_SCHEMA);
    });

    it('has a predicate carrying only the four public fields', () => {
      const predicate = read(name, 'predicate.json') as AttestationPredicate;
      expect(Object.keys(predicate).sort()).toEqual(['leaf', 'repo', 'schema', 'sha']);
      expect(() => assertNoEvidenceLeak(predicate, bundle())).not.toThrow();
    });

    it('has a predicate whose leaf matches the bundle', () => {
      expect((read(name, 'predicate.json') as AttestationPredicate).leaf).toBe(bundle().leaf);
    });

    it('never publishes the salt in the predicate', () => {
      expect(JSON.stringify(read(name, 'predicate.json'))).not.toContain(bundle().salt);
    });

    it('is marked as demo data with a cleartext salt', () => {
      // Committing a salt is fine for synthetic evidence and catastrophic for
      // real evidence. The distinction has to be a field, not a convention.
      expect(bundle().demo).toBe(true);
      expect(bundle().statement.collector?.synthetic).toBe(true);
    });

    it('is still in date — run `npm run fixtures:refresh` if this fails', () => {
      // A fixture past its validUntil renders as EXPIRED in the buyer view.
      // Correct behaviour, and a terrible thing to discover during the pitch.
      const { validUntil, generatedAt } = bundle().statement.evidence;
      expect(validUntil * 1000).toBeGreaterThan(Date.now());
      expect(validUntil).toBeGreaterThan(generatedAt);
    });
  });
});

describe('fixtures do not overwrite each other on-chain', () => {
  it('every fixture uses a distinct artifact digest', () => {
    // `records` is keyed on (artifactDigest, policyId) and `insert` replaces —
    // docs/02 gap 2b, last-writer-wins. Fixtures sharing one digest means
    // proving fails-both silently clobbers passes-both's COMPLIANT record for
    // the same policy, and the buyer dashboard shows one artifact instead of
    // four. Found the hard way on the devnet; this keeps it found.
    const digests = names.map(
      (n) => loadBundle(path.join(FIXTURES, n, 'bundle.json')).statement.evidence.artifactDigest,
    );
    expect(new Set(digests).size).toBe(names.length);
  });

  it('gives every (artifact, policy) pair a distinct record key', () => {
    const keys = names.flatMap((n) => {
      const digest = loadBundle(path.join(FIXTURES, n, 'bundle.json')).statement.evidence.artifactDigest;
      return [POLICY_BANK_SLUG, POLICY_ENTERPRISE_SLUG].map((slug) =>
        Buffer.from(recordKey(digest, slug)).toString('hex'),
      );
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('fixtures produce the verdicts the demo script promises', () => {
  const verdicts = (name: string) => {
    const ev = encodeEvidence(loadBundle(path.join(FIXTURES, name, 'bundle.json')).statement.evidence);
    return {
      bank: satisfies(ev, POLICY_BANK_V1),
      enterprise: satisfies(ev, POLICY_ENTERPRISE_V1),
    };
  };

  it('passes-both satisfies both policies — beats 3 and 4', () => {
    expect(verdicts('passes-both')).toEqual({ bank: true, enterprise: true });
  });

  it('bank-only passes BANK and fails ENTERPRISE — beat 5, the differentiator', () => {
    // One evidence bundle, two independently defined buyer policies, two
    // verdicts, and the buyer still sees no findings. Do not cut this.
    expect(verdicts('bank-only')).toEqual({ bank: true, enterprise: false });
  });

  it('enterprise-only is the mirror image', () => {
    expect(verdicts('enterprise-only')).toEqual({ bank: false, enterprise: true });
  });

  it('fails-both fails both — beat 6, the negative case', () => {
    expect(verdicts('fails-both')).toEqual({ bank: false, enterprise: false });
  });
});

describe('fixture index', () => {
  const index = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));

  it('lists every fixture with its leaf', () => {
    const listed = index().fixtures as Array<{ name: string; leaf: string }>;
    expect(listed.map((f) => f.name).sort()).toEqual(names);
    for (const f of listed) {
      expect(loadBundle(path.join(FIXTURES, f.name, 'bundle.json')).leaf).toBe(f.leaf);
    }
  });

  it('publishes buyer-side record keys that agree with the contract', () => {
    // The buyer looks up records[recordKeyOf(artifactDigest, policyId)]. Track D
    // reads these straight out of index.json rather than recomputing them.
    for (const f of index().fixtures as Array<Record<string, never>>) {
      const digest = (f as unknown as { artifactDigest: string }).artifactDigest;
      const keys = (f as unknown as { recordKeys: Record<string, string> }).recordKeys;
      for (const slug of [POLICY_BANK_SLUG, POLICY_ENTERPRISE_SLUG]) {
        expect(keys[slug]).toBe(Buffer.from(recordKey(digest, slug)).toString('hex'));
      }
    }
  });
});
