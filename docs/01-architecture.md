# Architecture

zkuat uses one hosted application and one local companion:

```text
zkuat.works / Vercel
  └─ dispatch workflow, wait, download evidence.json
       └─ HTTPS page calls paired http://127.0.0.1:4317
            └─ @zkuat/runtime
                 ├─ validate + persist private evidence
                 ├─ derive anchor identity from local sponsor seed
                 ├─ run proof server in Docker
                 ├─ submit attest transaction
                 ├─ generate + submit proveCompliance transaction
                 └─ verify transaction and record through hosted indexer
```

The Preview/Preprod node and indexer are hosted services. Only the proof server
and runtime run locally. A web page cannot start a native process, so the user
starts `@zkuat/runtime` once and pairs the page using the code printed in the
terminal.

## Trust boundaries

- GitHub Actions produces the measured facts.
- The authenticated Vercel application retrieves the matching run artifact.
- The paired local runtime validates the artifact shape and run metadata before
  sponsoring it. Pairing authorizes use of the local sponsor wallet.
- The sponsor seed never leaves the local env file. The contract sees only an
  HKDF-derived anchor witness.
- The Compact proof demonstrates that an anchored private input satisfies a
  public policy. It does not independently prove that the original scanner was
  correct.

This is intentionally a hackathon architecture: one sponsor wallet, one serial
job queue, filesystem persistence, and no remote relayer or evidence-signing
service.

## Transaction count

Every proof request causes two writes: `attest` and `proveCompliance`. The final
verification polls the indexer and reads the record, so it is not a transaction.
Contract deployment and policy registration occur once during setup.
