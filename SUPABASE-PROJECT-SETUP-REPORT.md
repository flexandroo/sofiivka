# SOFIEVKA SUPABASE REMOTE DEV VALIDATION REPORT v1

Дата проверки: 2026-09-28.

## 1. CLI version

Использован project-local Supabase CLI `2.118.0` из `devDependencies` (`npx supabase`). Глобальная установка не выполнялась.

## 2. Confirmed DEV project ref

До `link` выполнен read-only `supabase projects list`.

- Project name: `sofievka`
- Project ref: `wfxcklglujgramasdzyr`
- Region: `eu-west-1`
- Status: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6.1.166`
- Created: `2026-09-28T12:27:17.787721Z`

Ref совпал с предоставленным пользователем отдельным DEV project. Пользователь отдельно подтвердил, что production frontend к нему не подключён.

Перед migrations remote migration history была пустой, а `inspect db table-stats` вернул пустой список application tables. После targeted удаления только созданных тестом user IDs финальная Auth Admin проверка вернула `auth.users = 0`, то есть ранее существовавших Auth accounts также не было. Production data не обнаружены. `db reset` не использовался.

## 3. Migration apply result

После identity/data checks выполнены:

1. `supabase link --project-ref wfxcklglujgramasdzyr`
2. `supabase db push --dry-run --linked`
3. `supabase db push --linked`

Dry-run показал только четыре ожидаемые repository migrations. Все четыре применились без SQL errors:

- `20260928000100_catalog_schema.sql`
- `20260928000200_catalog_rls.sql`
- `20260928000300_core_seed.sql`
- `20260928000400_storage.sql`

`supabase db lint --linked --level warning` завершился с `No schema errors found`.

## 4. Migration history

Финальный `supabase migration list --linked` подтвердил точное совпадение local/remote:

- `20260928000100`
- `20260928000200`
- `20260928000300`
- `20260928000400`

Дополнительная SQL-проверка `supabase_migrations.schema_migrations` вернула те же четыре версии в том же порядке. Ad-hoc schema patches не применялись.

## 5. Core table/seed counts

Точные remote counts после migrations и после удаления всех test fixtures:

- `brands = 36`
- `categories = 87`
- `attribute_definitions = 64`
- `category_attributes = 648`
- disabled non-filterable facets `= 47`
- `products = 0`
- non-core rows `= 0`

Подтверждены:

- 21 application tables;
- RLS на всех 21 tables;
- 5 `security_invoker` views;
- 68 policies в `public`;
- 19 ожидаемых application functions;
- 32 application triggers;
- все 7 критических identity/search/PLP/facet indexes.

## 6. RLS live test

Официальный `supabase test db --linked` не смог стартовать `pg_prove`, потому что CLI требует Docker/Podman даже при `--linked`. Результат не симулировался.

Вместо этого те же repository pgTAP files были выполнены непосредственно в DEV PostgreSQL через официальный Management API SQL endpoint. Каждый файл работал в транзакции и завершался `ROLLBACK`:

- schema: `27/27`
- integrity: `32/32`
- RLS: `65/65`
- queries: `17/17`
- total: `141/141`

Дополнительно выполнены 47 live HTTP checks через Auth/Data/Storage APIs для `anon`, authenticated without profile, `content_manager`, `manager`, `admin`, `owner`.

## 7. Public visibility test

Создано семь временных products: published, draft, hidden, archived, discontinued+published, published с inactive brand, published с hidden category.

Через anon Data API были видны только две допустимые записи:

- обычный published product;
- discontinued product с `publication_status = published`.

Draft, hidden, archived, inactive-brand и hidden-category products не выдавались. `catalog_products` показал тот же результат и не обошёл RLS.

Authenticated user без `admin_profiles` получил тот же public-only scope.

## 8. Child leak test

Для public, draft, hidden и archived products были созданы временные rows в:

- `product_media`
- `product_documents`
- `product_attribute_values`
- `product_categories`
- `product_collection_items`

Anon Data API во всех пяти tables вернул только child row опубликованного public product. Связанные с draft/hidden/archived products rows не утекли.

Anon raw source read был отклонён. `content_manager` видел 0 raw source rows. `manager`, `admin` и `owner` видели разрешённую временную provenance row.

## 9. Auth role test

Через Supabase Auth Admin API созданы пять временных users: unprofiled, content manager, manager, admin, owner. Все пять реально вошли через password grant и использовали собственные access tokens.

Проверено:

- unprofiled: public read only, no catalog writes, no admin profile access;
- content manager: content RPC и media metadata writes разрешены; commercial RPC, brand writes и raw imports запрещены;
- manager: commercial RPC и raw source read разрешены; content RPC и brand writes запрещены;
- admin: catalog writes разрешены; self-promotion to owner запрещён;
- owner: catalog writes и управление admin roles разрешены.

Все временные profiles и Auth users удалены. Финальные counts: `auth.users = 0`; `admin_profiles = 0`.

## 10. Storage test

Подтверждены пять buckets:

- public: `product-media`, `brand-media`, `site-media`, `documents`;
- private: `import-private`.

Подтверждены 8 Sofiivka storage policies.

Live checks:

- anonymous upload отклонён;
- content manager загрузил маленький PNG в `site-media`;
- этот public object прочитан anon;
- admin загрузил маленький CSV в `import-private`;
- public endpoint не отдал private object;
- admin прочитал private object через authenticated endpoint.

Оба test objects удалены. Финальный count временных Storage objects: `0`.

## 11. Identity constraints

На remote DEV реальными Data API writes подтверждены:

- duplicate legacy ID rejection;
- trimmed non-empty legacy ID/SKU/slug checks;
- immutable `legacy_id` trigger;
- case-insensitive unique SKU;
- case-insensitive unique slug;
- category hierarchy/cycle/sibling-slug rules;
- price-state consistency;
- FK `RESTRICT`/`CASCADE` behavior;
- last-active-owner protection;
- automatic `updated_at`.

Все constraint fixtures выполнялись транзакционно либо были удалены.

## 12. SKU/slug constraints

Фактический local catalog audit повторно прошёл на 3 215 products:

- SKU: null `0`, empty `0`, exact duplicates `0`, case/trim/NFKC collisions `0`, surrounding whitespace `0`;
- slug: null `0`, empty `0`, exact duplicates `0`, case/trim/NFKC collisions `0`, surrounding whitespace `0`;
- legacy ID: те же нулевые conflict counts.

Remote constraints отдельно отклонили case-insensitive duplicate SKU и slug с SQLSTATE `23505`, whitespace identity с `23514`, изменение `legacy_id` с `P0001`.

## 13. Security findings

- Remote lint: 0 warnings/errors.
- 21/21 application tables защищены RLS.
- Все 5 storefront/API views используют `security_invoker`.
- Secret/service-role key применялся только в памяти server-side validation process, не выводился, не записывался и не подключался к browser code.
- `.env.example` содержит только пустые `SUPABASE_URL` и `SUPABASE_PUBLISHABLE_KEY`.
- `.gitignore` закрывает `.env*`, Supabase env/temp/link state и `node_modules`.
- Secret pattern scan не обнаружил сохранённых access tokens, database passwords, JWT или secret keys.
- Исправлена ошибка pgTAP tests: code-only `throws_ok` теперь использует документированную форму `throws_ok(sql, SQLSTATE, NULL, description)`. После исправления remote suite — `141/141`.

## 14. Catalog regression

Локальный существующий catalog не менялся и прошёл regression:

- canonical products: `3215`
- catalog published products: `3214`
- validation errors: `0`
- product ID hash: `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`
- public URL contract changed: `false`
- category assignments changed: `false`

Frontend source не подключался к Supabase. 3 215 products не импортировались.

## 15. Changed files

Изменения текущего remote-validation этапа:

- `package.json` — project-local Supabase CLI dependency;
- `package-lock.json` — зафиксирован dependency graph;
- `supabase/tests/002_integrity.test.sql` — корректная форма `throws_ok`;
- `supabase/tests/003_rls.test.sql` — корректная форма `throws_ok`;
- `SUPABASE-PROJECT-SETUP-REPORT.md` — этот фактический remote DEV report.

Link state находится только в ignored `supabase/.temp`. Secrets в changed files отсутствуют.

## 16. Remaining blockers

Acceptance blockers для начала отдельного этапа catalog data migration не обнаружены.

Ограничение окружения задокументировано: стандартная CLI-команда `supabase test db --linked` требует Docker/Podman для `pg_prove`. Это компенсировано прямым транзакционным выполнением всех pgTAP SQL files в remote DEV (`141/141`) и отдельными live Auth/Data/Storage API tests (`47/47`).

Не выполнялись и остаются отдельными будущими решениями:

- import 3 215 products;
- подключение frontend;
- deployment сайта;
- production project или production credentials.

## Итоговый статус

**READY FOR CATALOG DATA MIGRATION**
