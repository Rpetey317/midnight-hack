/**
 * Deterministic JSON serialization.
 *
 * The attestor signs bytes, not objects, so two processes that disagree about
 * key order or number formatting produce two different signatures over what is
 * semantically one document. `../../docs/03-evidence-schema.md` pins the rules:
 * **keys sorted, no insignificant whitespace, integers only.**
 *
 * Note the doc's example evidence JSON is printed in *field* order (identity,
 * then time, then facts) because that reads better. The **signed** form is
 * key-sorted. Both are correct; only one is what gets hashed. Do not "fix" the
 * doc's ordering to match this, and do not relax the sort here to match the doc.
 */

/** Anything that survives a JSON round trip. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Integers only — no floats anywhere in a canonical document.
 *
 * This is the rule that makes `coverage` a percent×100 integer rather than a
 * float. IEEE-754 shortest-representation printing differs across languages, so
 * a float in a signed payload is a signature that verifies on the machine that
 * produced it and nowhere else. Rejecting them costs nothing and removes the
 * whole class of problem.
 */
function assertIntegral(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`zkuat: ${path} is ${value}; canonical JSON admits finite numbers only`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(
      `zkuat: ${path} is ${value}; canonical JSON is integers only ` +
        '(this is why coverage is stored as percent × 100)',
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`zkuat: ${path} is ${value}, beyond Number.MAX_SAFE_INTEGER`);
  }
}

/** Recursively sort object keys; arrays keep their order, which is meaningful. */
function sortValue(value: Json, path: string): Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    assertIntegral(value, path);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => sortValue(item, `${path}[${i}]`));
  }
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      // An explicit `undefined` property is invisible to JSON.stringify but very
      // visible to Object.keys, so drop it here rather than emitting a hole.
      if (child === undefined) continue;
      out[key] = sortValue(child as Json, path ? `${path}.${key}` : key);
    }
    return out;
  }
  throw new Error(`zkuat: ${path} is a ${typeof value}, which has no canonical JSON form`);
}

/** Canonical UTF-8 JSON: keys sorted, no whitespace, integers only. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value as Json, ''));
}

/** Canonical JSON as bytes — what actually gets signed and hashed. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}
