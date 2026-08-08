/**
 * Strictly validates the `.github/workflows/generate-evidence.yml` artifact and
 * maps it into the private Compact `Evidence` input. There is no envelope,
 * signature, evidence key, or intermediary report in this path.
 */
import { EVIDENCE_SCHEMA, type CanonicalEvidence } from '@zkuat/contract';

const WORKFLOW = '.github/workflows/generate-evidence.yml';
const DEFAULT_VALID_DAYS = 29;

export interface GithubEvidenceDocument {
  repository: string;
  commit: string;
  artifactDigest: string;
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
  checks: {
    lint: GithubCommandCheck;
    build: GithubCommandCheck;
  };
}

export interface GithubCommandCheck {
  command: string;
  passed: boolean;
}

export interface GithubRunContext {
  id?: number;
  url?: string;
  conclusion?: string | null;
  requestId?: string;
}

export interface GithubContractEvidenceOptions {
  run?: GithubRunContext;
  receivedAt?: number;
  validDays?: number;
}

const INTEGER_KEYS = ['critical', 'high', 'moderate', 'low', 'total'] as const;

function requireCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`zkuat: evidence.json ${field} must be a non-negative integer, got ${value}`);
  }
  return value;
}

function requireCommandCheck(
  value: unknown,
  field: string,
  expectedCommand: string,
): GithubCommandCheck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`zkuat: evidence.json ${field} must be an object`);
  }
  const check = value as Record<string, unknown>;
  if (check.command !== expectedCommand) {
    throw new Error(
      `zkuat: evidence.json ${field}.command must be ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(check.command)}`,
    );
  }
  if (typeof check.passed !== 'boolean') {
    throw new Error(`zkuat: evidence.json ${field}.passed must be a boolean`);
  }
  return { command: expectedCommand, passed: check.passed };
}

/** Validate the untrusted, network-fetched workflow artifact. */
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

  const checks = doc.checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    throw new Error('zkuat: evidence.json is missing a checks object');
  }
  const commandChecks = checks as Record<string, unknown>;

  return {
    repository,
    commit: commit.toLowerCase(),
    artifactDigest: artifactDigest.trim().toLowerCase(),
    vulnerabilities: Object.fromEntries(
      INTEGER_KEYS.map((key) => [key, requireCount(counts[key], `vulnerabilities.${key}`)]),
    ) as GithubEvidenceDocument['vulnerabilities'],
    checks: {
      lint: requireCommandCheck(commandChecks.lint, 'checks.lint', 'npm run lint'),
      build: requireCommandCheck(commandChecks.build, 'checks.build', 'npm run build'),
    },
  };
}

/** Map a validated workflow artifact directly into private contract input. */
export function canonicalEvidenceFromGithub(
  input: unknown,
  options: GithubContractEvidenceOptions = {},
): CanonicalEvidence {
  const doc = parseGithubEvidence(input);
  if (options.run && options.run.conclusion !== 'success') {
    throw new Error(`zkuat: GitHub Actions run ${options.run.id ?? 'unknown'} did not succeed`);
  }
  const [vendor, product] = doc.repository.toLowerCase().split('/') as [string, string];
  const generatedAt = options.receivedAt ?? Math.floor(Date.now() / 1000);
  const validDays = options.validDays ?? DEFAULT_VALID_DAYS;
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 30) {
    throw new Error('zkuat: validDays must be an integer between 1 and 30');
  }

  return {
    schema: EVIDENCE_SCHEMA,
    vendor,
    product,
    artifactDigest: doc.artifactDigest,
    commit: doc.commit,
    generatedAt,
    validUntil: generatedAt + validDays * 24 * 60 * 60,
    vulns: {
      criticals: doc.vulnerabilities.critical,
      highs: doc.vulnerabilities.high,
      vulnerableDependencies: doc.vulnerabilities.total,
    },
    checks: {
      lintPassed: doc.checks.lint.passed,
      buildPassed: doc.checks.build.passed,
    },
  };
}
