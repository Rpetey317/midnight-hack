/**
 * Which attestor keys this anchor will accept.
 *
 * `verifyBundle` without a trust list checks the DSSE signature against the key
 * the bundle *carries*. That proves the bundle is internally consistent and
 * says nothing about who signed it — anyone can generate a keypair, sign a
 * statement claiming zero criticals, and ship the public half alongside. The
 * attestor has a test showing exactly that: a foreign key re-signing a
 * statement passes without `trustedKeyIds` and fails with it.
 *
 * So the anchor always passes a list. This module is where it comes from.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPublicKey } from '@zkuat/attestor';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `demo/keys/` at the repo root — where the demo attestor's public half lives. */
export const DEMO_KEYS_DIR = path.resolve(here, '..', '..', 'demo', 'keys');

/**
 * Resolve the trusted attestor keyids.
 *
 * With `files`, each is a `*.pub.json` written by `zkuat-attestor-keygen`; the
 * keyid is `sha256(SPKI DER)`, re-derived by `readPublicKey` rather than taken
 * on the file's word.
 *
 * Without, every `*.pub.json` in `demo/keys/`. That is the demo attestor and
 * only the demo attestor — a real deployment passes `--trust` explicitly and
 * does not keep its trust anchor in the same repo as the code.
 */
export function trustedKeyIds(files?: string[]): string[] {
  const resolved = files?.length ? files : defaultTrustFiles();
  if (resolved.length === 0) {
    throw new Error(
      `no attestor public keys found in ${DEMO_KEYS_DIR} — pass --trust <pub.json> explicitly`,
    );
  }
  return resolved.map((file) => {
    try {
      return readPublicKey(file).keyid;
    } catch (err) {
      // Typo'd path, or a file that is not an attestor public key. Say which,
      // because "Unexpected end of JSON input" names neither.
      throw new Error(
        `zkuat: ${file} is not a readable attestor public key (*.pub.json): ${
          (err as Error).message
        }`,
      );
    }
  });
}

function defaultTrustFiles(): string[] {
  if (!fs.existsSync(DEMO_KEYS_DIR)) return [];
  return fs
    .readdirSync(DEMO_KEYS_DIR)
    .filter((name) => name.endsWith('.pub.json'))
    .map((name) => path.join(DEMO_KEYS_DIR, name));
}

/** Parse a `--trust a.pub.json,b.pub.json` flag value. */
export function parseTrustFlag(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}
