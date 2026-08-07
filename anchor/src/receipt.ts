/**
 * Anchor receipts: what went on chain, where, and for which commit.
 *
 * Two jobs.
 *
 * **The leaf index.** `findPathForLeaf` is an O(n) scan of the whole
 * attestation tree. `pathForLeaf(index, leaf)` is a direct lookup, and the
 * index is only knowable at anchor time — it is the tree's `firstFree()` in the
 * moment before the insert. Recording it here is what lets the prover skip the
 * scan.
 *
 * **Duplicate suppression.** The contract cannot enforce one attestation per
 * commit: it sees an opaque 32-byte leaf and nothing else. The anchor sees the
 * predicate, so it enforces the rule off-chain. That is the mitigation the
 * threat model claims and the demo Q&A promises out loud.
 *
 * ## What a receipt must never contain
 *
 * The salt, or anything from `statement.evidence`. The anchor operator is
 * specified as seeing repo, commit, and leaf — *not* the findings. A receipt
 * that carried the salt would also unblind the commitment for anyone who read
 * the file. There is a test.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Local operator state, gitignored — see this package's `.gitignore`. */
export const RECEIPTS_FILE =
  process.env.ZKUAT_RECEIPTS_FILE ?? path.resolve(here, '..', '.zkuat-receipts.json');

export interface Receipt {
  /** Hex, 32 bytes. The value inserted into the attestations tree. */
  leaf: string;
  /** Tree position, for `pathForLeaf(BigInt(index), leaf)`. */
  index: number;
  txId: string;
  repo: string;
  /** 40-hex commit, from the predicate. */
  sha: string;
  contractAddress: string;
  /** Unix seconds. */
  anchoredAt: number;
  /** Whether the repo binding was actually proven, or waived with --allow-unsigned. */
  sigstore: 'verified' | 'unsigned';
}

type ReceiptStore = Record<string, Receipt>;

/** One anchor per (repo, commit) — this is the key that enforces it. */
export function receiptKey(repo: string, sha: string): string {
  return `${repo}@${sha}`;
}

export function readReceipts(file = RECEIPTS_FILE): ReceiptStore {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ReceiptStore;
  } catch (err) {
    throw new Error(`zkuat: receipts file ${file} is not readable JSON: ${(err as Error).message}`);
  }
}

/** How `zkuat prove` finds the index: it has the bundle, so it has the leaf. */
export function receiptForLeaf(leafHex: string, file = RECEIPTS_FILE): Receipt | undefined {
  return Object.values(readReceipts(file)).find((r) => r.leaf === leafHex);
}

/**
 * Refuse a second anchor for the same (repo, commit).
 *
 * `force` exists for rehearsals — refreshed fixtures reuse the fixture commit
 * while producing a new leaf, and the pitch gets rehearsed three times.
 */
export function assertNotAnchored(
  repo: string,
  sha: string,
  force = false,
  file = RECEIPTS_FILE,
): void {
  if (force) return;
  const existing = readReceipts(file)[receiptKey(repo, sha)];
  if (existing) {
    throw new Error(
      `zkuat: ${repo}@${sha.slice(0, 12)}… is already anchored — leaf ` +
        `${existing.leaf.slice(0, 16)}… at index ${existing.index}. One attestation per ` +
        'repo-commit. Pass --force to anchor again anyway.',
    );
  }
}

export function writeReceipt(receipt: Receipt, file = RECEIPTS_FILE): void {
  const store = readReceipts(file);
  store[receiptKey(receipt.repo, receipt.sha)] = receipt;
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}
