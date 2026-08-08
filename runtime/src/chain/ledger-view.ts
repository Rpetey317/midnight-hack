/**
 * The buyer's view: the complete public state of the audit registry, read
 * straight from the indexer.
 *
 * This module deliberately touches no wallet, no proof server, and no private
 * state. It needs an indexer URL and a contract address and nothing else, which
 * is the point — everything printed here is readable by anyone, and everything
 * absent from it is absent from the chain.
 *
 * `runtime/src/chain/client.ts` performs the same `queryContractState` read as
 * part of proving; this is the same data with no credentials attached.
 */
import {
  BUNDLED_POLICY_SLUGS,
  MAX_U32,
  ledger,
  policyId as policyIdOf,
  productId as productIdOf,
  vendorId as vendorIdOf,
  type ComplianceRecord,
  type Ledger,
  type Policy,
} from '@zkuat/contract';

import type { RuntimeConfig } from '../config.js';
import { createPublicDataProvider } from './indexer.js';

/** Every `Evidence` field committed by `leafOf` that no ledger entry carries. */
export const PRIVATE_ONLY_EVIDENCE_FIELDS = [
  'commitId',
  'criticals',
  'highs',
  'totalVulnerabilities',
  'lintPassed',
  'buildPassed',
] as const;

/**
 * `policyId` is `stringIdOf(slug)` and therefore not invertible. The four
 * bundled slugs are known, so their ids are re-derived once and matched by
 * value; anything else prints as raw hex rather than guessing.
 */
const POLICY_SLUG_BY_ID = new Map<string, string>(
  BUNDLED_POLICY_SLUGS.map((slug) => [hex(policyIdOf(slug)), slug]),
);

function hex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function short(value: Uint8Array): string {
  const full = hex(value);
  return `${full.slice(0, 16)}…`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function stamp(seconds: bigint): string {
  return `${seconds}  ${new Date(Number(seconds) * 1000).toISOString()}`;
}

function threshold(value: bigint): string {
  return value === MAX_U32 ? 'unlimited' : String(value);
}

function duration(seconds: bigint): string {
  const days = Number(seconds) / 86_400;
  return Number.isInteger(days) ? `${days}d` : `${seconds}s`;
}

export interface LedgerViewOptions {
  /** `owner/name`; labels records whose hashed vendor/product ids match. */
  repository?: string;
}

export interface PublicLedger {
  contractAddress: string;
  network: string;
  networkId: string;
  indexer: string;
  state: Ledger;
}

export async function readPublicLedger(config: RuntimeConfig): Promise<PublicLedger> {
  if (!config.contractAddress) throw new Error('zkuat: contract address is not configured');
  const provider = createPublicDataProvider(config.indexer, config.indexerWS);
  const state = await provider.queryContractState(config.contractAddress);
  if (!state) throw new Error('zkuat: configured contract was not found by the indexer');
  return {
    contractAddress: config.contractAddress,
    network: config.network,
    networkId: config.networkId,
    indexer: config.indexer,
    state: ledger(state.data),
  };
}

function policyLabel(id: Uint8Array): string {
  return POLICY_SLUG_BY_ID.get(hex(id)) ?? `${short(id)} (unrecognised policy)`;
}

function formatPolicy(id: Uint8Array, policy: Policy): string[] {
  return [
    `  ${policyLabel(id)}  v${policy.version}`,
    `      id      ${hex(id)}`,
    `      issuer  ${short(policy.issuer)}`,
    `      limits  criticals ${threshold(policy.maxCriticals)} · ` +
      `highs ${threshold(policy.maxHighs)} · total ${threshold(policy.maxTotalVulnerabilities)}`,
    `      checks  lint ${policy.requireLint ? 'required' : 'optional'} · ` +
      `build ${policy.requireBuild ? 'required' : 'optional'}`,
    `      window  at most ${duration(policy.maxAgeSeconds)}`,
  ];
}

function formatRecord(
  index: number,
  key: Uint8Array,
  record: ComplianceRecord,
  identity: { vendorId: Uint8Array; productId: Uint8Array; repository: string } | null,
): string[] {
  const matches =
    identity !== null &&
    sameBytes(record.vendorId, identity.vendorId) &&
    sameBytes(record.productId, identity.productId);
  const label = matches ? `  (${identity.repository})` : '';

  return [
    `  [${index}] recordKey ${hex(key)}${label}`,
    `      vendorId        ${hex(record.vendorId)}`,
    `      productId       ${hex(record.productId)}`,
    `      artifactDigest  sha256:${hex(record.artifactDigest)}`,
    `      policy          ${policyLabel(record.policyId)}  v${record.policyVersion}`,
    `      provenAt        ${stamp(record.provenAt)}`,
    `      validUntil      ${stamp(record.validUntil)}`,
    `      compliant       ${record.compliant ? 'true' : 'false'}`,
  ];
}

export function formatPublicLedger(
  view: PublicLedger,
  options: LedgerViewOptions = {},
): string {
  const { state } = view;
  const lines: string[] = [];

  let identity: { vendorId: Uint8Array; productId: Uint8Array; repository: string } | null = null;
  if (options.repository) {
    const [owner, name, extra] = options.repository.toLowerCase().split('/');
    if (!owner || !name || extra) {
      throw new Error(`zkuat: repository must be "owner/name", got "${options.repository}"`);
    }
    // The same derivation the circuit binds the record to: a buyer identifies a
    // vendor's product by recomputing the hash, never by reading a name back.
    identity = {
      vendorId: vendorIdOf(owner),
      productId: productIdOf(name),
      repository: `${owner}/${name}`,
    };
  }

  lines.push(
    `zkuat public ledger — ${view.network} (network id ${view.networkId})`,
    `contract  ${view.contractAddress}`,
    `indexer   ${view.indexer}`,
    '',
  );

  if (identity) {
    lines.push(
      `looking up ${identity.repository}`,
      `  vendorId   ${hex(identity.vendorId)}`,
      `  productId  ${hex(identity.productId)}`,
      '',
    );
  }

  lines.push(
    'registry',
    `  anchor identity     ${hex(state.anchor)}`,
    `  attested leaves     ${state.attestations.firstFree()}`,
    `  nullifiers claimed  ${state.claimed.size()}`,
    `  history entries     ${state.history.length()}`,
    '',
  );

  const policies = [...state.policies];
  lines.push(`policies (${policies.length})`);
  for (const [id, policy] of policies) lines.push(...formatPolicy(id, policy));
  lines.push('');

  const records = [...state.records];
  lines.push(`compliance records (${records.length})`);
  if (records.length === 0) {
    lines.push('  none — no artifact has been proven against a policy yet');
  } else {
    records.forEach(([key, record], index) => {
      lines.push(...formatRecord(index + 1, key, record, identity));
    });
  }
  lines.push('');

  lines.push(
    'private inputs to proveCompliance, none of which appear above:',
    `  Evidence.{${PRIVATE_ONLY_EVIDENCE_FIELDS.join(', ')}}`,
    '  the commitment salt, and every sibling of the Merkle inclusion path',
    '',
    'attested leaves are counted, not listed: attestations.insert() hashes each',
    'leaf, so the evidence commitments are not on the public transcript either.',
  );

  return lines.join('\n');
}
