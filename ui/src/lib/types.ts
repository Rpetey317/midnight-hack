// Browser-safe display types mirroring contract schema v3. Numeric Compact
// fields are bigint on chain; the UI uses number for fixtures and labels only.

export const EVIDENCE_SCHEMA = "zkuat.evidence.v3";
export const MAX_U32 = 4_294_967_295;

/** Private evidence. Never written to Midnight. */
export type Evidence = {
  schema: typeof EVIDENCE_SCHEMA;
  repo: string;
  commit: string;
  artifactDigest: string;
  generatedAt: number;
  validUntil: number;
  vulns: {
    criticals: number;
    highs: number;
    vulnerableDependencies: number;
  };
  checks: {
    lintPassed: boolean;
    buildPassed: boolean;
  };
};

/** Public policy state. `contract/src/encoding.ts` is the source of truth. */
export type Policy = {
  id: string;
  slug: string;
  name: string;
  issuer: string;
  issuerSlug: string;
  version: number;
  maxCriticals: number;
  maxHighs: number;
  maxVulnDeps: number;
  requireLint: boolean;
  requireBuild: boolean;
  maxAgeSeconds: number;
};

/** Public ledger state written by `proveCompliance`. */
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
/** `expr` is the predicate the circuit evaluates — identical for every artifact. */
export type Requirement = { id: string; label: string; expr: string };

export function policyRequirements(policy: Policy): Requirement[] {
  const days = Math.round(policy.maxAgeSeconds / 86400);

  const requirements: Requirement[] = [
    {
      id: "criticals",
      label:
        policy.maxCriticals === 0
          ? "No critical vulnerabilities"
          : `At most ${policy.maxCriticals} critical vulnerabilities`,
      expr:
        policy.maxCriticals === 0
          ? "criticalVulnerabilities == 0"
          : `criticalVulnerabilities <= ${policy.maxCriticals}`,
    },
  ];
  if (policy.maxHighs < MAX_U32) {
    requirements.push({
      id: "highs",
      label: `At most ${policy.maxHighs} high vulnerabilities`,
      expr: `highVulnerabilities <= ${policy.maxHighs}`,
    });
  }
  if (policy.maxVulnDeps < MAX_U32) {
    requirements.push({
      id: "vulnerableDependencies",
      label:
        policy.maxVulnDeps === 0
          ? "No vulnerable dependencies"
          : `At most ${policy.maxVulnDeps} vulnerable dependencies`,
      expr:
        policy.maxVulnDeps === 0
          ? "vulnerableDependencies == 0"
          : `vulnerableDependencies <= ${policy.maxVulnDeps}`,
    });
  }
  if (policy.requireLint)
    requirements.push({ id: "lint", label: "Lint check passed", expr: "lintPassed == true" });
  if (policy.requireBuild)
    requirements.push({ id: "build", label: "Build check passed", expr: "buildPassed == true" });
  requirements.push({
    id: "freshness",
    label: `Evidence validity no longer than ${days} days`,
    expr: `validUntil - evidenceGeneratedAt <= ${days}d`,
  });
  return requirements;
}

export function evaluate(evidence: Evidence, policy: Policy): boolean {
  return (
    evidence.vulns.criticals <= policy.maxCriticals &&
    evidence.vulns.highs <= policy.maxHighs &&
    evidence.vulns.vulnerableDependencies <= policy.maxVulnDeps &&
    (!policy.requireLint || evidence.checks.lintPassed) &&
    (!policy.requireBuild || evidence.checks.buildPassed)
  );
}

export function statusOf(record: ComplianceRecord | null, now = Date.now() / 1000): RecordStatus {
  if (!record) return "none";
  if (!record.compliant) return "failed";
  return record.validUntil > now ? "compliant" : "expired";
}
