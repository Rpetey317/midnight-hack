import { createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { canonicalBytes } from '../canonical.js';
import { envelopePayload, keyIdOf, pae, signEnvelope, verifyEnvelope } from '../dsse.js';
import { toPrivateKeyObject, toPublicKeyObject } from '../keys.js';
import { KEY, OTHER_KEY, evidence } from './helpers.js';

const priv = toPrivateKeyObject(KEY);
const pub = toPublicKeyObject(KEY);

describe('PAE', () => {
  it('matches the DSSE spec layout', () => {
    expect(pae('http/v1', Buffer.from('hello')).toString('utf8')).toBe(
      'DSSEv1 7 http/v1 5 hello',
    );
  });

  it('uses byte lengths, not character counts', () => {
    // A two-byte character must be counted as two, or a verifier that gets it
    // right and a signer that gets it wrong never agree.
    expect(pae('t', Buffer.from('é', 'utf8')).toString('utf8')).toBe('DSSEv1 1 t 2 é');
  });

  it('binds the payload type — a type swap changes the signed message', () => {
    const payload = Buffer.from('x');
    expect(pae('a/b', payload).equals(pae('a/c', payload))).toBe(false);
  });
});

describe('signEnvelope / verifyEnvelope', () => {
  const payload = canonicalBytes(evidence());

  it('round-trips', () => {
    expect(verifyEnvelope(signEnvelope(payload, priv), pub)).toBe(true);
  });

  it('rejects a flipped payload byte', () => {
    const envelope = signEnvelope(payload, priv);
    const bytes = Buffer.from(envelope.payload, 'base64');
    bytes[10] ^= 0xff;
    expect(verifyEnvelope({ ...envelope, payload: bytes.toString('base64') }, pub)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    expect(verifyEnvelope(signEnvelope(payload, priv), toPublicKeyObject(OTHER_KEY))).toBe(false);
  });

  it('rejects a changed payloadType even though the bytes are untouched', () => {
    const envelope = signEnvelope(payload, priv);
    expect(verifyEnvelope({ ...envelope, payloadType: 'application/json' }, pub)).toBe(false);
  });

  it('returns false rather than throwing on garbage', () => {
    const envelope = signEnvelope(payload, priv);
    expect(verifyEnvelope({ ...envelope, signatures: [{ keyid: '', sig: '!!!' }] }, pub)).toBe(
      false,
    );
    expect(verifyEnvelope({ ...envelope, signatures: [] }, pub)).toBe(false);
  });

  it('does not accept a signature labelled with a foreign keyid', () => {
    const envelope = signEnvelope(payload, priv);
    const tagged = { ...envelope, signatures: [{ ...envelope.signatures[0]!, keyid: 'ff'.repeat(32) }] };
    expect(verifyEnvelope(tagged, pub)).toBe(false);
  });

  it('exposes the payload it signed', () => {
    const envelope = signEnvelope(payload, priv);
    expect(envelopePayload(envelope)).toEqual(JSON.parse(payload.toString('utf8')));
  });
});

describe('keyIdOf', () => {
  it('is the sha256 of the SPKI DER, and stable across re-derivation', () => {
    expect(keyIdOf(pub)).toBe(KEY.keyid);
    expect(keyIdOf(createPublicKey(priv))).toBe(KEY.keyid);
    expect(KEY.keyid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes two keys for the same attestor slug', () => {
    expect(KEY.keyid).not.toBe(OTHER_KEY.keyid);
  });
});
