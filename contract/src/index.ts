/**
 * zkuat contract package — the integration surface for every other track.
 *
 * The runtime and read-only clients import from here. In particular they call
 * `pureCircuits.leafOf`,
 * `nullifierOf`, and `recordKeyOf` rather than reimplementing the commitment
 * scheme: those are compiled from the same Compact source `proveCompliance`
 * runs, so what TypeScript computes is byte for byte what the circuit checks.
 *
 *     import {
 *       encodeEvidence, pureCircuits, POLICY_CI_BASELINE_ID, recordKey,
 *     } from '@zkuat/contract';
 *
 *     const evidence = encodeEvidence(canonicalJson);
 *     const leaf     = pureCircuits.leafOf(evidence, salt);        // anchor this
 *     const key      = recordKey(canonicalJson.artifactDigest, 'npm-ci-baseline-v1');
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

// One deterministic, domain-separated derivation used by deployment and the
// local runtime. The raw wallet seed is never passed to Compact.
export { deriveAnchorSecret } from './anchor-secret.js';

// Canonical JSON → Evidence encoding, identifier derivation, and shipped
// policies. The single implementation; do not reimplement it downstream.
export {
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
  EVIDENCE_SCHEMA,
  HASH_BYTES,
  MAX_U32,
  MAX_U64,
  BUNDLED_POLICIES,
  BUNDLED_POLICY_SLUGS,
  POLICY_CI_BASELINE_ID,
  POLICY_CI_BASELINE_SLUG,
  POLICY_CI_BASELINE_V1,
  POLICY_EMERGENCY_HOTFIX_ID,
  POLICY_EMERGENCY_HOTFIX_SLUG,
  POLICY_EMERGENCY_HOTFIX_V1,
  POLICY_PRODUCTION_RELEASE_ID,
  POLICY_PRODUCTION_RELEASE_SLUG,
  POLICY_PRODUCTION_RELEASE_V1,
  POLICY_ZERO_KNOWN_VULNS_ID,
  POLICY_ZERO_KNOWN_VULNS_SLUG,
  POLICY_ZERO_KNOWN_VULNS_V1,
  STRING_ID_BYTES,
  THIRTY_DAYS_SECONDS,
  type BundledPolicySlug,
  type CanonicalEvidence,
} from './encoding.js';
