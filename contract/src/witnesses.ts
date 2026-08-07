/**
 * Witness implementations for the zkuat compliance registry.
 *
 * Everything here runs on the prover's own machine and never leaves it. The
 * private state carries the evidence, its salt, and its Merkle path for a
 * vendor; the anchor operator carries only a secret key.
 */
import type { Witnesses } from './managed/audit_registry/contract/index.js';
import type { AuditPath, Evidence } from './types.js';

/**
 * Private state for a zkuat participant.
 *
 * Both roles use the same shape and leave the other role's fields null:
 *   - the anchor operator holds `secretKey`
 *   - a vendor holds `evidence`, `salt`, and `path`
 *
 * Fields are nullable rather than optional so that "I forgot to load this" is a
 * named error at the witness boundary, not a cryptic failure deep in the circuit.
 */
export interface AuditPrivateState {
  /** Bytes<32>. The anchor operator's secret. Only attest/registerPolicy use it. */
  secretKey: Uint8Array | null;
  /** The private security evidence. Never disclosed. */
  evidence: Evidence | null;
  /** Bytes<32>. Blinds the commitment. Losing it makes the evidence unprovable forever. */
  salt: Uint8Array | null;
  /** Inclusion path for this evidence's leaf, read off the attestations tree. */
  path: AuditPath | null;
}

export const emptyPrivateState: AuditPrivateState = {
  secretKey: null,
  evidence: null,
  salt: null,
  path: null,
};

function required<T>(value: T | null, field: keyof AuditPrivateState, why: string): T {
  if (value === null || value === undefined) {
    throw new Error(`zkuat: private state is missing "${field}" — ${why}`);
  }
  return value;
}

export const witnesses: Witnesses<AuditPrivateState> = {
  localSecret: ({ privateState }) => [
    privateState,
    required(
      privateState.secretKey,
      'secretKey',
      'only the anchor operator can call attest or registerPolicy',
    ),
  ],

  getEvidence: ({ privateState }) => [
    privateState,
    required(
      privateState.evidence,
      'evidence',
      'load the signed evidence bundle produced by the attestor',
    ),
  ],

  getSalt: ({ privateState }) => [
    privateState,
    required(
      privateState.salt,
      'salt',
      'the salt travels with the evidence in the private bundle',
    ),
  ],

  getPath: ({ privateState }) => [
    privateState,
    required(
      privateState.path,
      'path',
      'read it from ledger.attestations.findPathForLeaf(leaf) after anchoring',
    ),
  ],
};
