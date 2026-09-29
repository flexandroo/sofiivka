# SOFIEVKA CONTROLLED DATA SOURCE CUTOVER REPORT v1

Дата: 2026-09-29
Финальный Preview: `https://sofievka-n3qb8kunb-flexandroos-projects.vercel.app`
Vercel deployment: `dpl_6AqWqBJnG7WtsEa9vg4bTFtCitSc`, `READY`, target Preview, `productionUrl=null`
Supabase DEV: `sofievka`, ref `wfxcklglujgramasdzyr`, `ACTIVE_HEALTHY`, region `eu-west-1`

## 1. Data source config

- Добавлен явный `SOFIEVKA_CATALOG_SOURCE=local|supabase`.
- Без environment variable build выбирает `local`.
- `supabase` требует `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` и `SOFIEVKA_SUPABASE_PROJECT_REF`.
- Неверный source, отсутствующий config, URL/ref mismatch и privileged key останавливают build/startup.
- Localhost query override разрешён только при `SOFIEVKA_DEV_CATALOG_SOURCE=true`; это не production config.
- Production build запрещает DEV ref и требует отдельный explicit production allow flag.

## 2. Script-loading changes

- Runtime config вставляется до `catalog-data.js`, `page-shell.js` или `script.js` во всех 33 HTML-файлах.
- Supabase build удаляет 256 `<script>` tags восьми supplier feeds и не копирует сами feed-файлы.
- `catalog-data.js` остаётся как ~198 KB shared taxonomy/routing/normalization/bootstrap runtime; 45.5 MB product snapshot в него не встроен.
- `water-catalog-data.js` остаётся как небольшая taxonomy compatibility data, не product feed.
- Local build сохраняет прежние feed tags/files.

## 3. PLP cutover

- PLP использует scoped async `listProducts` и server facets.
- Сохранены layout, cards, breadcrumbs, category navigation, sorting, load-more и empty/error/loading states.
- Large и small PLP проверены: gas boilers 57, borehole pumps, reverse osmosis 19.
- State-aware PLP выполняет максимум один дополнительный bulk lookup сохранённых legacy IDs; N+1 отсутствует.

## 4. PDP cutover

- PDP использует `getProductById(legacyId)`; URL остаётся `/product?id={legacy_id}`.
- Проверены gallery, price, availability, description, specs, breadcrumbs, related и mobile layout.
- Related products приходят в том же scoped PDP response; full snapshot не нужен.
- Representative PDP: `MO550MECOSTD`.

## 5. Search cutover

- Search page и autocomplete используют server-side search в Supabase mode.
- Сохранены `/search?q=`, grouped suggestions, keyboard-ready ARIA structure, debounce/cancellation и exact SKU priority.
- Mobile autocomplete `wilo`: 8 suggestions (products, brand и series groups).
- Scoped parity: 45 search cases, 0 critical diffs; full adapter parity: 25 cases, 0 critical diffs.

## 6. Facet cutover

- Facets загружаются scoped RPC и сохраняют AND между facets, OR внутри facet, multi-select, price, brand, availability и technical filters.
- URL state, reset, mobile apply и `popstate` сохранены.
- Проверен `?sort=price-asc`: back возвращает базовый URL, forward восстанавливает sort URL/results.

## 7. Collections and homepage handling

- Hero/static homepage content не изменялся.
- Hits и sale переведены на lightweight collections API.
- Homepage загружает 8 `homepage-products` и 8 `homepage-sale-products`; UI показывает 16 карточек.
- Проверены также `horeca=5`, `sale=18`, `sinum=110` в scoped parity.

## 8. Cart, favorites, compare and viewed handling

- В DataSource contract добавлен `getProductsByIds(ids)`; Supabase реализация делает один `get_catalog_products(product_ids)` request.
- Cart, favorites, compare, checkout и PDP viewed IDs используют legacy IDs без DB UUID.
- Исправлена state hydration: сохранённые IDs загружаются одним bulk request, текущие scoped cards регистрируются в page cache.
- Browser QA после reload: cart и favorite active, header counts `1/1`, compare сохраняет четыре совместимых товара, включая `MO650MECOSTD`.
- Existing viewed IDs резолвятся одним bulk request максимум для 8 позиций.

## 9. Preview environment

- Vercel Preview содержит только четыре public config variables: source, URL, publishable key и DEV project ref.
- Production environment variables не изменялись и остались пустыми.
- Preview source после rollback test восстановлен в `supabase`.
- Service role, DB password, access token и importer credentials не добавлялись.

## 10. Preview deployment URL and status

- Финальный URL: `https://sofievka-n3qb8kunb-flexandroos-projects.vercel.app`.
- Status: `READY`; deployment protection: Vercel Authentication.
- Build manifest: `source=supabase`, `environment=preview`, ref `wfxcklglujgramasdzyr`, 33 HTML, 256 removed tags, supplier files absent.
- Production deployment не выполнялся; `productionUrl=null`.

## 11. Network audit

- Protected Preview проверен через authenticated `vercel curl`.
- 10 representative routes вернули HTTP 200.
- Все восемь supplier feed URLs вернули HTTP 404.
- Full snapshot RPC не используется в normal PLP/PDP/search flow.
- Scoped journeys: first PLP `bootstrap + products + facets`; repeated PLP `products + facets`; first PDP `bootstrap + pdp/related`.
- Shared runtime `catalog-data.js` остаётся, но full local products/supplier feeds не загружаются.

## 12. Cold and warm timings

Content-usable timings измерены в браузере на Preview-equivalent build против DEV Supabase; Preview защищён Vercel Authentication, поэтому remote column — authenticated HTTP response time.

| Route | Browser usable, ms | Remote HTTP, ms |
|---|---:|---:|
| `/` | 639 cold / 748 warm | 906 |
| `/catalog` | 1 638 cold / 1 331 warm | 850 |
| `/catalog/heating` | 1 076 | 440 |
| gas boilers | 541 cold / 733 warm | 394 |
| borehole pumps | 1 116 | 301 |
| reverse osmosis | 650 | 396 |
| `/brands` | 401 | 645 |
| `/brands/wilo` | 1 175 | 510 |
| `/search?q=wilo` | 1 161 cold / 987 warm | 669 |
| PDP | 857 cold / 1 210 warm | 354 |

CLI process startup не включён в remote HTTP column.

## 13. Payloads

- Full snapshot baseline: 45 457 799 bytes uncompressed.
- First PLP: 3 requests, 143 271 bytes.
- Repeated PLP: 2 requests, 22 826 bytes; bootstrap cache hit.
- First PDP: 2 requests, 141 755 bytes.
- PLP payload reduction: 99.685%, ratio 317.3×.
- Slowest scoped EXPLAIN: search 532.242 ms; все scoped queries ниже 1 s.

## 14. Local vs Preview parity

- Full parity: 3 214 public products, 0 critical diffs, 0 related diffs, 0 hidden leaks.
- Local canonical содержит 3 215 записей; единственная разница в global count ожидаема — 1 hidden record не публикуется через Supabase.
- Browser semi-automatic comparison gas boilers: одинаковые H1, 57 products, первые 12 cards и facet text.
- Prices, availability, PDP, collections и state item resolution совпадают для проверенных кейсов.

## 15. Routing and URL parity

- Legacy product URL и localStorage identity сохранены.
- Проверены `/`, catalog root, heating, three representative deep PLPs, brands, Wilo, search и PDP.
- Catalog contract: 281 routing assertions; public URL contract unchanged.
- Filter/sort state переживает browser back/forward.
- SEO остаётся client-rendered как до cutover; route title/H1/canonical logic сохранены. SSR migration не выполнялась.

## 16. Stateful flow QA

- Добавление второго product в cart и favorites проверено через UI.
- После reload PLP, cart и favorites восстанавливают legacy ID и active state.
- Compare проверен с четырьмя compatible products и reload; max/compatibility rules сохранены.
- Checkout восстанавливает cart одним bulk lookup; business logic и disclosure о неактивной отправке не менялись.
- PDP записывает recent viewed и bulk-resolves предыдущие IDs.

## 17. Mobile QA

- Viewport: 390×844.
- PLP: two-column cards, category tabs, sort и product loading проверены.
- Filter drawer: полноэкранная панель, backdrop, close и sticky apply работают.
- Autocomplete: dropdown, grouped results и scrolling работают.
- PDP gallery, price/cart block, cart и favorites проверены в Supabase mode.

## 18. Visual QA

- Desktop и mobile screenshots просмотрены для PLP, PDP, failure state и local/Supabase comparison.
- Typography, spacing, colors, cards, header/footer, filters и PDP не перерабатывались.
- Anti-AI-slop review: новых gradients/glows/pills/decorative dashboards/вложенных cards не добавлено.
- Новый failure state использует существующие Sofiivka tokens и ecommerce empty-state pattern.

## 19. Security scan

- Browser runtime содержит только publishable key; privileged credential leaks: 0.
- Service role/DB password/access token patterns отсутствуют в generated runtime config.
- Direct read-model table и anonymous finalize возвращают 401.
- Hidden product leaks: 0.
- Build отклоняет `sb_secret_`, service-role JWT, URL/ref mismatch и DEV ref в production.

## 20. Failure and retry behavior

- Controlled server использовал invalid Supabase endpoint.
- Получен `configuration-error`, понятный текст, одна retry button, 0 product cards и 0 feed scripts.
- Retry повторяет попытку и остаётся в controlled error при продолжающейся ошибке.
- Silent fallback на local отсутствует.

## 21. Rollback procedure

1. Установить Preview/Production variable `SOFIEVKA_CATALOG_SOURCE=local` для нужного environment.
2. Выполнить обычный redeploy того же commit.
3. Проверить `catalog-build-manifest.json`: source local, feed tags/files present.
4. Smoke-test `/`, `/catalog`, representative PLP/PDP/cart.

Реальный Preview rollback test: config ~6 s, cached deployment примерно 1–2 min; manifest local, `products-data.js` HTTP 200. DB/schema/data rollback не нужен. Test URL: `https://sofievka-dzyjezxty-flexandroos-projects.vercel.app`. После теста Preview env возвращён в `supabase`.

## 22. Recommended production environment architecture

Рекомендация: **B — оставить текущий `wfxcklglujgramasdzyr` как DEV и создать отдельный production Supabase project**.

Причины: существующая environment strategy уже закрепляет проект как DEV; Preview использует его публичные credentials; отдельный production project уменьшает blast radius, исключает смешение тестовых migrations/data и позволяет независимые backups/quotas/access policies. Решение не выполнялось без explicit approval.

## 23. Production cutover plan

1. Получить explicit approval и создать отдельный production Supabase project.
2. Зафиксировать production ref/region/owners/backups.
3. Применить ровно проверенные 10 migrations.
4. Импортировать production catalog через управляемый importer.
5. Выполнить count/hash/publication/relation/storage reconciliation и public RLS tests.
6. Добавить production-only URL/publishable key/ref; DEV ref должен быть запрещён.
7. Сначала выполнить production build dry-run и protected canary/preview.
8. Установить production source `supabase` и выполнить production deploy.
9. Пройти homepage/PLP/PDP/search/state/mobile/network smoke matrix.
10. Rollback при startup errors, hidden/security leak, critical parity diff, >1 MB scoped payload или устойчивой latency/error regression: source local → redeploy.

## 24. Admin implementation readiness

- Создан `ADMIN-IMPLEMENTATION-READINESS.md`.
- Read path, schema, import/reconciliation и release materialization готовы как foundation.
- До admin UI нужны mutation APIs/RPC, admin auth/RBAC, audit/versioning, media signing и draft/validate/publish workflow.
- Admin UI в этом этапе не создавался.

## 25. Changed files

- Config/build: `.env.example`, `.gitignore`, `.vercelignore`, `package.json`, `vercel.json`.
- Runtime: `catalog/data-source.mjs`, `catalog/local-data-source.mjs`, `catalog/supabase-data-source.mjs`, `catalog/data-source-bootstrap.js`, generated `catalog-data.js`, `catalog-ui.js`, `page-shell.js`, `script.js`.
- Tooling: `scripts/build-static-site.mjs`, `scripts/configure-vercel-preview.mjs`, `scripts/serve-supabase-catalog-demo.mjs`, `scripts/publish-catalog-read-model.mjs`.
- Tests: `tests/catalog-cutover-qa.mjs`, `tests/vercel-preview-http-qa.mjs`, `tests/supabase-schema-qa.js`, `tests/static-assets-qa.js`.
- Docs: этот отчёт и `ADMIN-IMPLEMENTATION-READINESS.md`.

## 26. Remaining blockers

- Отдельный production Supabase project ещё не создан — это намеренный следующий gate.
- Production migrations/import/reconciliation/public credentials требуют отдельного approval.
- Финальный Preview защищён Vercel Authentication; визуальный QA выполнялся на эквивалентном local Preview build, remote HTTP — через authenticated CLI.
- Search EXPLAIN 532 ms проходит <1 s gate, но его стоит наблюдать после production data/import и warmup.
- Production env, production Vercel deployment, product import и admin UI намеренно не выполнялись.

Приложенные machine-readable reports: `reports/catalog-cutover-preview-http-v1.json`, `reports/catalog-performance-v2.json`, `reports/catalog-scoped-parity-v2.json`.

READY FOR PRODUCTION CUTOVER
