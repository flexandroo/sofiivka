# SOFIEVKA PRODUCTION SUPABASE & CUTOVER REPORT v1

Дата: 2026-09-29

## 1. DEV project ref

- Project: `sofievka`
- Ref: `wfxcklglujgramasdzyr`
- Status: `ACTIVE_HEALTHY`
- После production maintenance локальный Supabase CLI link возвращён к DEV.

## 2. PROD project ref

- Project: `sofievka-prod`
- Ref: `fkjarsouuchjiedrrblc`
- Status: `ACTIVE_HEALTHY`
- DEV и PROD refs различаются.

## 3. Environment separation

- Vercel Preview → Supabase DEV `wfxcklglujgramasdzyr`.
- Vercel Production → Supabase PROD `fkjarsouuchjiedrrblc`.
- Оба направления подтверждены через независимые `catalog-build-manifest.json`.
- Preview configuration не изменялась при production setup.

## 4. Migration result

До migrations PROD имел пустую remote history, 0 application tables, 0 Auth users и 0 Storage buckets. Dry-run показал ровно 10 существующих migrations. Полный immutable chain schema → RLS → core seed → Storage → public snapshot → materialization → scoped Read Model v2 применён успешно. Local/remote history совпадает.

## 5. Production core seed

- brands: 36
- categories: 87
- attribute definitions: 64
- category attributes: 648
- products до import: 0
- Storage buckets: 5; `import-private` private, остальные ожидаемые public buckets.

## 6. Product import

- Canonical snapshot hash: `c56e754efdeb8f90d7ece46ec65c901e66e0d14a781bb0d703e6fd800becab27`
- Первый successful import run: `cb9cb60a-442b-5aec-bdb4-a7990379d2cb`
- products: 3 215
- published: 3 214
- hidden service item: 1
- failed: 0

## 7. Second import / idempotency

- Второй successful import run: `30e0b958-cbcd-532a-a001-a189c1d4240d`
- existing state: `same-catalog`
- inserted: 0
- updated deterministically: 3 215
- failed: 0
- duplicate legacy ID/SKU/slug/typed attributes/source ordinals: 0
- Counts и projection hashes после второго run не изменились.

## 8. Product/hash reconciliation

- Legacy ID hash: `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`
- Duplicate legacy ID: 0
- Duplicate SKU: 0
- Duplicate slug: 0
- Два полных verifier runs: 57/57 checks, critical failures 0, expected differences 0.

## 9. Attribute/media/document reconciliation

- series: 368
- typed attributes: 23 988
- source records: 3 215
- source evidence rows: 92 554
- media: 13 006
- documents: 3 885
- tags: 225
- product tags: 4 204
- collections: 5; collection items: 149
- category mapping reviews: 29
- Critical projection count/hash differences: 0.

## 10. PROD RLS/security

- Anon видит только 3 214 published products.
- Hidden service product не доступен через public PDP/API.
- Raw provenance, source records, review queue, private import data и finalization mutation anon не доступны.
- Child-table visibility проверена; hidden/private leaks 0.
- `product_tags_public_read` policy, 12 expected indexes и Storage policy set подтверждены.

## 11. Read Model PROD validation

- Active snapshot: `f7cd4c0bcb211b7f78f5a7d2d1e6954ee2464b6f268c5496990e216f81c2a45e`
- bootstrap, scoped PLP, facets, PDP, related, search, collections и bulk lookup: green.
- Scoped parity: 12 PLP scopes, 36 PDP cases, 45 search cases, critical diffs 0.
- 21 search cases имеют non-critical order-only ranking differences относительно legacy client ranking; exact SKU/model expectations и result sanity не нарушены.

## 12. Performance

External PROD API medians / p95:

| Operation | Median | p95 | Payload |
|---|---:|---:|---:|
| Bootstrap | 135.565 ms | 195.480 ms | 120 445 B |
| PLP category | 103.176 ms | 131.607 ms | 21 705 B |
| PLP category + brand | 97.022 ms | 113.919 ms | 21 705 B |
| PLP price sort | 96.245 ms | 119.048 ms | 23 212 B |
| Facets | 105.966 ms | 144.316 ms | 1 121 B |
| PDP | 95.666 ms | 119.451 ms | 21 310 B |
| Search | 410.494 ms | 426.414 ms | 2 635 B |
| Collection | 121.590 ms | 129.680 ms | 19 072 B |

First PLP journey: 143 271 B; full snapshot baseline: 45 457 799 B; reduction 99.685%. Scoped SQL EXPLAIN acceptance passed; slowest scoped explain was search at 324.44 ms, below 1 s gate.

## 13. Vercel environment configuration

Production-only variables:

- `SOFIEVKA_CATALOG_SOURCE=supabase`
- `SUPABASE_URL` points to PROD
- `SUPABASE_PUBLISHABLE_KEY` is PROD browser-safe key
- `SOFIEVKA_SUPABASE_PROJECT_REF=fkjarsouuchjiedrrblc`
- `SOFIEVKA_ALLOW_PRODUCTION_SUPABASE=true`

No service-role/access token/DB password was added to Vercel storefront config.

## 14. Deployment ID and URL

- Initial cutover deployment: `dpl_HkpADrXwUQoQqdXNSx4xTHPLkU7V`, commit `bb9bb78`.
- Network-audit hotfix deployment: `dpl_BwDN51ZCDMiHzc2cjPoZT2SbZzx8`, commit `3210891`, `READY`.
- Production URL: `https://sofievka.vercel.app/`

## 15. Network source verification

- Production manifest: source `supabase`, environment `production`, project ref `fkjarsouuchjiedrrblc`.
- Browser DOM source marker: `supabase-scoped`.
- DEV ref отсутствует в production runtime config.
- Supplier product feeds и `water-catalog-data.js` отсутствуют в production HTML/build; direct request к legacy water entry point возвращает 404.
- `catalog-data.js` остаётся как общий runtime/taxonomy/adaptation code (~200 KB), а не 45 MB product snapshot.
- Normal PLP/PDP/search не вызывают full snapshot RPC.

## 16. PLP/PDP/search QA

- Representative production routes вернули HTTP 200.
- Gas boilers PLP: 57 total, 24 first-page cards, filters, sorting и load-more доступны.
- Filter drawer, price/availability/facets и category navigation загружаются без startup error.
- PDP `MO550MECOSTD`: legacy URL сохранён; title, 29-image gallery, known price, availability, descriptions, attributes, documents и related products загружены.
- Search `wilo`: 24 first-page cards; header autocomplete для `Wilo Stratos` открыт и содержит `Wilo Stratos MAXO`.

## 17. Stateful flows

- Cart, favorites и compare использовали существующий legacy ID contract.
- Add actions, reload persistence и bulk product resolution проверены на production.
- Cart/favorites/compare pages остались на `supabase-scoped`; representative product восстановлен после reload.
- Compare table загрузился без N requests на N products.

## 18. Mobile QA

- Production проверен headless Chrome при точном viewport 390×844.
- Header/search, PLP, filter entry point, cards, PDP gallery/thumbnail strip, price/action area, cart/favorites/compare data loading работают без config/network error.
- Storefront assets после approved Preview не менялись; desktop/mobile visual parity с Preview сохранена.

## 19. Visual QA

- Desktop homepage, PLP, filter drawer и PDP просмотрены в browser.
- Typography, colors, spacing, cards, buttons, filters, images и async states соответствуют approved Preview.
- Redesign не выполнялся.

## 20. Security scan

- Repository secret scan: 0 privileged matches.
- Staged diff secret scan: 0.
- Production runtime config: PROD ref present, DEV ref absent, privileged secret markers 0.
- 8 production browser assets scanned; service role/access token/DB password/secret key matches 0.
- Production browser console errors after final deployment: 0.

## 21. Error/retry behavior

- Controlled cutover tests подтверждают missing-config rejection, production→DEV rejection, explicit error state и retry contract.
- Silent fallback на local source отсутствует.
- Production намеренно не ломался.

## 22. Rollback readiness

Rollback source сохранён. Команда конфигурации переводит только Production в `local`, после чего нужен штатный redeploy. Database migrations/data не откатываются. Legacy local catalog и supplier feeds не удалены.

## 23. Documentation/admin

- `PRODUCTION-SUPABASE-RUNBOOK.md` создан.
- `ADMIN-IMPLEMENTATION-READINESS.md` обновлён под Public site → PROD, future Admin → PROD, Preview/admin validation → DEV.
- Admin UI не создавался.

## 24. Changed files

- Catalog contract, canonical/legacy adapters, local/Supabase data sources и scoped UI integration.
- Supabase schema/RLS/seed/Storage и 10 migrations.
- Import/reconciliation/read-model/performance/Vercel configuration tooling.
- Cutover, schema, identity, parity, performance, security и HTTP tests.
- Vercel build configuration, environment example, runbook и reports.
- Network hotfix добавил `water-catalog-data.js` в Supabase-build exclusion list.

## 25. Remaining blockers

Critical production blockers: none.

Intentional remaining work outside этого этапа:

- legacy local data layer остаётся rollback source;
- admin mutation API, RBAC/MFA, audit log и admin UI ещё не реализованы;
- 3 096 products имеют retained unmapped source attributes, 29 category mappings и 225 supplier tags остаются review debt без потери данных;
- media migration в Supabase Storage не выполнялась.

## Result

**PRODUCTION CUTOVER SUCCESSFUL**
