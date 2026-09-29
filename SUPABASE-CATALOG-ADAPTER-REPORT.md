# SOFIEVKA SUPABASE CATALOG ADAPTER REPORT v1

Date: 2026-09-29
DEV project: `sofievka`
Project ref: `wfxcklglujgramasdzyr`
Region/status: `eu-west-1` / `ACTIVE_HEALTHY`

## 1. Architecture

One canonical `CatalogSnapshot` can now come from either `LocalCatalogDataSource` or `SupabaseCatalogDataSource`, then pass through the same LegacyAdapter and existing UI. The Supabase path uses one anon RPC backed by a private, materialized public read model. Default/production remains local.

## 2. Files created/changed

Core adapter and runtime:

- `catalog/data-source.mjs`
- `catalog/local-data-source.mjs`
- `catalog/supabase-data-source.mjs`
- `catalog/data-source-bootstrap.js`
- `catalog/legacy-adapter.js`
- `catalog/catalog-facade.js`
- `catalog/pdp-engine.js`
- `catalog/search-engine.js`
- `lib/supabase-client.mjs`
- `catalog-ui.js`
- `page-shell.js`
- `script.js`
- generated `catalog-data.js`
- `scripts/build-catalog-data.mjs`

Read model and tooling:

- `supabase/migrations/20260929000100_catalog_public_snapshot.sql`
- `supabase/migrations/20260929000200_catalog_snapshot_materialization.sql`
- `supabase/migrations/20260929000300_catalog_snapshot_rpc_timeout.sql`
- `scripts/publish-catalog-read-model.mjs`
- `scripts/serve-supabase-catalog-demo.mjs`
- `scripts/catalog-db-utils.mjs`
- `scripts/import-catalog-to-supabase.mjs`
- `scripts/verify-supabase-catalog.mjs`
- `package.json`

Tests and documentation:

- `tests/catalog-data-source-parity.mjs`
- `tests/supabase-client-qa.mjs`
- `tests/supabase-schema-qa.js`
- `supabase/tests/005_public_snapshot.test.sql`
- `SUPABASE-CATALOG-ADAPTER.md`
- `SUPABASE-CATALOG-ADAPTER-REPORT.md`

Existing unrelated and previous-stage worktree changes were preserved.

## 3. Data source interface

The minimal interface is `loadCatalogSnapshot()`. Both implementations return the same required keys: `version`, `products`, `categories`, `brands`, and `attributeDefinitions`. No parallel Product DTO or repository framework was introduced. Snapshot validation fails with clear diagnostics.

## 4. Supabase read model

Three new append-only migrations add private snapshot release/product tables, service-role-only materialization, an active pointer, and anon RPC `get_catalog_snapshot()`. The RPC returns only the active canonical public snapshot. Applied migrations were not edited. Remote history contains all eight expected versions.

## 5. Number of network requests

One request: `POST /rest/v1/rpc/get_catalog_snapshot`. There are no per-product attribute/media/document requests and no N+1 behaviour. A five-minute in-memory cache serves subsequent loads in the same document with zero requests.

## 6. Payload size

- Uncompressed JSON: **45,457,799 bytes** (43.35 MiB).
- Gzip estimate: **1,240,206 bytes** (1.18 MiB).
- Largest and only catalogue endpoint: `get_catalog_snapshot()`.
- Raw supplier/import/review payload is excluded.

## 7. Snapshot assembly timing

Final parity sample:

- headers/server wait: 19,450 ms;
- body read/decompression: 1,513 ms;
- JSON parse: 305 ms;
- total load: 21,268 ms;
- adapter assembly: 263 ms.

An earlier automated sample was 39,635 ms, and browser QA observed cold loads ranging approximately from 32 to 75 seconds. Exact browser heap measurement was unavailable; the runtime did not expose `performance.memory`. Parsed-object memory is expected to materially exceed the wire size, and DEV comparison mode also retains the local snapshot.

## 8. Public product count

Database total is 3,215: 3,214 published and one hidden. The public Supabase snapshot contains exactly 3,214 products. Hidden-product leaks: zero.

## 9. Product identity/hash

- Full 3,215-row legacy ID-set hash: `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733` — preserved exactly in the database.
- Public 3,214-row ID-set hash: `7c76aaa153fb4c57052bc83def3dbb154a86674229b8e32c10f8bf591ebecbf3` — exact local-public/Supabase match.
- Canonical public product hash: `e3f54852063250e4eb53b06342094bfd08dbf480a2ff38382f8e03230e61f423`.
- Internal database UUIDs do not leak into frontend identity.

## 10. Category parity

87 categories matched exactly. Canonical category hash: `663d3d22b55403c97e7c1700f0f5a44a732fcd04b1a11e74b3e366a51302263c`. Stable IDs, parent IDs, slugs, levels, titles, routes, and ordered active facet IDs are preserved.

## 11. Brand parity

36 brands matched exactly. Canonical brand hash: `62a33b162782dae512775e5e10d0cea7c5951561ec5fc93336fd3f64bb75030a`. Stable IDs/slugs/names and brand route behaviour are preserved.

## 12. Attribute parity

64 definitions matched exactly. Definition hash: `b7f248948e773d58aec9b050b5d53255136ff4365257c8ca32c5ea86994a0fc9`. All 23,988 typed database rows reconcile; the public projection has 23,987 because the hidden product is excluded. `normalizedAttributes`, canonical attribute arrays, types, units, labels, and PDP ordering matched.

## 13. Media parity

13,006 database media rows reconcile exactly; 13,004 belong to public products. Images, primary-first ordering, URLs, and gallery/PDP output matched. Storage migration was not performed.

## 14. Documents parity

3,885 document rows reconcile exactly. Type, title, URL, and order matched the local public snapshot. Invalid/private document leaks: zero.

## 15. Collection parity

Five collections and 149 ordered membership rows reconcile exactly. Homepage hits/sale inputs remain compatible. The production homepage source was not switched.

## 16. LegacyAdapter parity

All 3,214 public products were compared after both sources passed through the same LegacyAdapter. Critical differences: zero. Existing cart, favorites, compare, PDP lookup, and UI field shapes continue to use legacy IDs.

## 17. PLP parity

Green with zero critical differences across 11 categories: gas boilers, borehole pumps, reverse osmosis, smart lighting, feed grinders, circulation pumps, mainline cartridges, automation, water pumps, heat generation, and pellet boilers. Counts, first items, price ordering, brand/availability/technical facets, and card fields matched.

## 18. PDP parity

Green for 20 representative products spanning brands/categories, known and unknown prices, inventory states, multiple images, documents, many attributes, and public unmapped characteristics. IDs, content, media, price/inventory, attributes, SEO, and related-product inputs matched.

## 19. Search parity

Green for 25 cases covering the existing regression set plus SKU, brand, model, category, typo, and attribute queries. DEV browser QA returned 11 correct results for `Grundfos ALPHA3`.

## 20. Filter parity

Green. Brand, availability, technical facets, multi-select signatures, price, subcategory, sorting, and URL state matched the local source.

## 21. Routing parity

Green for catalog, section, category/subcategory, brand, `product?id=`, `search?q=`, and filtered URLs. The data source does not change routing output or browser storage keys.

## 22. Security/RLS result

- Public adapter uses publishable/anon access only.
- Direct read-model table access as anon: HTTP 401.
- Anonymous snapshot finalization: HTTP 401.
- Hidden product leaks: zero.
- Forbidden raw/private/admin keys: zero.
- Privileged credential leaks: zero.
- RLS and five pgTAP snapshot tests: green.
- Remote catalogue verification: 57/57 checks, zero critical failures.

## 23. Visual QA

DEV source was explicitly verified at `127.0.0.1` on desktop and at a 390 × 844 mobile viewport. Homepage, catalogue/PLP, PDP, search, brands, cart, favorites, and compare rendered from the Supabase source. Preserved localStorage IDs resolved in cart/favorites/compare. Console errors/warnings were empty. Mobile homepage, PLP, and PDP had no document-level horizontal overflow; compare uses the intended horizontal table scroller. No UI redesign or visual-source-dependent change was introduced.

## 24. Production impact

None. Default production source remains local. The Supabase flag requires localhost, an explicit query, and a demo-server-only enable flag. Vercel/environment configuration was not changed. No frontend deploy, production switch, storage migration, admin UI, or production data import occurred.

## 25. Known performance limitations

The full snapshot is functionally correct but production-inappropriate. Observed cold response/load latency is approximately 21–75 seconds, the browser must parse and retain a 45.46 MB JSON document, and the current DEV comparison page also loads the local catalogue before replacing it. The 60-second RPC timeout is a bounded safety allowance, not a performance solution. In-memory cache helps only subsequent reads within the same document and does not survive navigation.

## 26. Recommended Phase 2 optimizations

Add scoped/paginated PLP APIs with server-side sort/filter/facets; exact-ID PDP and compact related-product endpoints; indexed search; separately cached taxonomy/brand/attribute registries; immutable versioned HTTP/CDN caching; independent collection projections; Brotli/gzip validation; and real browser memory/RUM budgets. Only after these are green should a Supabase-only build stop loading the local full bundle.

## 27. Remaining blockers

There is one cutover blocker: cold-load latency and client memory/main-thread cost of the v1 full snapshot. Functional parity, identity, routing, security, RLS, and visual QA are green. The adapter is suitable as a DEV compatibility bridge and Phase 2 foundation, but not as the production data source yet.

# NOT READY FOR DATA SOURCE CUTOVER
