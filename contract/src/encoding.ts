/**
 * Canonical GitHub Actions evidence → Evidence struct encoding (schema v4).
 *
 * ../../docs/03-evidence-schema.md names encoding drift between the tracks as the
 * highest-risk item in the project: four components encode this struct, and if
 * they disagree by a single byte the commitment differs, the Merkle path check
 * fails, and every proof breaks.
 *
 * This module plus the contract's exported `pureCircuits` is the single
 * implementation used by the runtime and contract tests.
 *
 *     import { encodeEvidence, pureCircuits, policyId } from '@zkuat/contract';
 *
 *     const ev   = encodeEvidence(canonicalJson);
 *     const leaf = pureCircuits.leafOf(ev, salt);   // byte-identical to the circuit
 */
import { pureCircuits } from './managed/audit_registry/contract/index.js';
import type { Evidence, Policy } from './types.js';

/** Width of every padded string identifier fed to `stringIdOf`. */
export const STRING_ID_BYTES = 64;

/** Width of every hash, digest, and commitment in this protocol. */
export const HASH_BYTES = 32;

/** `Uint<32>` saturation ceiling. */
export const MAX_U32 = 4_294_967_295n;

/** `Uint<64>` ceiling, used for timestamps. */
export const MAX_U64 = 18_446_744_073_709_551_615n;

export const EVIDENCE_SCHEMA = 'zkuat.evidence.v4';

/** The canonical private evidence produced from the GitHub Actions artifact. */
export interface CanonicalEvidence {
  schema: string;
  vendor: string;
  product: string;
  /** Hex sha256, with or without a `sha256:` prefix. */
  artifactDigest: string;
  commit: string;
  generatedAt: number;
  validUntil: number;
  vulns: {
    criticals: number;
    highs: number;
    totalVulnerabilities: number;
  };
  checks: {
    lintPassed: boolean;
    buildPassed: boolean;
  };
}

function clamp(value: number, ceiling: bigint, field: string): bigint {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`zkuat: ${field} must be a non-negative integer, got ${value}`);
  }
  const asBig = BigInt(value);
  return asBig > ceiling ? ceiling : asBig;
}

/**
 * Any string identifier → 64 bytes: lowercased, UTF-8, zero-padded right.
 *
 * `Bytes<N>` is fixed-width in Compact, so "hash the UTF-8 bytes" is
 * underspecified — the width has to be pinned somewhere, and it is pinned here.
 * Throws rather than truncating: a truncated identifier would silently collide
 * two vendors, products, or policies into one identity.
 */
export function padString(value: string): Uint8Array {
  const utf8 = new TextEncoder().encode(value.toLowerCase());
  if (utf8.length > STRING_ID_BYTES) {
    throw new Error(
      `zkuat: "${value}" is ${utf8.length} UTF-8 bytes, exceeding the ${STRING_ID_BYTES}-byte limit`,
    );
  }
  const out = new Uint8Array(STRING_ID_BYTES);
  out.set(utf8);
  return out;
}

/** String identifier → 32-byte id, via the contract's own hash. */
export function stringId(value: string): Uint8Array {
  return pureCircuits.stringIdOf(padString(value));
}

// Named wrappers so call sites read as intent rather than as a generic hash.
// One padding rule covers every string this protocol hashes.
export const vendorId = (slug: string): Uint8Array => stringId(slug);
export const productId = (slug: string): Uint8Array => stringId(slug);
export const policyId = (slug: string): Uint8Array => stringId(slug);
export const issuerId = (slug: string): Uint8Array => stringId(slug);

/**
 * Hex sha256 → exactly 32 bytes. Accepts an optional `sha256:` prefix for human
 * legibility in JSON; the raw bytes are what get committed.
 */
export function encodeArtifactDigest(digest: string): Uint8Array {
  const hex = digest.toLowerCase().replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(
      `zkuat: artifactDigest must be 64 hex characters (sha256), got "${digest}"`,
    );
  }
  const out = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < HASH_BYTES; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** 40-char lowercase hex git SHA → 20 bytes, left-aligned in 32, zero-padded right. */
export function encodeCommit(sha: string): Uint8Array {
  const normalized = sha.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`zkuat: commit "${sha}" is not a 40-character hex SHA`);
  }
  const out = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < 20; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Canonical JSON → the Evidence struct the circuit commits to. */
export function encodeEvidence(input: CanonicalEvidence): Evidence {
  if (input.schema !== EVIDENCE_SCHEMA) {
    throw new Error(`zkuat: expected schema "${EVIDENCE_SCHEMA}", got "${input.schema}"`);
  }

  const generatedAt = clamp(input.generatedAt, MAX_U64, 'generatedAt');
  const validUntil = clamp(input.validUntil, MAX_U64, 'validUntil');
  if (validUntil <= generatedAt) {
    // Evidence that expires before it was issued is nonsense, and the circuit
    // would reject it against any policy anyway. Fail here, where the message
    // can say why.
    throw new Error(
      `zkuat: validUntil (${validUntil}) must be after generatedAt (${generatedAt})`,
    );
  }

  return {
    vendorId: vendorId(input.vendor),
    productId: productId(input.product),
    artifactDigest: encodeArtifactDigest(input.artifactDigest),
    commitId: encodeCommit(input.commit),
    generatedAt,
    validUntil,
    criticals: clamp(input.vulns.criticals, MAX_U32, 'vulns.criticals'),
    highs: clamp(input.vulns.highs, MAX_U32, 'vulns.highs'),
    totalVulnerabilities: clamp(
      input.vulns.totalVulnerabilities,
      MAX_U32,
      'vulns.totalVulnerabilities',
    ),
    lintPassed: input.checks.lintPassed,
    buildPassed: input.checks.buildPassed,
  };
}

/** The buyer's lookup key into `ledger.records`. */
export function recordKey(artifactDigest: string, policySlug: string): Uint8Array {
  return pureCircuits.recordKeyOf(encodeArtifactDigest(artifactDigest), policyId(policySlug));
}

// ─── Shipped reference policies ────────────────────────────────────────────────
//
// All are evaluated over the same private GitHub artifact shape. The selected
// policy controls the validity window the runtime adds before encoding.

const DAY_SECONDS = 24n * 60n * 60n;

/** 30 days, the longest validity window any bundled policy grants. */
export const THIRTY_DAYS_SECONDS = 30n * DAY_SECONDS;

export const POLICY_CI_BASELINE_SLUG = 'npm-ci-baseline-v1';
export const POLICY_PRODUCTION_RELEASE_SLUG = 'npm-production-release-v1';
export const POLICY_ZERO_KNOWN_VULNS_SLUG = 'npm-zero-known-vulns-v1';
export const POLICY_EMERGENCY_HOTFIX_SLUG = 'npm-emergency-hotfix-v1';

/** General CI baseline: no criticals, at most five highs, lint and build pass. */
export const POLICY_CI_BASELINE_V1: Policy = {
  version: 1n,
  issuer: issuerId('zkuat-reference'),
  maxCriticals: 0n,
  maxHighs: 5n,
  maxTotalVulnerabilities: MAX_U32,
  requireLint: true,
  requireBuild: true,
  maxAgeSeconds: THIRTY_DAYS_SECONDS,
};

/** Production release: no critical/high findings, at most five findings total. */
export const POLICY_PRODUCTION_RELEASE_V1: Policy = {
  version: 1n,
  issuer: issuerId('zkuat-reference'),
  maxCriticals: 0n,
  maxHighs: 0n,
  maxTotalVulnerabilities: 5n,
  requireLint: true,
  requireBuild: true,
  maxAgeSeconds: 7n * DAY_SECONDS,
};

/** Strict release: npm audit reported no known vulnerabilities of any severity. */
export const POLICY_ZERO_KNOWN_VULNS_V1: Policy = {
  version: 1n,
  issuer: issuerId('zkuat-reference'),
  maxCriticals: 0n,
  maxHighs: 0n,
  maxTotalVulnerabilities: 0n,
  requireLint: true,
  requireBuild: true,
  maxAgeSeconds: 3n * DAY_SECONDS,
};

/** Emergency hotfix: limited highs, lint optional, successful build required. */
export const POLICY_EMERGENCY_HOTFIX_V1: Policy = {
  version: 1n,
  issuer: issuerId('zkuat-reference'),
  maxCriticals: 0n,
  maxHighs: 2n,
  maxTotalVulnerabilities: MAX_U32,
  requireLint: false,
  requireBuild: true,
  maxAgeSeconds: 2n * DAY_SECONDS,
};

export const POLICY_CI_BASELINE_ID = policyId(POLICY_CI_BASELINE_SLUG);
export const POLICY_PRODUCTION_RELEASE_ID = policyId(POLICY_PRODUCTION_RELEASE_SLUG);
export const POLICY_ZERO_KNOWN_VULNS_ID = policyId(POLICY_ZERO_KNOWN_VULNS_SLUG);
export const POLICY_EMERGENCY_HOTFIX_ID = policyId(POLICY_EMERGENCY_HOTFIX_SLUG);

export const BUNDLED_POLICY_SLUGS = [
  POLICY_CI_BASELINE_SLUG,
  POLICY_PRODUCTION_RELEASE_SLUG,
  POLICY_ZERO_KNOWN_VULNS_SLUG,
  POLICY_EMERGENCY_HOTFIX_SLUG,
] as const;

export type BundledPolicySlug = (typeof BUNDLED_POLICY_SLUGS)[number];

export const BUNDLED_POLICIES = [
  {
    slug: POLICY_CI_BASELINE_SLUG,
    id: POLICY_CI_BASELINE_ID,
    policy: POLICY_CI_BASELINE_V1,
    validDays: 30,
  },
  {
    slug: POLICY_PRODUCTION_RELEASE_SLUG,
    id: POLICY_PRODUCTION_RELEASE_ID,
    policy: POLICY_PRODUCTION_RELEASE_V1,
    validDays: 7,
  },
  {
    slug: POLICY_ZERO_KNOWN_VULNS_SLUG,
    id: POLICY_ZERO_KNOWN_VULNS_ID,
    policy: POLICY_ZERO_KNOWN_VULNS_V1,
    validDays: 3,
  },
  {
    slug: POLICY_EMERGENCY_HOTFIX_SLUG,
    id: POLICY_EMERGENCY_HOTFIX_ID,
    policy: POLICY_EMERGENCY_HOTFIX_V1,
    validDays: 2,
  },
] as const;
