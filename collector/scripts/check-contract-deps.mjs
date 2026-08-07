/**
 * Fail the install with a useful message if `contract/` has not been installed.
 *
 * `@zkuat/contract` is a `file:../contract` dependency, so npm creates a
 * **symlink** and does not install the linked package's own dependencies. Node
 * then resolves that symlink to its real path and looks for
 * `@midnight-ntwrk/compact-runtime` from inside `contract/`, where nothing has
 * been installed.
 *
 * Without this check the failure is a runtime `ERR_MODULE_NOT_FOUND` pointing
 * at a generated file in a directory the reader did not know existed, several
 * commands after the actual mistake. Found by installing into a genuinely
 * fresh copy of the repo, which is the only way this shows up — it is invisible
 * on any machine where Track A has ever run `npm install`.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(here, '..', '..', 'contract', 'node_modules', '@midnight-ntwrk', 'compact-runtime');

if (!existsSync(runtime)) {
  console.error(`
  ⚠️  contract/ has no node_modules, so @zkuat/contract cannot load.

      @zkuat/contract is a file: dependency — npm symlinks it but does not
      install its dependencies. Install it first:

          npm --prefix ../contract install

      Then re-run this install. Everything here imports pureCircuits through
      that package, so nothing works until it resolves.
`);
  process.exit(1);
}
