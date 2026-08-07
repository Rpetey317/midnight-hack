/**
 * The signed statement and the evidence bundle.
 *
 * Two documents, two audiences, and the split is the whole privacy design:
 *
 *   bundle.json     PRIVATE — evidence, salt, leaf, signature. Vendor only.
 *   predicate.json  PUBLIC  — leaf, repo, sha, schema. Goes into Sigstore/Rekor.
 *
 * `../../docs/01-architecture.md` §"Why the predicate carries only the
 * commitment": GitHub attestations are world-readable through Rekor, so putting
 * evidence in the predicate would publish our vulnerability findings to a public
 * transparency log — leaking exactly what the protocol exists to protect.
 */
import type { CanonicalEvidence } from '@zkuat/contract';

import type { DsseEnvelope } from './dsse.js';
import type { AttestorPublicKey } from './keys.js';

export const STATEMENT_TYPE = 'zkuat.attestation.v1';
export const BUNDLE_TYPE = 'zkuat.bundle.v1';

/**
 * What the attestor signs.
 *
 * It signs the statement rather than the bare evidence so that the **leaf is
 * attestor-bound too**: a statement pairs one evidence document with one
 * commitment, and neither can be swapped for another under the same signature.
 *
 * The salt is deliberately **not** in here. It sits in the bundle envelope
 * instead. Signing it would make the salt a natural thing to quote when
 * presenting a signature, and the salt is the one value whose publication
 * unblinds the commitment. The binding that actually matters —
 * `evidence + salt → leaf → tree` — is enforced in-circuit by `proveCompliance`,
 * so nothing is lost by leaving it out.
 */
export interface ZkuatStatement {
  _type: typeof STATEMENT_TYPE;
  /** Must equal `EVIDENCE_SCHEMA`. Gated at the encoding boundary. */
  schema: string;
  evidence: CanonicalEvidence;
  /** hex, 32 bytes. `pureCircuits.leafOf(encodeEvidence(evidence), salt)`. */
  leaf: string;
  /** Attestor slug — the same string that hashes into `Evidence.attestorId`. */
  attestor: string;
  /** Unix seconds. When the attestor signed, not when the evidence was measured. */
  attestedAt: number;
  /**
   * How the facts were established.
   *
   * `../../docs/02-threat-model.md` gap 4 asks for exactly this: "the policy
   * pins collector version and configuration hash, so a record means *ran
   * collector v1.2.0 with config hash 0xabc…*". It lives here, in the private
   * statement, because adding it to `Evidence` would re-key every leaf.
   */
  collector?: {
    name: string;
    version: string;
    configHash: string;
    synthetic?: boolean;
    scenario?: string;
  };
}

/** The private bundle. Evidence, salt, commitment, signature. */
export interface EvidenceBundle {
  _type: typeof BUNDLE_TYPE;
  /**
   * Committed demo data, not a real measurement.
   *
   * Fixture bundles carry their salt in cleartext in a public git repository.
   * That is fine for synthetic evidence and catastrophic for real evidence, so
   * the distinction is a field rather than a convention.
   */
  demo?: boolean;
  /** hex, 32 bytes. PRIVATE — never reaches the predicate. */
  salt: string;
  /** hex, 32 bytes. The value the anchor inserts into the attestations tree. */
  leaf: string;
  statement: ZkuatStatement;
  envelope: DsseEnvelope;
  attestorPublicKey: AttestorPublicKey;
  /**
   * The Sigstore bundle from `actions/attest`, when the live workflow produced
   * this. `null` for anything signed offline. Track C's anchor verifies it with
   * `@sigstore/verify` and checks the OIDC subject repo against the predicate
   * repo — without that check, repo A can attest for repo B.
   */
  sigstore: unknown | null;
}

/**
 * The public attestation predicate. Four fields, and that is the point.
 *
 * `leaf` is a salt-blinded commitment, so publishing it discloses nothing
 * without the salt — which lives only in the private bundle.
 */
export interface AttestationPredicate {
  leaf: string;
  repo: string;
  sha: string;
  schema: string;
}
