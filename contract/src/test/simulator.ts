/**
 * In-memory simulator for the zkuat compliance registry.
 *
 * There is no published simulator package for Compact — `@openzeppelin-compact/
 * contracts-simulator` does not exist on npm — so this threads `CircuitContext`
 * between calls by hand over `@midnight-ntwrk/compact-runtime`. That is all a
 * simulator is: construct the contract, run the constructor, and hand each
 * circuit the context the previous one returned.
 *
 * Tests get a fresh instance per case. Never share one across tests.
 */
import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  type CircuitContext,
  type ProofData,
} from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  ledger,
  type Ledger,
} from '../managed/audit_registry/contract/index.js';
import type { AuditPath, ComplianceRecord, Policy } from '../types.js';
import { emptyPrivateState, witnesses, type AuditPrivateState } from '../witnesses.js';

/**
 * The Zswap coin public key of the simulated caller. `CoinPublicKey` is a plain
 * hex string in the runtime, and nothing in this contract routes tokens, so a
 * constant serves.
 *
 * Note this is deliberately NOT used for authorization anywhere — the contract
 * derives the anchor's identity from a witness secret precisely because
 * `ownPublicKey()` is prover-supplied and therefore forgeable.
 */
const CALLER_COIN_PUBLIC_KEY = '00'.repeat(32);

export class ComplianceRegistrySimulator {
  private readonly contract: Contract<AuditPrivateState>;
  private context: CircuitContext<AuditPrivateState>;

  /** Proof data from the most recent circuit call, for transcript inspection. */
  public lastProofData: ProofData | undefined;

  /**
   * Deploys the contract. Whoever holds `anchorSecret` at construction becomes
   * the anchor operator, permanently — the field is `sealed`.
   */
  constructor(anchorSecret: Uint8Array, privateState: Partial<AuditPrivateState> = {}) {
    const initialPrivateState: AuditPrivateState = {
      ...emptyPrivateState,
      secretKey: anchorSecret,
      ...privateState,
    };

    this.contract = new Contract<AuditPrivateState>(witnesses);
    const initial = this.contract.initialState(
      createConstructorContext(initialPrivateState, CALLER_COIN_PUBLIC_KEY),
    );

    this.context = createCircuitContext(
      dummyContractAddress(),
      initial.currentZswapLocalState,
      initial.currentContractState.data,
      initial.currentPrivateState,
    );
  }

  /** Current public ledger state. */
  get ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  get privateState(): AuditPrivateState {
    return this.context.currentPrivateState;
  }

  /**
   * Swaps fields of the caller's private state, leaving the ledger untouched.
   *
   * This is how a test changes identity: give it a different `secretKey` and it
   * is a different caller against the same deployed contract.
   */
  withPrivateState(patch: Partial<AuditPrivateState>): this {
    this.context = {
      ...this.context,
      currentPrivateState: { ...this.context.currentPrivateState, ...patch },
    };
    return this;
  }

  /** Loads a vendor's proving inputs. */
  asProver(
    evidence: AuditPrivateState['evidence'],
    salt: Uint8Array,
    path: AuditPath | null,
  ): this {
    return this.withPrivateState({ evidence, salt, path });
  }

  // ─── Circuits ───────────────────────────────────────────────────────────────

  attest(leaf: Uint8Array): void {
    const result = this.contract.impureCircuits.attest(this.context, leaf);
    this.context = result.context;
    this.lastProofData = result.proofData;
  }

  registerPolicy(policyId: Uint8Array, policy: Policy): void {
    const result = this.contract.impureCircuits.registerPolicy(this.context, policyId, policy);
    this.context = result.context;
    this.lastProofData = result.proofData;
  }

  proveCompliance(
    vendorId: Uint8Array,
    productId: Uint8Array,
    artifactDigest: Uint8Array,
    policyId: Uint8Array,
  ): boolean {
    const result = this.contract.impureCircuits.proveCompliance(
      this.context,
      vendorId,
      productId,
      artifactDigest,
      policyId,
    );
    this.context = result.context;
    this.lastProofData = result.proofData;
    return result.result;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Inclusion path for an attested leaf, as of right now.
   *
   * `findPathForLeaf` is an O(n) scan and returns undefined when the leaf is
   * absent; throwing here turns that into a clear test failure rather than a
   * cryptic circuit error two calls later. In production prefer
   * `pathForLeaf(index, leaf)` with the index recorded in the anchor's receipt.
   */
  pathFor(leaf: Uint8Array): AuditPath {
    const path = this.ledger.attestations.findPathForLeaf(leaf);
    if (path === undefined) {
      throw new Error(`leaf ${Buffer.from(leaf).toString('hex')} is not in the attestations tree`);
    }
    return path;
  }

  /** The buyer's primary query: current status for an artifact under a policy. */
  record(key: Uint8Array): ComplianceRecord | undefined {
    const records = this.ledger.records;
    return records.member(key) ? records.lookup(key) : undefined;
  }

  /** Every current record. Exercises the Map iterator the buyer dashboard needs. */
  allRecords(): ComplianceRecord[] {
    return [...this.ledger.records].map(([, record]) => record);
  }

  /** The append-only timeline, newest first (`pushFront`). */
  timeline(): ComplianceRecord[] {
    return [...this.ledger.history];
  }

  /** Collects every distinct 32-byte value reachable from an arbitrary structure. */
  private static collectHashes(root: unknown): Set<string> {
    const found = new Set<string>();
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        if (/^[0-9a-f]{64}$/.test(node)) found.add(node);
        return;
      }
      if (node instanceof Uint8Array) {
        if (node.length === 32) found.add(Buffer.from(node).toString('hex'));
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (node && typeof node === 'object') {
        for (const child of Object.values(node)) walk(child);
      }
    };
    walk(root);
    return found;
  }

  /**
   * Every distinct 32-byte value appearing anywhere in the last call's proof
   * data — inputs, outputs, and the public transcript.
   *
   * Useful, but **not sufficient on its own** as a privacy oracle: see
   * `publicStateHashes`.
   */
  transcriptHashes(): Set<string> {
    const pd = this.lastProofData;
    return ComplianceRegistrySimulator.collectHashes([
      pd?.input,
      pd?.output,
      pd?.publicTranscript,
    ]);
  }

  /**
   * Every distinct 32-byte value readable from public ledger state.
   *
   * **This is the real privacy boundary, and it is strictly larger than the
   * transcript.** A value written into a ledger struct is readable by anyone
   * afterwards, but does not necessarily appear anywhere in `proofData` — not in
   * `input`, `output`, `publicTranscript`, or even `privateTranscriptOutputs`.
   * Verified by deliberately leaking a private field into a `ComplianceRecord`:
   * the transcript looked clean while the value sat in plain sight in `records`.
   *
   * So a privacy test that only inspects the transcript can pass while private
   * data is being published to the chain. Check both.
   */
  publicStateHashes(): Set<string> {
    return ComplianceRegistrySimulator.collectHashes([
      this.allRecords(),
      this.timeline(),
      [...this.ledger.policies].map(([key, policy]) => [key, policy]),
      [...this.ledger.claimed],
      this.ledger.anchor,
    ]);
  }

  /**
   * The public transcript of the last circuit call, serialized for substring
   * search. Complements `transcriptHashes` for non-32-byte values.
   */
  publicTranscriptJson(): string {
    return JSON.stringify(this.lastProofData?.publicTranscript ?? [], (_key, value) =>
      typeof value === 'bigint'
        ? value.toString()
        : value instanceof Uint8Array
          ? Buffer.from(value).toString('hex')
          : value,
    );
  }
}
