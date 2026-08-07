/**
 * @zkuat/anchor — the trust boundary.
 *
 * This is the only component that decides whether a leaf deserves to be on
 * chain. The contract cannot make that decision: it sees 32 opaque bytes and
 * has no way to tell an honestly-verified commitment from an arbitrary one.
 * That gap is the system's residual trust assumption, and the mitigation for it
 * is that this package stays small enough to audit in an afternoon.
 *
 * Four checks, in cost order:
 *
 *   1. The DSSE signature is from an attestor key we trust    → trust.ts
 *   2. The public predicate leaks nothing private             → @zkuat/attestor
 *   3. The Sigstore OIDC subject repo is the predicate repo   → sigstore.ts
 *   4. This (repo, commit) has not already been anchored      → receipt.ts
 *
 * Then, and only then, `attest(leaf)`                          → submit.ts
 *
 * The anchor operator never sees the findings: repo, commit, and a commitment
 * are all that pass through here.
 */
export { ANCHOR_USAGE, runAnchor } from './command.js';
export { DEMO_KEYS_DIR, parseTrustFlag, trustedKeyIds } from './trust.js';
export {
  assertRepoBinding,
  repoClaims,
  verifySigstore,
  type RepoClaims,
  type SigstoreOutcome,
  type VerifySigstoreOptions,
} from './sigstore.js';
export {
  assertNotAnchored,
  readReceipts,
  receiptForLeaf,
  receiptKey,
  writeReceipt,
  RECEIPTS_FILE,
  type Receipt,
} from './receipt.js';
export {
  anchorLeaf,
  connect,
  deployment,
  queryLedger,
  readLedger,
  DEVNET,
  PRIVATE_STATE_ID,
  type AnchorResult,
  type Connection,
  type Deployment,
} from './submit.js';
