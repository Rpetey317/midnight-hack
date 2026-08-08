import type { ComplianceRecord, Evidence, Policy } from "./types";
import { EVIDENCE_SCHEMA } from "./types";

// Demo fixtures. Deterministic timestamps — no Date.now() at module scope, so
// server and client render identically.
const t = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const DAY = 86400;

/**
 * The four policies registered on-chain by `@zkuat/runtime deploy`.
 *
 * ⚠️ Mirrors the bundled policy constants in
 * `contract/src/encoding.ts` — see the note on `Policy` in `./types`. The ids
 * are `stringIdOf(slug)` and therefore identical across every deployment; they
 * were read off the contract, not invented.
 *
 * Note what each policy does *not* constrain. A field the contract leaves at
 * `MAX_U32` means "unconstrained", not "at most zero" — writing 0 here would
 * make the UI reject evidence the chain accepts.
 */
export const POLICIES: Policy[] = [
  {
    id: "68e2e475be3b5cf8a0148f290a48468856c5ad4731760aca421ff95f172d9018",
    slug: "npm-ci-baseline-v1",
    name: "npm CI Baseline",
    issuer: "zkuat Reference",
    issuerSlug: "zkuat-reference",
    version: 1,
    maxCriticals: 0,
    maxHighs: 5,
    maxTotalVulnerabilities: 4_294_967_295,
    requireLint: true,
    requireBuild: true,
    maxAgeSeconds: 30 * DAY,
  },
  {
    id: "c65a4bcdd2d77a8a85115cca4f738ef5b8cd2cbd07b93a3e766e406e545cff71",
    slug: "npm-production-release-v1",
    name: "npm Production Release",
    issuer: "zkuat Reference",
    issuerSlug: "zkuat-reference",
    version: 1,
    maxCriticals: 0,
    maxHighs: 0,
    maxTotalVulnerabilities: 5,
    requireLint: true,
    requireBuild: true,
    maxAgeSeconds: 7 * DAY,
  },
  {
    id: "b1a71e0fa2fd2dd57ddb3a1d2208ffd5b9ebeeb935c2360ae0e7ec36ac025890",
    slug: "npm-zero-known-vulns-v1",
    name: "npm Zero Known Vulnerabilities",
    issuer: "zkuat Reference",
    issuerSlug: "zkuat-reference",
    version: 1,
    maxCriticals: 0,
    maxHighs: 0,
    maxTotalVulnerabilities: 0,
    requireLint: true,
    requireBuild: true,
    maxAgeSeconds: 3 * DAY,
  },
  {
    id: "dec6878d0531719ff6484f2c5061e817defe3816e1bcd1cc08de7003f5f40e2a",
    slug: "npm-emergency-hotfix-v1",
    name: "npm Emergency Hotfix",
    issuer: "zkuat Reference",
    issuerSlug: "zkuat-reference",
    version: 1,
    maxCriticals: 0,
    maxHighs: 2,
    maxTotalVulnerabilities: 4_294_967_295,
    requireLint: false,
    requireBuild: true,
    maxAgeSeconds: 2 * DAY,
  },
];

export const policyBySlug = (slug: string) => POLICIES.find((p) => p.slug === slug);

/**
 * The private evidence bundle. In production this is produced by the repo's own
 * CI and consumed by the local runtime.
 */
export const EVIDENCE: Evidence = {
  schema: EVIDENCE_SCHEMA,
  repo: "user-name/repo-name",
  commit: "9f2a71c4be08d35a6c1f47e2b90d85af31c60e77",
  artifactDigest:
    "sha256:3d8f21a90b47c6e5d21f89a03c74b6e18d95f2a7c40b83e619d7a52f8c03b41e",
  generatedAt: t("2026-08-05T09:14:00Z"),
  validUntil: t("2026-09-04T09:14:00Z"),
  vulns: { criticals: 0, highs: 0, totalVulnerabilities: 3 },
  checks: { lintPassed: true, buildPassed: true },
};

/** The negative case — demo beat 6. Same shape, two criticals. */
export const EVIDENCE_FAILING: Evidence = {
  ...EVIDENCE,
  commit: "41b7e0c9d2a8f36514e7b02c9d38a71f60e4c825",
  artifactDigest:
    "sha256:b71c04e93a58d26f0c8471b3e95d20a6f83c17d4e09a625f34c08d71e926a3fb",
  vulns: { criticals: 2, highs: 7, totalVulnerabilities: 11 },
  generatedAt: t("2026-08-06T11:02:00Z"),
  validUntil: t("2026-09-05T11:02:00Z"),
};

const strip = (d: string) => d.replace(/^sha256:/, "");

/**
 * The local evidence bundle for an artifact. In production this is read from the
 * developer's own machine; here it is a fixture keyed by digest.
 */
export function evidenceFor(digest: string, repo?: string, commit?: string | null): Evidence {
  const d = strip(digest);
  if (d === strip(EVIDENCE_FAILING.artifactDigest)) return EVIDENCE_FAILING;
  if (d === strip(EVIDENCE.artifactDigest)) return EVIDENCE;
  return {
    ...EVIDENCE,
    repo: repo ?? EVIDENCE.repo,
    commit: commit ?? EVIDENCE.commit,
    artifactDigest: `sha256:${d}`,
  };
}

export const RECORDS: ComplianceRecord[] = [
  {
    vendorId: "user-name",
    productId: "repo-name",
    artifactDigest: EVIDENCE.artifactDigest,
    policyId: POLICIES[0].id,
    policySlug: "npm-ci-baseline-v1",
    policyVersion: 1,
    provenAt: t("2026-08-05T09:41:00Z"),
    validUntil: EVIDENCE.validUntil,
    compliant: true,
    txHash: "0x8a3f21c07e94b6d5182a0f73c46b9e0d51f8a27c93b6e40d7152ac89f30e6b41",
  },
  {
    vendorId: "user-name",
    productId: "repo-name",
    artifactDigest: EVIDENCE.artifactDigest,
    policyId: POLICIES[1].id,
    policySlug: "npm-production-release-v1",
    policyVersion: 1,
    provenAt: t("2026-08-05T09:52:00Z"),
    validUntil: t("2026-08-12T09:14:00Z"),
    compliant: true,
    txHash: "0x1d7c93a05e28f4b6c07d13e9a852f0b4d69c31e785a04f2b6c9d31708e45a2f6",
  },
  {
    vendorId: "user-name",
    productId: "repo-name",
    artifactDigest:
      "sha256:5c19e73b0a284df61c93b70e5a8d42f07b16c9e30d54a821f7b0c6e39d25a814",
    policyId: POLICIES[0].id,
    policySlug: "npm-ci-baseline-v1",
    policyVersion: 1,
    provenAt: t("2026-07-08T14:20:00Z"),
    validUntil: t("2026-08-07T14:20:00Z"),
    compliant: true,
    txHash: "0x63b0d5a7e1298c4f036b7d02a95e18c4f70d36b8291eac05d47f6b1930c82ae5",
  },
];

/**
 * The raw on-chain transaction for a record. This is the money shot: what a
 * verifier can read is exactly this, and no evidence field appears in it.
 */
export function rawTransaction(r: ComplianceRecord) {
  return JSON.stringify(
    {
      contract: "0x4f7a...c091",
      circuit: "proveCompliance",
      publicInputs: {
        vendorId: r.vendorId,
        productId: r.productId,
        artifactDigest: r.artifactDigest,
        policyId: r.policyId,
      },
      publicTranscript: [
        { op: "checkRoot", root: "0x2c81f6...93ae40" },
        { op: "member", set: "claimed", key: "0xd419b7...05fc82", result: false },
        { op: "insert", set: "claimed", key: "0xd419b7...05fc82" },
        { op: "lookup", map: "policies", key: r.policyId },
        { op: "insert", map: "records", key: "0x9e02a4...71cd35" },
      ],
      record: {
        policyVersion: r.policyVersion,
        provenAt: r.provenAt,
        validUntil: r.validUntil,
        compliant: r.compliant,
      },
      proof: { system: "PLONK", size: "2.1 KB", verified: true },
    },
    null,
    2,
  );
}
