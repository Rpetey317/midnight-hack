#!/usr/bin/env -S npx tsx
/**
 * Generate an attestor keypair.
 *
 *     npm run keygen -- --attestor zkuat-attestor-v1 --out ../demo/keys
 *
 * Writes `<attestor>.key.json` (mode 0600, gitignored under attestor/) and
 * `<attestor>.pub.json` (commit this — it is what lets anyone verify a bundle).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateAttestorKey, writeKeyPair } from '../keys.js';
import { bool, die, parseArgs, str } from './args.js';

const USAGE = `
Generate an ed25519 attestor keypair.

  npm run keygen -- [flags]

  --attestor <slug>   attestor identity, hashed into Evidence.attestorId
                      (default zkuat-attestor-v1)
  --out <dir>         output directory (default ./keys)
  --force             overwrite an existing key

⚠️  Regenerating an attestor key invalidates nothing already anchored — the
    chain holds leaf hashes, not signatures — but every existing bundle then
    verifies only against the OLD public key. Keep both, or re-sign.
`;

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const attestor = str(flags, 'attestor', 'zkuat-attestor-v1');
  const outDir = path.resolve(str(flags, 'out', 'keys'));
  const privPath = path.join(outDir, `${attestor}.key.json`);

  if (fs.existsSync(privPath) && !bool(flags, 'force', false)) {
    throw new Error(
      `${privPath} already exists. Re-signing with a new key orphans every bundle signed ` +
        'with the old one — pass --force only if you mean that.',
    );
  }

  const key = generateAttestorKey(attestor);
  const { priv, pub } = writeKeyPair(outDir, key);

  console.log(`\n  attestor  ${attestor}`);
  console.log(`  keyid     ${key.keyid}`);
  console.log(`  private   ${priv}   (0600)`);
  console.log(`  public    ${pub}    ← commit this\n`);
}

main().catch(die);
