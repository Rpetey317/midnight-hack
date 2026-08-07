/**
 * Collector configuration.
 *
 * The config is hashed into `provenance.configHash`, which travels into the
 * signed statement. `../../docs/02-threat-model.md` gap 4 — *"the protocol is
 * agnostic to check quality; a vendor could configure a scanner with every rule
 * disabled and honestly attest zero findings"* — asks for exactly this, so a
 * compliance record can mean "ran collector v0.1.0 with config hash 0xabc…"
 * rather than something absolute.
 *
 * The hash covers the config as written, `stubs` included. A run that stubbed
 * eight of eleven checks therefore hashes differently from one that measured
 * them, which is the property that makes the pin worth having.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { canonicalize } from '@zkuat/attestor';
import { createHash } from 'node:crypto';

export interface CollectorConfig {
  /** Vendor slug — hashed into `Evidence.vendorId`. Max 64 UTF-8 bytes. */
  vendor: string;
  /** Product slug — hashed into `Evidence.productId`. */
  product: string;
  /** Attestor slug — must match the signing key's identity. */
  attestor: string;
  /** `owner/repo`, for the `gh api` checks. */
  repo: string;

  /** Project root to scan. Relative paths resolve against the config file. */
  projectDir: string;
  /** The built artifact whose sha256 becomes `artifactDigest`. Mandatory (§10). */
  artifactPath: string;
  /** Git ref to measure. Defaults to the project's HEAD. */
  commit?: string;
  /** How long the attestor declares this evidence valid. Policy max is 30. */
  validDays: number;

  /**
   * The buyer's prohibited-package list, for `forbiddenDeps` (§16).
   *
   * A demo input by design — keep it small and visible. Entries are exact
   * package names; `name@range` pins a version range too.
   */
  forbiddenPackages: string[];

  /** Treat a commit with no CI checks at all as green. Default false. */
  treatNoChecksAsGreen?: boolean;

  /**
   * Values for facts this environment cannot measure.
   *
   * Used only when the corresponding check reports `stubbed` or `unavailable`,
   * and the report says which. A personal GitHub repo has no organisation, so
   * `mfaRequired` genuinely has no source — that is a stub, not a failure, and
   * the honest thing is to label it.
   */
  stubs: {
    criticals?: number;
    highs?: number;
    kev?: number;
    forbiddenDeps?: number;
    vulnDeps?: number;
    mfaRequired?: boolean;
    branchProtected?: boolean;
    buildProvenanceVerified?: boolean;
    ciGreen?: boolean;
    /** Percent × 100. §18: do not build a coverage pipeline for this. */
    coverage?: number;
  };
}

const DEFAULTS = {
  validDays: 29,
  forbiddenPackages: [] as string[],
  treatNoChecksAsGreen: false,
  stubs: {},
};

export function loadConfig(file: string): { config: CollectorConfig; configHash: string } {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CollectorConfig> &
    Record<string, unknown>;

  // Comment keys are for humans and must not perturb the hash.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith('_')),
  ) as Partial<CollectorConfig>;

  const config: CollectorConfig = { ...DEFAULTS, ...cleaned } as CollectorConfig;

  for (const field of ['vendor', 'product', 'attestor', 'repo', 'artifactPath'] as const) {
    if (!config[field]) throw new Error(`zkuat: config is missing required field "${field}"`);
  }
  if (!/^[^/]+\/[^/]+$/.test(config.repo)) {
    throw new Error(`zkuat: config.repo must be "owner/repo", got "${config.repo}"`);
  }

  // Relative paths resolve against the config file, not the cwd, so the same
  // config works from anywhere.
  const base = path.dirname(path.resolve(file));
  config.projectDir = path.resolve(base, config.projectDir ?? '.');
  config.artifactPath = path.resolve(base, config.artifactPath);

  return { config, configHash: hashConfig(cleaned) };
}

/**
 * sha256 of the canonicalized config *as written*.
 *
 * Deliberately hashes the pre-resolution form: absolute paths differ between a
 * laptop and a CI runner, and a config hash that changes with the checkout
 * directory pins nothing.
 */
export function hashConfig(config: unknown): string {
  return createHash('sha256').update(canonicalize(config), 'utf8').digest('hex');
}
