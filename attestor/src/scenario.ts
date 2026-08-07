/**
 * Demo scenarios — synthetic collector reports for the fixture bundles.
 *
 * These exist because our own repository honestly measures zero criticals and
 * zero highs, which is correct and useless for a demo whose strongest beats are
 * *"the same evidence passes one policy and fails another"* (§17) and *"the
 * protocol returns false and records it"* (beat 6).
 *
 * So the scenarios are **stated deviations from a real report**, applied as
 * patches over named check values, and the resulting report carries
 * `provenance.synthetic: true` and the scenario name. That marker travels all
 * the way into the signed statement, so a fixture bundle can never be mistaken
 * for a measurement — not by a reader, not by a test, not by us at 04:00.
 *
 * Overrides are keyed on **check names**, the flat vocabulary the collector
 * report uses, so the same scenario file patches a synthetic report today and a
 * real collector report once `@zkuat/collector` is wired in.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

import { canonicalize } from './canonical.js';
import type { CheckName, CheckResult, CollectorReport, ReportSubject } from './report.js';

export interface Scenario {
  name: string;
  /** One line for the fixture README and the demo cue card. */
  title: string;
  /** Why this scenario exists — which demo beat or test it serves. */
  why?: string;
  /** Deterministic 32-byte salt, hex. Fixed so committed leaves are stable. */
  salt: string;
  /** Check-name → value. Everything else comes from the base report. */
  overrides?: Partial<Record<CheckName, number | boolean | string>>;
  /** Subject overrides, for a scenario about a different artifact or product. */
  subject?: Partial<ReportSubject>;
}

export interface ScenarioBase {
  subject: ReportSubject;
  /** Baseline check values, before any scenario override. */
  checks: Record<CheckName, number | boolean | string>;
  collector: { name: string; version: string };
}

function measured<T>(value: T, source: string): CheckResult<T> {
  return { value, status: 'measured', source };
}

/**
 * Build a synthetic report from a base plus a scenario.
 *
 * Every check is marked `measured` with a source that says where the number
 * really came from. Marking them `stubbed` would be more literal but would make
 * `degradationWarning` shout on every fixture, and a warning that always fires
 * is a warning nobody reads. `provenance.synthetic` is the honest signal, and
 * it is one field rather than eleven.
 */
export function synthesizeReport(
  base: ScenarioBase,
  scenario: Scenario,
  collectedAt: number,
): CollectorReport {
  const values = { ...base.checks, ...(scenario.overrides ?? {}) };
  const source = `demo scenario "${scenario.name}" — synthetic, not measured`;

  const subject: ReportSubject = { ...base.subject, ...scenario.subject };

  const checks = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, measured(value, source)]),
  ) as CollectorReport['checks'];

  return {
    _type: 'zkuat.collector-report.v1',
    provenance: {
      collector: base.collector.name,
      collectorVersion: base.collector.version,
      // The config hash pins *how* the facts were established. For a scenario
      // that is the scenario definition itself, so a silently edited fixture
      // shows up as a different hash in the signed statement.
      configHash: configHashOf({ base, scenario }),
      collectedAt,
      synthetic: true,
      scenario: scenario.name,
    },
    subject,
    checks,
  };
}

/**
 * Apply a scenario's overrides to a **real** collector report.
 *
 * The same scenario file that synthesizes a report from `_base.json` also
 * patches one that `zkuat-collect` actually measured, so a fixture can be built
 * on genuine repository facts with only the demo-relevant numbers restated.
 * Patched checks are relabelled with the scenario as their source, and the
 * report is marked `synthetic`, so which facts were measured and which were
 * staged stays legible in the signed statement.
 */
export function patchReport(report: CollectorReport, scenario: Scenario): CollectorReport {
  const overrides = scenario.overrides ?? {};
  // Indexed as a loose record: `checks[name]` over the CheckName union collapses
  // to `never`, since CheckResult<string> and CheckResult<number> have no common
  // assignable type. The shape is restored on the way out.
  const checks = { ...report.checks } as Record<string, CheckResult<unknown>>;

  for (const [name, value] of Object.entries(overrides)) {
    const original = checks[name];
    checks[name] = {
      value,
      status: 'measured',
      source: `demo scenario "${scenario.name}" — overrides ${original?.source ?? 'unmeasured'}`,
      detail: { overridden: true, measuredValue: original?.value },
    };
  }

  return {
    ...report,
    provenance: {
      ...report.provenance,
      configHash: configHashOf({ base: report.provenance.configHash, scenario }),
      synthetic: true,
      scenario: scenario.name,
    },
    subject: { ...report.subject, ...scenario.subject },
    checks: checks as unknown as CollectorReport['checks'],
  };
}

/** sha256 of a canonicalized config or scenario. Pins the measurement recipe. */
export function configHashOf(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

export function loadScenarioBase(dir: string): ScenarioBase {
  return JSON.parse(fs.readFileSync(path.join(dir, '_base.json'), 'utf8')) as ScenarioBase;
}

/** Every `<name>.json` in the directory except the `_base.json` baseline. */
export function loadScenarios(dir: string): Scenario[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Scenario);
}
