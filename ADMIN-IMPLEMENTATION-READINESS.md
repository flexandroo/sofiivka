# ADMIN IMPLEMENTATION READINESS

Дата: 2026-09-29
Статус: production public read path активен; Admin Foundation v1 и Products Admin v1 реализованы в Preview/DEV. Production admin всё ещё не развёрнут.

## Products Admin v1

- Реализованы рабочие `/admin/products` и `/admin/products/{legacy_id}` для каталога из 3 215 товаров.
- Server-side list/search/filter/sort/pagination (50 записей), page selection и подтверждаемые bulk publish/hide/category/brand/archive.
- Транзакционные `admin_create_product`, `admin_save_product`, `admin_bulk_products`; immutable `legacy_id`; optimistic concurrency и audit trail.
- Роли enforced в UI и DB: owner/admin — полный доступ; manager — core/commercial/specifications/publication; content_manager — content/SEO/media/documents.
- Новые товары получают immutable `manual_<20 hex>` ID и создаются только как draft.
- Category-scoped attribute picker использует 648 category-attribute relations; source evidence остаётся read-only и не смешивается с canonical values.
- Media/documents поддерживают external URL и browser-safe upload в DEV Storage через user JWT и существующие policies.
- Каждая mutation повышает `catalogVersion` (`<release>:admin:<revision>`) и точечно обновляет scoped PLP/PDP/search payloads без deploy.
- DEV migrations: 15/15. Production database и production Vercel environment этим этапом не менялись.

## Admin Foundation v1

- Реализованы `/admin/login`, guarded `/admin/*`, session restore/logout/expired states и проверка active `admin_profiles`.
- Реализован branded application shell, responsive drawer, role-aware routes и украинский UI.
- Dashboard получает lightweight counts через user JWT и существующий RLS; full catalog в admin shell не загружается.
- Reusable component foundation и архитектура описаны в `ADMIN-ARCHITECTURE.md`.
- Production `/admin` не развёрнут; первый production owner не создавался.

## Environment architecture после production cutover

```text
Public site
  ↓
Supabase PROD — sofievka-prod / fkjarsouuchjiedrrblc

Future Admin UI
  ↓
Supabase PROD — только через server-authorized mutation layer

Preview и будущая admin DEV validation
  ↓
Supabase DEV — sofievka / wfxcklglujgramasdzyr
```

Production и DEV являются отдельными projects. Production storefront не использует DEV credentials; Preview не использует PROD credentials.

## Что уже готово

- Стабильная идентичность каталога: 3 215 уникальных `legacy_id`, SKU и slug без коллизий.
- Схема каталога: 21 таблица с RLS, 5 views, 15 migrations, storage buckets/policies и 6 pgTAP suites.
- Публичный Read Model v2:
  - bootstrap taxonomy/brands/attribute definitions/counts;
  - scoped product list;
  - scoped facets;
  - PDP по `legacy_id` с related products;
  - server-side search/autocomplete;
  - collections;
  - bulk product lookup по списку legacy IDs.
- Import/reconciliation tooling для управляемой загрузки и сверки каталога.
- Release/read-model materialization и проверки public/hidden visibility.
- Public browser client принимает только publishable key; service-role доступ в storefront запрещён.
- Production catalog импортирован и reconciled: 3 215 products, 3 214 public, legacy ID hash подтверждён, critical diffs 0.
- Production RLS, Read Model v2, scoped PLP/PDP/search/facets/collections/bulk lookup и browser security проверены после deployment.

## Какие backend methods уже реализованы для Products Admin

### Products

- `admin_product_reference_data`, `admin_list_products`, `admin_get_product`.
- `admin_create_product`, `admin_save_product`, `admin_bulk_products` с optimistic concurrency по `updated_at`.
- Draft/publish/hide/archive, безопасная смена brand/category/series и category-scoped attributes.
- Запрет изменения `legacy_id`; uniqueness SKU/slug обеспечивается DB constraints.
- Точечная `_admin_refresh_catalog` и монотонная `catalog_admin_cache_revision`.

## Какие backend methods остаются для следующих admin-модулей

### Brands

- Create/update visibility, description, logo, featured/order.
- Merge/redirect duplicate brand stable IDs.
- Guard: нельзя удалить бренд, пока к нему привязаны products/collections.

### Categories

- Create/update title, slug, parent, order, visibility/status и SEO fields.
- Проверка отсутствия циклов и корректного level/path.
- Preview влияния move на URLs, breadcrumbs, counts и filters.

### Attributes

- CRUD definitions/options/units/value types.
- Управление category-attribute relations, facet visibility, sort order и required status.
- Controlled rename/migration существующих product values.

### Media and documents

- Products Admin уже поддерживает attach/detach/reorder, alt text, primary image, document title/type и JWT upload по RLS.
- Для будущей глобальной media library остаются lifecycle/reuse checks, orphan cleanup и content/virus scan по выбранной инфраструктуре.

### Collections

- CRUD collection metadata, visibility, schedule.
- Bulk membership, stable manual ordering и preview состава.
- Release/finalize операция с audit record.

## Сквозные требования

- Admin auth, MFA policy и роли минимум `viewer`, `editor`, `publisher`, `admin`.
- Server-side authorization/RLS для каждой mutation; не полагаться на скрытые кнопки UI.
- Audit log: actor, timestamp, entity, before/after, request/release ID.
- Draft → validation → preview → publish workflow.
- Idempotency keys для bulk/import/finalize операций.
- Rate limits, structured errors и correlation IDs.
- Staging/DEV preview для каждой release до production publish.

## Рекомендуемый порядок реализации

1. Утвердить admin roles/MFA и server-side authorization model для существующего production project.
2. Реализовать admin service/API слой и audit log без UI.
3. Products + publish workflow — завершено в DEV/Preview.
4. Brands/categories/attribute definitions.
5. Global media library и lifecycle.
6. Collections.
7. Только после отдельного production gate — Production Admin deploy.

## Итог

Products Admin готов к отдельному production-deploy gate, но в этом этапе остаётся только в Preview/DEV. Public Production продолжает работать с Supabase PROD без admin UI; перенос миграций `006`–`010`, создание production owner и Production Admin deploy требуют отдельного явно подтверждённого этапа.
