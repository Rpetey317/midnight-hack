/**
 * Fail the install with a useful message if `contract/` or `attestor/` has not
 * been installed.
 *
 * Both are `file:` dependencies, so npm creates **symlinks** and does not
 * install the linked packages' own dependencies. Node then resolves those
 * symlinks to their real paths and looks for `@midnight-ntwrk/compact-runtime`
 * from inside `contract/`, where nothing has been installed.
 *
 * Without this check the failure is a runtime `ERR_MODULE_NOT_FOUND` pointing
 * at a generated file in a directory the reader did not know existed, several
 * commands after the actual mistake. It is invisible on any machine where
 * Track A has ever run `npm install`, and only shows up on a fresh clone.
 *
 * Install order for this package: contract → attestor → anchor.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const missing = [
  ['contract', resolve(root, 'contract', 'node_modules', '@midnight-ntwrk', 'compact-runtime')],
  ['attestor', resolve(root, 'attestor', 'node_modules')],
].filter(([, path]) => !existsSync(path));

if (missing.length > 0) {
  console.error(`
  ⚠️  ${missing.map(([name]) => `${name}/`).join(' and ')} not installed, so @zkuat/anchor cannot load.

      They are file: dependencies — npm symlinks them but does not install
      their dependencies. Install in order, then re-run this install:

          npm --prefix ../contract install
          npm --prefix ../attestor install

      Everything here imports pureCircuits through @zkuat/contract, so nothing
      works until it resolves.
`);
  process.exit(1);
}
