/**
 * Sigstore verification, and the check the whole trust chain rests on.
 *
 * The collector's `buildProvenanceVerified` asks GitHub whether an attestation
 * *exists* for a digest. That is a presence check. This is the real one:
 * signature valid, certificate chains to Fulcio, Rekor entry present — and then
 * **the OIDC subject repo must equal the predicate repo.** Without that last
 * comparison repo A can attest for repo B and everything above it is
 * decorative.
 *
 * ## Status in this repo
 *
 * `Rpetey317/midnight-hack` is private, so GitHub artifact attestations are
 * plan-gated and `actions/attest` has never gone green here. Every committed
 * fixture carries `"sigstore": null`. The code below is written and the
 * comparator is unit-tested, but **the full-chain path has never run against a
 * real Fulcio certificate.** Treat it accordingly, and do not tick the
 * Definition-of-Done box that says otherwise.
 *
 * The null case is not silently tolerated: it requires `--allow-unsigned`, so
 * an offline-signed bundle can never be mistaken for a verified one.
 */
import * as fs from 'node:fs';

import { bundleFromJSON } from '@sigstore/bundle';
import { getTrustedRoot } from '@sigstore/tuf';
import { toSignedEntity, toTrustMaterial, Verifier } from '@sigstore/verify';
import type { AttestationPredicate, EvidenceBundle } from '@zkuat/attestor';

/**
 * Fulcio certificate extension OIDs carrying the workflow's OIDC claims.
 *
 * The v1 pair holds a bare ASCII string; the v2 pair holds a DER UTF8String.
 * Both are still issued, so read either — see {@link decodeClaim}.
 * https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md
 */
const OID_GITHUB_WORKFLOW_REPOSITORY = '1.3.6.1.4.1.57264.1.5'; // v1: "owner/repo"
const OID_GITHUB_WORKFLOW_SHA = '1.3.6.1.4.1.57264.1.3'; // v1: 40-hex
const OID_SOURCE_REPOSITORY_URI = '1.3.6.1.4.1.57264.1.12'; // v2: "https://github.com/owner/repo"
const OID_SOURCE_REPOSITORY_DIGEST = '1.3.6.1.4.1.57264.1.13'; // v2: 40-hex

export type SigstoreOutcome =
  | { state: 'verified'; repo: string; sha: string }
  | { state: 'unsigned'; reason: string };

export interface VerifySigstoreOptions {
  /** Accept `sigstore: null`. Without it, an unsigned bundle is a hard failure. */
  allowUnsigned?: boolean;
  /**
   * A `TrustedRoot` JSON on disk, instead of fetching the public-good root over
   * TUF. Set `ZKUAT_SIGSTORE_TRUSTED_ROOT` for the same effect. Offline
   * verification, and the only way this runs without network access.
   */
  trustedRootFile?: string;
}

/** The OIDC claims we compare against the predicate. */
export interface RepoClaims {
  repo?: string;
  sha?: string;
}

/**
 * The security-critical comparison, isolated so it can be tested without a
 * certificate.
 *
 * Absence is failure, not a pass: a certificate with no repository claim tells
 * us nothing about who built the artifact, and treating "no claim" as "no
 * mismatch" is how this check gets quietly defeated.
 */
export function assertRepoBinding(claims: RepoClaims, predicate: AttestationPredicate): void {
  if (!claims.repo) {
    throw new Error(
      'zkuat: the Sigstore certificate carries no source-repository claim — ' +
        'nothing binds this attestation to a repo, so it cannot be anchored',
    );
  }
  if (claims.repo !== predicate.repo) {
    throw new Error(
      `zkuat: OIDC subject repo "${claims.repo}" does not match predicate repo ` +
        `"${predicate.repo}" — refusing to anchor. This is the check that stops ` +
        'one repository attesting for another.',
    );
  }
  if (claims.sha && claims.sha !== predicate.sha) {
    throw new Error(
      `zkuat: OIDC source-repository digest ${claims.sha} does not match predicate sha ` +
        `${predicate.sha} — the attestation is for a different commit`,
    );
  }
}

/**
 * Verify the Sigstore attestation attached to a bundle, if there is one.
 *
 * Order matters: chain first (is this a real GitHub-issued identity?), binding
 * second (is it *our* repo?), payload third (is it *our* leaf?). Each stage
 * assumes the previous one held.
 */
export async function verifySigstore(
  bundle: EvidenceBundle,
  predicate: AttestationPredicate,
  options: VerifySigstoreOptions = {},
): Promise<SigstoreOutcome> {
  if (bundle.sigstore == null) {
    if (!options.allowUnsigned) {
      throw new Error(
        'zkuat: this bundle has no Sigstore attestation (`sigstore: null`), so the ' +
          'repo binding cannot be checked. Pass --allow-unsigned to anchor it anyway, ' +
          'which trusts the attestor key alone.',
      );
    }
    return {
      state: 'unsigned',
      reason: 'offline-signed bundle — trusted on the attestor key alone, no repo binding',
    };
  }

  const sigstoreBundle = bundleFromJSON(bundle.sigstore as Parameters<typeof bundleFromJSON>[0]);
  const trustMaterial = toTrustMaterial(await trustedRoot(options));

  // Chain: signature → Fulcio → Rekor. Throws VerificationError on any of them.
  const signer = new Verifier(trustMaterial).verify(toSignedEntity(sigstoreBundle));

  const claims = repoClaims(signer.identity?.oids);
  assertRepoBinding(claims, predicate);
  assertLeafBinding(sigstoreBundle, predicate);

  return { state: 'verified', repo: claims.repo!, sha: claims.sha ?? predicate.sha };
}

/**
 * The attestation must be for *this* leaf.
 *
 * Without this, a genuine attestation from the right repo for some other
 * artifact would authorise anchoring anything — the repo binding proves who,
 * not what.
 */
function assertLeafBinding(
  sigstoreBundle: ReturnType<typeof bundleFromJSON>,
  predicate: AttestationPredicate,
): void {
  const content = sigstoreBundle.content;
  if (content?.$case !== 'dsseEnvelope') {
    throw new Error(
      `zkuat: expected a DSSE-envelope Sigstore bundle, got "${content?.$case ?? 'nothing'}"`,
    );
  }

  let statement: { predicate?: { leaf?: unknown } };
  try {
    statement = JSON.parse(Buffer.from(content.dsseEnvelope.payload).toString('utf8'));
  } catch (err) {
    throw new Error(`zkuat: Sigstore DSSE payload is not JSON: ${(err as Error).message}`);
  }

  const attested = statement.predicate?.leaf;
  if (attested !== predicate.leaf) {
    throw new Error(
      `zkuat: the Sigstore attestation is for leaf ${String(attested).slice(0, 16)}…, ` +
        `not ${predicate.leaf.slice(0, 16)}… — refusing to anchor`,
    );
  }
}

/** Pull the repository and commit claims out of the certificate's extensions. */
export function repoClaims(
  oids: Array<{ oid: { id: number[] } | undefined; value: Buffer }> | undefined,
): RepoClaims {
  const byOid = new Map<string, Buffer>();
  for (const pair of oids ?? []) {
    if (pair.oid) byOid.set(pair.oid.id.join('.'), pair.value);
  }

  const read = (oid: string) => {
    const raw = byOid.get(oid);
    return raw ? decodeClaim(raw) : undefined;
  };

  const uri = read(OID_SOURCE_REPOSITORY_URI);
  return {
    repo: stripGithubPrefix(uri) ?? read(OID_GITHUB_WORKFLOW_REPOSITORY),
    sha: read(OID_SOURCE_REPOSITORY_DIGEST) ?? read(OID_GITHUB_WORKFLOW_SHA),
  };
}

/** `https://github.com/owner/repo` → `owner/repo`. */
function stripGithubPrefix(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  return uri.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
}

/**
 * v2 extension values are DER UTF8String (tag `0x0c`); v1 values are bare
 * ASCII. Unwrap the former, pass the latter through.
 */
function decodeClaim(value: Buffer): string {
  if (value.length < 2 || value[0] !== 0x0c) return value.toString('utf8');

  let length = value[1]!;
  let offset = 2;
  if (length & 0x80) {
    // Long form: the low 7 bits say how many bytes the length itself occupies.
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | value[offset + i]!;
    offset += count;
  }
  return value.subarray(offset, offset + length).toString('utf8');
}

let cachedRoot: Awaited<ReturnType<typeof getTrustedRoot>> | undefined;

async function trustedRoot(options: VerifySigstoreOptions) {
  const file = options.trustedRootFile ?? process.env.ZKUAT_SIGSTORE_TRUSTED_ROOT;
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  // TUF fetch, network-bound. Cached for the process; the client caches on disk
  // across runs.
  cachedRoot ??= await getTrustedRoot();
  return cachedRoot;
}
