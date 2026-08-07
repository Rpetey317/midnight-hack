/**
 * zkuat contract package — the integration surface for every other track.
 *
 * Tracks B (collector/attestor), C (anchor/CLI), and D (vendor + buyer views)
 * import from here. In particular they call `pureCircuits.leafOf`,
 * `nullifierOf`, and `recordKeyOf` rather than reimplementing the commitment
 * scheme: those are compiled from the same Compact source `proveCompliance`
 * runs, so what TypeScript computes is byte for byte what the circuit checks.
 *
 *     import {
 *       encodeEvidence, pureCircuits, POLICY_BANK_ID, recordKey,
 *     } from '@zkuat/contract';
 *
 *     const evidence = encodeEvidence(canonicalJson);
 *     const leaf     = pureCircuits.leafOf(evidence, salt);        // anchor this
 *     const key      = recordKey(canonicalJson.artifactDigest, 'bank-v1');
 *
 * See ../../docs/03-evidence-schema.md for the encoding rules and
 * ../../docs/04-contract-spec.md for the circuits.
 */

// Compiled contract: the Contract class, the ledger reader, and the pure
// circuits callable with no context and no transaction.
export {
  Contract,
  ledger,
  pureCircuits,
  contractReferenceLocations,
} from './managed/audit_registry/contract/index.js';

export type {
  Circuits,
  ImpureCircuits,
  ProvableCircuits,
  PureCircuits,
} from './managed/audit_registry/contract/index.js';

// Types derived from the compiler's own output.
export type {
  AuditPath,
  ComplianceRecord,
  Evidence,
  Ledger,
  Policy,
  Witnesses,
} from './types.js';

// Witness implementations and the private state they read.
export { emptyPrivateState, witnesses, type AuditPrivateState } from './witnesses.js';

// Canonical JSON → Evidence encoding, identifier derivation, and the two shipped
// policies. The single implementation; do not reimplement it downstream.
export {
  attestorId,
  encodeArtifactDigest,
  encodeCommit,
  encodeEvidence,
  issuerId,
  padString,
  policyId,
  productId,
  recordKey,
  stringId,
  vendorId,
  ANY_ATTESTOR,
  EVIDENCE_SCHEMA,
  HASH_BYTES,
  MAX_COVERAGE,
  MAX_U32,
  MAX_U64,
  POLICY_BANK_ID,
  POLICY_BANK_SLUG,
  POLICY_BANK_V1,
  POLICY_ENTERPRISE_ID,
  POLICY_ENTERPRISE_SLUG,
  POLICY_ENTERPRISE_V1,
  STRING_ID_BYTES,
  THIRTY_DAYS_SECONDS,
  type CanonicalEvidence,
} from './encoding.js';
