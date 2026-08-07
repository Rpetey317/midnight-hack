/**
 * Minimal flag parsing, matching the conventions in
 * `contract/src/devnet/prove.ts` so the CLIs in this repo behave alike.
 *
 *     --name value    → string
 *     --name          → true
 *     --no-name       → false
 */
export type Flags = Map<string, string | boolean>;

export function parseArgs(argv: string[]): Flags {
  const flags: Flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }
  return flags;
}

export function str(flags: Flags, name: string, fallback: string): string {
  const raw = flags.get(name);
  return typeof raw === 'string' ? raw : fallback;
}

export function required(flags: Flags, name: string, usage: string): string {
  const raw = flags.get(name);
  if (typeof raw !== 'string') {
    console.error(`❌ --${name} is required.\n\n${usage}`);
    process.exit(1);
  }
  return raw;
}

export function bool(flags: Flags, name: string, fallback: boolean): boolean {
  if (flags.has(`no-${name}`)) return false;
  if (flags.has(name)) return true;
  return fallback;
}

/** Print a failure the way a person reads it, not the way a stack trace does. */
export function die(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${message}\n`);
  if (process.env.ZKUAT_DEBUG && err instanceof Error) console.error(err.stack);
  process.exit(1);
}
