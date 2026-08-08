import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PolicySlug, PreparedEvidence, RuntimeJobInput } from './evidence.js';
import { prepareEvidence } from './evidence.js';
import type { AnchorReceipt, ProofReceipt, VerifiedProof } from './chain/client.js';
import { atomicJsonWrite, ensurePrivateDir, readJson } from './storage.js';

export type JobStatus =
  | 'queued'
  | 'validating-source'
  | 'persisting-private-evidence'
  | 'starting-proof-server'
  | 'syncing-wallet'
  | 'checking-anchor-identity'
  | 'anchoring'
  | 'confirming-anchor'
  | 'retrieving-merkle-path'
  | 'proving-compliance'
  | 'submitting'
  | 'verifying-on-chain'
  | 'verified'
  | 'rejected'
  | 'failed'
  | 'cancelled';

const TERMINAL = new Set<JobStatus>(['verified', 'rejected', 'failed', 'cancelled']);

export interface RuntimeJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  policySlug: PolicySlug;
  prepared: PreparedEvidence;
  anchor?: AnchorReceipt;
  proof?: ProofReceipt;
  verification?: VerifiedProof;
  cancelRequested?: boolean;
  error?: string;
}

export interface PublicJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  policySlug: PolicySlug;
  source: {
    repository: string;
    runId: number;
    runUrl: string;
    artifactDigest: string;
    commit: string;
  };
  anchor?: AnchorReceipt;
  proof?: ProofReceipt;
  verification?: VerifiedProof;
  error?: string;
}

export interface JobChain {
  start(): Promise<void>;
  hasAnchoredLeaf(prepared: PreparedEvidence, preferredIndex?: number): Promise<boolean>;
  anchor(prepared: PreparedEvidence): Promise<AnchorReceipt>;
  prove(
    prepared: PreparedEvidence,
    policySlug: PolicySlug,
    preferredIndex?: number,
  ): Promise<ProofReceipt>;
  verifyProof(
    prepared: PreparedEvidence,
    policySlug: PolicySlug,
    proof: ProofReceipt,
  ): Promise<VerifiedProof>;
}

export interface ManagedProofServer {
  start(): Promise<void>;
}

class JobStore {
  private readonly dir: string;

  constructor(storageDir: string) {
    this.dir = path.join(storageDir, 'jobs');
    ensurePrivateDir(this.dir);
  }

  private file(id: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('zkuat: invalid job id');
    return path.join(this.dir, `${id}.json`);
  }

  save(job: RuntimeJob): void {
    atomicJsonWrite(this.file(job.id), job);
  }

  get(id: string): RuntimeJob | null {
    return readJson<RuntimeJob>(this.file(id));
  }

  list(): RuntimeJob[] {
    return fs
      .readdirSync(this.dir)
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .map((name) => readJson<RuntimeJob>(path.join(this.dir, name)))
      .filter((job): job is RuntimeJob => job !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function publicJob(job: RuntimeJob): PublicJob {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    policySlug: job.policySlug,
    source: {
      repository: job.prepared.github.repository,
      runId: job.prepared.github.runId,
      runUrl: job.prepared.github.runUrl,
      artifactDigest: job.prepared.evidence.artifactDigest,
      commit: job.prepared.evidence.commit,
    },
    ...(job.anchor ? { anchor: job.anchor } : {}),
    ...(job.proof ? { proof: job.proof } : {}),
    ...(job.verification ? { verification: job.verification } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

export class JobManager extends EventEmitter {
  private readonly store: JobStore;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    storageDir: string,
    private readonly proofServer: ManagedProofServer,
    private readonly chain: JobChain,
  ) {
    super();
    this.store = new JobStore(storageDir);
  }

  create(input: RuntimeJobInput): PublicJob {
    const now = new Date();
    const prepared = prepareEvidence(input, Math.floor(now.getTime() / 1000));
    const job: RuntimeJob = {
      id: randomUUID(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: 'queued',
      policySlug: input.policySlug,
      prepared,
    };
    this.store.save(job);
    this.enqueue(job.id);
    return publicJob(job);
  }

  recover(): void {
    for (const job of this.store.list()) {
      if (!TERMINAL.has(job.status)) this.enqueue(job.id);
    }
  }

  get(id: string): PublicJob | null {
    const job = this.store.get(id);
    return job ? publicJob(job) : null;
  }

  list(): PublicJob[] {
    return this.store.list().map(publicJob);
  }

  cancel(id: string): PublicJob | null {
    const job = this.store.get(id);
    if (!job) return null;
    if (!TERMINAL.has(job.status)) {
      job.cancelRequested = true;
      this.save(job);
    }
    return publicJob(job);
  }

  private enqueue(id: string): void {
    this.tail = this.tail.then(() => this.run(id)).catch(() => undefined);
  }

  private save(job: RuntimeJob): void {
    job.updatedAt = new Date().toISOString();
    this.store.save(job);
    this.emit(`job:${job.id}`, publicJob(job));
    this.emit('job', publicJob(job));
  }

  private transition(job: RuntimeJob, status: JobStatus): void {
    job.status = status;
    this.save(job);
  }

  private cancelled(job: RuntimeJob): boolean {
    const latest = this.store.get(job.id);
    if (!latest?.cancelRequested) return false;
    latest.status = 'cancelled';
    this.save(latest);
    return true;
  }

  private async run(id: string): Promise<void> {
    const job = this.store.get(id);
    if (!job || TERMINAL.has(job.status) || this.cancelled(job)) return;
    try {
      this.transition(job, 'validating-source');
      this.transition(job, 'persisting-private-evidence');
      if (this.cancelled(job)) return;

      this.transition(job, 'starting-proof-server');
      await this.proofServer.start();
      if (this.cancelled(job)) return;

      this.transition(job, 'syncing-wallet');
      await this.chain.start();
      this.transition(job, 'checking-anchor-identity');
      if (this.cancelled(job)) return;

      if (!job.anchor) {
        this.transition(job, 'anchoring');
        job.anchor = await this.chain.anchor(job.prepared);
        this.save(job);
      }
      this.transition(job, 'confirming-anchor');
      if (!(await this.chain.hasAnchoredLeaf(job.prepared, job.anchor.leafIndex))) {
        throw new Error('zkuat: submitted anchor transaction is not reflected in contract state');
      }
      if (this.cancelled(job)) return;

      if (!job.proof) {
        this.transition(job, 'retrieving-merkle-path');
        this.transition(job, 'proving-compliance');
        job.proof = await this.chain.prove(job.prepared, job.policySlug, job.anchor.leafIndex);
        this.transition(job, 'submitting');
        this.save(job);
      }
      if (this.cancelled(job)) return;

      this.transition(job, 'verifying-on-chain');
      job.verification = await this.chain.verifyProof(job.prepared, job.policySlug, job.proof);
      this.transition(job, job.verification.record.compliant ? 'verified' : 'rejected');
    } catch (error: unknown) {
      job.error = error instanceof Error ? error.message : String(error);
      this.transition(job, 'failed');
    }
  }
}
