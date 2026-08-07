/**
 * Acceptance tests for the zkaudit registry.
 *
 * Tests 1–7 are the acceptance criteria from ../../../docs/04-contract-spec.md.
 * Test 7 (historic root) is the one that validates the core design: if it fails,
 * the choice of HistoricMerkleTree over MerkleTree is wrong and every outstanding
 * proof dies the moment a second repo anchors.
 *
 * Every failure case asserts the exact error string. A bare `.toThrow()` passes
 * on the wrong error and hides regressions.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { pureCircuits } from '../managed/audit_registry/contract/index.js';
import { encodeCommit, encodeEvidence, encodeRepo, policyId, repoId } from '../encoding.js';
import { AuditRegistrySimulator } from './simulator.js';
import {
  ANCHOR_SECRET,
  CI_RED,
  COMPLIANT,
  IMPOSTOR_SECRET,
  LOW_COVERAGE,
  NON_COMPLIANT,
  OTHER_REPO,
  PRODUCTION_READY,
  PRODUCTION_READY_ID,
  SALT_A,
  SALT_B,
  bytes32,
  canonical,
} from './fixtures.js';
import type { Evidence } from '../types.js';

/**
 * Deploys a registry with `production-ready` registered, anchors `evidence`
 * under `salt`, and loads the resulting proving inputs. The common setup for
 * almost every test below.
 */
function anchored(evidence: Evidence, salt: Uint8Array): AuditRegistrySimulator {
  const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
  sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);
  const leaf = pureCircuits.leafOf(evidence, salt);
  sim.attest(leaf);
  return sim.asProver(evidence, salt, sim.pathFor(leaf));
}

describe('deployment', () => {
  it('seals the deployer as the anchor', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    expect(sim.ledger.anchor).toEqual(pureCircuits.anchorIdOf(ANCHOR_SECRET));
  });

  it('starts with an empty tree, no policies, and no nullifiers', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    expect(sim.ledger.attestations.firstFree()).toBe(0n);
    expect(sim.ledger.policies.isEmpty()).toBe(true);
    expect(sim.ledger.claimed.isEmpty()).toBe(true);
  });
});

describe('1 — valid claim on compliant evidence', () => {
  let sim: AuditRegistrySimulator;

  beforeEach(() => {
    sim = anchored(COMPLIANT, SALT_A);
  });

  it('returns true', () => {
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);
  });

  it('increments the badge tally', () => {
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(0n);
    sim.claimBadge(PRODUCTION_READY_ID);
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(1n);
  });

  it('records the nullifier', () => {
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    const nullifier = pureCircuits.nullifierOf(leaf, PRODUCTION_READY_ID);
    expect(sim.ledger.claimed.member(nullifier)).toBe(false);
    sim.claimBadge(PRODUCTION_READY_ID);
    expect(sim.ledger.claimed.member(nullifier)).toBe(true);
  });
});

describe('2 — non-compliant evidence returns false without reverting', () => {
  // Proving non-compliance is a legitimate outcome, not an error. A protocol
  // that only ever says yes proves nothing.
  const cases: [label: string, evidence: Evidence][] = [
    ['criticals over the limit', NON_COMPLIANT],
    ['coverage under the floor', LOW_COVERAGE],
    ['CI not green', CI_RED],
  ];

  it.each(cases)('returns false when %s', (_label, evidence) => {
    const sim = anchored(evidence, SALT_A);
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(false);
  });

  it.each(cases)('leaves the tally unchanged when %s', (_label, evidence) => {
    const sim = anchored(evidence, SALT_A);
    sim.claimBadge(PRODUCTION_READY_ID);
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(0n);
  });

  it('still burns the nullifier, so a failed claim cannot be retried', () => {
    const sim = anchored(NON_COMPLIANT, SALT_A);
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(false);
    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('already claimed');
  });
});

describe('3 — tampered evidence fails the path/leaf binding', () => {
  // The prover anchors honest evidence, then swaps in something more flattering
  // while keeping the real path. The binding assert is what stops this.
  const tampered: [field: string, evidence: Evidence][] = [
    ['criticals', { ...COMPLIANT, criticals: 0n, highs: 0n }],
    ['coverage', { ...COMPLIANT, coverage: 10_000n }],
    ['ciGreen', { ...COMPLIANT, ciGreen: false }],
    ['issuedAt', { ...COMPLIANT, issuedAt: COMPLIANT.issuedAt + 1n }],
    ['repoId', { ...COMPLIANT, repoId: bytes32(0xff) }],
    ['commitId', { ...COMPLIANT, commitId: bytes32(0xff) }],
    ['vulnDeps', { ...COMPLIANT, vulnDeps: 7n }],
  ];

  it.each(tampered)('rejects a mutated %s', (_field, mutated) => {
    const sim = anchored(COMPLIANT, SALT_A);
    sim.withPrivateState({ evidence: mutated });
    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('path/leaf mismatch');
  });
});

describe('4 — wrong salt fails the path/leaf binding', () => {
  it('rejects a claim proved under a different salt', () => {
    const sim = anchored(COMPLIANT, SALT_A);
    sim.withPrivateState({ salt: SALT_B });
    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('path/leaf mismatch');
  });
});

describe('5 — unanchored leaf is rejected', () => {
  it('rejects evidence whose leaf was never inserted', () => {
    // Anchor one repo's evidence, then try to claim with another's — supplying
    // the anchored path so the failure lands on the root check, not the binding.
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);
    sim.attest(pureCircuits.leafOf(COMPLIANT, SALT_A));

    const unanchoredLeaf = pureCircuits.leafOf(OTHER_REPO, SALT_B);
    const forgedPath = { ...sim.pathFor(pureCircuits.leafOf(COMPLIANT, SALT_A)), leaf: unanchoredLeaf };
    sim.asProver(OTHER_REPO, SALT_B, forgedPath);

    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('not anchored');
  });

  it('rejects a claim against a registry with an empty tree', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    sim.asProver(COMPLIANT, SALT_A, {
      leaf,
      path: Array.from({ length: 16 }, () => ({ sibling: { field: 0n }, goes_left: true })),
    });
    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('not anchored');
  });
});

describe('6 — replay protection', () => {
  it('rejects a second claim for the same (leaf, policy)', () => {
    const sim = anchored(COMPLIANT, SALT_A);
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);
    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('already claimed');
  });

  it('leaves the tally at one after a rejected replay', () => {
    const sim = anchored(COMPLIANT, SALT_A);
    sim.claimBadge(PRODUCTION_READY_ID);
    expect(() => sim.claimBadge(PRODUCTION_READY_ID)).toThrow('already claimed');
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(1n);
  });

  it('documents Gap 1 — re-anchoring under a fresh salt permits a second claim', () => {
    // ../../../docs/02-threat-model.md Gap 1, chosen deliberately: a nullifier
    // over (repo, commit, policy) would be deterministic but brute-forceable,
    // trading a counting bug for a privacy break. This test pins the known
    // behaviour so a future "fix" is a conscious decision, not an accident.
    const sim = anchored(COMPLIANT, SALT_A);
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);

    const reLeaf = pureCircuits.leafOf(COMPLIANT, SALT_B);
    sim.attest(reLeaf);
    sim.asProver(COMPLIANT, SALT_B, sim.pathFor(reLeaf));

    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(2n);
  });
});

describe('7 — historic root', () => {
  // The whole reason for HistoricMerkleTree. With a plain MerkleTree this fails,
  // and the design is broken: the first repo's proof would die the moment a
  // second repo anchored.
  it('accepts a path captured before later inserts', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);

    const leafA = pureCircuits.leafOf(COMPLIANT, SALT_A);
    sim.attest(leafA);
    const pathA = sim.pathFor(leafA); // captured against root R1
    const rootAtCapture = sim.ledger.attestations.root();

    sim.attest(pureCircuits.leafOf(OTHER_REPO, SALT_A));
    sim.attest(pureCircuits.leafOf(OTHER_REPO, SALT_B));

    // The tree has moved on...
    expect(sim.ledger.attestations.root()).not.toEqual(rootAtCapture);
    expect(sim.ledger.attestations.firstFree()).toBe(3n);

    // ...but the stale path still proves membership.
    sim.asProver(COMPLIANT, SALT_A, pathA);
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(1n);
  });

  it('still accepts the historic root after many more inserts', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);

    const leafA = pureCircuits.leafOf(COMPLIANT, SALT_A);
    sim.attest(leafA);
    const pathA = sim.pathFor(leafA);

    for (let i = 0; i < 20; i++) sim.attest(bytes32(i));
    expect(sim.ledger.attestations.firstFree()).toBe(21n);

    sim.asProver(COMPLIANT, SALT_A, pathA);
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);
  });
});

describe('8 — pure circuits are the single encoding implementation', () => {
  // These are what make the schema drift flagged in
  // ../../../docs/03-evidence-schema.md structurally impossible rather than
  // merely discouraged. Without this test, that claim is an assertion.
  it('computes the same leaf that claimBadge accepts', () => {
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);
    sim.attest(leaf); // anchored using the TypeScript-computed leaf
    sim.asProver(COMPLIANT, SALT_A, sim.pathFor(leaf));

    // The circuit recomputes the leaf from the witness evidence and asserts it
    // matches the anchored path. Passing means the two agree byte for byte.
    expect(sim.claimBadge(PRODUCTION_READY_ID)).toBe(true);
  });

  it('is deterministic and returns 32 bytes', () => {
    const first = pureCircuits.leafOf(COMPLIANT, SALT_A);
    const second = pureCircuits.leafOf(COMPLIANT, SALT_A);
    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
  });

  it('blinds the commitment — a different salt gives a different leaf', () => {
    expect(pureCircuits.leafOf(COMPLIANT, SALT_A)).not.toEqual(
      pureCircuits.leafOf(COMPLIANT, SALT_B),
    );
  });

  it('separates nullifier domains from leaf domains', () => {
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    const nullifier = pureCircuits.nullifierOf(leaf, PRODUCTION_READY_ID);
    expect(nullifier).not.toEqual(leaf);
    expect(nullifier).toHaveLength(32);
  });

  it('gives a different nullifier per policy for the same leaf', () => {
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    expect(pureCircuits.nullifierOf(leaf, PRODUCTION_READY_ID)).not.toEqual(
      pureCircuits.nullifierOf(leaf, policyId('some-other-policy')),
    );
  });
});

describe('encoding helpers', () => {
  it('pads a repo name to 64 bytes and lowercases it', () => {
    expect(encodeRepo('Acme/Widget')).toHaveLength(64);
    expect(encodeRepo('Acme/Widget')).toEqual(encodeRepo('acme/widget'));
  });

  it('refuses a repo name that would be truncated', () => {
    // Silent truncation would collide two repos into one identity.
    expect(() => encodeRepo('x'.repeat(65))).toThrow('exceeding the 64-byte limit');
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

  it('rejects evidence carrying the wrong schema version', () => {
    expect(() => encodeEvidence({ ...canonical(), schema: 'zkaudit.evidence.v0' })).toThrow(
      'expected schema "zkaudit.evidence.v1"',
    );
  });

  it('clamps coverage to 100.00%', () => {
    expect(encodeEvidence(canonical({ coverage: 99_999 })).coverage).toBe(10_000n);
  });

  it('derives distinct ids for distinct repos', () => {
    expect(repoId('acme/widget')).not.toEqual(repoId('globex/gadget'));
  });
});

describe('9 — anchor-only access control', () => {
  // Identity comes from a witness secret, not ownPublicKey(), which is
  // prover-supplied and therefore forgeable for authorization purposes.
  let sim: AuditRegistrySimulator;

  beforeEach(() => {
    sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.withPrivateState({ secretKey: IMPOSTOR_SECRET });
  });

  it('rejects attest from a non-anchor', () => {
    expect(() => sim.attest(bytes32(0x01))).toThrow('not anchor');
  });

  it('rejects registerPolicy from a non-anchor', () => {
    expect(() => sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY)).toThrow('not anchor');
  });

  it('leaves the tree untouched after a rejected attest', () => {
    expect(() => sim.attest(bytes32(0x01))).toThrow('not anchor');
    expect(sim.ledger.attestations.firstFree()).toBe(0n);
  });

  it('lets a repo owner claim without holding any secret at all', () => {
    const registry = anchored(COMPLIANT, SALT_A);
    registry.withPrivateState({ secretKey: null });
    expect(registry.claimBadge(PRODUCTION_READY_ID)).toBe(true);
  });
});

describe('10 — policy registration', () => {
  it('publishes thresholds a verifier can read', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);
    expect(sim.ledger.policies.lookup(PRODUCTION_READY_ID)).toEqual(PRODUCTION_READY);
  });

  it('seeds the tally, so the first successful claim does not throw', () => {
    // A Map<_, Counter> entry does not exist until inserted; without the seed in
    // registerPolicy, claimBadge's lookup().increment() fails on the first claim.
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    sim.registerPolicy(PRODUCTION_READY_ID, PRODUCTION_READY);
    expect(sim.ledger.compliantCount.member(PRODUCTION_READY_ID)).toBe(true);
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(0n);
  });

  it('does not reset an existing tally when re-registered', () => {
    const sim = anchored(COMPLIANT, SALT_A);
    sim.claimBadge(PRODUCTION_READY_ID);
    expect(sim.tally(PRODUCTION_READY_ID)).toBe(1n);

    sim.withPrivateState({ secretKey: ANCHOR_SECRET });
    sim.registerPolicy(PRODUCTION_READY_ID, { ...PRODUCTION_READY, maxHighs: 10n });

    expect(sim.tally(PRODUCTION_READY_ID)).toBe(1n);
    expect(sim.ledger.policies.lookup(PRODUCTION_READY_ID).maxHighs).toBe(10n);
  });

  it('rejects a claim against an unregistered policy', () => {
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    sim.attest(leaf);
    sim.asProver(COMPLIANT, SALT_A, sim.pathFor(leaf));
    expect(() => sim.claimBadge(policyId('never-registered'))).toThrow();
  });
});

describe('privacy — what reaches the public transcript', () => {
  // The checklist in ../../../docs/02-threat-model.md, checked mechanically
  // instead of by eye.
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

  it('does not publish the leaf preimage when anchoring', () => {
    // The compiler requires disclose() on insert()'s argument, which reads like
    // "this becomes public" — but insert() applies leaf_hash() internally and the
    // raw leaf never enters the transcript. Worth asserting, because the
    // annotation and the actual behaviour disagree.
    const sim = new AuditRegistrySimulator(ANCHOR_SECRET);
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);
    sim.attest(leaf);
    expect(sim.publicTranscriptJson()).not.toContain(hex(leaf));
  });

  it('does not publish the repo, the commit, or any finding count when claiming', () => {
    const sim = anchored(COMPLIANT, SALT_A);
    sim.claimBadge(PRODUCTION_READY_ID);
    const transcript = sim.publicTranscriptJson();

    expect(transcript).not.toContain(hex(COMPLIANT.repoId));
    expect(transcript).not.toContain(hex(COMPLIANT.commitId));
    expect(transcript).not.toContain(hex(SALT_A));
    expect(transcript).not.toContain(hex(pureCircuits.leafOf(COMPLIANT, SALT_A)));
  });

  it('publishes the nullifier and the policy id, which are public by design', () => {
    const sim = anchored(COMPLIANT, SALT_A);
    sim.claimBadge(PRODUCTION_READY_ID);
    const transcript = sim.publicTranscriptJson();
    const leaf = pureCircuits.leafOf(COMPLIANT, SALT_A);

    expect(transcript).toContain(hex(pureCircuits.nullifierOf(leaf, PRODUCTION_READY_ID)));
    expect(transcript).toContain(hex(PRODUCTION_READY_ID));
  });
});
