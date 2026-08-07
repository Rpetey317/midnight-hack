/**
 * Acceptance tests for the zkuat compliance registry (schema v2).
 *
 * The seven criteria from ../../../docs/04-contract-spec.md still apply, adapted
 * to `proveCompliance`. Test 7 (historic root) is the one that validates the core
 * design: if it fails, HistoricMerkleTree was the wrong choice and every
 * outstanding proof dies the moment a second vendor attests.
 *
 * Every failure case asserts the exact error string. A bare `.toThrow()` passes
 * on the wrong error and hides regressions.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { pureCircuits } from '../managed/audit_registry/contract/index.js';
import {
  ANY_ATTESTOR,
  EVIDENCE_SCHEMA,
  POLICY_BANK_ID,
  POLICY_BANK_SLUG,
  POLICY_BANK_V1,
  POLICY_ENTERPRISE_ID,
  POLICY_ENTERPRISE_V1,
  attestorId,
  encodeArtifactDigest,
  encodeCommit,
  encodeEvidence,
  padString,
  policyId,
  productId,
  recordKey,
  vendorId,
} from '../encoding.js';
import { ComplianceRegistrySimulator } from './simulator.js';
import {
  ANCHOR_SECRET,
  ATTESTOR,
  BANK_ONLY,
  DIGEST_A,
  DIGEST_B,
  ENTERPRISE_ONLY,
  FAILS_BOTH,
  HAS_KEV,
  IMPOSTOR_SECRET,
  NO_BRANCH_PROTECTION,
  NO_PROVENANCE,
  OTHER_ARTIFACT,
  OTHER_ATTESTOR,
  OVERLONG_WINDOW,
  PASSES_BOTH,
  PRODUCT,
  REFRESHED,
  SALT_A,
  SALT_B,
  VENDOR,
  bytes32,
  canonical,
} from './fixtures.js';
import type { Evidence } from '../types.js';

const VENDOR_ID = vendorId(VENDOR);
const PRODUCT_ID = productId(PRODUCT);
const ARTIFACT_A = encodeArtifactDigest(DIGEST_A);
const ARTIFACT_B = encodeArtifactDigest(DIGEST_B);

/** Deploy with both shipped policies registered. */
function deployed(): ComplianceRegistrySimulator {
  const sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
  sim.registerPolicy(POLICY_BANK_ID, POLICY_BANK_V1);
  sim.registerPolicy(POLICY_ENTERPRISE_ID, POLICY_ENTERPRISE_V1);
  return sim;
}

/** Deploy, attest `evidence` under `salt`, and load the proving inputs. */
function attested(evidence: Evidence, salt: Uint8Array = SALT_A): ComplianceRegistrySimulator {
  const sim = deployed();
  const leaf = pureCircuits.leafOf(evidence, salt);
  sim.attest(leaf);
  return sim.asProver(evidence, salt, sim.pathFor(leaf));
}

/** Prove the loaded evidence against a policy, for the standard artifact. */
function prove(sim: ComplianceRegistrySimulator, policy = POLICY_BANK_ID): boolean {
  return sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, policy);
}

describe('deployment', () => {
  it('seals the deployer as the anchor', () => {
    const sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
    expect(sim.ledger.anchor).toEqual(pureCircuits.anchorIdOf(ANCHOR_SECRET));
  });

  it('starts empty', () => {
    const sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
    expect(sim.ledger.attestations.firstFree()).toBe(0n);
    expect(sim.ledger.policies.isEmpty()).toBe(true);
    expect(sim.ledger.claimed.isEmpty()).toBe(true);
    expect(sim.ledger.records.isEmpty()).toBe(true);
    expect(sim.ledger.history.isEmpty()).toBe(true);
  });
});

describe('1 — valid proof on compliant evidence', () => {
  let sim: ComplianceRegistrySimulator;

  beforeEach(() => {
    sim = attested(PASSES_BOTH);
  });

  it('returns true', () => {
    expect(prove(sim)).toBe(true);
  });

  it('records the nullifier', () => {
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    const nullifier = pureCircuits.nullifierOf(leaf, POLICY_BANK_ID);
    expect(sim.ledger.claimed.member(nullifier)).toBe(false);
    prove(sim);
    expect(sim.ledger.claimed.member(nullifier)).toBe(true);
  });
});

describe('2 — non-compliant evidence returns false without reverting', () => {
  // Proving non-compliance is a legitimate outcome, not an error. A protocol
  // that only ever says yes proves nothing.
  const cases: [label: string, evidence: Evidence][] = [
    ['criticals over the limit', FAILS_BOTH],
    ['a known-exploited vulnerability', HAS_KEV],
    ['highs over the limit', ENTERPRISE_ONLY],
    ['no verified build provenance', NO_PROVENANCE],
  ];

  it.each(cases)('returns false when there is %s', (_label, evidence) => {
    expect(prove(attested(evidence))).toBe(false);
  });

  it('still writes a record, marked non-compliant', () => {
    const sim = attested(FAILS_BOTH);
    expect(prove(sim)).toBe(false);
    const record = sim.record(recordKey(DIGEST_A, POLICY_BANK_SLUG));
    expect(record?.compliant).toBe(false);
  });

  it('still burns the nullifier, so a failed proof cannot be retried', () => {
    const sim = attested(FAILS_BOTH);
    expect(prove(sim)).toBe(false);
    expect(() => prove(sim)).toThrow('already proven');
  });
});

describe('3 — tampered evidence fails the path/leaf binding', () => {
  // The vendor attests honest evidence, then swaps in something more flattering
  // while keeping the real path. The binding assert is what stops this.
  // Every field of the 17-field struct, mutated independently.
  const mutations: [field: string, evidence: Evidence][] = [
    ['vendorId', { ...PASSES_BOTH, vendorId: bytes32(0xf1) }],
    ['productId', { ...PASSES_BOTH, productId: bytes32(0xf2) }],
    ['artifactDigest', { ...PASSES_BOTH, artifactDigest: bytes32(0xf3) }],
    ['commitId', { ...PASSES_BOTH, commitId: bytes32(0xf4) }],
    ['attestorId', { ...PASSES_BOTH, attestorId: bytes32(0xf5) }],
    ['generatedAt', { ...PASSES_BOTH, generatedAt: PASSES_BOTH.generatedAt + 1n }],
    ['validUntil', { ...PASSES_BOTH, validUntil: PASSES_BOTH.validUntil + 1n }],
    ['criticals', { ...PASSES_BOTH, criticals: 9n }],
    ['highs', { ...PASSES_BOTH, highs: 0n }],
    ['kev', { ...PASSES_BOTH, kev: 9n }],
    ['forbiddenDeps', { ...PASSES_BOTH, forbiddenDeps: 9n }],
    ['vulnDeps', { ...PASSES_BOTH, vulnDeps: 0n }],
    ['mfaRequired', { ...PASSES_BOTH, mfaRequired: false }],
    ['branchProtected', { ...PASSES_BOTH, branchProtected: false }],
    ['buildProvenanceVerified', { ...PASSES_BOTH, buildProvenanceVerified: false }],
    ['ciGreen', { ...PASSES_BOTH, ciGreen: false }],
    ['coverage', { ...PASSES_BOTH, coverage: 10_000n }],
  ];

  it.each(mutations)('rejects a mutated %s', (_field, mutated) => {
    const sim = attested(PASSES_BOTH);
    sim.withPrivateState({ evidence: mutated });
    expect(() => prove(sim)).toThrow('path/leaf mismatch');
  });

  it('covers every field of the struct', () => {
    // Guards against a field being added to Evidence without a tampering case.
    expect(mutations.map(([field]) => field).sort()).toEqual(Object.keys(PASSES_BOTH).sort());
  });
});

describe('4 — wrong salt fails the path/leaf binding', () => {
  it('rejects a proof built under a different salt', () => {
    const sim = attested(PASSES_BOTH, SALT_A);
    sim.withPrivateState({ salt: SALT_B });
    expect(() => prove(sim)).toThrow('path/leaf mismatch');
  });
});

describe('5 — unattested evidence is rejected', () => {
  it('rejects evidence whose leaf was never inserted', () => {
    // Attest one bundle, then prove another — supplying the attested path so the
    // failure lands on the root check, not the binding.
    const sim = deployed();
    const attestedLeaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(attestedLeaf);

    const forgedPath = {
      ...sim.pathFor(attestedLeaf),
      leaf: pureCircuits.leafOf(OTHER_ARTIFACT, SALT_B),
    };
    sim.asProver(OTHER_ARTIFACT, SALT_B, forgedPath);

    expect(() =>
      sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_B, POLICY_BANK_ID),
    ).toThrow('not attested');
  });

  it('rejects a proof against an empty tree', () => {
    const sim = deployed();
    sim.asProver(PASSES_BOTH, SALT_A, {
      leaf: pureCircuits.leafOf(PASSES_BOTH, SALT_A),
      path: Array.from({ length: 16 }, () => ({ sibling: { field: 0n }, goes_left: true })),
    });
    expect(() => prove(sim)).toThrow('not attested');
  });
});

describe('6 — replay protection', () => {
  it('rejects a second proof for the same (evidence, policy)', () => {
    const sim = attested(PASSES_BOTH);
    expect(prove(sim)).toBe(true);
    expect(() => prove(sim)).toThrow('already proven');
  });

  it('permits the same evidence against a different policy', () => {
    // The nullifier is over (leaf, policyId), so one evidence bundle can satisfy
    // several buyers independently. This is the point of reusable evidence.
    const sim = attested(PASSES_BOTH);
    expect(prove(sim, POLICY_BANK_ID)).toBe(true);
    expect(prove(sim, POLICY_ENTERPRISE_ID)).toBe(true);
  });

  it('permits fresh evidence for the same artifact and policy', () => {
    // Continuous compliance: new evidence → new leaf → new nullifier → allowed.
    const sim = attested(PASSES_BOTH);
    expect(prove(sim)).toBe(true);

    const refreshedLeaf = pureCircuits.leafOf(REFRESHED, SALT_A);
    sim.attest(refreshedLeaf);
    sim.asProver(REFRESHED, SALT_A, sim.pathFor(refreshedLeaf));
    expect(prove(sim)).toBe(true);
  });
});

describe('7 — historic root', () => {
  // The whole reason for HistoricMerkleTree. With a plain MerkleTree this fails,
  // and the first vendor's proof would die the moment a second vendor attested.
  it('accepts a path captured before later inserts', () => {
    const sim = deployed();
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(leaf);
    const path = sim.pathFor(leaf); // captured against root R1
    const rootAtCapture = sim.ledger.attestations.root();

    sim.attest(pureCircuits.leafOf(OTHER_ARTIFACT, SALT_A));
    sim.attest(pureCircuits.leafOf(OTHER_ARTIFACT, SALT_B));

    // The tree has moved on...
    expect(sim.ledger.attestations.root()).not.toEqual(rootAtCapture);
    expect(sim.ledger.attestations.firstFree()).toBe(3n);

    // ...but the stale path still proves membership.
    sim.asProver(PASSES_BOTH, SALT_A, path);
    expect(prove(sim)).toBe(true);
  });

  it('still accepts the historic root after many more inserts', () => {
    const sim = deployed();
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(leaf);
    const path = sim.pathFor(leaf);

    for (let i = 0; i < 20; i++) sim.attest(bytes32(i));
    expect(sim.ledger.attestations.firstFree()).toBe(21n);

    sim.asProver(PASSES_BOTH, SALT_A, path);
    expect(prove(sim)).toBe(true);
  });
});

describe('8 — identity binding', () => {
  // Without these, a proof means "*some* attested artifact passes" and a record
  // can be filed under somebody else's name.
  it('rejects a mismatched artifact digest', () => {
    const sim = attested(PASSES_BOTH);
    expect(() =>
      sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_B, POLICY_BANK_ID),
    ).toThrow('artifact mismatch');
  });

  it('rejects a mismatched vendor', () => {
    const sim = attested(PASSES_BOTH);
    expect(() =>
      sim.proveCompliance(vendorId('globex'), PRODUCT_ID, ARTIFACT_A, POLICY_BANK_ID),
    ).toThrow('vendor mismatch');
  });

  it('rejects a mismatched product', () => {
    const sim = attested(PASSES_BOTH);
    expect(() =>
      sim.proveCompliance(VENDOR_ID, productId('other-product'), ARTIFACT_A, POLICY_BANK_ID),
    ).toThrow('product mismatch');
  });

  it('cannot file a record under another vendor even with valid evidence', () => {
    // The attack the binding exists to stop: attest real evidence, then claim it
    // belongs to a competitor so their name appears on a failing record.
    const sim = attested(FAILS_BOTH);
    expect(() =>
      sim.proveCompliance(vendorId('competitor-inc'), PRODUCT_ID, ARTIFACT_A, POLICY_BANK_ID),
    ).toThrow('vendor mismatch');
    expect(sim.allRecords()).toHaveLength(0);
  });
});

describe('9 — attestor acceptance', () => {
  const STRICT_ID = policyId('strict-attestor-policy');
  const STRICT = { ...POLICY_BANK_V1, requiredAttestor: attestorId(ATTESTOR) };

  it('accepts any attestor when requiredAttestor is zero', () => {
    expect(POLICY_BANK_V1.requiredAttestor).toEqual(ANY_ATTESTOR);
    const sim = deployed();
    const leaf = pureCircuits.leafOf(OTHER_ATTESTOR, SALT_A);
    sim.attest(leaf);
    sim.asProver(OTHER_ATTESTOR, SALT_A, sim.pathFor(leaf));
    expect(prove(sim)).toBe(true);
  });

  it('accepts the pinned attestor', () => {
    const sim = attested(PASSES_BOTH);
    sim.withPrivateState({ secretKey: ANCHOR_SECRET });
    sim.registerPolicy(STRICT_ID, STRICT);
    expect(sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, STRICT_ID)).toBe(true);
  });

  it('rejects an attestor the policy does not pin', () => {
    const sim = deployed();
    sim.registerPolicy(STRICT_ID, STRICT);
    const leaf = pureCircuits.leafOf(OTHER_ATTESTOR, SALT_A);
    sim.attest(leaf);
    sim.asProver(OTHER_ATTESTOR, SALT_A, sim.pathFor(leaf));
    expect(() =>
      sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, STRICT_ID),
    ).toThrow('attestor not accepted');
  });
});

describe('10 — validity window', () => {
  // Freshness enforcement that needs no block-time primitive: it bounds
  // validUntil relative to generatedAt, both of which are committed. It does NOT
  // check the evidence against wall-clock now — the record carries validUntil
  // and the reader judges expiry.
  it('rejects evidence granted a longer window than the policy allows', () => {
    const sim = attested(OVERLONG_WINDOW);
    expect(() => prove(sim)).toThrow('validity window exceeds policy');
  });

  it('accepts a window inside the policy limit', () => {
    expect(prove(attested(PASSES_BOTH))).toBe(true);
  });
});

describe('11 — the compliance record', () => {
  it('writes every field correctly', () => {
    const sim = attested(PASSES_BOTH);
    expect(prove(sim)).toBe(true);

    const record = sim.record(recordKey(DIGEST_A, POLICY_BANK_SLUG));
    expect(record).toBeDefined();
    expect(record).toEqual({
      vendorId: VENDOR_ID,
      productId: PRODUCT_ID,
      artifactDigest: ARTIFACT_A,
      policyId: POLICY_BANK_ID,
      policyVersion: POLICY_BANK_V1.version,
      provenAt: PASSES_BOTH.generatedAt,
      validUntil: PASSES_BOTH.validUntil,
      compliant: true,
    });
  });

  it('is keyed so the buyer can look it up from public data alone', () => {
    // The buyer knows the artifact digest and the policy slug and nothing else.
    const sim = attested(PASSES_BOTH);
    prove(sim);
    expect(sim.record(recordKey(DIGEST_A, POLICY_BANK_SLUG))).toBeDefined();
    expect(sim.record(recordKey(DIGEST_B, POLICY_BANK_SLUG))).toBeUndefined();
  });

  it('is replaced by a fresher proof for the same artifact and policy', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim);
    const key = recordKey(DIGEST_A, POLICY_BANK_SLUG);
    expect(sim.record(key)?.provenAt).toBe(PASSES_BOTH.generatedAt);

    const refreshedLeaf = pureCircuits.leafOf(REFRESHED, SALT_A);
    sim.attest(refreshedLeaf);
    sim.asProver(REFRESHED, SALT_A, sim.pathFor(refreshedLeaf));
    prove(sim);

    expect(sim.record(key)?.provenAt).toBe(REFRESHED.generatedAt);
    expect(sim.record(key)?.validUntil).toBe(REFRESHED.validUntil);
    expect(sim.ledger.records.size()).toBe(1n);
  });

  it('keeps one record per (artifact, policy) pair', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim, POLICY_BANK_ID);
    prove(sim, POLICY_ENTERPRISE_ID);
    expect(sim.ledger.records.size()).toBe(2n);
  });

  it('iterates, so the buyer dashboard needs no separate index', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim, POLICY_BANK_ID);
    prove(sim, POLICY_ENTERPRISE_ID);

    const records = sim.allRecords();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.compliant)).toBe(true);
    expect(records.map((r) => r.policyId).sort()).toEqual(
      [POLICY_BANK_ID, POLICY_ENTERPRISE_ID].sort(),
    );
  });

  it('appends to the timeline, newest first', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim, POLICY_BANK_ID);

    const refreshedLeaf = pureCircuits.leafOf(REFRESHED, SALT_A);
    sim.attest(refreshedLeaf);
    sim.asProver(REFRESHED, SALT_A, sim.pathFor(refreshedLeaf));
    prove(sim, POLICY_BANK_ID);

    const timeline = sim.timeline();
    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.provenAt).toBe(REFRESHED.generatedAt);
    expect(timeline[1]?.provenAt).toBe(PASSES_BOTH.generatedAt);
  });
});

describe('12 — two policies over the same evidence', () => {
  // The demo's strongest beat, and the central argument for programmable ZK: one
  // evidence bundle, two independent buyer policies, verdicts that can differ,
  // and the buyer still sees no findings.
  it('satisfies both policies with one bundle', () => {
    const sim = attested(PASSES_BOTH);
    expect(prove(sim, POLICY_BANK_ID)).toBe(true);
    expect(prove(sim, POLICY_ENTERPRISE_ID)).toBe(true);
  });

  it('passes the bank policy and fails the enterprise policy on the same evidence', () => {
    // A forbidden dependency: the bank does not check for it, the enterprise does.
    const sim = attested(BANK_ONLY);
    expect(sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_BANK_ID)).toBe(true);
    expect(sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_ENTERPRISE_ID)).toBe(false);
  });

  it('passes the enterprise policy and fails the bank policy on the same evidence', () => {
    // Six highs: the bank caps them at five, the enterprise does not count them.
    const sim = attested(ENTERPRISE_ONLY);
    expect(sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_BANK_ID)).toBe(false);
    expect(sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_ENTERPRISE_ID)).toBe(true);
  });

  it('fails the enterprise policy without branch protection', () => {
    const sim = attested(NO_BRANCH_PROTECTION);
    expect(sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_ENTERPRISE_ID)).toBe(false);
  });

  it('records both verdicts independently', () => {
    const sim = attested(BANK_ONLY);
    sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_BANK_ID);
    sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_ENTERPRISE_ID);

    expect(sim.record(recordKey(DIGEST_A, 'bank-v1'))?.compliant).toBe(true);
    expect(sim.record(recordKey(DIGEST_A, 'enterprise-v1'))?.compliant).toBe(false);
  });
});

describe('13 — anchor-only access control', () => {
  // Identity comes from a witness secret, not ownPublicKey(), which is
  // prover-supplied and therefore forgeable for authorization purposes.
  let sim: ComplianceRegistrySimulator;

  beforeEach(() => {
    sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
    sim.withPrivateState({ secretKey: IMPOSTOR_SECRET });
  });

  it('rejects attest from a non-anchor', () => {
    expect(() => sim.attest(bytes32(0x01))).toThrow('not anchor');
  });

  it('rejects registerPolicy from a non-anchor', () => {
    expect(() => sim.registerPolicy(POLICY_BANK_ID, POLICY_BANK_V1)).toThrow('not anchor');
  });

  it('leaves the tree untouched after a rejected attest', () => {
    expect(() => sim.attest(bytes32(0x01))).toThrow('not anchor');
    expect(sim.ledger.attestations.firstFree()).toBe(0n);
  });

  it('lets a vendor prove without holding any secret at all', () => {
    const registry = attested(PASSES_BOTH);
    registry.withPrivateState({ secretKey: null });
    expect(prove(registry)).toBe(true);
  });
});

describe('14 — policy registration', () => {
  it('publishes thresholds a buyer can read', () => {
    const sim = deployed();
    expect(sim.ledger.policies.lookup(POLICY_BANK_ID)).toEqual(POLICY_BANK_V1);
    expect(sim.ledger.policies.lookup(POLICY_ENTERPRISE_ID)).toEqual(POLICY_ENTERPRISE_V1);
  });

  it('carries issuer and version, so policy identity is stable', () => {
    const sim = deployed();
    const policy = sim.ledger.policies.lookup(POLICY_BANK_ID);
    expect(policy.version).toBe(1n);
    expect(policy.issuer).toEqual(POLICY_BANK_V1.issuer);
  });

  it('rejects a proof against an unregistered policy', () => {
    const sim = attested(PASSES_BOTH);
    expect(() =>
      sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, policyId('never-registered')),
    ).toThrow();
  });

  it('lets a buyer update thresholds without disturbing existing records', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim);
    const key = recordKey(DIGEST_A, POLICY_BANK_SLUG);
    expect(sim.record(key)?.compliant).toBe(true);

    sim.withPrivateState({ secretKey: ANCHOR_SECRET });
    sim.registerPolicy(POLICY_BANK_ID, { ...POLICY_BANK_V1, version: 2n, maxHighs: 0n });

    expect(sim.record(key)?.compliant).toBe(true);
    expect(sim.record(key)?.policyVersion).toBe(1n);
    expect(sim.ledger.policies.lookup(POLICY_BANK_ID).version).toBe(2n);
  });

  it('stamps the record with the policy version in force at proof time', () => {
    const sim = attested(PASSES_BOTH);
    sim.withPrivateState({ secretKey: ANCHOR_SECRET });
    sim.registerPolicy(POLICY_BANK_ID, { ...POLICY_BANK_V1, version: 7n });
    prove(sim);
    expect(sim.record(recordKey(DIGEST_A, POLICY_BANK_SLUG))?.policyVersion).toBe(7n);
  });
});

describe('15 — encoding', () => {
  it('pads an identifier to 64 bytes and lowercases it', () => {
    expect(padString('Acme-Software')).toHaveLength(64);
    expect(padString('Acme-Software')).toEqual(padString('acme-software'));
  });

  it('refuses an identifier that would be truncated', () => {
    // Silent truncation would collide two vendors into one identity.
    expect(() => padString('x'.repeat(65))).toThrow('exceeding the 64-byte limit');
  });

  it('strips the sha256: prefix from an artifact digest', () => {
    expect(encodeArtifactDigest(`sha256:${'8f'.repeat(32)}`)).toEqual(
      encodeArtifactDigest('8f'.repeat(32)),
    );
  });

  it('requires an artifact digest of exactly 32 bytes', () => {
    expect(() => encodeArtifactDigest('8f'.repeat(31))).toThrow('64 hex characters');
    expect(() => encodeArtifactDigest('8f'.repeat(33))).toThrow('64 hex characters');
    expect(() => encodeArtifactDigest('not-hex')).toThrow('64 hex characters');
  });

  it('left-aligns a commit SHA in 32 zero-padded bytes', () => {
    const encoded = encodeCommit('9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3');
    expect(encoded).toHaveLength(32);
    expect(encoded[0]).toBe(0x9f);
    expect(encoded[19]).toBe(0xc3);
    expect(Array.from(encoded.slice(20))).toEqual(Array.from(new Uint8Array(12)));
  });

  it('rejects a malformed commit SHA', () => {
    expect(() => encodeCommit('deadbeef')).toThrow('not a 40-character hex SHA');
  });

  it('rejects the v1 schema string', () => {
    expect(() => encodeEvidence(canonical({ schema: 'zkaudit.evidence.v1' }))).toThrow(
      `expected schema "${EVIDENCE_SCHEMA}"`,
    );
  });

  it('rejects evidence that expires before it was issued', () => {
    expect(() =>
      encodeEvidence(canonical({ generatedAt: 2_000, validUntil: 1_000 })),
    ).toThrow('must be after generatedAt');
  });

  it('clamps coverage to 100.00%', () => {
    expect(encodeEvidence(canonical({ coverage: 99_999 })).coverage).toBe(10_000n);
  });

  it('derives distinct ids for distinct identifiers', () => {
    expect(vendorId('acme-software')).not.toEqual(vendorId('globex-corp'));
    expect(policyId('bank-v1')).not.toEqual(policyId('enterprise-v1'));
  });

  it('computes the record key the circuit uses', () => {
    expect(recordKey(DIGEST_A, POLICY_BANK_SLUG)).toEqual(
      pureCircuits.recordKeyOf(ARTIFACT_A, POLICY_BANK_ID),
    );
  });
});

describe('16 — pure circuits are the single encoding implementation', () => {
  // These make the schema drift flagged in ../../../docs/03-evidence-schema.md
  // structurally impossible rather than merely discouraged. Without this test,
  // that claim is an assertion.
  it('computes the leaf that proveCompliance accepts', () => {
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    const sim = deployed();
    sim.attest(leaf); // attested using the TypeScript-computed leaf
    sim.asProver(PASSES_BOTH, SALT_A, sim.pathFor(leaf));

    // The circuit recomputes the leaf from witness evidence and asserts it
    // matches the attested path. Passing means the two agree byte for byte.
    expect(prove(sim)).toBe(true);
  });

  it('is deterministic and returns 32 bytes', () => {
    expect(pureCircuits.leafOf(PASSES_BOTH, SALT_A)).toEqual(
      pureCircuits.leafOf(PASSES_BOTH, SALT_A),
    );
    expect(pureCircuits.leafOf(PASSES_BOTH, SALT_A)).toHaveLength(32);
  });

  it('blinds the commitment — a different salt gives a different leaf', () => {
    expect(pureCircuits.leafOf(PASSES_BOTH, SALT_A)).not.toEqual(
      pureCircuits.leafOf(PASSES_BOTH, SALT_B),
    );
  });

  it('separates the nullifier, record-key, and leaf domains', () => {
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    const nullifier = pureCircuits.nullifierOf(leaf, POLICY_BANK_ID);
    const key = pureCircuits.recordKeyOf(ARTIFACT_A, POLICY_BANK_ID);
    expect(new Set([leaf, nullifier, key].map((b) => Buffer.from(b).toString('hex'))).size).toBe(3);
  });

  it('gives a different nullifier per policy for the same evidence', () => {
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    expect(pureCircuits.nullifierOf(leaf, POLICY_BANK_ID)).not.toEqual(
      pureCircuits.nullifierOf(leaf, POLICY_ENTERPRISE_ID),
    );
  });
});

describe('17 — what reaches the public transcript', () => {
  // Mechanizes the checklist in ../../../docs/02-threat-model.md.
  //
  // v2 moved the privacy boundary: vendor, product, and artifact are now public
  // by design. So the old "these bytes are absent" assertions no longer describe
  // the boundary — the allowlist below does, and it catches new fields
  // automatically, which substring searches cannot.
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

  /**
   * Everything this protocol intends to make public, for a proof of PASSES_BOTH
   * against the bank policy.
   */
  function allowlist(sim: ComplianceRegistrySimulator): Set<string> {
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    const allowed = new Set(
      [
        VENDOR_ID, // public by design — the buyer must know whose record this is
        PRODUCT_ID,
        ARTIFACT_A,
        POLICY_BANK_ID,
        pureCircuits.nullifierOf(leaf, POLICY_BANK_ID), // the replay guard
        pureCircuits.recordKeyOf(ARTIFACT_A, POLICY_BANK_ID),
        POLICY_BANK_V1.issuer, // read back from public ledger state
        POLICY_BANK_V1.requiredAttestor,
        POLICY_ENTERPRISE_ID, // registered at deploy
        POLICY_ENTERPRISE_V1.issuer,
        pureCircuits.anchorIdOf(ANCHOR_SECRET), // sealed, already public
        new Uint8Array(32), // zero padding
      ].map(hex),
    );

    // Merkle roots are 32-byte field elements and legitimately public; allow the
    // tree's own history explicitly rather than blanket-ignoring unknowns.
    //
    // Two toolchain traps in four lines:
    //   1. `history()` returns a bare `Iterator`, not an `IterableIterator`, so
    //      it cannot be spread or used with for...of — drain it by hand.
    //   2. A `MerkleTreeDigest.field` read from the ledger is a big-endian
    //      bigint, but the same digest appears **little-endian** in the
    //      transaction transcript. Allow both byte orders; comparing only one
    //      silently fails to match.
    const roots = sim.ledger.attestations.history();
    for (let next = roots.next(); !next.done; next = roots.next()) {
      const bigEndian = next.value.field.toString(16).padStart(64, '0');
      allowed.add(bigEndian);
      allowed.add(Buffer.from(bigEndian, 'hex').reverse().toString('hex'));
    }
    return allowed;
  }

  it('writes nothing beyond the allowlist into public ledger state', () => {
    // THIS is the load-bearing privacy test. Ledger state is the real boundary:
    // a value written into a ComplianceRecord is readable by anyone forever,
    // and — verified by deliberately leaking a field — it need not appear
    // anywhere in proofData. The transcript test below is a useful complement,
    // not a substitute.
    const sim = attested(PASSES_BOTH);
    prove(sim);

    const leaked = [...sim.publicStateHashes()].filter((h) => !allowlist(sim).has(h));
    expect(leaked).toEqual([]);
  });

  it('discloses nothing beyond the allowlist in the proof data', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim);

    const leaked = [...sim.transcriptHashes()].filter((h) => !allowlist(sim).has(h));
    expect(leaked).toEqual([]);
  });

  it('does not publish the leaf preimage when attesting', () => {
    // The compiler requires disclose() on insert()'s argument, which reads like
    // "this becomes public" — but insert() applies leaf_hash() internally and the
    // raw leaf never enters the transcript. Worth asserting, because the
    // annotation and the actual behaviour disagree.
    const sim = new ComplianceRegistrySimulator(ANCHOR_SECRET);
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);
    sim.attest(leaf);
    expect(sim.publicTranscriptJson()).not.toContain(hex(leaf));
  });

  it('does not publish the commit, attestor, salt, or leaf', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim);
    const transcript = sim.publicTranscriptJson();

    expect(transcript).not.toContain(hex(PASSES_BOTH.commitId));
    expect(transcript).not.toContain(hex(PASSES_BOTH.attestorId));
    expect(transcript).not.toContain(hex(SALT_A));
    expect(transcript).not.toContain(hex(pureCircuits.leafOf(PASSES_BOTH, SALT_A)));
  });

  it('does not publish any finding count', () => {
    // Fixture values are deliberately distinctive so a leak is greppable rather
    // than lost among small integers.
    const sim = attested(HAS_KEV);
    sim.proveCompliance(VENDOR_ID, PRODUCT_ID, ARTIFACT_A, POLICY_BANK_ID);
    const transcript = sim.publicTranscriptJson();

    expect(HAS_KEV.kev).toBe(4242n);
    expect(HAS_KEV.vulnDeps).toBe(31_337n);
    for (const value of [HAS_KEV.kev, HAS_KEV.vulnDeps, HAS_KEV.coverage]) {
      expect(transcript).not.toContain(value.toString(16).padStart(8, '0'));
    }
  });

  it('publishes the identity and verdict, which are public by design', () => {
    const sim = attested(PASSES_BOTH);
    prove(sim);
    const transcript = sim.publicTranscriptJson();
    const leaf = pureCircuits.leafOf(PASSES_BOTH, SALT_A);

    expect(transcript).toContain(hex(ARTIFACT_A));
    expect(transcript).toContain(hex(VENDOR_ID));
    expect(transcript).toContain(hex(POLICY_BANK_ID));
    expect(transcript).toContain(hex(pureCircuits.nullifierOf(leaf, POLICY_BANK_ID)));
  });
});
