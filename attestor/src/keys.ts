/**
 * Attestor key material.
 *
 * One ed25519 keypair per attestor identity. The public half is committed so
 * anyone can verify the demo fixtures; the private half is gitignored (`*.key.json`).
 *
 * ⚠️ This key is the whole of the attestor's authority in the offline path. A
 * real deployment keeps it in a KMS or an HSM and never lets it touch a
 * filesystem. For the hackathon it is a file, and saying so plainly is better
 * than implying otherwise — `../../docs/02-threat-model.md` §"Trust assumptions"
 * already names the attestor as an irreducible trust root.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { keyIdOf } from './dsse.js';

/** The committed half. Everything needed to verify, nothing to sign with. */
export interface AttestorPublicKey {
  alg: 'ed25519';
  /** The attestor slug that goes into `Evidence.attestorId`. */
  attestor: string;
  keyid: string;
  /** base64 SPKI DER. */
  spki: string;
}

/** The gitignored half. */
export interface AttestorPrivateKey extends AttestorPublicKey {
  /** base64 PKCS#8 DER. */
  pkcs8: string;
}

export function generateAttestorKey(attestor: string): AttestorPrivateKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    alg: 'ed25519',
    attestor,
    keyid: keyIdOf(publicKey),
    spki: Buffer.from(publicKey.export({ type: 'spki', format: 'der' })).toString('base64'),
    pkcs8: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'der' })).toString('base64'),
  };
}

export function publicHalf(key: AttestorPrivateKey | AttestorPublicKey): AttestorPublicKey {
  return { alg: 'ed25519', attestor: key.attestor, keyid: key.keyid, spki: key.spki };
}

export function toPrivateKeyObject(key: AttestorPrivateKey): KeyObject {
  return createPrivateKey({
    key: Buffer.from(key.pkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
}

export function toPublicKeyObject(key: AttestorPublicKey): KeyObject {
  return createPublicKey({
    key: Buffer.from(key.spki, 'base64'),
    format: 'der',
    type: 'spki',
  });
}

export function readPrivateKey(file: string): AttestorPrivateKey {
  const key = JSON.parse(fs.readFileSync(file, 'utf8')) as AttestorPrivateKey;
  if (key.alg !== 'ed25519' || !key.pkcs8) {
    throw new Error(`zkuat: ${file} is not an ed25519 attestor private key`);
  }
  // A keyid that does not match its own key material means the file was edited
  // by hand or two keys got merged. Catch it here rather than producing
  // signatures nobody can attribute.
  const derived = keyIdOf(createPublicKey(toPrivateKeyObject(key)));
  if (derived !== key.keyid) {
    throw new Error(
      `zkuat: ${file} declares keyid ${key.keyid} but its key material derives ${derived}`,
    );
  }
  return key;
}

export function readPublicKey(file: string): AttestorPublicKey {
  const key = JSON.parse(fs.readFileSync(file, 'utf8')) as AttestorPublicKey;
  if (key.alg !== 'ed25519' || !key.spki) {
    throw new Error(`zkuat: ${file} is not an ed25519 attestor public key`);
  }
  return key;
}

/**
 * Carried inside the private key file itself.
 *
 * The demo key under `demo/keys/` is deliberately committed — a four-person
 * team needs to refresh the fixtures before the pitch, and the repo already
 * commits the devnet genesis seed and anchor secret on the same reasoning. But
 * "deliberately committed" and "safe to copy" are different things, and the
 * person who finds this file will not have read `demo/README.md` first.
 */
const KEY_WARNING = [
  'PRIVATE KEY. This is the attestor signing key — its entire authority.',
  'The copy under demo/keys/ is COMMITTED ON PURPOSE and signs synthetic demo',
  'evidence only. Do not reuse it for anything real; generate a fresh key with',
  '`npm run keygen` and keep it in a KMS.',
];

export function writeKeyPair(dir: string, key: AttestorPrivateKey): { priv: string; pub: string } {
  fs.mkdirSync(dir, { recursive: true });
  const priv = path.join(dir, `${key.attestor}.key.json`);
  const pub = path.join(dir, `${key.attestor}.pub.json`);
  // 0600: the private key is the attestor's entire authority.
  fs.writeFileSync(priv, `${JSON.stringify({ _warning: KEY_WARNING, ...key }, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.writeFileSync(pub, `${JSON.stringify(publicHalf(key), null, 2)}\n`);
  return { priv, pub };
}
