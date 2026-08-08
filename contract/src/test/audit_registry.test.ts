import { describe, expect, it } from 'vitest';

import { deriveAnchorSecret } from '../anchor-secret.js';
import {
  EVIDENCE_SCHEMA,
  POLICY_BANK_ID,
  POLICY_BANK_V1,
  POLICY_ENTERPRISE_ID,
  POLICY_ENTERPRISE_V1,
  encodeArtifactDigest,
  encodeEvidence,
  policyId,
  productId,
  pureCircuits,
  recordKey,
  vendorId,
} from '../index.js';
import { ComplianceRegistrySimulator } from './simulator.js';
import {
  ANCHOR_SECRET,
  BANK_ONLY,
  DIGEST_A,
  DIGEST_B,
  ENTERPRISE_ONLY,
  FAILS_BOTH,
  IMPOSTOR_SECRET,
  NO_BUILD,
  NO_LINT,
  OTHER_ARTIFACT,
  OVERLONG_WINDOW,
  PASSES_BOTH,
  PRODUCT,
  REFRESHED,
  SALT_A,
  SALT_B,
  VENDOR,
  canonical,
} from './fixtures.js';
import type { Evidence } from '../types.js';

const VENDOR_ID = vendorId(VENDOR);
const PRODUCT_ID = productId(PRODUCT);
const ARTIFACT_A = encodeArtifactDigest(DIGEST_A);

function deployed(): ComplianceRegistrySimulator {
  const sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
  sim.registerPolicy(POLICY_BANK_ID, POLICY_BANK_V1);
  sim.registerPolicy(POLICY_ENTERPRISE_ID, POLICY_ENTERPRISE_V1);
  return sim;
}

function attested(evidence: Evidence, salt = SALT_A): ComplianceRegistrySimulator {
  const sim = deployed();
  const leaf = pureCircuits.leafOf(evidence, salt);
  sim.attest(leaf);
  return sim.asProver(evidence, salt, sim.pathFor(leaf));
}

function prove(sim: ComplianceRegistrySimulator, policy = POLICY_BANK_ID): boolean {
  return sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, policy);
}

describe('deployment and anchor authorization', () => {
  it('seals the deployment witness as the anchor', () => {
    const sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
    expect(sim.ledger.anchor).toEqual(pureCircuits.anchorIdOf(ANCHOR_SECRET));
  });

  it('rejects attest from a different secret', () => {
    const sim = deployed().withPrivateState({ secretKey: IMPOSTOR_SECRET });
    expect(() => sim.attest(new Uint8Array(32))).toThrow('not anchor');
  });

  it('rejects policy registration from a different secret', () => {
    const sim = deployed().withPrivateState({ secretKey: IMPOSTOR_SECRET });
    expect(() => sim.registerPolicy(policyId('rogue'), POLICY_BANK_V1)).toThrow('not anchor');
  });
});

describe('policy evaluation', () => {
  it('records compliant evidence', () => {
    const sim = attested(PASSES_BOTH);
    expect(prove(sim)).toBe(true);
    expect(sim.record(recordKey(DIGEST_A, 'bank-v1'))?.compliant).toBe(true);
  });

  it('records a negative verdict instead of reverting', () => {
    const sim = attested(FAILS_BOTH);
    expect(prove(sim)).toBe(false);
    expect(sim.record(recordKey(DIGEST_A, 'bank-v1'))?.compliant).toBe(false);
  });

  it.each([
    ['lint failure', NO_LINT],
    ['build failure', NO_BUILD],
  ])('fails when the workflow reports %s', (_label, evidence) => {
    expect(prove(attested(evidence))).toBe(false);
  });

  it('allows the same evidence to produce different policy verdicts', () => {
    const sim = attested(BANK_ONLY);
    expect(prove(sim, POLICY_BANK_ID)).toBe(true);
    expect(prove(sim, POLICY_ENTERPRISE_ID)).toBe(false);
  });

  it('mirrors the policy contrast for high-severity findings', () => {
    const sim = attested(ENTERPRISE_ONLY);
    expect(prove(sim, POLICY_BANK_ID)).toBe(false);
    expect(prove(sim, POLICY_ENTERPRISE_ID)).toBe(true);
  });

  it('rejects validity windows longer than the policy', () => {
    expect(() => prove(attested(OVERLONG_WINDOW))).toThrow('validity window exceeds policy');
  });
});

describe('evidence binding and replay protection', () => {
  it('binds vendor, product, and artifact public inputs', () => {
    expect(() =>
      attested(PASSES_BOTH).proveCompliance(
        vendorId('somebody-else'),
        PRODUCT_ID,
        ARTIFACT_A,
        POLICY_BANK_ID,
      ),
    ).toThrow('vendor mismatch');

    expect(() =>
      attested(PASSES_BOTH).proveCompliance(
        VENDOR_ID,
        productId('other-product'),
        ARTIFACT_A,
        POLICY_BANK_ID,
      ),
    ).toThrow('product mismatch');

    expect(() =>
      attested(PASSES_BOTH).proveCompliance(
        VENDOR_ID,
        PRODUCT_ID,
        encodeArtifactDigest(DIGEST_B),
        POLICY_BANK_ID,
      ),
    ).toThrow('artifact mismatch');
  });

  it('rejects a path belonging to different private evidence', () => {
    const sim = deployed();
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(leaf);
    sim.asProver(OTHER_ARTIFACT, SALT_A, sim.pathFor(leaf));
    expect(() => prove(sim)).toThrow('path/leaf mismatch');
  });

  it('prevents proving the same leaf twice for one policy', () => {
    const sim = attested(PASSES_BOTH);
    expect(prove(sim)).toBe(true);
    expect(() => prove(sim)).toThrow('already proven');
  });

  it('allows refreshed evidence for the same artifact', () => {
    const sim = deployed();
    const first = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(first);
    sim.asProver(PASSES_BOTH, SALT_A, sim.pathFor(first));
    expect(prove(sim)).toBe(true);

    const refreshed = pureCircuits.leafOf(REFRESHED, SALT_B);
    sim.withPrivateState({ secretKey: ANCHOR_SECRET });
    sim.attest(refreshed);
    sim.asProver(REFRESHED, SALT_B, sim.pathFor(refreshed));
    expect(prove(sim)).toBe(true);
    expect(sim.timeline()).toHaveLength(2);
  });

  it('accepts a path against a historic root after another insert', () => {
    const sim = deployed();
    const first = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(first);
    const oldPath = sim.pathFor(first);
    sim.attest(pureCircuits.leafOf(OTHER_ARTIFACT, SALT_B));
    sim.asProver(PASSES_BOTH, SALT_A, oldPath);
    expect(prove(sim)).toBe(true);
  });
});

describe('encoding and key derivation', () => {
  it('rejects an obsolete evidence schema', () => {
    expect(() => encodeEvidence(canonical({ schema: 'zkuat.evidence.v2' }))).toThrow(
      EVIDENCE_SCHEMA,
    );
  });

  it('derives a stable, domain-separated 32-byte anchor witness', () => {
    const a = deriveAnchorSecret('11'.repeat(32));
    expect(a).toHaveLength(32);
    expect(deriveAnchorSecret('11'.repeat(32))).toEqual(a);
    expect(deriveAnchorSecret('22'.repeat(32))).not.toEqual(a);
    expect(a).not.toEqual(Uint8Array.from(Buffer.from('11'.repeat(32), 'hex')));
  });
});
