/**
 * The public attestation predicate, and the guard that keeps it public-safe.
 *
 * This module exists because of one sentence in
 * `../../docs/01-architecture.md`:
 *
 *   > GitHub attestations on public repos are world-readable via Rekor.
 *   > Putting raw evidence in the attestation predicate would publish our
 *   > vulnerability findings to a public log, leaking exactly what the protocol
 *   > exists to protect.
 *
 * `../../docs/02-threat-model.md` carries the corresponding unticked checklist
 * item — *"Evidence bundle is private, not attached to the public attestation
 * predicate — Track B"*. `assertNoEvidenceLeak` is that item, mechanized.
 */
import type { EvidenceBundle, AttestationPredicate } from './types.js';

/** The only keys that may appear in a predicate. */
const ALLOWED_KEYS = ['leaf', 'repo', 'sha', 'schema'] as const;

/**
 * Evidence paths whose values are public by design, so finding one in the
 * predicate is not a leak.
 *
 * Straight from `../../docs/01-architecture.md` §"What is public and what is
 * private" and `../../docs/04-contract-spec.md` §"Disclosure decisions":
 *
 *   - `vendor`, `product`, `artifactDigest`, `generatedAt`, `validUntil` all
 *     land in the public `ComplianceRecord` — a procurement record that omitted
 *     them would be useless to a buyer. We hide the findings, not the vendor.
 *   - `commit` is in the predicate on purpose. The anchor operator sees repo,
 *     commit, and leaf; that is what `docs/01` §"Trust summary" grants them.
 *   - `schema` is a version string.
 *
 * `attestor` is **not** on this list. `docs/04` puts `ev.attestorId` under
 * "never disclosed" — which attestor a *policy requires* is public, which
 * attestor signed a given bundle is not.
 *
 * These are also the values most likely to collide innocently: a repo named
 * `acme-software/widget-api` contains both the vendor and the product slug.
 */
const PUBLIC_BY_DESIGN = new Set([
  'schema',
  'vendor',
  'product',
  'artifactDigest',
  'commit',
  'generatedAt',
  'validUntil',
]);

/**
 * Build the predicate by naming its four fields explicitly.
 *
 * Deliberately **not** `const { salt, statement, ...rest } = bundle`. A
 * subtractive construction is one added field away from publishing something
 * new by default; an additive one is one added field away from publishing
 * nothing new. Only one of those fails safe.
 */
export function buildPredicate(
  bundle: EvidenceBundle,
  subject: { repo: string; sha: string },
): AttestationPredicate {
  const predicate: AttestationPredicate = {
    leaf: bundle.leaf,
    repo: subject.repo,
    sha: subject.sha,
    schema: bundle.statement.schema,
  };
  assertNoEvidenceLeak(predicate, bundle);
  return predicate;
}

/**
 * Predicate fields that hold cryptographic hex.
 *
 * A 64-character random hex string contains almost every short decimal token by
 * chance, so substring-matching a private value like `4` or `8734` against one
 * produces constant false positives — and a guard that cries wolf is a guard
 * someone deletes. These fields are compared for **exact equality** instead,
 * which is the only way a private value could meaningfully hide in them.
 */
const HEX_FIELDS = new Set(['leaf', 'sha']);

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does `haystack` contain `needle` as a standalone token?
 *
 * Word-boundary matching rather than a bare `includes`, so `repo` containing
 * `payment-engine` does not trip on a private value of `4`, while a genuine
 * `zkuat-attestor-v1` still does.
 */
function containsToken(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(needle)}(?![A-Za-z0-9])`).test(haystack);
}

/** Every leaf scalar in a value, with its dotted path. Arrays keep indices. */
function walk(
  value: unknown,
  path: string,
  out: Array<{ path: string; key: string; value: string }>,
): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, path ? `${path}.${key}` : key, out);
    }
    return;
  }
  const key = path.slice(path.lastIndexOf('.') + 1);
  out.push({ path, key, value: String(value) });
}

/**
 * Throw if anything private is reachable from the predicate.
 *
 * Allowlist-shaped rather than a list of forbidden names, for the same reason
 * `contract/src/test/` uses allowlists for its privacy assertions: a field
 * nobody remembered to write an assertion for is caught automatically, which a
 * denylist can never do. When Track A adds a field to `Evidence`, this starts
 * guarding it without anyone editing this file.
 *
 * Three checks, in descending order of how much they actually guarantee:
 *
 *   1. **The predicate's key set is exactly the four allowed keys.** This is
 *      the real guarantee — no field can be added to the predicate at all, so
 *      the only way to leak is to populate one of the four from a wrong source.
 *   2. No private evidence field *name* appears anywhere in it.
 *   3. No private evidence *value* appears in it. Hex fields are compared for
 *      exact equality, human-readable fields by standalone token, so this
 *      catches a wrong-source population without firing on coincidence.
 *
 * Booleans are excluded from check 3: `true` is not a secret.
 */
export function assertNoEvidenceLeak(
  predicate: AttestationPredicate,
  bundle: EvidenceBundle,
): void {
  const extra = Object.keys(predicate).filter(
    (k) => !(ALLOWED_KEYS as readonly string[]).includes(k),
  );
  if (extra.length) {
    throw new Error(
      `zkuat: predicate carries fields that are not public by design: ${extra.join(', ')}. ` +
        `The predicate reaches Rekor; only [${ALLOWED_KEYS.join(', ')}] may.`,
    );
  }

  const serialized = JSON.stringify(predicate);
  const fields: Array<{ path: string; key: string; value: string }> = [];
  walk(bundle.statement.evidence, '', fields);

  for (const { path, key, value } of fields) {
    if (PUBLIC_BY_DESIGN.has(path) || PUBLIC_BY_DESIGN.has(key)) continue;

    if (serialized.includes(`"${key}"`)) {
      throw new Error(
        `zkuat: predicate contains the private evidence field name "${key}" (evidence.${path})`,
      );
    }

    if (value === 'true' || value === 'false') continue;

    for (const [field, fieldValue] of Object.entries(predicate)) {
      const text = String(fieldValue);
      const leaked = HEX_FIELDS.has(field) ? text === value : containsToken(text, value);
      if (leaked) {
        throw new Error(
          `zkuat: predicate.${field} leaks evidence.${path} = "${value}". The predicate is ` +
            'published to a public transparency log; the leaf is the only thing that may ' +
            'carry evidence, and only because the salt blinds it.',
        );
      }
    }
  }

  // The salt is the one value whose publication unblinds the commitment.
  if (serialized.includes(bundle.salt)) {
    throw new Error('zkuat: predicate contains the salt — this unblinds the commitment');
  }
}
