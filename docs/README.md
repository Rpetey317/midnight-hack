# zkuat documentation

These pages describe the repository as currently implemented on `main`:

- [Architecture and trust boundaries](01-architecture.md)
- [GitHub evidence and Compact encoding](03-evidence-schema.md)
- [Compact contract specification](04-contract-spec.md)
- [Local runtime setup and operations](08-local-setup.md)
- [Four-minute demo video script](09-demo-script.md)
- [Current product and implementation brief](Master-Doc-v2.md)

The code is authoritative when behavior changes. The primary implementation
sources are:

- `.github/workflows/generate-evidence.yml` for measurement and artifact shape;
- `runtime/src/` for validation, wallet/proof orchestration, API behavior, and
  indexer verification;
- `contract/src/audit_registry.compact` and `contract/src/encoding.ts` for
  protocol state, circuits, IDs, and policies;
- `ui/src/` for the hosted experience and its current Supabase read-model.

The filename `Master-Doc-v2.md` is retained for existing links, but its contents
have been updated from the earlier design brief to the current implementation.
