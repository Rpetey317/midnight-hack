#!/usr/bin/env -S npx tsx
/**
 * zkuat — anchor, prove, status.
 *
 * The fallback proof path. If the browser demo dies, these three commands still
 * execute the whole protocol against a real chain with real ZK proofs; the
 * pitch then describes the vendor/buyer asymmetry instead of showing it. That
 * is a degraded demo, not a failed one.
 *
 * They also map cleanly onto the three roles:
 *
 *   anchor   the operator  — verifies provenance, puts a commitment on chain
 *   prove    the vendor    — holds the evidence, claims a policy is satisfied
 *   status   the buyer     — reads a verdict, and can read nothing else
 *
 * ⚠️ LOCAL DEVNET ONLY — the wallet is the well-known genesis seed.
 */
import { runAnchor, ANCHOR_USAGE } from '@zkuat/anchor';
import { die } from '@zkuat/attestor/src/cli/args.js';

import { runProve, PROVE_USAGE } from './commands/prove.js';
import { runStatus, STATUS_USAGE } from './commands/status.js';

const USAGE = `
zkuat — private compliance attestation on Midnight.

  zkuat anchor  --bundle <path> --repo <owner/name>      operator: verify + attest(leaf)
  zkuat prove   --bundle <path> --policy <s> --artifact <d>   vendor: prove compliance
  zkuat status  --artifact <digest>                      buyer: read the verdict

  zkuat <command> --help    flags for one command

Typical run, from a signed fixture:

  zkuat anchor --bundle demo/fixtures/bank-only/bundle.json \\
               --repo acme-software/payment-engine --allow-unsigned
  zkuat prove  --bundle demo/fixtures/bank-only/bundle.json \\
               --policy bank-v1 --artifact <digest>
  zkuat status --artifact <digest>
`;

const COMMANDS = {
  anchor: { run: runAnchor, usage: ANCHOR_USAGE },
  prove: { run: runProve, usage: PROVE_USAGE },
  status: { run: runStatus, usage: STATUS_USAGE },
} as const;

async function main(): Promise<void> {
  const [name, ...rest] = process.argv.slice(2);

  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(USAGE);
    return;
  }

  const command = COMMANDS[name as keyof typeof COMMANDS];
  if (!command) {
    console.error(`\n❌ Unknown command "${name}".\n${USAGE}`);
    process.exit(1);
  }

  await command.run(rest);
}

main().catch(die);
