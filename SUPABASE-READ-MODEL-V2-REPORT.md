# SOFIEVKA SUPABASE READ MODEL PERFORMANCE v2 — итоговый отчёт

## 1. Root cause breakdown old 21–75s

Старый обычный путь всегда запрашивал единый JSON snapshot на 45 457 799 bytes. Отдельный `EXPLAIN (ANALYZE, BUFFERS)` показал 24 547,604 ms внутри PostgreSQL на сборку гигантского JSON. В холодном HTTP-замере ответ начал приходить через 18 100,560 ms, а весь запрос занял 19 892,156 ms; независимые замеры не позволяют честно выделить server serialization/gateway/RTT, поэтому нулевое значение для этой стадии не заявляется. После получения данных браузер дополнительно тратил 1 466,825 ms на transfer/decompression, 324,771 ms на JSON parse, 324,866 ms на canonical assembly, 228,213 ms на LegacyAdapter, 1 945,856 ms на построение client search index и 16,079 ms на facet preparation. Главный bottleneck — SQL-сборка полного snapshot; затем — client search index и parse/object assembly, а не только сеть.

## 2. New architecture

Обычный runtime разделён на version/bootstrap, paginated PLP, server facets, dedicated PDP+related, server search и editorial collections. Полный snapshot оставлен как `supabase-full` debug/parity path. Bootstrap не содержит все товары. PLP получает компактные карточки по 24, PDP — один полный товар и до четырёх related, поиск выполняется сервером. Local и Supabase источники реализуют один контракт.

## 3. DB migrations

Применены две миграции:

- `20260929000400_catalog_scoped_read_api.sql` — приватный `catalog_product_cards`, индексы, RLS/revokes, семь публичных RPC и атомарная синхронизация scoped/full read model.
- `20260929000500_catalog_facets_object_length_fix.sql` — закрытый compatibility helper и исправленный `search_path` для facets.

Перед каждой remote migration отдельно подтверждены проект `sofievka`, ref `wfxcklglujgramasdzyr`, `ACTIVE_HEALTHY`, отсутствие production/customer данных, показан план и выполнен dry-run. На момент preflight: `auth.users=0`, `admin_profiles=0`, customer/order/payment/checkout/invoice tables отсутствуют, storage objects `0`; имелись только 3 215 DEV catalog records, из них 3 214 published и 1 hidden.

## 4. New DataSource API

Добавлены `loadVersion`, `loadBootstrap`, `listProducts`, `loadFacets`, `getProductById`, `search`, `getCollection`, а `loadFullSnapshot` помечен debug-only. `LocalCatalogDataSource` и `SupabaseCatalogDataSource` дают одинаковые формы данных. Scoped query нормализует category/brand/availability/technical filters, цену, sort, query, page и page size.

## 5. Bootstrap size/time

`get_catalog_bootstrap`: 120 445 bytes decoded JSON; пять внешних DEV-сэмплов: min 110,915 ms, median 139,319 ms, p95 195,444 ms. Payload содержит 87 категорий, 36 брендов, 64 определения атрибутов и агрегаты для 3 214 публичных товаров, но не полный массив товаров.

## 6. PLP requests/size/time

Первый PLP: три запроса — bootstrap, products и facets; 143 271 bytes суммарно. Повторный PLP: два запроса — products и facets; 22 826 bytes, bootstrap cache hit. Категорийный PLP: 21 705 bytes, median 126,558 ms, p95 173,952 ms. Category+brand: 21 705 bytes, median 119,481 ms, p95 146,744 ms. Price ascending: 23 212 bytes, median 99,765 ms, p95 129,596 ms. Page 2: 22 129 bytes, median 103,243 ms, p95 134,537 ms.

## 7. Facet requests/size/time

Facet sample для reverse-osmosis: 1 121 bytes, median 111,674 ms, p95 172,128 ms. Семантика: AND между группами, OR внутри группы, self-exclusion для текущей группы, server counts для brand/category/availability/technical facets.

## 8. PDP size/time

Один PDP+related response: 21 310 bytes, median 128,842 ms, p95 305,025 ms. Первый PDP вместе с bootstrap: два запроса, 141 755 bytes. Payload включает полное описание, 29 изображений в проверенном товаре, документы, все технические атрибуты и четыре related cards.

## 9. Search time

Exact-search sample: 2 635 bytes, median 412,258 ms, p95 447,887 ms. SQL execution — 316,709 ms, это самый тяжёлый scoped query, но он укладывается в целевой бюджет 500 ms для endpoint sample и 1 s для SQL. Точное совпадение SKU/model/title приоритетно; далее используются FTS, trigram, substring и нормализация O/0.

## 10. Collection time

Collection sample `sale`: 19 072 bytes, median 109,629 ms, p95 161,829 ms. Parity подтверждён для `homepage-products` (8), `homepage-sale-products` (8), `horeca` (5), `sale` (18) и `sinum` (110), включая редакционный порядок.

## 11. Cache behavior

Bootstrap имеет TTL 300 s; scoped payloads — 60 s. Ключ кэша включает version, operation и стабильные params. Повторный PLP не запрашивает bootstrap и не строит client-side index на 3 214 товаров. Полный snapshot не попадает в обычный кэш и доступен только через debug path.

## 12. Version invalidation

`get_catalog_version` возвращает hash версии `f7cd4c0bcb211b7f78f5a7d2d1e6954ee2464b6f268c5496990e216f81c2a45e`. При обнаружении новой версии `SupabaseCatalogDataSource` очищает scoped-кэш; следующий запрос получает новые данные. Финализация публикует full debug snapshot и scoped cards согласованно.

## 13. SQL EXPLAIN results

`EXPLAIN (ANALYZE, BUFFERS)` выполнен на фактических 3 215 товарах:

| Query | Execution |
|---|---:|
| category PLP | 11,194 ms |
| category + brand | 11,359 ms |
| facets | 23,243 ms |
| price sort | 10,144 ms |
| page 2 | 10,987 ms |
| PDP | 5,433 ms |
| related, 4 rows | 2,196 ms |
| search | 316,709 ms |
| collection | 10,000 ms |

Во всех проверенных планах `sharedReadBlocks=0`, `tempReadBlocks=0`, `tempWrittenBlocks=0` в прогретом замере. Наблюдаемого индексного дефицита нет; дополнительная индексная миграция не требуется.

## 14. Payload reduction

Сравнение обычного первого PLP: 45 457 799 bytes раньше против 143 271 bytes сейчас. Снижение — 99,685%, отношение — 317,3×, предотвращённая загрузка — 45 314 528 bytes. После bootstrap повторный PLP использует только 22 826 bytes.

## 15. Memory reduction estimate

Точный browser heap не заявляется: GC и внутреннее представление строк делают единичный heap delta ненадёжным. Проверяемая нижняя граница — обычный маршрут больше не размещает 45,31 MB лишнего serialized JSON. Дополнительно не создаются 3 214 полных DTO, их LegacyAdapter-копии и client search index, поэтому фактическое уменьшение working set должно быть больше, но без профайлера не квантифицируется.

## 16. Local vs Supabase PLP parity

Проверено 12 scopes: gas boilers, solid-fuel boilers, system circulation pumps, borehole pumps, sewage pumps, reverse osmosis, water softening, smart lighting, feed grinders, heating, water supply и all. Default, price ascending, price descending, totals и first-page IDs совпали; critical diffs `0`.

## 17. PDP parity

Сравнено 36 PDP payloads. Полные данные товаров совпали, related differences `0`, hidden PDP возвращает `null`. В браузере проверены gallery, описание, характеристики, документ и четыре related cards.

## 18. Search parity

Проверено 45 запросов. Critical diffs `0`; точные SKU/model/title находят ожидаемый товар первым. Зафиксировано 21 некритичное отличие порядка широких и fuzzy результатов: серверное ранжирование осознанно отличается от старого client index, но сохраняет exact-match contract. Опечатка, не покрытая текущей нормализацией, может дать более узкий результат и остаётся кандидатом для будущего словаря/`unaccent`, а не блокером cutover.

## 19. Filter/facet parity

Facet signatures, counts, brand filter и brand self-exclusion совпали с локальной моделью во всех тестовых scopes. В браузере BAXI дал 52 результата, а self-excluded brand facet сохранил BAXI 52 и Buderus 5. Price sort для reverse osmosis сохранил ожидаемый диапазон и URL state. P3: две исходные availability-группы газовых котлов имеют одинаковую человекочитаемую подпись «Наявність уточнюйте»; это семантика существующих данных, не ошибка scoped RPC.

## 20. Routing parity

Публичные category/brand/product/search URLs и product IDs сохранены. В DEV-режиме `dataSource=supabase` переносится через внутренние клики, GET forms, фильтрацию, сортировку и историю; обычные URL без параметра не изменяются. Проверены category click, product link, brand link, search и возвращение к local default flow.

## 21. Mobile QA

QA выполнен в браузере на viewport 390×844. PDP корректно перестраивает header, заголовок, gallery, thumbnails, purchase block и sticky quick-buy. PLP показывает две товарные колонки, мобильную сортировку и кнопку фильтров. Drawer открывается поверх страницы, содержит прокрутку, close, backdrop и фиксированную жёлтую CTA; закрытие возвращает collapsed state. URL сохраняет `dataSource=supabase`. Ранее также проверен промежуточный responsive viewport 884×704.

## 22. Visual QA

Desktop, responsive и mobile состояния проверены в реальном браузере. Scoped PLP/PDP/homepage сохраняют существующие typography, spacing, карточки, техническую иерархию и product-first композицию. Skeleton повторяет структуру карточек, empty/error/retry и load-more используют существующие компоненты. Anti-AI-slop review: P0/P1/P2 findings для новых изменений отсутствуют; не добавлены gradients, glow, декоративные pills, nested-card clutter, stock imagery или шаблонная SaaS-композиция.

## 23. Security/RLS

Публичные RPC исключают hidden товары и возвращают только разрешённые поля. `catalog_product_cards` и source records недоступны anon (`401`), а служебная финализация не вызывается anon (`404` в scoped security test; `401` в полном adapter test). Forbidden field leaks `0`, privileged credential leaks `0`. Функции имеют фиксированный `search_path`, явные grants/revokes; private helper также закрыт.

## 24. Error behavior

Remote error не маскируется автоматическим переходом на локальный полный каталог. Пользователь видит контролируемый error state и retry; filters получают отдельное недоступное состояние. Устаревшие PLP и autocomplete запросы отменяются, поздние ответы игнорируются. Пустые результаты имеют отдельный empty state. Загрузочные skeletons и `aria-busy` не меняют layout внезапно.

## 25. Production impact

Production impact отсутствует. Default source остаётся local; production frontend не подключён к Supabase, environment production не изменён, Vercel deploy не выполнялся, `origin/master` не обновлялся. Импорт 3 215 товаров в этом этапе не выполнялся: тесты работали с уже существующим DEV dataset. Docker не использовался.

## 26. Files changed

Основные файлы этапа:

- `supabase/migrations/20260929000400_catalog_scoped_read_api.sql`
- `supabase/migrations/20260929000500_catalog_facets_object_length_fix.sql`
- `supabase/tests/006_scoped_read_api.test.sql`
- `catalog/data-source.mjs`
- `catalog/local-data-source.mjs`
- `catalog/supabase-data-source.mjs`
- `catalog/data-source-bootstrap.js`
- `catalog/catalog-facade.js`
- `catalog/legacy-adapter.js`
- `catalog-ui.js`
- `page-shell.js`
- `script.js`
- `catalog-data.js`
- `scripts/serve-supabase-catalog-demo.mjs`
- `scripts/preflight-scoped-read-model.mjs`
- `scripts/preflight-scoped-read-model.ps1`
- `scripts/measure-catalog-performance-baseline.ps1`
- `scripts/measure-catalog-performance-v2.ps1`
- `tests/catalog-performance.mjs`
- `tests/catalog-performance-v2.mjs`
- `tests/catalog-scoped-parity.mjs`
- `tests/supabase-schema-qa.js`
- `package.json`
- `SUPABASE-READ-MODEL-V2.md`
- `SUPABASE-READ-MODEL-V2-REPORT.md`

## 27. Remaining blockers

Блокеров для контролируемого переключения DEV data source не осталось. Все JS syntax checks, `git diff --check`, 281 catalog routing assertions, contract/hash checks, identity audit, Supabase client QA, schema static QA, scoped parity, full debug parity, remote security checks, EXPLAIN budgets и browser QA прошли. Локальный runtime pgTAP не запускался в рамках Docker-free стратегии; SQL suite добавлен и статически проверен, а соответствующее поведение покрыто удалёнными read-only parity/security тестами. Search остаётся самым тяжёлым scoped endpoint (median 412,258 ms; SQL 316,709 ms), но находится внутри принятого бюджета и не требует преждевременной индексной миграции.

READY FOR CONTROLLED DATA SOURCE CUTOVER
