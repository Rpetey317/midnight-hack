/**
 * The buyer's view of one artifact.
 *
 * Read-only: one GraphQL query against the indexer, no wallet, no sync, no
 * transaction, back in about a second. This is what an outside observer can
 * learn — a verdict, a policy, and two dates. No vulnerability counts, no
 * dependency facts, no repository configuration.
 *
 * `--artifact` alone does not determine a record: the key is
 * `recordKeyOf(artifactDigest, policyId)`, so an artifact has one record *per
 * policy*. Printing a row per registered policy is what makes the two-policy
 * contrast visible — the same evidence, one PASS and one FAIL.
 */
import { deployment, queryLedger } from '@zkuat/anchor';
import { parseArgs, required, str } from '@zkuat/attestor/src/cli/args.js';

import { encodeArtifactDigest, recordKey } from '../../../contract/src/encoding.js';
import type { ComplianceRecord } from '../../../contract/src/types.js';

export const STATUS_USAGE = `
Read the public compliance record for one artifact.

  zkuat status --artifact <digest> [--policy <slug>]

  --artifact <digest>  64-hex, optional sha256: prefix
  --policy <slug>      only this policy; default is every registered one

No wallet and no proving — this is the buyer's query, and it is the whole
public surface. Exit 0 if any policy is compliant, 1 otherwise.
`;

/** COMPLIANT / NOT COMPLIANT / EXPIRED — three of the buyer's four states. */
function status(record: ComplianceRecord): string {
  if (!record.compliant) return '✗ NOT COMPLIANT';
  return Number(record.validUntil) * 1000 < Date.now() ? '⚠ EXPIRED' : '✓ COMPLIANT';
}

const day = (unix: bigint) => new Date(Number(unix) * 1000).toISOString().slice(0, 10);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

export async function runStatus(argv: string[]): Promise<never | void> {
  const flags = parseArgs(argv);
  if (flags.has('help')) {
    console.log(STATUS_USAGE);
    return;
  }

  const artifact = required(flags, 'artifact', STATUS_USAGE);
  encodeArtifactDigest(artifact); // reject a malformed digest before the query
  const only = str(flags, 'policy', '');

  const { contractAddress, policies } = deployment();
  const slugs = Object.keys(policies).filter((slug) => !only || slug === only);
  if (slugs.length === 0) {
    throw new Error(`no policy "${only}" is registered — known: ${Object.keys(policies).join(', ')}`);
  }

  const l = await queryLedger(contractAddress);

  console.log(`\n  artifact  ${artifact.replace(/^sha256:/, '')}`);
  console.log(`  contract  ${contractAddress}\n`);

  let anyCompliant = false;
  for (const slug of slugs) {
    const key = recordKey(artifact, slug);
    if (!l.records.member(key)) {
      // The fourth state. Absence is not failure — nobody has made a claim.
      console.log(`  ${slug.padEnd(15)} — NO CURRENT PROOF`);
      continue;
    }
    const record = l.records.lookup(key);
    const verdict = status(record);
    anyCompliant ||= verdict === '✓ COMPLIANT';
    console.log(
      `  ${slug.padEnd(15)} ${verdict.padEnd(16)} evidence ${day(record.provenAt)}  ` +
        `valid until ${day(record.validUntil)}  (policy v${record.policyVersion})`,
    );
  }

  // The timeline for this artifact, newest first — the compliance history a
  // buyer uses to tell "still compliant" from "was compliant once".
  const digest = hex(encodeArtifactDigest(artifact));
  const mine = [...l.history].filter((r) => hex(r.artifactDigest) === digest);
  if (mine.length > 0) {
    console.log(`\n  ─── Timeline (${mine.length}, newest first) ───\n`);
    let n = 0;
    for (const r of mine) {
      const slug =
        Object.entries(policies).find(([, id]) => id === hex(r.policyId))?.[0] ??
        hex(r.policyId).slice(0, 12);
      console.log(
        `  ${String(++n).padStart(2)}. ${day(r.provenAt)}  ${slug.padEnd(15)} ` +
          `${r.compliant ? 'PASS' : 'FAIL'}`,
      );
    }
  }

  console.log('\n  Note what is NOT here: no vulnerability counts, no dependency facts,');
  console.log('  no repository configuration, no commit. Those never left the vendor.\n');

  process.exit(anyCompliant ? 0 : 1);
}
