/**
 * Repository configuration facts: `branchProtected`, `mfaRequired`, `ciGreen`.
 *
 * All three come from `gh api`. Two environment notes, both **VERIFIED**
 * 2026-08-07 against this machine:
 *
 *   - `gh` is 2.45.0, which has no `gh attestation` subcommand (it landed in
 *     2.49.0). Nothing here needs it; `provenance.ts` uses the REST endpoint.
 *   - `gh api repos/{o}/{r}/branches/{b}/protection` returns a clean **404
 *     "Branch not protected"** on an unprotected branch. That 404 is the
 *     answer `false`, not an error, and treating it as a failure would
 *     misreport every unprotected repo as "unknown".
 */
import type { CheckResult } from '@zkuat/attestor';

import { ghApi } from '../exec.js';

const unavailable = <T>(value: T, stub: T | undefined, source: string, error: string): CheckResult<T> => ({
  value: stub ?? value,
  status: stub === undefined ? 'unavailable' : 'stubbed',
  source,
  error,
});

export async function checkBranchProtected(
  repo: string,
  defaultBranch: string,
  stub?: boolean,
): Promise<CheckResult<boolean>> {
  const apiPath = `repos/${repo}/branches/${defaultBranch}/protection`;
  const source = `gh api ${apiPath}`;
  const { status, body, result } = await ghApi(apiPath);

  if (status === 200) {
    return { value: true, status: 'measured', source, detail: body };
  }
  if (status === 404) {
    // "Branch not protected" — a measurement of false, not a missing answer.
    return { value: false, status: 'measured', source, detail: { reason: 'branch not protected' } };
  }
  return unavailable(
    false,
    stub,
    source,
    result.failure ?? `gh api returned ${status || result.code}: ${result.stderr.slice(0, 160)}`,
  );
}

/**
 * `mfaRequired` — whether the owning organisation requires two-factor auth.
 *
 * Only an *organisation* can require MFA of its members. A personal repository
 * has no organisation, so this fact genuinely has no source there and honestly
 * reports `stubbed` rather than inventing a `true`. That is the case on this
 * machine: the repo is owned by a user account.
 */
export async function checkMfaRequired(
  repo: string,
  ownerType: string | undefined,
  stub?: boolean,
): Promise<CheckResult<boolean>> {
  const owner = repo.split('/')[0]!;

  if (ownerType && ownerType !== 'Organization') {
    return {
      value: stub ?? false,
      status: 'stubbed',
      source: `config (${owner} is a ${ownerType}, not an organisation — MFA policy is org-level)`,
      detail: { ownerType },
    };
  }

  const apiPath = `orgs/${owner}`;
  const source = `gh api ${apiPath} → two_factor_requirement_enabled`;
  const { status, body, result } = await ghApi(apiPath);

  const enabled =
    body && typeof body === 'object' && 'two_factor_requirement_enabled' in body
      ? (body as { two_factor_requirement_enabled: unknown }).two_factor_requirement_enabled
      : undefined;

  if (status === 200 && typeof enabled === 'boolean') {
    return { value: enabled, status: 'measured', source };
  }
  if (status === 200) {
    // The field is null unless the token holds admin:org — a permission gap,
    // not a policy of "no MFA". Reporting false here would be a lie.
    return unavailable(
      false,
      stub,
      source,
      'two_factor_requirement_enabled is null — the token lacks admin:org scope',
    );
  }
  return unavailable(
    false,
    stub,
    source,
    result.failure ?? `gh api returned ${status || result.code}`,
  );
}

/** Conclusions that do not mean "the build is broken". */
const GREEN = new Set(['success', 'neutral', 'skipped']);

export async function checkCiGreen(
  repo: string,
  commit: string,
  treatNoChecksAsGreen: boolean,
  stub?: boolean,
): Promise<CheckResult<boolean>> {
  const apiPath = `repos/${repo}/commits/${commit}/check-runs`;
  const source = `gh api ${apiPath}`;
  const { status, body, result } = await ghApi(apiPath);

  if (status !== 200 || !body || typeof body !== 'object') {
    return unavailable(
      false,
      stub,
      source,
      result.failure ?? `gh api returned ${status || result.code}`,
    );
  }

  const runs = (body as { check_runs?: Array<{ name?: string; conclusion?: string | null }> })
    .check_runs ?? [];

  if (runs.length === 0) {
    // No CI ran at all. Whether that is "green" is a policy question, not a
    // measurement — so it comes from config and is labelled as such.
    return {
      value: treatNoChecksAsGreen,
      status: 'stubbed',
      source: `${source} → no check runs; config.treatNoChecksAsGreen`,
      detail: { checkRuns: 0 },
    };
  }

  const failing = runs.filter((r) => !GREEN.has(r.conclusion ?? 'pending'));
  return {
    value: failing.length === 0,
    status: 'measured',
    source,
    detail: {
      total: runs.length,
      failing: failing.map((r) => ({ name: r.name, conclusion: r.conclusion })),
    },
  };
}

/** The repo's default branch and owner type, for the two checks above. */
export async function repoMetadata(
  repo: string,
): Promise<{ defaultBranch: string; ownerType?: string; error?: string }> {
  const { status, body, result } = await ghApi(`repos/${repo}`);
  if (status !== 200 || !body || typeof body !== 'object') {
    return {
      defaultBranch: 'main',
      error: result.failure ?? `gh api repos/${repo} returned ${status || result.code}`,
    };
  }
  const meta = body as { default_branch?: string; owner?: { type?: string } };
  return { defaultBranch: meta.default_branch ?? 'main', ownerType: meta.owner?.type };
}
