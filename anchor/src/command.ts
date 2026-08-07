/**
 * The `anchor` command, as a function, so `cli/` can mount it as a subcommand
 * without shelling out.
 */
import * as fs from 'node:fs';

import { assertNoEvidenceLeak, buildPredicate, loadBundle, unhex32, verifyBundle } from '@zkuat/attestor';
// The flag parser is deliberately not on the attestor's barrel — it is CLI
// scaffolding, not attestor API. Reach for it by subpath so every command in
// this repo parses flags the same way.
import { parseArgs, required, str } from '@zkuat/attestor/src/cli/args.js';

import { assertNotAnchored, writeReceipt, type Receipt } from './receipt.js';
import { verifySigstore } from './sigstore.js';
import { anchorLeaf } from './submit.js';
import { parseTrustFlag, trustedKeyIds } from './trust.js';

export const ANCHOR_USAGE = `
Verify a signed evidence bundle and anchor its leaf on Midnight.

  zkuat anchor --bundle <path> --repo <owner/name> [flags]

  --bundle <path>       signed bundle from the attestor          (required)
  --repo <owner/name>   the repository the evidence is about     (required)
  --sha <40hex>         commit; defaults to the evidence's own
  --trust <a,b>         attestor public keys to accept; defaults to demo/keys/
  --allow-unsigned      accept a bundle with no Sigstore attestation
  --force               re-anchor a (repo, commit) already on file
  --trusted-root <p>    a Sigstore TrustedRoot JSON, instead of fetching over TUF

Nothing from the evidence reaches the chain or this terminal — the anchor sees
a repository, a commit, and a 32-byte commitment.
`;

export async function runAnchor(argv: string[]): Promise<void> {
  const flags = parseArgs(argv);
  if (flags.has('help')) {
    console.log(ANCHOR_USAGE);
    return;
  }

  const file = required(flags, 'bundle', ANCHOR_USAGE);
  const repo = required(flags, 'repo', ANCHOR_USAGE);
  if (!fs.existsSync(file)) throw new Error(`no such bundle: ${file}`);

  // 1. Trusted attestor key. Without a trust list this proves only that the
  //    bundle is internally consistent, which is worth nothing here.
  const bundle = loadBundle(file);
  const trusted = trustedKeyIds(parseTrustFlag(str(flags, 'trust', '') || undefined));
  verifyBundle(bundle, { trustedKeyIds: trusted });

  // 2. The public predicate — four keys, and nothing private in any of them.
  const sha = str(flags, 'sha', bundle.statement.evidence.commit);
  const predicate = buildPredicate(bundle, { repo, sha });
  assertNoEvidenceLeak(predicate, bundle);

  // 3. The repo binding. This is the check the trust chain rests on.
  const sigstore = await verifySigstore(bundle, predicate, {
    allowUnsigned: flags.has('allow-unsigned'),
    trustedRootFile: str(flags, 'trusted-root', '') || undefined,
  });

  // 4. One attestation per repo-commit, enforced off-chain because the contract
  //    cannot see a commit.
  assertNotAnchored(repo, sha, flags.has('force'));

  console.log('\n─── Verified ─────────────────────────────────────────────\n');
  console.log(`  bundle             ${file}`);
  console.log(`  ✓ attestor key     ${bundle.attestorPublicKey.keyid.slice(0, 16)}… (in the trust list)`);
  console.log('  ✓ leaf             re-derived via pureCircuits.leafOf');
  console.log('  ✓ predicate        {leaf, repo, sha, schema} — no evidence leaked');
  if (sigstore.state === 'verified') {
    console.log(`  ✓ repo binding     OIDC subject ${sigstore.repo} == predicate repo`);
  } else {
    console.log(`  ⚠ repo binding     NOT CHECKED — ${sigstore.reason}`);
  }
  console.log('');
  console.log(`  repo               ${predicate.repo}`);
  console.log(`  commit             ${predicate.sha}`);
  console.log(`  leaf               ${predicate.leaf}`);
  console.log('');

  console.log('─── Anchor ───────────────────────────────────────────────\n');
  const { index, txId, contractAddress } = await anchorLeaf(unhex32(bundle.leaf, 'bundle.leaf'));

  const receipt: Receipt = {
    leaf: predicate.leaf,
    index,
    txId,
    repo: predicate.repo,
    sha: predicate.sha,
    contractAddress,
    anchoredAt: Math.floor(Date.now() / 1000),
    sigstore: sigstore.state === 'verified' ? 'verified' : 'unsigned',
  };
  writeReceipt(receipt);

  console.log(`  anchored at index  ${index < 0 ? '(unknown — see warning above)' : index}`);
  console.log(`  tx                 ${txId}`);
  console.log('  receipt written.\n');
  console.log('  Next: zkuat prove --bundle <path> --policy <slug> --artifact <digest>\n');
}
