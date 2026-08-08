import type { PublicAudit } from "./queries";
import { POLICIES } from "./demo";
import type { ComplianceRecord, Policy } from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DIGEST_RE = /^[0-9a-f]{64}$/;

/**
 * Stored proofs address a policy by slug or by its contract-derived id.
 * Undefined means no known policy matches — a verifier must be shown the raw
 * value rather than a guess.
 */
export const findPolicy = (idOrSlug: string): Policy | undefined =>
  POLICIES.find((p) => p.slug === idOrSlug || p.id === idOrSlug);

/**
 * @deprecated Falls back to `POLICIES[0]`, so an unrecognised id renders as a
 * real policy the proof was never made against. Prefer `findPolicy` and handle
 * the undefined case.
 */
export const policyFor = (idOrSlug: string): Policy =>
  findPolicy(idOrSlug) ?? POLICIES[0];

/** Renders a stored audit as the public compliance record a verifier reads. */
export function recordFromAudit(a: PublicAudit): ComplianceRecord {
  const policy = policyFor(a.proof.policy_id);
  const provenAt = Math.floor(Date.parse(a.proof.created_at) / 1000);
  const [owner, name] = a.repo.split("/");

  return {
    vendorId: owner ?? "",
    productId: name ?? a.repo,
    artifactDigest: `sha256:${a.digest}`,
    policyId: policy.id,
    policySlug: policy.slug,
    policyVersion: a.proof.policy_version,
    provenAt,
    validUntil: provenAt + policy.maxAgeSeconds,
    compliant: a.proof.verdict,
    txHash: a.proof.tx_hash ?? "",
  };
}
