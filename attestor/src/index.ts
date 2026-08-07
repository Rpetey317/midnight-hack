/**
 * `@zkuat/attestor` — Track B's integration surface.
 *
 * Tracks C (anchor + CLI) and D (vendor + buyer views) consume signed evidence
 * bundles through this module. The two calls that matter:
 *
 *     import { loadBundle, bundleToPrivateState } from '@zkuat/attestor';
 *     import { ledger } from '@zkuat/contract';
 *
 *     const bundle = loadBundle('demo/fixtures/bank-only/bundle.json');
 *     const { evidence, salt, leaf } = bundleToPrivateState(bundle);   // verifies first
 *
 *     // ... anchor `leaf`, then read its path back off the chain ...
 *     const path = ledger(state.data).attestations.findPathForLeaf(leaf);
 *     await providers.privateStateProvider.set(PRIVATE_STATE_ID,
 *       { secretKey: null, evidence, salt, path });
 *
 * and, for the anchor:
 *
 *     import { buildPredicate, assertNoEvidenceLeak } from '@zkuat/attestor';
 *
 * `bundleToPrivateState` returns exactly the private-state fields
 * `contract/src/witnesses.ts` needs, and verifies the bundle before returning
 * them — an unverified bundle fails as `path/leaf mismatch` minutes into proof
 * generation instead of immediately.
 *
 * See `../README.md` for the bundle format and `../../docs/03-evidence-schema.md`
 * for the encoding it commits to.
 */

export {
  buildBundle,
  bundleToPrivateState,
  freshSalt,
  loadBundle,
  unhex32,
  verifyBundle,
  writeBundle,
  type BuildBundleOptions,
  type VerifyBundleOptions,
} from './bundle.js';

export { assertNoEvidenceLeak, buildPredicate } from './predicate.js';

export { degradationWarning, normalize, type NormalizeOptions } from './normalize.js';

export { canonicalBytes, canonicalize, type Json } from './canonical.js';

export {
  PAYLOAD_TYPE,
  envelopePayload,
  keyIdOf,
  pae,
  signEnvelope,
  verifyEnvelope,
  type DsseEnvelope,
  type DsseSignature,
} from './dsse.js';

export {
  generateAttestorKey,
  publicHalf,
  readPrivateKey,
  readPublicKey,
  toPrivateKeyObject,
  toPublicKeyObject,
  writeKeyPair,
  type AttestorPrivateKey,
  type AttestorPublicKey,
} from './keys.js';

export {
  degradedChecks,
  type CheckName,
  type CheckResult,
  type CheckStatus,
  type CollectorReport,
  type ReportProvenance,
  type ReportSubject,
} from './report.js';

export {
  BUNDLE_TYPE,
  STATEMENT_TYPE,
  type AttestationPredicate,
  type EvidenceBundle,
  type ZkuatStatement,
} from './types.js';
