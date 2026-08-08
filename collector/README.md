# @zkuat/collector

This package has one job: validate the untrusted `evidence.json` emitted by the
existing GitHub Actions workflow and map it into `CanonicalEvidence` from
`@zkuat/contract`.

```ts
import { canonicalEvidenceFromGithub } from '@zkuat/collector';

const evidence = canonicalEvidenceFromGithub(json, {
  receivedAt: Math.floor(Date.now() / 1000),
  run: { id: 123, conclusion: 'success' },
});
```

It checks the repository, commit SHA, artifact SHA-256, vulnerability counts,
the exact lint/build command names, and their boolean results. It introduces no
signature, evidence key, envelope, or intermediate bundle.

```bash
npm install
npm run typecheck
npm test
```
