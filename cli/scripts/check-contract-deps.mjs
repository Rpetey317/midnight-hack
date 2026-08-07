/**
 * Fail the install with a useful message if the packages below this one have
 * not been installed.
 *
 * `@zkuat/anchor` is a `file:` dependency, so npm symlinks it without
 * installing its dependencies — and the anchor in turn reaches the Midnight SDK
 * through `contract/node_modules`, deliberately (see
 * `contract/src/devnet/sdk.ts`). Miss either and the failure is a runtime
 * `ERR_MODULE_NOT_FOUND` several commands after the actual mistake.
 *
 * Install order: contract → attestor → anchor → cli.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const missing = [
  ['contract', resolve(root, 'contract', 'node_modules', '@midnight-ntwrk', 'compact-runtime')],
  ['attestor', resolve(root, 'attestor', 'node_modules')],
  ['anchor', resolve(root, 'anchor', 'node_modules')],
].filter(([, path]) => !existsSync(path));

if (missing.length > 0) {
  console.error(`
  ⚠️  ${missing.map(([name]) => `${name}/`).join(', ')} not installed, so @zkuat/cli cannot load.

      Install in order, then re-run this install:

          npm --prefix ../contract install
          npm --prefix ../attestor install
          npm --prefix ../anchor   install
`);
  process.exit(1);
}
