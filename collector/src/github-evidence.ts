/**
 * GitHub Actions `evidence.json` → a private collector report.
 *
 * This is the adapter for Master-Doc-v2 §4–§5: the application dispatches the
 * repository's own workflow, waits for it, downloads the artifact, and gets a
 * deliberately small document back:
 *
 *     { repository, commit, artifactDigest, vulnerabilities: { critical, … } }
 *
 * The circuit needs seventeen fields. This module bridges the two **without
 * pretending the missing ones were measured**.
 *
 * ## Why the target is `CollectorReport` and not a bespoke type
 *
 * `CheckResult<T>` already carries `status` (`measured` / `stubbed` /
 * `unavailable`), `source`, and `error`, and `zkuat-attest` refuses to sign a
 * report with any non-`measured` check unless someone passes `--allow-degraded`
 * after reading the list. Emitting a `CollectorReport` means the whole existing
 * chain runs unchanged:
 *
 *     evidence.json → reportFromGithubEvidence() → normalize() → sign
 *                   → bundle.json → anchor → devnet:prove --bundle
 *
 * ## The honesty problem this module exists to not create
 *
 * `npm audit` reports severity counts. It does **not** cross-reference the CISA
 * KEV catalogue and it does not evaluate a prohibited-package list. Writing
 * `kev: 0` and `forbiddenDeps: 0` here would produce a compliance record
 * asserting "no known-exploited vulnerabilities" from a measurement that never
 * ran — precisely the failure ../../docs/02-threat-model.md names under "the
 * checks themselves are meaningful", and the reason `checks/npm-audit.ts`
 * carries a `scanned` flag at all.
 *
 * So both come back `unavailable`. The value still has to be *some* integer for
 * the struct, but the status says where it came from, and the attestor prints
 * it before signing.
 *
 * Repository configuration (`branchProtected`, `mfaRequired`) is measured here,
 * downstream of CI, through the same `gh api` checks the full collector uses —
 * `.github/workflows/attest.yml` is fixed and does not gather them.
 */
import type { CheckResult, CollectorReport } from '@zkuat/attestor';

import { checkBranchProtected, checkMfaRequired, repoMetadata } from './checks/repo.js';
import { hashConfig } from './config.js';

export const GITHUB_ADAPTER_NAME = 'zkuat-github-evidence';
export const GITHUB_ADAPTER_VERSION = '0.1.0';

/**
 * The attestor slug for evidence produced this way.
 *
 * Master-Doc-v2 §10 makes GitHub Actions the trusted evidence environment, so
 * the workflow *is* the attestor. Naming it explicitly keeps a policy's
 * `requiredAttestor` able to distinguish this path from a signed collector run.
 */
export const GITHUB_ATTESTOR_SLUG = 'github-actions';

/** The workflow that produced the document. Quoted verbatim in `source`. */
const WORKFLOW = '.github/workflows/attest.yml';

/** Long enough to be useful, inside the 30 days both shipped policies grant. */
const DEFAULT_VALID_DAYS = 29;

/** The document `.github/workflows/attest.yml` uploads. */
export interface GithubEvidenceDocument {
  /** `owner/name`. */
  repository: string;
  /** 40-char hex git SHA — `GITHUB_SHA`. */
  commit: string;
  /** `sha256:…` of the `npm pack` tarball. */
  artifactDigest: string;
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
}

/** What the application learned about the run that produced the document. */
export interface GithubRunContext {
  id?: number;
  url?: string;
  /** `success`, `failure`, … — `null` while still running. */
  conclusion?: string | null;
  /** The `request_id` input the application dispatched with. */
  requestId?: string;
}

export interface GithubEvidenceOptions {
  run?: GithubRunContext;
  /** Defaults to {@link GITHUB_ATTESTOR_SLUG}. */
  attestor?: string;
  /** How long the attestor declares the evidence valid. Default 29 days. */
  validDays?: number;
  /** Unix seconds. Defaults to now. */
  collectedAt?: number;
  /**
   * Measure `branchProtected` and `mfaRequired` via `gh api`.
   *
   * Off in tests and anywhere `gh` is not authenticated; both checks then
   * report `unavailable` rather than inventing a `false`.
   */
  probeRepository?: boolean;
}

const INTEGER_KEYS = ['critical', 'high', 'moderate', 'low', 'total'] as const;

function requireCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`zkuat: evidence.json ${field} must be a non-negative integer, got ${value}`);
  }
  return value;
}

/**
 * Validate an untrusted `evidence.json`.
 *
 * Separate from {@link reportFromGithubEvidence} so the shape can be checked
 * without touching the network — the application parses a ZIP entry from
 * GitHub, and everything in it is attacker-influenced until proven otherwise.
 */
export function parseGithubEvidence(input: unknown): GithubEvidenceDocument {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('zkuat: evidence.json must be a JSON object');
  }
  const doc = input as Record<string, unknown>;

  const repository = doc.repository;
  if (typeof repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(
      `zkuat: evidence.json repository must be "owner/name", got ${JSON.stringify(repository)}`,
    );
  }

  const commit = doc.commit;
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(
      `zkuat: evidence.json commit must be a 40-character hex SHA, got ${JSON.stringify(commit)}`,
    );
  }

  const artifactDigest = doc.artifactDigest;
  if (
    typeof artifactDigest !== 'string' ||
    !/^(sha256:)?[0-9a-f]{64}$/i.test(artifactDigest.trim())
  ) {
    throw new Error(
      'zkuat: evidence.json is missing a usable artifactDigest. ' +
        `${WORKFLOW} emits sha256 of the npm pack tarball; got ${JSON.stringify(artifactDigest)}`,
    );
  }

  const vulns = doc.vulnerabilities;
  if (!vulns || typeof vulns !== 'object' || Array.isArray(vulns)) {
    throw new Error('zkuat: evidence.json is missing a vulnerabilities object');
  }
  const counts = vulns as Record<string, unknown>;

  return {
    repository,
    commit: commit.toLowerCase(),
    artifactDigest: artifactDigest.trim().toLowerCase(),
    vulnerabilities: Object.fromEntries(
      INTEGER_KEYS.map((key) => [key, requireCount(counts[key], `vulnerabilities.${key}`)]),
    ) as GithubEvidenceDocument['vulnerabilities'],
  };
}

const measured = <T>(value: T, source: string, detail?: unknown): CheckResult<T> => ({
  value,
  status: 'measured',
  source,
  detail,
});

const unmeasured = <T>(value: T, source: string, error: string): CheckResult<T> => ({
  value,
  status: 'unavailable',
  source,
  error,
});

/**
 * `evidence.json` + run metadata → a `CollectorReport` the attestor can sign.
 *
 * Throws only on a malformed document. Every fact this workflow cannot
 * establish degrades and says so; nothing is silently invented.
 */
export async function reportFromGithubEvidence(
  input: unknown,
  options: GithubEvidenceOptions = {},
): Promise<CollectorReport> {
  const doc = parseGithubEvidence(input);
  const [owner, name] = doc.repository.toLowerCase().split('/') as [string, string];

  const collectedAt = options.collectedAt ?? Math.floor(Date.now() / 1000);
  const attestor = options.attestor ?? GITHUB_ATTESTOR_SLUG;
  const validDays = options.validDays ?? DEFAULT_VALID_DAYS;
  const run = options.run;

  const auditSource = `npm audit --json (${WORKFLOW})`;
  const auditDetail = { vulnerabilities: doc.vulnerabilities, workflowRun: run?.id, requestId: run?.requestId };

  // The run's own outcome. `conclusion` is null while a run is in flight, which
  // is a different fact from "it failed" — the application only calls this
  // after waiting for completion, so treat null as unknown rather than false.
  const runSource = run?.url
    ? `github actions run ${run.id} (${run.url})`
    : `github actions run ${run?.id ?? 'unknown'}`;
  const succeeded = run?.conclusion === 'success';

  const ciGreen: CheckResult<boolean> =
    run && typeof run.conclusion === 'string'
      ? measured(succeeded, `${runSource} → conclusion`, { conclusion: run.conclusion })
      : unmeasured(
          false,
          runSource,
          'no workflow run conclusion was supplied — the caller did not wait for completion',
        );

  // Master-Doc-v2 §10: GitHub Actions is the trusted evidence environment, so a
  // document that came out of a run WE dispatched and GitHub reported
  // successful is provenance under that assumption — and the `source` string
  // says exactly which assumption, so nobody reads it as a Sigstore check.
  // `anchor/` still performs the stronger verification on the signed path.
  const buildProvenanceVerified: CheckResult<boolean> =
    run && typeof run.conclusion === 'string'
      ? measured(
          succeeded,
          `${runSource} — trusted per Master-Doc-v2 §10 (GitHub Actions is the evidence environment); ` +
            'NOT a Sigstore bundle verification',
          { conclusion: run.conclusion },
        )
      : unmeasured(
          false,
          runSource,
          'no workflow run was supplied, so the evidence cannot be tied to a dispatched run',
        );

  // Repository configuration is not gathered by the workflow. Measure it here,
  // downstream, with the same checks the full collector uses.
  let branchProtected: CheckResult<boolean>;
  let mfaRequired: CheckResult<boolean>;

  if (options.probeRepository) {
    const meta = await repoMetadata(doc.repository);
    [branchProtected, mfaRequired] = await Promise.all([
      checkBranchProtected(doc.repository, meta.defaultBranch),
      checkMfaRequired(doc.repository, meta.ownerType),
    ]);
  } else {
    const why = `${WORKFLOW} does not gather repository configuration, and no gh probe was requested`;
    branchProtected = unmeasured(false, 'gh api repos/…/branches/…/protection', why);
    mfaRequired = unmeasured(false, 'gh api orgs/… → two_factor_requirement_enabled', why);
  }

  return {
    _type: 'zkuat.collector-report.v1',
    provenance: {
      collector: GITHUB_ADAPTER_NAME,
      collectorVersion: GITHUB_ADAPTER_VERSION,
      // No config file on this path, so pin what actually shaped the mapping.
      // §35 wants a record to mean "measured by X configured as Y".
      configHash: hashConfig({
        workflow: WORKFLOW,
        attestor,
        validDays,
        probeRepository: Boolean(options.probeRepository),
      }),
      collectedAt,
    },
    subject: {
      vendor: owner,
      product: name,
      attestor,
      repo: doc.repository,
      commit: doc.commit,
      validDays,
    },
    checks: {
      artifactDigest: measured(doc.artifactDigest, `npm pack | sha256 (${WORKFLOW})`),
      criticals: measured(doc.vulnerabilities.critical, auditSource, auditDetail),
      highs: measured(doc.vulnerabilities.high, auditSource, auditDetail),

      // `npm audit` severity counts carry no KEV cross-reference. See the
      // module header — a measured-looking 0 here is the dangerous case.
      kev: unmeasured(
        0,
        'CISA KEV catalogue',
        'npm audit does not cross-reference the CISA Known Exploited Vulnerabilities ' +
          'catalogue; this run established no KEV fact',
      ),
      forbiddenDeps: unmeasured(
        0,
        'prohibited-package list',
        `${WORKFLOW} evaluates no prohibited-package list; this run established no forbidden-dependency fact`,
      ),

      // Every package with at least one advisory. Not identical to the full
      // collector's `Object.keys(report.vulnerabilities).length`, but it is the
      // same quantity npm reports as the total, and it is genuinely measured.
      vulnDeps: measured(doc.vulnerabilities.total, auditSource, auditDetail),

      mfaRequired,
      branchProtected,
      buildProvenanceVerified,
      ciGreen,

      // Absent from both shipped policies (§18 — a weak security signal), so a
      // zero here constrains nothing.
      coverage: {
        value: 0,
        status: 'stubbed',
        source: `${WORKFLOW} runs no coverage tooling`,
      },
    },
  };
}
