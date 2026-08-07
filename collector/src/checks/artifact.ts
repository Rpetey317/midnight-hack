/**
 * `artifactDigest` — sha256 of the built artifact.
 *
 * The one check with no honest fallback. §10 and §21 make the artifact digest
 * the thing every claim refers to: *"Every claim must refer to immutable
 * artifact bytes, not a version label."* A stubbed digest is a claim about
 * nothing, so this throws rather than degrading, and `normalize()` refuses to
 * sign a report whose digest is not `measured`.
 */
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';

import type { CheckResult } from '@zkuat/attestor';

/** Streaming, because an artifact can be larger than memory. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function checkArtifactDigest(artifactPath: string): Promise<CheckResult<string>> {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `zkuat: no artifact at ${artifactPath}. The artifact digest is mandatory — there is ` +
        'nothing to prove compliance *about* without it. Build first, or point ' +
        'config.artifactPath at the built file.',
    );
  }
  const stat = fs.statSync(artifactPath);
  if (stat.isDirectory()) {
    throw new Error(
      `zkuat: ${artifactPath} is a directory. Digest a single built file — a tarball, a ` +
        'binary, an image layer. Directory hashing is not defined here, and two tools ' +
        'would not agree on it.',
    );
  }

  const digest = await sha256File(artifactPath);
  return {
    value: `sha256:${digest}`,
    status: 'measured',
    source: `sha256(${artifactPath})`,
    detail: { bytes: stat.size },
  };
}
