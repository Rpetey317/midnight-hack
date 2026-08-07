#!/usr/bin/env -S npx tsx
/**
 * Anchor one signed evidence bundle.
 *
 *     zkuat-anchor --bundle demo/fixtures/bank-only/bundle.json \
 *                  --repo acme-software/payment-engine --allow-unsigned
 *
 * The same command is available as `zkuat anchor` from the `cli/` package.
 */
import { die } from '@zkuat/attestor/src/cli/args.js';

import { runAnchor } from './command.js';

runAnchor(process.argv.slice(2)).catch(die);
