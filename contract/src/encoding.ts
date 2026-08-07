/**
 * Canonical JSON → Evidence struct encoding (schema v2).
 *
 * ../../docs/03-evidence-schema.md names encoding drift between the tracks as the
 * highest-risk item in the project: four components encode this struct, and if
 * they disagree by a single byte the commitment differs, the Merkle path check
 * fails, and every proof breaks.
 *
 * This module plus the contract's exported `pureCircuits` is the single
 * implementation. The collector, attestor, anchor, CLI, and both UIs import it.
 * Nobody reimplements it — not "reimplements it carefully", nobody.
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

/** Coverage is percent × 100, so 100.00% is 10000. */
export const MAX_COVERAGE = 10_000n;

export const EVIDENCE_SCHEMA = 'zkuat.evidence.v2';

/** The canonical JSON the attestor signs and the vendor keeps privately. */
export interface CanonicalEvidence {
  schema: string;
  vendor: string;
  product: string;
  /** Hex sha256, with or without a `sha256:` prefix. */
  artifactDigest: string;
  commit: string;
  attestor: string;
  generatedAt: number;
  validUntil: number;
  vulns: { criticals: number; highs: number; kev: number };
  deps: { forbidden: number; vulnerable: number };
  config: {
    mfaRequired: boolean;
    branchProtected: boolean;
    buildProvenanceVerified: boolean;
    ciGreen: boolean;
  };
  coverage: number;
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
export const attestorId = (slug: string): Uint8Array => stringId(slug);
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
    attestorId: attestorId(input.attestor),
    generatedAt,
    validUntil,
    criticals: clamp(input.vulns.criticals, MAX_U32, 'vulns.criticals'),
    highs: clamp(input.vulns.highs, MAX_U32, 'vulns.highs'),
    kev: clamp(input.vulns.kev, MAX_U32, 'vulns.kev'),
    forbiddenDeps: clamp(input.deps.forbidden, MAX_U32, 'deps.forbidden'),
    vulnDeps: clamp(input.deps.vulnerable, MAX_U32, 'deps.vulnerable'),
    mfaRequired: input.config.mfaRequired,
    branchProtected: input.config.branchProtected,
    buildProvenanceVerified: input.config.buildProvenanceVerified,
    ciGreen: input.config.ciGreen,
    coverage: clamp(input.coverage, MAX_COVERAGE, 'coverage'),
  };
}

/** The buyer's lookup key into `ledger.records`. */
export function recordKey(artifactDigest: string, policySlug: string): Uint8Array {
  return pureCircuits.recordKeyOf(encodeArtifactDigest(artifactDigest), policyId(policySlug));
}

// ─── The two shipped policies ──────────────────────────────────────────────────
//
// Both are evaluated over the *same* evidence bundle. That contrast — one
// evidence set, two independent buyer policies, two independent verdicts, and
// the buyer still sees no findings — is the strongest argument for programmable
// ZK over a signed PDF.
//
// Note what is absent: coverage. It is a weak representation of software
// security and does not belong in a flagship threshold, so it stays in the
// schema as a demo predicate and out of both policies.

/** All-zero: this policy accepts evidence from any attestor. */
export const ANY_ATTESTOR = new Uint8Array(HASH_BYTES);

/** 30 days, the longest validity window either policy grants. */
export const THIRTY_DAYS_SECONDS = 30n * 24n * 60n * 60n;

export const POLICY_BANK_SLUG = 'bank-v1';
export const POLICY_ENTERPRISE_SLUG = 'enterprise-v1';

/** criticals == 0, highs <= 5, kev == 0, build provenance verified. */
export const POLICY_BANK_V1: Policy = {
  version: 1n,
  issuer: issuerId('first-national-bank'),
  maxCriticals: 0n,
  maxHighs: 5n,
  maxKev: 0n,
  maxForbiddenDeps: MAX_U32, // unconstrained: this policy does not care
  requireMfa: false,
  requireBranchProtection: false,
  requireBuildProvenance: true,
  requiredAttestor: ANY_ATTESTOR,
  maxAgeSeconds: THIRTY_DAYS_SECONDS,
};

/** criticals == 0, no forbidden dependencies, branch protection, build provenance. */
export const POLICY_ENTERPRISE_V1: Policy = {
  version: 1n,
  issuer: issuerId('globex-corp'),
  maxCriticals: 0n,
  maxHighs: MAX_U32, // unconstrained: this policy does not care
  maxKev: MAX_U32,
  maxForbiddenDeps: 0n,
  requireMfa: false,
  requireBranchProtection: true,
  requireBuildProvenance: true,
  requiredAttestor: ANY_ATTESTOR,
  maxAgeSeconds: THIRTY_DAYS_SECONDS,
};

export const POLICY_BANK_ID = policyId(POLICY_BANK_SLUG);
export const POLICY_ENTERPRISE_ID = policyId(POLICY_ENTERPRISE_SLUG);
