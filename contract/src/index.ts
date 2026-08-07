/**
 * zkaudit contract package — the integration surface for every other track.
 *
 * Tracks B (collector), C (anchor/CLI), and D (dApp) import from here. In
 * particular they call `pureCircuits.leafOf` and `pureCircuits.nullifierOf`
 * rather than reimplementing the commitment scheme: those are compiled from the
 * same Compact source `claimBadge` runs, so what TypeScript computes is byte for
 * byte what the circuit checks.
 *
 *     import { encodeEvidence, pureCircuits, policyId } from '@zkaudit/contract';
 *
 *     const evidence = encodeEvidence(canonicalJson);
 *     const leaf     = pureCircuits.leafOf(evidence, salt);
 *     const nul      = pureCircuits.nullifierOf(leaf, policyId('production-ready'));
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
export type { AuditPath, Evidence, Ledger, Policy, Witnesses } from './types.js';

// Witness implementations and the private state they read.
export { emptyPrivateState, witnesses, type AuditPrivateState } from './witnesses.js';

// Canonical JSON → Evidence encoding. The single implementation; do not
// reimplement it downstream.
export {
  encodeCommit,
  encodeEvidence,
  encodeRepo,
  policyId,
  repoId,
  EVIDENCE_SCHEMA,
  HASH_BYTES,
  MAX_COVERAGE,
  MAX_U32,
  PRODUCTION_READY_SLUG,
  REPO_BYTES,
  type CanonicalEvidence,
} from './encoding.js';
