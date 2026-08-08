# Architecture and trust boundaries

zkuat is split into three active packages and one GitHub Actions workflow. The
hosted UI coordinates GitHub and the user's browser; the local runtime owns all
wallet/proving operations; the Compact package defines the on-chain protocol.

```text
GitHub repository
└── generate-evidence.yml
    └── evidence.json artifact (retained for one day)
        │
        │ GitHub API via authenticated Next.js server action
        ▼
Vercel: zkuat.works ─────── Supabase `midnight` schema
└── vendor browser          ├── products
    ├── displays evidence   ├── artifacts
    ├── selects policy      └── proof_activity
    └── pairs over HTTP loopback
        ▼
@zkuat/runtime on the vendor machine
├── validates forwarded evidence and run/artifact metadata
├── persists private jobs and wallet/private-state caches
├── starts the Docker proof server
├── derives and synchronizes the sponsor wallet
├── submits attest
├── submits proveCompliance
└── verifies transaction + record through the hosted indexer
        │
        ├── local proof server at 127.0.0.1:6300
        └── Midnight Preview/Preprod RPC + indexer
```

The chain node and indexer are hosted. The only Docker workload zkuat manages is
the local proof server.

## Repository responsibilities

| Component | Runs where | Holds or sees |
| --- | --- | --- |
| `ui/` server actions | Vercel | GitHub OAuth provider token during the request, downloaded evidence JSON, run/artifact metadata |
| `ui/` browser | Vendor's browser | Evidence JSON, pairing token, selected policy, redacted runtime job state |
| Supabase | Hosted | Repository, artifact, and proof-activity read-model rows; never the sponsor recovery phrase or seed |
| `runtime/` | Vendor's machine | Sponsor recovery phrase and decoded seed, wallet state, raw prepared evidence, salt, Merkle path, job receipts |
| Docker proof server | Vendor's machine | ZK proving request and compiled circuit assets during proving |
| Midnight ledger/indexer | Hosted network | Public policies, attestation tree state, nullifiers, compliance records/history, transactions |

## End-to-end sequence

1. A GitHub-authenticated user registers a repository in the Supabase-backed
   dashboard.
2. The Vercel server action dispatches the repository's evidence workflow with a
   request UUID and waits for the matching run.
3. The server action downloads `zkuat-evidence-<request-id>`, extracts
   `evidence.json`, and returns it with GitHub metadata to the browser.
4. The user starts `@zkuat/runtime`; it binds to loopback and prints a random
   six-digit pairing code.
5. The browser exchanges the code for an in-memory bearer token and sends the
   evidence, request/run/artifact metadata, and one of the four policy slugs.
6. The runtime validates the payload, maps it into `zkuat.evidence.v4`, derives a
   fresh 32-byte salt and leaf with the contract's generated pure circuit, and
   writes the private job to disk.
7. The proof server is started if necessary. The sponsor wallet synchronizes,
   registers NIGHT outputs for DUST generation when necessary, and waits for
   spendable DUST.
8. The runtime proves and submits `attest(leaf)`, then waits until the indexer can
   return a Merkle path for the inserted leaf.
9. The runtime loads evidence, salt, and path into Compact private state, proves
   and submits `proveCompliance`, and obtains the private boolean result.
10. The runtime polls the indexer for the transaction, requires a successful call
    to the configured contract's `proveCompliance` entry point, loads the record,
    and matches artifact digest, policy ID, and verdict.

## Authentication and authorization

The HTTP listener accepts only the exact `ZKUAT_ALLOWED_ORIGIN` when an Origin
header is present. Only `/v1/health` and `/v1/pair` are unauthenticated. A correct
pairing code creates a random bearer token held only in runtime process memory
and browser component state.

Pairing authorizes the browser to spend from the local sponsor wallet through
the limited runtime API. It is not GitHub attestation. The runtime checks that
the forwarded run URL, run ID, repository, artifact name, request ID, and success
status agree, but it does not re-authenticate to GitHub or download the artifact
itself. A compromised paired frontend could fabricate a self-consistent payload.
This is an explicit hackathon trust boundary.

The contract separately authorizes `attest` and `registerPolicy` through a
sealed anchor identity. Both deployment and runtime decode the sponsor recovery
phrase to its original seed and derive the private witness from that seed.
Neither the recovery phrase nor raw sponsor seed is ever a Compact witness.

## Privacy boundary

The private contract inputs are vulnerability values, lint/build results,
commit, salt, and Merkle path. Those values do not appear in the public
compliance record.

The current web flow is not end-to-end local evidence handling: Vercel retrieves
the artifact and the vendor's browser renders it before forwarding it to the
runtime. Evidence is private from the chain, auditor, and unauthenticated public,
not from the authenticated web tier or vendor.

The Compact proof establishes that the committed private values satisfy the
contract predicate. It does not prove that `npm audit`, lint, or build were
honestly executed. GitHub Actions and the compatible workflow are trusted for
measurement in this MVP.

## Persistence and recovery

The runtime stores jobs, wallet synchronization state, Compact private state,
and a process lock below `~/.zkuat/runtime` by default. Jobs are serialized
through one promise queue. Nonterminal job files are re-queued after restart;
pairing tokens are not persisted.

The hosted UI separately stores its product/artifact/proof read-model in
Supabase. At present a real completed runtime job is not copied into that
read-model. Demo seeding is the only implemented UI path that inserts
`proof_activity` rows.

## Transactions

A normal proof job submits two contract transactions:

1. `attest`
2. `proveCompliance`

Indexer confirmation is read-only. A sponsor wallet may submit a separate,
first-use NIGHT registration transaction to begin DUST generation. Initial
deployment makes one deploy transaction and four policy-registration
transactions.

## Current hackathon tradeoffs

- one local sponsor wallet;
- one serialized local job queue;
- filesystem persistence instead of a service database;
- four npm reference policies fixed at deployment time;
- GitHub Actions trusted without signed provenance;
- Vercel/browser evidence handoff rather than direct runtime download;
- Supabase-backed public UI not yet synchronized with real chain records;
- no KMS, wallet connector, or multi-wallet orchestration.
