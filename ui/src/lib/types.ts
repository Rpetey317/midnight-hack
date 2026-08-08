// Mirrors contract/src/audit_registry.compact — schema v2.
// See docs/03-evidence-schema.md and docs/04-contract-spec.md.
// Numerics are bigint on-chain; the UI keeps them as number for display only.

export const EVIDENCE_SCHEMA = "zkuat.evidence.v2";

/** Private. Never written to Midnight, never sent to a server. */
export type Evidence = {
  schema: typeof EVIDENCE_SCHEMA;
  repo: string;
  commit: string;
  attestor: string;
  /** sha256:… — public by design, the one public field in the bundle. */
  artifactDigest: string;
  generatedAt: number;
  validUntil: number;
  vulns: { criticals: number; highs: number; kev: number };
  deps: { total: number; forbidden: number; vulnerable: number };
  config: {
    mfaRequired: boolean;
    branchProtected: boolean;
    buildProvenanceVerified: boolean;
    ciGreen: boolean;
  };
  /** percent × 100 — 8734 === 87.34% */
  coverage: number;
};

/**
 * Public ledger state. Buyers read this to know what a record means.
 *
 * ⚠️ Every threshold below must equal `POLICY_BANK_V1` / `POLICY_ENTERPRISE_V1`
 * in `contract/src/encoding.ts`. That file is the source of truth; this is a
 * deliberate duplicate, not a second implementation — `ui/` cannot import
 * `@zkuat/contract` because it pulls the `@midnight-ntwrk/*` WASM runtime and
 * the `onchain-runtime-v3` duplication documented in `docs/08-local-setup.md`.
 *
 * The duplication has teeth: `evaluate()` below mirrors the circuit predicate,
 * so a drifted threshold makes the UI show ✓ while the chain writes
 * `compliant: false`. Change one, change both.
 */
export type Policy = {
  /** `stringIdOf(slug)` — deterministic, identical across deployments. */
  id: string;
  slug: string;
  /** Display only. The on-chain identity is `issuerSlug`. */
  name: string;
  issuer: string;
  /** The slug actually hashed into `Policy.issuer` on-chain. */
  issuerSlug: string;
  version: number;
  maxCriticals: number;
  maxHighs: number;
  maxKev: number;
  maxForbiddenDeps: number;
  requireMfa: boolean;
  requireBranchProtection: boolean;
  requireBuildProvenance: boolean;
  requiredAttestor: string | null;
  maxAgeSeconds: number;
};

/** Public ledger state, written by proveCompliance. */
export type ComplianceRecord = {
  vendorId: string;
  productId: string;
  artifactDigest: string;
  policyId: string;
  policySlug: string;
  policyVersion: number;
  provenAt: number;
  validUntil: number;
  compliant: boolean;
  txHash: string;
};

export type RecordStatus = "compliant" | "expired" | "failed" | "none";

/** A policy requirement rendered as a checklist line. Never carries a value. */
export type Requirement = { id: string; label: string };

export function policyRequirements(p: Policy): Requirement[] {
  const out: Requirement[] = [];
  out.push({
    id: "criticals",
    label:
      p.maxCriticals === 0
        ? "No critical vulnerabilities"
        : `At most ${p.maxCriticals} critical vulnerabilities`,
  });
  if (p.maxHighs < 4_294_967_295)
    out.push({ id: "highs", label: `At most ${p.maxHighs} high vulnerabilities` });
  if (p.maxKev === 0)
    out.push({ id: "kev", label: "No known-exploited (CISA KEV) vulnerabilities" });
  if (p.maxForbiddenDeps === 0)
    out.push({ id: "forbidden", label: "No forbidden dependencies" });
  if (p.requireMfa) out.push({ id: "mfa", label: "Organisation-wide MFA enforced" });
  if (p.requireBranchProtection)
    out.push({ id: "branch", label: "Branch protection enabled on default branch" });
  if (p.requireBuildProvenance)
    out.push({ id: "provenance", label: "Build provenance verified (SLSA / Sigstore)" });
  out.push({
    id: "freshness",
    label: `Evidence no older than ${Math.round(p.maxAgeSeconds / 86400)} days`,
  });
  return out;
}

/** Local mirror of the circuit predicate. Runs on private data — never leaves the device. */
export function evaluate(ev: Evidence, p: Policy): boolean {
  return (
    ev.vulns.criticals <= p.maxCriticals &&
    ev.vulns.highs <= p.maxHighs &&
    ev.vulns.kev <= p.maxKev &&
    ev.deps.forbidden <= p.maxForbiddenDeps &&
    (!p.requireMfa || ev.config.mfaRequired) &&
    (!p.requireBranchProtection || ev.config.branchProtected) &&
    (!p.requireBuildProvenance || ev.config.buildProvenanceVerified)
  );
}

export function statusOf(r: ComplianceRecord | null, now = Date.now() / 1000): RecordStatus {
  if (!r) return "none";
  if (!r.compliant) return "failed";
  return r.validUntil > now ? "compliant" : "expired";
}
