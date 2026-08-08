import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { JobManager, type JobChain, type PublicJob } from '../src/jobs.js';
import type { RuntimeJobInput } from '../src/evidence.js';

const requestId = '12345678-1234-1234-1234-123456789abc';
const input: RuntimeJobInput = {
  evidence: {
    repository: 'acme/payment-engine',
    commit: 'ab'.repeat(20),
    artifactDigest: `sha256:${'cd'.repeat(32)}`,
    vulnerabilities: { critical: 0, high: 2, moderate: 1, low: 0, total: 3 },
    checks: {
      lint: { command: 'npm run lint', passed: true },
      build: { command: 'npm run build', passed: true },
    },
  },
  requestId,
  run: { id: 42, url: 'https://github.com/acme/payment-engine/actions/runs/42', status: 'completed', conclusion: 'success' },
  artifact: { id: 9, name: `zkuat-evidence-${requestId}` },
  policySlug: 'npm-ci-baseline-v1',
};

function waitForTerminal(manager: JobManager, id: string): Promise<PublicJob> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('job timeout')), 2_000);
    const inspect = (job: PublicJob) => {
      if (!['verified', 'rejected', 'failed', 'cancelled'].includes(job.status)) return;
      clearTimeout(timeout);
      manager.off(`job:${id}`, inspect);
      resolve(job);
    };
    manager.on(`job:${id}`, inspect);
    const current = manager.get(id);
    if (current) inspect(current);
  });
}

describe('JobManager', () => {
  it('runs anchor, proof, and read-only verification in order', async () => {
    const calls: string[] = [];
    const chain: JobChain = {
      async start() { calls.push('start'); },
      async anchor() { calls.push('anchor'); return { txId: 'anchor-tx', leafIndex: 4 }; },
      async hasAnchoredLeaf() { calls.push('confirm-anchor'); return true; },
      async prove() { calls.push('prove'); return { txId: 'proof-tx', verdict: true }; },
      async verifyProof(_prepared, _policy, proof) {
        calls.push('verify');
        return {
          ...proof,
          record: { policyVersion: '1', provenAt: '1', validUntil: '2', compliant: true },
        };
      },
    };
    const proofServer = { async start() { calls.push('proof-server'); } };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkuat-jobs-'));
    const manager = new JobManager(dir, proofServer, chain);
    const created = manager.create(input);
    const final = await waitForTerminal(manager, created.id);

    expect(final.status).toBe('verified');
    expect(final.anchor?.txId).toBe('anchor-tx');
    expect(final.proof?.txId).toBe('proof-tx');
    expect(calls).toEqual(['proof-server', 'start', 'anchor', 'confirm-anchor', 'prove', 'verify']);
  });

  it('persists failures without exposing private evidence in the public job', async () => {
    const chain: JobChain = {
      async start() { throw new Error('wallet unavailable'); },
      async anchor() { throw new Error('not called'); },
      async hasAnchoredLeaf() { return false; },
      async prove() { throw new Error('not called'); },
      async verifyProof() { throw new Error('not called'); },
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkuat-jobs-'));
    const manager = new JobManager(dir, { async start() {} }, chain);
    const created = manager.create(input);
    const final = await waitForTerminal(manager, created.id);
    expect(final.status).toBe('failed');
    expect(final.stoppedAt).toBe('syncing-wallet');
    expect(final.error).toContain('wallet unavailable');
    expect(final).not.toHaveProperty('prepared');
  });
});
