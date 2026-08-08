import { hkdfSync } from 'node:crypto';

const SEED_HEX = /^(?:[0-9a-f]{2}){16,64}$/i;
const KDF_SALT = Buffer.from('zkuat:anchor-kdf:v1', 'utf8');
const KDF_INFO = Buffer.from('zkuat:anchor-secret:v1', 'utf8');

/**
 * Derive the Compact anchor witness from the sponsor wallet seed.
 *
 * The wallet seed itself is never supplied to a witness. Deployment and the
 * runtime call this same function, so the sealed on-chain anchor identity and
 * subsequent attest/registerPolicy calls cannot drift.
 */
export function deriveAnchorSecret(seedHex: string): Uint8Array {
  const normalized = seedHex.trim().replace(/^0x/i, '');
  if (!SEED_HEX.test(normalized)) {
    throw new Error('zkuat: sponsor wallet seed must be 32-128 hexadecimal characters');
  }
  return new Uint8Array(
    hkdfSync('sha256', Buffer.from(normalized, 'hex'), KDF_SALT, KDF_INFO, 32),
  );
}
