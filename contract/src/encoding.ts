/**
 * Canonical JSON → Evidence struct encoding.
 *
 * ../../docs/03-evidence-schema.md names encoding drift between the four tracks as
 * the highest-risk item in the project: four components encode this struct, and if
 * they disagree by a single byte the commitment differs, the Merkle path check
 * fails, and every proof breaks.
 *
 * This module plus the contract's exported `pureCircuits` is the single
 * implementation. The collector, anchor, CLI, and dApp import it. Nobody
 * reimplements it — not "reimplements it carefully", nobody.
 *
 *     import { encodeEvidence, REPO_BYTES } from '@zkaudit/contract';
 *     import { pureCircuits } from '@zkaudit/contract';
 *
 *     const ev   = encodeEvidence(canonicalJson);
 *     const leaf = pureCircuits.leafOf(ev, salt);   // byte-identical to the circuit
 */
import { pureCircuits } from './managed/audit_registry/contract/index.js';
import type { Evidence } from './types.js';

/** Width of the padded "owner/name" string fed to `repoIdOf`. */
export const REPO_BYTES = 64;

/** Width of every hash and commitment in this protocol. */
export const HASH_BYTES = 32;

/** `Uint<32>` saturation ceiling. */
export const MAX_U32 = 4_294_967_295n;

/** Coverage is percent × 100, so 100.00% is 10000. */
export const MAX_COVERAGE = 10_000n;

/** The canonical JSON the collector writes and the repo owner keeps privately. */
export interface CanonicalEvidence {
  schema: string;
  repo: string;
  commit: string;
  issuedAt: number;
  checks: {
    ciGreen: boolean;
    criticals: number;
    highs: number;
    vulnDeps: number;
    coverage: number;
  };
}

export const EVIDENCE_SCHEMA = 'zkaudit.evidence.v1';

function clamp(value: number, ceiling: bigint): bigint {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`expected a non-negative integer, got ${value}`);
  }
  const asBig = BigInt(value);
  return asBig > ceiling ? ceiling : asBig;
}

/**
 * "owner/name" → 64 bytes: lowercased, UTF-8, zero-padded right.
 *
 * Throws rather than truncating on overlong names. A truncated repo id would
 * silently collide two repos into one identity.
 */
export function encodeRepo(repo: string): Uint8Array {
  const utf8 = new TextEncoder().encode(repo.toLowerCase());
  if (utf8.length > REPO_BYTES) {
    throw new Error(
      `repo "${repo}" is ${utf8.length} UTF-8 bytes, exceeding the ${REPO_BYTES}-byte limit`,
    );
  }
  const out = new Uint8Array(REPO_BYTES);
  out.set(utf8);
  return out;
}

/** "owner/name" → repoId, via the contract's own hash. */
export function repoId(repo: string): Uint8Array {
  return pureCircuits.repoIdOf(encodeRepo(repo));
}

/**
 * 40-char lowercase hex git SHA → 20 bytes, left-aligned in 32, zero-padded right.
 */
export function encodeCommit(sha: string): Uint8Array {
  const normalized = sha.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`commit "${sha}" is not a 40-character hex SHA`);
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
    throw new Error(`expected schema "${EVIDENCE_SCHEMA}", got "${input.schema}"`);
  }
  return {
    repoId: repoId(input.repo),
    commitId: encodeCommit(input.commit),
    issuedAt: clamp(input.issuedAt, 18_446_744_073_709_551_615n),
    ciGreen: input.checks.ciGreen,
    criticals: clamp(input.checks.criticals, MAX_U32),
    highs: clamp(input.checks.highs, MAX_U32),
    vulnDeps: clamp(input.checks.vulnDeps, MAX_U32),
    coverage: clamp(input.checks.coverage, MAX_COVERAGE),
  };
}

/**
 * Policy slug → policy id. Same 64-byte padding as a repo name, so one padding
 * rule covers every string this protocol hashes.
 */
export function policyId(slug: string): Uint8Array {
  return pureCircuits.repoIdOf(encodeRepo(slug));
}

/** The single policy we ship. See ../../docs/03-evidence-schema.md. */
export const PRODUCTION_READY_SLUG = 'production-ready';
