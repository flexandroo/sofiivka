# SOFIEVKA CATALOG DATA MIGRATION REPORT v1

Дата: 2026-09-28
Итог: **READY FOR SUPABASE CATALOG ADAPTER**

## 1. DEV project confirmation

Подтверждён отдельный Supabase DEV: `sofievka`, ref `wfxcklglujgramasdzyr`, region `eu-west-1`, status `ACTIVE_HEALTHY`. Перед первой записью exact `products = 0`; migration history совпала по пяти версиям `20260928000100`–`20260928000500`. Production не использовался.

## 2. Import architecture

Реализован воспроизводимый pipeline Canonical CatalogSnapshot → validator/baseline → deterministic mapper → batched PostgREST import → independent reconciliation. Поддержаны `--dry-run`, `--apply`, `--verify`; service credentials живут только в памяти. Core seed не дублируется.

## 3. Import run ID/status

- Первый полный successful run: `25fb6d29-4bf2-5fd7-ae5c-d47bb39b8cac`, `succeeded`, 3215/3215.
- Обязательный второй successful run: `b96a67a4-d855-5da1-97f8-6b863a96f330`, `succeeded`, 3215/3215; metadata явно фиксирует `inserted=0`, `updated=3215`, `failed=0` и три review warnings.
- До первого success был один честно сохранённый partial diagnostic run: timestamp check для source records остановил импорт; importer исправлен, ошибка не маскировалась.

## 4. Products imported

В DEV: 3215 products. Duplicate legacy IDs/SKU/slugs: 0/0/0. Full product projection hash (identity, content, price, inventory, publication, SEO и relations): expected = actual `02604af2c143f76c1c43f7d4fb4dd30f7f6775282f07ec99cf04ffc08c6fcbaa`.

## 5. Product identity/hash

Sorted DB legacy ID hash совпал с baseline: `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`. Public URLs и immutable legacy IDs не менялись.

## 6. Brands reconciliation

Core brands: 36; с товарами: 11. Для всех 11 brand IDs counts до/после совпали, differences = 0. Product projection также подтверждает каждый brand FK.

## 7. Categories reconciliation

Core categories: 87; primary categories с товарами: 65. Для всех 65 category IDs counts до/после совпали, differences = 0. Secondary category rows ожидаемо 0. 29 suggestions не применялись автоматически.

## 8. Series reconciliation

Canonical/DB series: 368/368; deterministic projection hashes совпали. Duplicate stable series не созданы. Для `termojet-mega` и `termojet-box` использован документированный stable-ID fallback имени, потому что canonical source display name отсутствует.

## 9. Pricing reconciliation

`known = 631`, `unknown = 2584`, `on_request = 0`, rows with old price = 112. Invalid known prices = 0; non-known rows с amount = 0; currency вне UAH = 0. Null prices не превращались в zero.

## 10. Inventory reconciliation

`in_stock = 599`, `out_of_stock = 32`, `preorder = 0`, `discontinued = 29`, `unknown = 2555`. Exact parity достигнут; inventory не использовался как publication flag.

## 11. Publication reconciliation

Published = 3214, hidden service item = 1. Discontinued published products остались published. Anon catalog count = 3214; hidden leak = 0.

## 12. Typed attributes

23988 rows: number 12401, boolean 301, reviewed text/select 11286, option ID 0, invalid multi/empty typed rows 0. Per-definition counts и полный projection hash совпали. Curated options отсутствуют, поэтому случайные supplier options не создавались.

## 13. Source/unmapped attributes

Lossless rows: 92554 = 7148 `sourceAttributes` + 85406 `unmappedAttributes`; products с unmapped layer = 3096. Сохранены label, JSON value, порядок, layer ordinal, provenance и mapping link. Expected/actual hash: `41dd98447b9960da4ab16e4fdc13f9963d49fd425ba55f6260b6bc2770a2cc1f`.

## 14. Media

13006 rows; products without media = 23, with one = 629, with multiple = 2563. Active primary rows = 3192, duplicate active primary = 0. Порядок и external/local URLs сохранены; массовая загрузка в Storage не выполнялась.

## 15. Documents

3885 rows, products with documents = 2255, invalid/null URLs = 0, exact duplicate documents = 0. Файлы не скачивались в Storage.

## 16. Tags

225 unique supplier tags импортированы как `origin=supplier`, `status=review`; active canonical tags = 0. 4204 product-tag relations сохранены, но новая RLS-policy не показывает relation для review tag публичному клиенту. Supplier tags не стали taxonomy.

## 17. Collections

Созданы 5 collections: 3 canonical (`horeca`, `sale`, `sinum`) и 2 homepage representations. Items = 149. `homepageProductIds` и `homepageSaleProductIds` перенесены с точными IDs/order; frontend не подключался.

## 18. Source provenance

3215 source records, 12 supplier rows (11 source suppliers + canonical pipeline), raw JSONB только в provenance table. Checksum/source/mapping/raw projection hash совпал: `eb63e5fc888b3039e331af815e5e510e6cbd82e9027942a4b8042acd1fb661b2`.

## 19. Second import/idempotency

Второй полный apply начал с `productsBefore = 3215`, state `same-catalog`, завершился success. После него: products 3215, media 13006, typed attrs 23988, source records 3215, source attrs 92554; все hashes неизменны. Duplicate checks = 0. Ожидаемо добавилась только строка audit trail в `import_runs`.

## 20. Critical diffs

REST/hash reconciliation: 57/57 checks passed. Critical differences = 0, expected unexplained differences = 0. Server-side SQL reconciliation mismatches = 0.

## 21. RLS after import

Anon видит 3214 catalog products и только дочерние строки published products. Hidden product отсутствует. Raw supplier payload возвращает 401/403. Review tags и их relations не видны anon. Category mapping review queue и import provenance остаются staff-side.

## 22. API sanity

Publishable client успешно проверил: published catalog, exact SKU, brand filter, category filter, inventory filter, price sort, media, typed attributes и ordered collections. Hidden/raw leaks не обнаружены.

## 23. Performance

Все 12 ожидаемых indexes присутствуют. Последний `EXPLAIN ANALYZE` (ms): category 5.212, brand 0.844, category+brand 6.980, price 0.134, inventory 0.128, numeric facet 3.057, text facet 2.188, collection 0.340, legacy ID 0.946, exact SKU 5.460. Очевидных bottlenecks/missing indexes нет; seq scans на 3215 строках не оптимизировались без причины.

## 24. Search sanity

Exact SKU API lookup прошёл. Plans: title FTS 2.613 ms, brand/title 1.513 ms, pg_trgm typo 15.765 ms. Production search engine не менялся.

## 25. Catalog regression

Canonical snapshot был собран существующим normalizer/facade read-only. Перед handoff повторно запущены catalog contract, identity, catalog QA, Supabase schema/client tests. Frontend data source, JS feeds и URLs не переключались.

## 26. Files created/changed

- `scripts/catalog-db-utils.mjs`
- `scripts/export-canonical-snapshot.mjs`
- `scripts/import-catalog-to-supabase.mjs`
- `scripts/verify-supabase-catalog.mjs`
- `scripts/run-remote-catalog-sql-checks.mjs`
- `scripts/run-remote-catalog-sql-checks.ps1`
- `supabase/migrations/20260928000500_tag_relation_visibility.sql`
- `supabase/rls.sql`, `supabase/tests/003_rls.test.sql`, `tests/supabase-schema-qa.js`
- `package.json`
- `CATALOG-MIGRATION.md`, `CATALOG-MIGRATION-REPORT.md`
- generated ignored `reports/catalog-migration-*.json`

Никакие frontend files для этой миграции не изменялись. Commit/push/deploy не выполнялись.

## 27. Remaining blockers

Блокирующих проблем для разработки Supabase catalog adapter нет. Ожидаемые follow-ups: adapter пока не создан/не подключён; 29 category reviews требуют ручного решения; 225 supplier tags остаются review; 11286 select values ждут будущего curated option governance; два series display names используют fallback; media/documents пока остаются по текущим URL. Production import/deploy не выполнялись.

**READY FOR SUPABASE CATALOG ADAPTER**
