/**
 * `buildProvenanceVerified` — does GitHub hold a build attestation for these
 * exact artifact bytes?
 *
 * This is the §8 hook, and the reason the whole design has a trust root worth
 * defending: our chain terminates at GitHub's OIDC identity, the same root SLSA
 * and npm provenance use, rather than at a key we invented.
 *
 * **Scope, stated plainly.** This check asks GitHub whether an attestation
 * *exists* for the digest. It does not perform Sigstore verification, and in
 * particular it does not check that the OIDC subject repo matches the predicate
 * repo — the check `../../docs/05-implementation-plan.md` calls
 * security-critical, *"without it, repo A can attest for repo B and the whole
 * trust chain is decorative."* That verification belongs to Track C's anchor,
 * runs against our own predicate with `@sigstore/verify`, and is where the
 * trust decision is actually made. `source` says so in the report, so nobody
 * reads more into this value than it carries.
 *
 * `gh attestation verify` is not an option here: `gh` is 2.45.0 and the
 * subcommand landed in 2.49.0 (**VERIFIED** 2026-08-07). The REST endpoint
 * works on 2.45 and 404s cleanly when nothing is attested.
 */
import type { CheckResult } from '@zkuat/attestor';

import { ghApi } from '../exec.js';

export async function checkBuildProvenance(
  repo: string,
  artifactDigest: string,
  stub?: boolean,
): Promise<CheckResult<boolean>> {
  const digest = artifactDigest.replace(/^sha256:/, '');
  const apiPath = `repos/${repo}/attestations/sha256:${digest}`;
  const source = `gh api ${apiPath} (presence only — cryptographic verification is the anchor's)`;

  const { status, body, result } = await ghApi(apiPath);

  if (status === 200 && body && typeof body === 'object') {
    const attestations = (body as { attestations?: unknown[] }).attestations ?? [];
    return {
      value: attestations.length > 0,
      status: 'measured',
      source,
      detail: { count: attestations.length },
    };
  }

  if (status === 404) {
    // No attestation for these bytes. A real measurement of false: GitHub was
    // asked and said no.
    return {
      value: false,
      status: 'measured',
      source,
      detail: { reason: 'no attestation for this digest' },
    };
  }

  return {
    value: stub ?? false,
    status: stub === undefined ? 'unavailable' : 'stubbed',
    source,
    error: result.failure ?? `gh api returned ${status || result.code}`,
  };
}
