import { randomBytes } from 'node:crypto';

import {
  encodeEvidence,
  pureCircuits,
  type CanonicalEvidence,
} from '@zkuat/contract';
import { canonicalEvidenceFromGithub, parseGithubEvidence } from './github-evidence.js';

export const POLICY_SLUGS = ['bank-v1', 'enterprise-v1'] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export interface RuntimeJobInput {
  evidence: unknown;
  requestId: string;
  run: {
    id: number;
    url: string;
    status: string;
    conclusion: string | null;
  };
  artifact: {
    id: number;
    name: string;
  };
  policySlug: PolicySlug;
}

export interface PreparedEvidence {
  schema: 'zkuat.runtime-evidence.v1';
  github: {
    repository: string;
    runId: number;
    runUrl: string;
    requestId: string;
    artifactId: number;
    artifactName: string;
  };
  evidence: CanonicalEvidence;
  saltHex: string;
  leafHex: string;
}

function isPolicySlug(value: unknown): value is PolicySlug {
  return typeof value === 'string' && (POLICY_SLUGS as readonly string[]).includes(value);
}

export function prepareEvidence(input: RuntimeJobInput, receivedAt: number): PreparedEvidence {
  if (!input || typeof input !== 'object') throw new Error('zkuat: job input must be an object');
  if (!isPolicySlug(input.policySlug)) throw new Error('zkuat: unsupported policy');
  if (!/^[0-9a-f-]{16,64}$/i.test(input.requestId)) {
    throw new Error('zkuat: requestId is malformed');
  }
  if (!Number.isSafeInteger(input.run?.id) || input.run.id <= 0) {
    throw new Error('zkuat: GitHub run id is invalid');
  }
  if (input.run.status !== 'completed' || input.run.conclusion !== 'success') {
    throw new Error(`zkuat: GitHub run ${input.run.id} is not a successful completed run`);
  }
  if (!Number.isSafeInteger(input.artifact?.id) || input.artifact.id <= 0) {
    throw new Error('zkuat: GitHub artifact id is invalid');
  }
  const expectedArtifact = `zkuat-evidence-${input.requestId}`;
  if (input.artifact.name !== expectedArtifact) {
    throw new Error(`zkuat: expected artifact ${expectedArtifact}`);
  }

  const parsed = parseGithubEvidence(input.evidence);
  let runUrl: URL;
  try {
    runUrl = new URL(input.run.url);
  } catch {
    throw new Error('zkuat: GitHub run URL is invalid');
  }
  const expectedRunPath = `/${parsed.repository}/actions/runs/${input.run.id}`.toLowerCase();
  if (
    runUrl.protocol !== 'https:' ||
    runUrl.hostname !== 'github.com' ||
    runUrl.pathname.replace(/\/$/, '').toLowerCase() !== expectedRunPath ||
    runUrl.search ||
    runUrl.hash
  ) {
    throw new Error('zkuat: GitHub run URL does not match the evidence repository and run id');
  }
  const evidence = canonicalEvidenceFromGithub(parsed, {
    receivedAt,
    run: {
      id: input.run.id,
      url: input.run.url,
      conclusion: input.run.conclusion,
      requestId: input.requestId,
    },
  });
  const salt = Uint8Array.from(randomBytes(32));
  const leaf = pureCircuits.leafOf(encodeEvidence(evidence), salt);

  return {
    schema: 'zkuat.runtime-evidence.v1',
    github: {
      repository: parsed.repository,
      runId: input.run.id,
      runUrl: runUrl.toString(),
      requestId: input.requestId,
      artifactId: input.artifact.id,
      artifactName: input.artifact.name,
    },
    evidence,
    saltHex: Buffer.from(salt).toString('hex'),
    leafHex: Buffer.from(leaf).toString('hex'),
  };
}
