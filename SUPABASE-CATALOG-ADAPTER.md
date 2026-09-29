# Supabase Catalog Adapter v1

## Status and scope

This adapter introduces a common `CatalogDataSource` boundary for the existing TD Sofiivka catalogue. It is implemented and parity-tested against the DEV Supabase project `sofievka` (`wfxcklglujgramasdzyr`), but it is **not approved for production cutover** because the current full-snapshot RPC has unacceptable cold-load latency.

Production/default behaviour remains the local generated catalogue. The local feeds and `catalog-data.js` remain authoritative and have not been removed. No production environment variable, Vercel configuration, route, product ID, or browser storage key is changed by this work.

## Architecture

```text
Local JS feeds -> canonical CatalogSnapshot ----+
                                                  +-> LegacyAdapter -> existing UI
DEV Supabase -> get_catalog_snapshot() -> snapshot+
```

Both sources return the contract already defined in `CATALOG-CONTRACT.md`:

```js
{
  version,
  products,
  categories,
  brands,
  attributeDefinitions
}
```

There is no second Product DTO. `product.id`, category IDs, brand IDs, series IDs, URLs, and the existing cart/favorites/compare keys stay in their stable application representation. Database UUIDs do not become frontend identities.

## Data-source API

`catalog/data-source.mjs` provides:

- `CatalogDataSource.loadCatalogSnapshot()` — the minimal interface;
- `assertCatalogSnapshot()` — structural contract validation;
- `publicCatalogProjection()` — published-product projection for local parity tests;
- `estimateSnapshotBytes()` — uncompressed JSON measurement.

Implementations:

- `LocalCatalogDataSource` wraps the existing `window.sofievkaCatalogSnapshot` without changing normalization.
- `SupabaseCatalogDataSource` calls one public RPC, validates the result, restores the historical normalized-attribute ordering required by PDP rendering, deduplicates concurrent loads, and caches the snapshot in memory for five minutes.

`catalog/legacy-adapter.js` can install either snapshot. With the Supabase source it runs with `useRawCatalog: false`, so supplier/raw data is not exposed to the UI.

## Browser client and security boundary

`lib/supabase-client.mjs` contains the public browser client. It requires only:

- a valid Supabase URL;
- a publishable/anon key.

The client rejects `sb_secret_*`, service-role labels, and JWTs whose role is `service_role`. It exposes only the RPC method needed by this adapter and emits actionable errors for missing configuration, invalid URLs, network failures, non-JSON responses, and non-success HTTP responses.

No credentials are embedded in tracked source. The local demo server resolves the publishable key at runtime and injects it only into localhost HTML responses. A service-role key is used only by the explicit Node publishing script, never by browser code.

## Supabase read model

The read model is intentionally server-shaped:

- private release and per-product snapshot tables are protected by RLS;
- `finalize_catalog_snapshot(...)` is restricted to the service role and materializes the complete public JSON snapshot at publish time;
- `get_catalog_snapshot()` is the only anon storefront entry point;
- an active singleton pointer selects the deterministic snapshot version;
- the public payload contains only published products and canonical public fields;
- supplier raw payload, import metadata, review queues, admin notes, and the hidden product are excluded.

The full response is materialized at publication time rather than assembled from catalogue tables on every request. This prevents N+1 browser traffic and repeated 20-table aggregation. The v1 storefront makes exactly one catalogue request.

New migrations, in application order:

1. `20260929000100_catalog_public_snapshot.sql` — private snapshot release/read-model tables and the public RPC boundary.
2. `20260929000200_catalog_snapshot_materialization.sql` — service-role finalization and materialized snapshot payload.
3. `20260929000300_catalog_snapshot_rpc_timeout.sql` — a bounded 60-second function-local timeout for the read-only snapshot RPC.

Previously applied migrations were not edited.

## Snapshot publication

`scripts/publish-catalog-read-model.mjs` is DEV-ref locked. Before it writes, it verifies:

- project ref is exactly `wfxcklglujgramasdzyr`;
- linked project identity/status and all eight migration versions match;
- remote catalogue has exactly 3,215 rows: 3,214 published and one hidden;
- the full legacy ID-set hash is `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`.

The snapshot version is a SHA-256 hash of the entire canonical snapshot, so product, category, brand, and attribute-definition changes all invalidate it. The currently active version is:

`f7cd4c0bcb211b7f78f5a7d2d1e6954ee2464b6f268c5496990e216f81c2a45e`

Run a non-writing preflight/verification:

```powershell
npm run catalog:adapter:verify
```

Publishing is a deliberate operation and must only follow the project/data/migration preflight required by the project runbook:

```powershell
npm run catalog:adapter:publish -- --apply
```

Do not run that command against production or after changing/removing the DEV-ref guard.

## Local DEV demo

Start the localhost-only demo:

```powershell
npm run catalog:adapter:demo
```

Then open:

```text
http://127.0.0.1:4174/?dataSource=supabase
```

Supabase mode activates only when all three conditions are true:

1. the query contains `dataSource=supabase`;
2. the hostname is `localhost` or `127.0.0.1`;
3. `window.SOFIEVKA_DEV_CATALOG_SOURCE === true`, injected by the dedicated demo server.

The flag therefore cannot activate the Supabase source on the production hostname. There is no silent fallback: a Supabase error remains visible as a diagnostic failure. Remove the query parameter to use the local source.

## Caching and invalidation

V1 uses an in-document, five-minute cache with concurrent-request deduplication. A cache hit performs zero Supabase requests. `clearCache()` and `{ force: true }` are available for tests and explicit refreshes. The cache is intentionally not persistent, and the adapter does not keep stale data indefinitely.

The deterministic snapshot `version` is the future invalidation key. A production-grade design should put a version-aware HTTP/CDN cache in front of immutable snapshot/scoped responses and keep a small active-version pointer separately cacheable.

## Test and verification commands

```powershell
node --expose-gc tests/catalog-data-source-parity.mjs
node tests/catalog-contract-qa.js
node tests/catalog-qa.js
node tests/product-identity-audit.js
node tests/supabase-client-qa.mjs
node tests/supabase-schema-qa.js
node scripts/verify-supabase-catalog.mjs --project-ref=wfxcklglujgramasdzyr
```

The parity suite compares canonical hashes, all 3,214 public LegacyAdapter products, 11 PLP categories, 20 PDP products, 25 search cases, filter signatures, and route output. It also checks hidden/raw-field leaks and the public RPC/table authorization boundary.

## Performance limits and Phase 2

The current full snapshot is 45,457,799 bytes uncompressed and approximately 1,240,206 bytes with gzip. The final parity run took 21.27 seconds (19.45 seconds to headers, 1.51 seconds body/decompression, 0.30 seconds JSON parse) plus 0.26 seconds adapter assembly; an earlier measured run took 39.63 seconds. Browser QA observed roughly 32–75 seconds across cold page loads.

That payload is smaller than the former roughly 63 MiB uncompressed supplier/bundle layer and it meets functional parity, but the cold latency and main-thread/memory cost are not acceptable for production. Exact browser heap measurement is unavailable in the current browser runtime; parsed-object memory is expected to exceed wire size, and the DEV demo temporarily keeps the local bundle resident as well.

Recommended Phase 2:

1. Add scoped, paginated PLP endpoints with server-side sort/filter/facet counts.
2. Add exact-ID/SKU PDP endpoints and compact related-product projections.
3. Move search to a dedicated indexed endpoint while preserving result semantics.
4. Split public taxonomy/brand/attribute registries from product payloads.
5. Serve immutable, versioned responses through HTTP/CDN caching with Brotli/gzip.
6. Load collection/homepage projections independently.
7. Stop loading the local full snapshot in a future Supabase-only build after cutover is explicitly approved.
8. Add real-user timing and browser heap instrumentation before reconsidering cutover.

## Future admin boundary

`ADMIN-DESIGN-BRIEF.md` remains unchanged and no admin UI or public mutation API was added. A future authenticated admin layer will need separate, privileged methods for:

- list/get/create/update product;
- product media and document ordering;
- typed and unmapped-attribute editing;
- category, facet, brand, and series management;
- collection membership/order;
- validation, draft/review/publish workflow;
- snapshot publication and rollback.

Those methods must live outside the public `CatalogDataSource` and must not reuse the anon RPC authorization boundary.
