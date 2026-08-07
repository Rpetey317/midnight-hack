import { describe, expect, it } from 'vitest';

import { EVIDENCE_SCHEMA, encodeEvidence, pureCircuits } from '@zkuat/contract';

import { buildBundle, bundleToPrivateState, freshSalt, unhex32, verifyBundle } from '../bundle.js';
import { canonicalBytes } from '../canonical.js';
import { signEnvelope } from '../dsse.js';
import { toPrivateKeyObject } from '../keys.js';
import { KEY, OTHER_KEY, SALT, evidence } from './helpers.js';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bundle = () => buildBundle({ evidence: evidence(), key: KEY, salt: SALT });

describe('buildBundle', () => {
  it('derives the leaf through the contract, not a local reimplementation', () => {
    // The check that closes docs/03's "highest-risk item in the project": what
    // TypeScript commits to is byte for byte what proveCompliance checks,
    // because both are the same compiled circuit.
    const b = bundle();
    expect(b.leaf).toBe(hex(pureCircuits.leafOf(encodeEvidence(evidence()), SALT)));
  });

  it('is deterministic for a fixed salt', () => {
    expect(bundle().leaf).toBe(bundle().leaf);
  });

  it('produces a different leaf for a different salt — the blinding property', () => {
    const other = buildBundle({ evidence: evidence(), key: KEY, salt: new Uint8Array(32).fill(9) });
    expect(other.leaf).not.toBe(bundle().leaf);
  });

  it('changes the leaf when any evidence field changes', () => {
    const changed = buildBundle({
      evidence: evidence({ vulns: { criticals: 1, highs: 3, kev: 0 } }),
      key: KEY,
      salt: SALT,
    });
    expect(changed.leaf).not.toBe(bundle().leaf);
  });

  it('generates a fresh 32-byte salt when none is given', () => {
    const a = buildBundle({ evidence: evidence(), key: KEY });
    const b = buildBundle({ evidence: evidence(), key: KEY });
    expect(a.salt).toHaveLength(64);
    expect(a.salt).not.toBe(b.salt);
  });

  it('rejects a salt that is not 32 bytes', () => {
    expect(() => buildBundle({ evidence: evidence(), key: KEY, salt: new Uint8Array(31) })).toThrow(
      /salt must be 32 bytes/,
    );
  });

  it('refuses to sign evidence naming a different attestor than the key', () => {
    // The attestor slug hashes into Evidence.attestorId, which a policy can pin
    // via requiredAttestor. A bundle whose signature and committed identity
    // disagree is a bundle that means nothing.
    expect(() =>
      buildBundle({ evidence: evidence({ attestor: 'rogue-scanner' }), key: KEY, salt: SALT }),
    ).toThrow(/these must match/);
  });

  it('propagates encodeEvidence validation rather than signing bad input', () => {
    expect(() => buildBundle({ evidence: evidence({ schema: 'zkuat.evidence.v1' }), key: KEY })).toThrow(
      /expected schema/,
    );
    expect(() =>
      buildBundle({ evidence: evidence({ validUntil: evidence().generatedAt - 1 }), key: KEY }),
    ).toThrow(/must be after generatedAt/);
  });

  it('leaves the sigstore slot empty for an offline signature', () => {
    expect(bundle().sigstore).toBeNull();
  });

  it('does not put the salt in the signed statement', () => {
    // The salt is the one value whose publication unblinds the commitment.
    // Keeping it out of the signed payload keeps it out of anything anyone
    // might quote when presenting a signature.
    expect(JSON.stringify(bundle().statement)).not.toContain(hex(SALT));
  });
});

describe('freshSalt', () => {
  it('is 32 bytes and not the same twice', () => {
    const a = freshSalt();
    expect(a).toHaveLength(32);
    expect(hex(a)).not.toBe(hex(freshSalt()));
  });
});

describe('verifyBundle', () => {
  it('accepts what buildBundle produced', () => {
    expect(verifyBundle(bundle())).toBe(true);
  });

  it('enforces a trusted key set when one is given', () => {
    expect(verifyBundle(bundle(), { trustedKeyIds: [KEY.keyid] })).toBe(true);
    expect(() => verifyBundle(bundle(), { trustedKeyIds: [OTHER_KEY.keyid] })).toThrow(
      /not in the trusted set/,
    );
  });

  it('catches the readable statement being edited after signing', () => {
    // The nastiest failure mode available: the signature stays valid over the
    // ORIGINAL payload while every human and every naive reader sees the edit.
    const b = bundle();
    const forged = {
      ...b,
      statement: {
        ...b.statement,
        evidence: { ...b.statement.evidence, vulns: { criticals: 0, highs: 0, kev: 0 } },
      },
    };
    expect(() => verifyBundle(forged)).toThrow(/differs from the signed envelope payload/);
  });

  it('catches a tampered signature', () => {
    const b = bundle();
    const sigs = [{ ...b.envelope.signatures[0]!, sig: Buffer.alloc(64).toString('base64') }];
    expect(() => verifyBundle({ ...b, envelope: { ...b.envelope, signatures: sigs } })).toThrow(
      /does not verify/,
    );
  });

  it('catches a swapped salt — the leaf stops re-deriving', () => {
    const b = bundle();
    expect(() => verifyBundle({ ...b, salt: 'a'.repeat(64) })).toThrow(/leaf mismatch/);
  });

  it('catches a swapped leaf', () => {
    const b = bundle();
    expect(() => verifyBundle({ ...b, leaf: 'b'.repeat(64) })).toThrow(/leaf mismatch/);
  });

  it('catches a key substituted along with a re-signature by that key', () => {
    // Signing the same statement with a foreign key is internally consistent,
    // so only the trust list rejects it. This is exactly why the anchor MUST
    // pass trustedKeyIds and why verifyBundle says so in its own doc comment.
    const b = bundle();
    const resigned = {
      ...b,
      envelope: signEnvelope(canonicalBytes(b.statement), toPrivateKeyObject(OTHER_KEY)),
      attestorPublicKey: { ...b.attestorPublicKey, keyid: OTHER_KEY.keyid, spki: OTHER_KEY.spki },
    };
    expect(verifyBundle(resigned)).toBe(true);
    expect(() => verifyBundle(resigned, { trustedKeyIds: [KEY.keyid] })).toThrow(
      /not in the trusted set/,
    );
  });

  it('rejects a wrong schema version outright', () => {
    const b = bundle();
    expect(() => verifyBundle({ ...b, statement: { ...b.statement, schema: 'zkuat.evidence.v3' } })).toThrow(
      /schema/,
    );
  });

  it('rejects a document that is not a bundle', () => {
    expect(() => verifyBundle({ _type: 'something-else' } as never)).toThrow(/not a zkuat.bundle/);
  });

  it('names which link broke, not just "invalid"', () => {
    // At 02:00 the error message is the debugging tool.
    const b = bundle();
    try {
      verifyBundle({ ...b, salt: 'a'.repeat(64) });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toMatch(/salt is wrong or the contract's Evidence struct changed/);
    }
  });
});

describe('bundleToPrivateState', () => {
  it('returns exactly the witnesses proveCompliance needs', () => {
    const { evidence: ev, salt, leaf } = bundleToPrivateState(bundle());
    expect(ev).toEqual(encodeEvidence(evidence()));
    expect(hex(salt)).toBe(hex(SALT));
    expect(hex(leaf)).toBe(bundle().leaf);
  });

  it('verifies before returning, so a bad bundle fails here not mid-proof', () => {
    const b = bundle();
    expect(() => bundleToPrivateState({ ...b, leaf: 'c'.repeat(64) })).toThrow(/leaf mismatch/);
  });

  it('produces a leaf the contract agrees with', () => {
    const { evidence: ev, salt, leaf } = bundleToPrivateState(bundle());
    expect(hex(pureCircuits.leafOf(ev, salt))).toBe(hex(leaf));
  });
});

describe('unhex32', () => {
  it('accepts exactly 64 lowercase hex characters', () => {
    expect(unhex32('a'.repeat(64), 'x')).toHaveLength(32);
  });

  it('rejects anything else rather than padding it', () => {
    for (const bad of ['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'zz', '']) {
      expect(() => unhex32(bad, 'field')).toThrow(/64 lowercase hex/);
    }
  });
});

describe('schema pinning', () => {
  it('this build targets the schema the contract exports', () => {
    expect(bundle().statement.schema).toBe(EVIDENCE_SCHEMA);
  });
});
