/**
 * Types for the zkaudit registry, derived from the compiler's own output.
 *
 * The Compact compiler emits `Evidence`, `Policy`, and the Merkle path as
 * anonymous inline object types rather than named exports, so we recover them by
 * indexing into the generated signatures. Deriving rather than hand-writing means
 * a change to the .compact structs surfaces as a TypeScript error here instead of
 * as a silent commitment mismatch three tracks downstream.
 */
import type {
  ImpureCircuits,
  PureCircuits,
  Witnesses,
} from './managed/audit_registry/contract/index.js';

export type { Ledger, Witnesses } from './managed/audit_registry/contract/index.js';

/** The private evidence struct. Field order determines the commitment. */
export type Evidence = Parameters<PureCircuits['leafOf']>[0];

/** Public policy thresholds, stored in ledger state so verifiers can read them. */
export type Policy = Parameters<ImpureCircuits<unknown>['registerPolicy']>[2];

/**
 * A Merkle inclusion path for the attestations tree.
 *
 * Two traps live in this shape, both confirmed against the generated output:
 * `goes_left` is snake_case (the Compact docs write `goesLeft`), and `sibling`
 * is a `{ field: bigint }` wrapper rather than a bare bigint. Read paths off
 * `ledger.attestations.findPathForLeaf()` and neither can bite you.
 */
export type AuditPath = ReturnType<Witnesses<unknown>['getPath']>[1];
