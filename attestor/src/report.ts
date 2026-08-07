/**
 * The collector → attestor contract.
 *
 * This type lives in the *attestor* even though the *collector* produces it,
 * because it describes what the attestor requires as input. Anything that can
 * fill this shape — our collector today, a semgrep or trivy adapter tomorrow,
 * a hand-written scenario for a demo fixture — is a valid evidence source, and
 * none of them require a change here. `@zkuat/collector` imports this type and
 * implements against it.
 *
 * The report is **private and stays private**. It carries `detail` fields with
 * CVE identifiers and package names — exactly the over-disclosure the protocol
 * exists to prevent. `normalize()` reads `.value` and nothing else, so there is
 * no path from `detail` into the canonical evidence, the commitment, or the
 * chain. That is structural, not a convention.
 */

/**
 * How a fact was established.
 *
 * The distinction is the point. A stubbed `mfaRequired: true` and a measured
 * one are indistinguishable once they reach the `Evidence` struct, so the
 * honesty has to live here, in the report the attestor sees before it signs.
 * `zkuat-attest` prints every non-`measured` check before signing.
 */
export type CheckStatus =
  /** A real tool or API produced this value. */
  | 'measured'
  /** No source exists in this environment; the value came from config. */
  | 'stubbed'
  /** A source exists but failed — offline, rate-limited, unauthenticated. */
  | 'unavailable';

export interface CheckResult<T> {
  value: T;
  status: CheckStatus;
  /** The command or endpoint, verbatim: `npm audit --json`, `gh api repos/…`. */
  source: string;
  /** PRIVATE. CVE ids, package names, raw counts. Never leaves the report. */
  detail?: unknown;
  /** Why the check degraded, when `status` is not `measured`. */
  error?: string;
}

/** Provenance for the run itself — §35's "measured by X at version Y". */
export interface ReportProvenance {
  collector: string;
  collectorVersion: string;
  /** sha256 of the canonicalized collector config. Pins *how* it measured. */
  configHash: string;
  /** Unix seconds when collection started. */
  collectedAt: number;
  /** Set when scenario overrides were applied — demo data, marked as such. */
  synthetic?: boolean;
  /** Which scenario, when synthetic. */
  scenario?: string;
}

/** Identity the collector was told to measure. Validated by `normalize`. */
export interface ReportSubject {
  vendor: string;
  product: string;
  attestor: string;
  /** `owner/repo`, for the CI-input cross-checks. */
  repo: string;
  /** 40-char lowercase hex git SHA. */
  commit: string;
  /** How long the attestor declares the evidence valid, in days. */
  validDays: number;
}

export interface CollectorReport {
  _type: 'zkuat.collector-report.v1';
  provenance: ReportProvenance;
  subject: ReportSubject;
  checks: {
    artifactDigest: CheckResult<string>;
    criticals: CheckResult<number>;
    highs: CheckResult<number>;
    kev: CheckResult<number>;
    forbiddenDeps: CheckResult<number>;
    vulnDeps: CheckResult<number>;
    mfaRequired: CheckResult<boolean>;
    branchProtected: CheckResult<boolean>;
    buildProvenanceVerified: CheckResult<boolean>;
    ciGreen: CheckResult<boolean>;
    /** Percent × 100, matching `Evidence.coverage`. */
    coverage: CheckResult<number>;
  };
}

export type CheckName = keyof CollectorReport['checks'];

/** Every check that is not `measured`, for the pre-signing summary. */
export function degradedChecks(report: CollectorReport): Array<[CheckName, CheckResult<unknown>]> {
  return (Object.entries(report.checks) as Array<[CheckName, CheckResult<unknown>]>).filter(
    ([, check]) => check.status !== 'measured',
  );
}
