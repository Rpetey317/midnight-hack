/**
 * Building, loading, and verifying evidence bundles.
 *
 * The leaf is derived by calling `pureCircuits.leafOf` — the compiler's own
 * output, compiled from the same Compact source `proveCompliance` runs. So what
 * this module commits to is byte for byte what the circuit checks it against.
 * `../../docs/03-evidence-schema.md` names encoding drift between components as
 * the highest-risk item in the project and closes it exactly this way:
 *
 *   > Drift is not discouraged — it is impossible.
 *
 * **Do not reimplement the commitment here.** Not carefully, not "just for the
 * fixture generator", not at all.
 */
import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';

import {
  EVIDENCE_SCHEMA,
  HASH_BYTES,
  encodeEvidence,
  pureCircuits,
  type CanonicalEvidence,
  type Evidence,
} from '@zkuat/contract';

import { canonicalBytes } from './canonical.js';
import { envelopePayload, signEnvelope, verifyEnvelope, PAYLOAD_TYPE } from './dsse.js';
import { toPrivateKeyObject, toPublicKeyObject, publicHalf } from './keys.js';
import type { AttestorPrivateKey } from './keys.js';
import { BUNDLE_TYPE, STATEMENT_TYPE, type EvidenceBundle, type ZkuatStatement } from './types.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/** hex → exactly 32 bytes. Throws on any other length rather than padding. */
export function unhex32(value: string, field: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`zkuat: ${field} must be 64 lowercase hex characters, got "${value}"`);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

/**
 * A fresh salt. 32 cryptographically random bytes, one per attestation.
 *
 * ⚠️ Losing it makes the evidence unprovable forever. There is no recovery, no
 * derivation, no reset — the commitment is over the salt and the chain holds
 * only its hash. The salt travels with the evidence in the private bundle and
 * nowhere else.
 */
export function freshSalt(): Uint8Array {
  return Uint8Array.from(randomBytes(HASH_BYTES));
}

export interface BuildBundleOptions {
  evidence: CanonicalEvidence;
  key: AttestorPrivateKey;
  /** Defaults to a fresh random salt. Fixtures pass a deterministic one. */
  salt?: Uint8Array;
  /** Defaults to `evidence.generatedAt` — deterministic fixtures need that. */
  attestedAt?: number;
  collector?: ZkuatStatement['collector'];
  demo?: boolean;
}

export function buildBundle(options: BuildBundleOptions): EvidenceBundle {
  const { evidence, key, collector, demo } = options;
  const salt = options.salt ?? freshSalt();
  if (salt.length !== HASH_BYTES) {
    throw new Error(`zkuat: salt must be ${HASH_BYTES} bytes, got ${salt.length}`);
  }

  // encodeEvidence enforces the schema string, digest and commit widths, the
  // ordering of generatedAt/validUntil, and the u32 saturation rules. Anything
  // malformed fails here, before a signature exists to be trusted.
  const encoded: Evidence = encodeEvidence(evidence);
  const leaf = pureCircuits.leafOf(encoded, salt);

  if (evidence.attestor !== key.attestor) {
    // The attestor slug hashes into Evidence.attestorId, which a policy may pin
    // via requiredAttestor. Signing evidence that names a different attestor
    // than the signing key would produce a bundle whose signature and whose
    // committed identity disagree.
    throw new Error(
      `zkuat: evidence names attestor "${evidence.attestor}" but the signing key is ` +
        `"${key.attestor}" — these must match, they are the same identity`,
    );
  }

  const statement: ZkuatStatement = {
    _type: STATEMENT_TYPE,
    schema: EVIDENCE_SCHEMA,
    evidence,
    leaf: hex(leaf),
    attestor: key.attestor,
    attestedAt: options.attestedAt ?? evidence.generatedAt,
    ...(collector ? { collector } : {}),
  };

  return {
    _type: BUNDLE_TYPE,
    ...(demo ? { demo: true } : {}),
    salt: hex(salt),
    leaf: hex(leaf),
    statement,
    envelope: signEnvelope(canonicalBytes(statement), toPrivateKeyObject(key), PAYLOAD_TYPE),
    attestorPublicKey: publicHalf(key),
    sigstore: null,
  };
}

export interface VerifyBundleOptions {
  /**
   * Accept only these attestor keys, by keyid.
   *
   * Omitting this verifies the signature against the key the bundle *carries*,
   * which proves internal consistency and nothing about who signed. That is
   * enough for "is this bundle well-formed", and **not** enough for "should I
   * anchor this" — Track C's anchor must pass a trust list.
   */
  trustedKeyIds?: string[];
}

/**
 * Full structural and cryptographic check. Throws a named error on the first
 * failure; the message says which link broke, because at 02:00 "invalid bundle"
 * is not a useful thing to read.
 */
export function verifyBundle(bundle: EvidenceBundle, options: VerifyBundleOptions = {}): true {
  if (bundle._type !== BUNDLE_TYPE) {
    throw new Error(`zkuat: not a ${BUNDLE_TYPE} (got "${bundle._type}")`);
  }
  if (bundle.statement?._type !== STATEMENT_TYPE) {
    throw new Error(`zkuat: bundle statement is not a ${STATEMENT_TYPE}`);
  }
  if (bundle.statement.schema !== EVIDENCE_SCHEMA) {
    throw new Error(
      `zkuat: bundle is schema "${bundle.statement.schema}", this build expects "${EVIDENCE_SCHEMA}"`,
    );
  }

  const { attestorPublicKey: pub } = bundle;
  if (!pub?.spki) throw new Error('zkuat: bundle carries no attestor public key');
  if (options.trustedKeyIds && !options.trustedKeyIds.includes(pub.keyid)) {
    throw new Error(
      `zkuat: attestor keyid ${pub.keyid} is not in the trusted set ` +
        `[${options.trustedKeyIds.join(', ')}]`,
    );
  }

  if (!verifyEnvelope(bundle.envelope, toPublicKeyObject(pub))) {
    throw new Error(`zkuat: DSSE signature does not verify under keyid ${pub.keyid}`);
  }

  // The signature covers the envelope payload, not `bundle.statement`. If the
  // two disagree, the readable copy has been edited and the signature is
  // authenticating something else entirely — the single nastiest way to get a
  // "valid" bundle that says whatever the editor wanted.
  const signed = envelopePayload<ZkuatStatement>(bundle.envelope);
  if (canonicalBytes(signed).toString('utf8') !== canonicalBytes(bundle.statement).toString('utf8')) {
    throw new Error(
      'zkuat: bundle.statement differs from the signed envelope payload — the readable ' +
        'copy has been modified after signing',
    );
  }

  if (signed.attestor !== pub.attestor) {
    throw new Error(
      `zkuat: statement names attestor "${signed.attestor}" but the key belongs to "${pub.attestor}"`,
    );
  }
  if (signed.evidence.attestor !== signed.attestor) {
    throw new Error(
      `zkuat: evidence names attestor "${signed.evidence.attestor}" but the statement is ` +
        `signed as "${signed.attestor}"`,
    );
  }

  // Re-derive the commitment through the contract's own pure circuit. This is
  // the check that would catch a schema change in Track A, because a v3
  // Evidence struct produces a different leaf from the same JSON.
  const salt = unhex32(bundle.salt, 'bundle.salt');
  const expected = hex(pureCircuits.leafOf(encodeEvidence(signed.evidence), salt));
  if (expected !== bundle.leaf) {
    throw new Error(
      `zkuat: leaf mismatch — bundle claims ${bundle.leaf} but leafOf(evidence, salt) is ` +
        `${expected}. Either the salt is wrong or the contract's Evidence struct changed.`,
    );
  }
  if (signed.leaf !== bundle.leaf) {
    throw new Error(
      `zkuat: statement leaf ${signed.leaf} disagrees with bundle leaf ${bundle.leaf}`,
    );
  }

  return true;
}

export function loadBundle(file: string): EvidenceBundle {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as EvidenceBundle;
}

export function writeBundle(file: string, bundle: EvidenceBundle): void {
  fs.writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
}

/**
 * The two private witnesses `proveCompliance` needs.
 *
 * `AuditPrivateState` in `contract/src/witnesses.ts` also wants `path`, which
 * the caller reads off the chain after anchoring:
 *
 *     const { evidence, salt } = bundleToPrivateState(bundle);
 *     const path = ledger.attestations.findPathForLeaf(unhex32(bundle.leaf, 'leaf'));
 *     await providers.privateStateProvider.set(PRIVATE_STATE_ID,
 *       { secretKey: null, evidence, salt, path });
 *
 * `secretKey` stays null: a vendor proving compliance never invokes
 * `localSecret` and needs no anchor secret at all.
 *
 * Verifies before returning — handing unverified witnesses to a prover produces
 * a "path/leaf mismatch" three minutes into proof generation instead of an
 * error here.
 */
export function bundleToPrivateState(
  bundle: EvidenceBundle,
  options: VerifyBundleOptions = {},
): { evidence: Evidence; salt: Uint8Array; leaf: Uint8Array } {
  verifyBundle(bundle, options);
  return {
    evidence: encodeEvidence(bundle.statement.evidence),
    salt: unhex32(bundle.salt, 'bundle.salt'),
    leaf: unhex32(bundle.leaf, 'bundle.leaf'),
  };
}
