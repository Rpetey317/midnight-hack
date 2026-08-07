/**
 * DSSE envelopes over ed25519.
 *
 * Master Doc §9 asks for `Sign(ATTESTOR_PRIVATE_KEY, hash(normalizedEvidence))`.
 * We use the DSSE envelope shape rather than a bare signature for two reasons:
 * the payload type is signed alongside the payload (so a statement cannot be
 * replayed as a different document type), and it is the same envelope Sigstore
 * uses — so when `.github/workflows/attest.yml` adds the Sigstore layer, the two
 * signatures sit in structurally identical objects.
 *
 * ed25519 via `node:crypto`, so this package has no cryptographic dependency at
 * all. `sign(null, …)` is correct for ed25519: the digest algorithm is part of
 * the scheme, and passing one is an error.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export const PAYLOAD_TYPE = 'application/vnd.zkuat.statement+json';

export interface DsseSignature {
  /** sha256 of the signer's SPKI DER, hex. Identifies the key, not the signer. */
  keyid: string;
  /** base64 raw ed25519 signature. */
  sig: string;
}

export interface DsseEnvelope {
  payloadType: string;
  /** base64 of the canonical JSON payload. */
  payload: string;
  signatures: DsseSignature[];
}

/**
 * Pre-Authentication Encoding, per the DSSE spec.
 *
 *     "DSSEv1" SP LEN(type) SP type SP LEN(payload) SP payload
 *
 * Lengths are of the UTF-8 *byte* strings, which is why this concatenates
 * Buffers rather than building a JS string — a multi-byte character in the
 * payload would otherwise be counted as one unit instead of several.
 */
export function pae(payloadType: string, payload: Buffer): Buffer {
  const type = Buffer.from(payloadType, 'utf8');
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${type.length} `, 'utf8'),
    type,
    Buffer.from(` ${payload.length} `, 'utf8'),
    payload,
  ]);
}

/** sha256 of the SPKI DER, hex. Stable across encodings of the same key. */
export function keyIdOf(publicKey: KeyObject): string {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(spki).digest('hex');
}

export function signEnvelope(
  payload: Buffer,
  privateKey: KeyObject,
  payloadType: string = PAYLOAD_TYPE,
): DsseEnvelope {
  const publicKey = createPublicKey(privateKey);
  return {
    payloadType,
    payload: payload.toString('base64'),
    signatures: [
      {
        keyid: keyIdOf(publicKey),
        sig: sign(null, pae(payloadType, payload), privateKey).toString('base64'),
      },
    ],
  };
}

/**
 * True if at least one signature in the envelope verifies under `publicKey`.
 *
 * Never throws on malformed input — a bad base64 blob or a wrong-length
 * signature is an authentication failure, not a crash, and the caller
 * distinguishes them by the error message it raises.
 */
export function verifyEnvelope(envelope: DsseEnvelope, publicKey: KeyObject): boolean {
  let payload: Buffer;
  try {
    payload = Buffer.from(envelope.payload, 'base64');
  } catch {
    return false;
  }
  const message = pae(envelope.payloadType, payload);
  const expectedKeyId = keyIdOf(publicKey);
  return envelope.signatures.some((s) => {
    if (s.keyid && s.keyid !== expectedKeyId) return false;
    try {
      return verify(null, message, publicKey, Buffer.from(s.sig, 'base64'));
    } catch {
      return false;
    }
  });
}

/** The envelope's payload, decoded and parsed. Throws if it is not JSON. */
export function envelopePayload<T>(envelope: DsseEnvelope): T {
  return JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8')) as T;
}

export { createPrivateKey, createPublicKey };
export type { KeyObject };
