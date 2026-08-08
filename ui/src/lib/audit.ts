import type { PublicAudit } from "./queries";
import { POLICIES } from "./demo";
import type { ComplianceRecord, Policy } from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DIGEST_RE = /^[0-9a-f]{64}$/;

export const policyFor = (slug: string): Policy =>
  POLICIES.find((p) => p.slug === slug) ?? POLICIES[0];

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
