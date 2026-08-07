/**
 * The anchor's decisions, tested without a chain.
 *
 * Everything here is a trust decision — the four things that must hold before a
 * leaf is allowed on chain, plus the promise that a receipt carries nothing
 * private. The chain half (`submit.ts`) is exercised end to end by the devnet
 * run in `cli/README.md`, not from here: it needs a node, an indexer, a proof
 * server, and real proving keys.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadBundle, verifyBundle, buildPredicate } from '@zkuat/attestor';
import type { AttestationPredicate, EvidenceBundle } from '@zkuat/attestor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertNotAnchored,
  receiptForLeaf,
  writeReceipt,
  type Receipt,
} from '../receipt.js';
import { assertRepoBinding, repoClaims, verifySigstore } from '../sigstore.js';
import { trustedKeyIds } from '../trust.js';

const FIXTURE = path.resolve(import.meta.dirname, '..', '..', '..', 'demo', 'fixtures', 'bank-only', 'bundle.json');
const REPO = 'acme-software/payment-engine';

function fixture(): EvidenceBundle {
  return loadBundle(FIXTURE);
}

function predicateFor(bundle: EvidenceBundle): AttestationPredicate {
  return buildPredicate(bundle, { repo: REPO, sha: bundle.statement.evidence.commit });
}

describe('trust list', () => {
  it('accepts the demo attestor key that signed the fixtures', () => {
    const bundle = fixture();
    expect(trustedKeyIds()).toContain(bundle.attestorPublicKey.keyid);
    expect(verifyBundle(bundle, { trustedKeyIds: trustedKeyIds() })).toBe(true);
  });

  // The whole point of passing a trust list: without one, verifyBundle checks
  // the signature against the key the bundle carries, which any forger also
  // controls.
  it('rejects a bundle whose attestor key is not in the trust list', () => {
    expect(() => verifyBundle(fixture(), { trustedKeyIds: ['de'.repeat(32)] })).toThrow(
      /not in the trusted set/,
    );
  });
});

describe('repo binding', () => {
  it('rejects an OIDC subject repo that is not the predicate repo', () => {
    // DoD: "Anchor rejects a bundle whose OIDC repo ≠ predicate repo."
    expect(() =>
      assertRepoBinding({ repo: 'attacker/evil', sha: undefined }, predicateFor(fixture())),
    ).toThrow(/does not match predicate repo/);
  });

  it('rejects a certificate with no repository claim at all', () => {
    expect(() => assertRepoBinding({}, predicateFor(fixture()))).toThrow(
      /no source-repository claim/,
    );
  });

  it('rejects a matching repo on the wrong commit', () => {
    const predicate = predicateFor(fixture());
    expect(() => assertRepoBinding({ repo: REPO, sha: 'a'.repeat(40) }, predicate)).toThrow(
      /different commit/,
    );
  });

  it('accepts the matching repo and commit', () => {
    const predicate = predicateFor(fixture());
    expect(() => assertRepoBinding({ repo: REPO, sha: predicate.sha }, predicate)).not.toThrow();
  });

  it('reads both the v1 (raw ASCII) and v2 (DER UTF8String) certificate extensions', () => {
    const der = (value: string) =>
      Buffer.concat([Buffer.from([0x0c, value.length]), Buffer.from(value, 'utf8')]);

    const v2 = repoClaims([
      { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 12] }, value: der(`https://github.com/${REPO}`) },
      { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 13] }, value: der('b'.repeat(40)) },
    ]);
    expect(v2).toEqual({ repo: REPO, sha: 'b'.repeat(40) });

    const v1 = repoClaims([
      { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 5] }, value: Buffer.from(REPO, 'utf8') },
      { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 3] }, value: Buffer.from('c'.repeat(40), 'utf8') },
    ]);
    expect(v1).toEqual({ repo: REPO, sha: 'c'.repeat(40) });
  });
});

describe('unsigned bundles', () => {
  it('refuses a sigstore:null bundle by default', async () => {
    const bundle = fixture();
    expect(bundle.sigstore).toBeNull(); // the repo is private; nothing is Sigstore-signed here
    await expect(verifySigstore(bundle, predicateFor(bundle), {})).rejects.toThrow(
      /--allow-unsigned/,
    );
  });

  it('accepts one with --allow-unsigned, and says the binding was not checked', async () => {
    const bundle = fixture();
    const outcome = await verifySigstore(bundle, predicateFor(bundle), { allowUnsigned: true });
    expect(outcome.state).toBe('unsigned');
  });
});

describe('receipts', () => {
  let file: string;

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zkuat-')), 'receipts.json');
  });
  afterEach(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  const receipt = (over: Partial<Receipt> = {}): Receipt => ({
    leaf: '14cbf361586b748a2fd2c43d63b0e3255de579aaff4c9ca0952d99b89ed01651',
    index: 0,
    txId: 'deadbeef',
    repo: REPO,
    sha: '9f2a1b3c4d5e6f708192a3b4c5d6e7f809a1b2c3',
    contractAddress: '0200abcd',
    anchoredAt: 1786060800,
    sigstore: 'unsigned',
    ...over,
  });

  it('enforces one anchor per (repo, commit), and lets --force through', () => {
    const r = receipt();
    expect(() => assertNotAnchored(r.repo, r.sha, false, file)).not.toThrow();

    writeReceipt(r, file);
    expect(() => assertNotAnchored(r.repo, r.sha, false, file)).toThrow(/already anchored/);
    expect(() => assertNotAnchored(r.repo, r.sha, true, file)).not.toThrow();

    // A different commit in the same repo is a different attestation.
    expect(() => assertNotAnchored(r.repo, 'f'.repeat(40), false, file)).not.toThrow();
  });

  it('finds the leaf index the prover needs', () => {
    const r = receipt({ index: 7 });
    writeReceipt(r, file);
    expect(receiptForLeaf(r.leaf, file)?.index).toBe(7);
    expect(receiptForLeaf('00'.repeat(32), file)).toBeUndefined();
  });

  // The anchor operator sees a repo, a commit, and a commitment. Not the
  // findings, and above all not the salt — that would unblind the commitment
  // for anyone who read the file.
  it('never serializes the salt or any evidence value', () => {
    const bundle = fixture();
    writeReceipt(receipt(), file);
    const serialized = fs.readFileSync(file, 'utf8');

    expect(serialized).not.toContain(bundle.salt);

    // `attestor` is the identifier the predicate's own leak check treats as
    // private — vendor and product are public by design, and in the fixture the
    // repo is literally "<vendor>/<product>", so asserting their absence would
    // fail on the repo field rather than on a leak. Small integers are worse
    // still: `highs: 3` would "appear" in any file full of hex. The shape
    // assertion below is what covers the numeric evidence fields.
    expect(serialized).not.toContain(bundle.statement.evidence.attestor);

    const stored = Object.values(JSON.parse(serialized))[0] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      'anchoredAt',
      'contractAddress',
      'index',
      'leaf',
      'repo',
      'sha',
      'sigstore',
      'txId',
    ]);
  });
});
