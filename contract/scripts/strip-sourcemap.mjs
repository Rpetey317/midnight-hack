/**
 * The Compact compiler emits an index.js.map whose `sources` point at
 * compiler-internal files that are not distributed. Vite resolves that map when
 * loading the generated contract and logs
 *
 *   Sourcemap for ".../contract/index.js" points to missing source files
 *
 * on every test run. The map is unusable either way, so drop it along with the
 * comment that references it. Runs automatically after `npm run compile`.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const CONTRACT_JS = 'src/managed/audit_registry/contract/index.js';
const CONTRACT_MAP = `${CONTRACT_JS}.map`;

if (existsSync(CONTRACT_JS)) {
  const source = readFileSync(CONTRACT_JS, 'utf8');
  const stripped = source.replace(/\n?\/\/# sourceMappingURL=.*\n?$/, '\n');
  if (stripped !== source) writeFileSync(CONTRACT_JS, stripped);
}

rmSync(CONTRACT_MAP, { force: true });
