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

/**
 * A policy requirement rendered as a checklist line. Never carries a value from
 * the evidence — `expr` is the predicate the circuit evaluates, stated in terms
 * of evidence field names, and is identical for every artifact under a policy.
 */
export type Requirement = { id: string; label: string; expr: string };

const UNBOUNDED = 4_294_967_295;

export function policyRequirements(p: Policy): Requirement[] {
  const out: Requirement[] = [];
  const days = Math.round(p.maxAgeSeconds / 86400);

  out.push({
    id: "criticals",
    label:
      p.maxCriticals === 0
        ? "No critical-severity vulnerabilities in the resolved dependency set"
        : `At most ${p.maxCriticals} critical-severity vulnerabilities`,
    expr:
      p.maxCriticals === 0
        ? "criticalVulnerabilities == 0"
        : `criticalVulnerabilities <= ${p.maxCriticals}`,
  });

  if (p.maxHighs < UNBOUNDED)
    out.push({
      id: "highs",
      label: `At most ${p.maxHighs} high-severity vulnerabilities outstanding`,
      expr: `highVulnerabilities <= ${p.maxHighs}`,
    });

  if (p.maxKev < UNBOUNDED)
    out.push({
      id: "kev",
      label:
        p.maxKev === 0
          ? "Nothing on the CISA Known Exploited Vulnerabilities catalog"
          : `At most ${p.maxKev} CISA KEV entries`,
      expr:
        p.maxKev === 0
          ? "knownExploitedVulnerabilities == 0"
          : `knownExploitedVulnerabilities <= ${p.maxKev}`,
    });

  if (p.maxForbiddenDeps < UNBOUNDED)
    out.push({
      id: "forbidden",
      label:
        p.maxForbiddenDeps === 0
          ? "No dependency appears on the issuer's prohibited list"
          : `At most ${p.maxForbiddenDeps} prohibited dependencies`,
      expr:
        p.maxForbiddenDeps === 0
          ? "prohibitedDependencyCount == 0"
          : `prohibitedDependencyCount <= ${p.maxForbiddenDeps}`,
    });

  if (p.requireMfa)
    out.push({
      id: "mfa",
      label: "Multi-factor authentication enforced for privileged accounts",
      expr: "mfaRequiredForPrivilegedUsers == true",
    });

  if (p.requireBranchProtection)
    out.push({
      id: "branch",
      label: "Default branch protected — reviewed merges, no force pushes",
      expr: "protectedPrimaryBranch == true",
    });

  if (p.requireBuildProvenance)
    out.push({
      id: "provenance",
      label: "Build provenance attested and verified (SLSA / Sigstore)",
      expr: "buildProvenanceVerified == true",
    });

  out.push({
    id: "freshness",
    label: `Evidence generated within the last ${days} days`,
    expr: `now - evidenceGeneratedAt <= ${days}d`,
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
