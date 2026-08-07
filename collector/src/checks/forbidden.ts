/**
 * `forbiddenDeps` — how many installed packages appear on the buyer's
 * prohibited list.
 *
 * §16's scenario: a vendor proves no dependency appears in the buyer's
 * prohibited list *without handing over a 427-component SBOM*. This is the
 * check that makes that concrete, and it is deliberately distinct from
 * `vulnDeps`: "appears on the buyer's prohibited list" is a licence or policy
 * fact, not a vulnerability fact. A package can be perfectly secure and still
 * be banned.
 *
 * The list is a demo input — keep it small and visible.
 */
import type { CheckResult } from '@zkuat/attestor';

import { parseJson, run } from '../exec.js';

interface LsNode {
  name?: string;
  version?: string;
  dependencies?: Record<string, LsNode>;
  /** npm ls emits this instead of a tree — ENOLOCK, for instance. */
  error?: { code?: string; summary?: string };
}

/** Flatten `npm ls --all --json` into name@version pairs, cycles included. */
export function flattenTree(root: LsNode): Array<{ name: string; version: string }> {
  const out: Array<{ name: string; version: string }> = [];
  const seen = new Set<string>();

  const visit = (deps: Record<string, LsNode> | undefined): void => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      const key = `${name}@${node.version ?? ''}`;
      if (seen.has(key)) continue; // the tree repeats shared deps at every use site
      seen.add(key);
      out.push({ name, version: node.version ?? '' });
      visit(node.dependencies);
    }
  };

  visit(root.dependencies);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** `left-pad` matches the package; `left-pad@1.3.0` matches that version too. */
export function matches(
  installed: { name: string; version: string },
  rule: string,
): boolean {
  const at = rule.lastIndexOf('@');
  if (at > 0) {
    return installed.name === rule.slice(0, at) && installed.version === rule.slice(at + 1);
  }
  return installed.name === rule;
}

export async function checkForbiddenDeps(
  projectDir: string,
  forbidden: string[],
  stub?: number,
): Promise<CheckResult<number>> {
  const source = 'npm ls --all --json --package-lock-only ∩ config.forbiddenPackages';

  if (forbidden.length === 0) {
    // An empty prohibited list measures zero honestly — there is nothing that
    // could match. Not a stub.
    return { value: 0, status: 'measured', source, detail: { list: [], matched: [] } };
  }

  // --package-lock-only reads the lockfile instead of walking node_modules, so
  // this works in CI before `npm ci` and gives the same answer either way.
  const result = await run(
    'npm',
    ['ls', '--all', '--json', '--package-lock-only'],
    { cwd: projectDir, timeout: 60_000 },
  );

  // npm ls exits non-zero on peer-dependency complaints while still emitting a
  // complete tree, so parse first and judge on the output.
  const tree = parseJson<LsNode>(result.stdout) ?? parseJson<LsNode>(result.stderr);

  // A parseable document is not the same as an enumerated tree. With no
  // lockfile, npm ls emits `{"error":{"code":"ENOLOCK",…}}` — valid JSON that
  // parses cleanly and describes nothing. Reporting a *measured* zero from
  // that would claim "none of the buyer's prohibited packages are present"
  // having looked at no packages at all. Same class of bug as the kev one.
  const enumerated = tree && !tree.error && (tree.name !== undefined || tree.dependencies !== undefined);

  if (!enumerated) {
    return {
      value: stub ?? 0,
      status: stub === undefined ? 'unavailable' : 'stubbed',
      source,
      error:
        result.failure ??
        tree?.error?.summary ??
        `npm ls enumerated no dependency tree (exit ${result.code}): ${result.stderr.slice(0, 200)}`,
    };
  }

  const installed = flattenTree(tree);
  const matched = installed.filter((pkg) => forbidden.some((rule) => matches(pkg, rule)));

  return {
    value: matched.length,
    status: 'measured',
    source,
    // PRIVATE: which packages, and how many there are in total. The buyer
    // learns the count is zero, never the dependency tree. That is §16.
    detail: {
      totalDependencies: installed.length,
      list: forbidden,
      matched: matched.map((p) => `${p.name}@${p.version}`),
    },
  };
}
