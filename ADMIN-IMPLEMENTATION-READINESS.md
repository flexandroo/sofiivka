# ADMIN IMPLEMENTATION READINESS

Дата: 2026-09-29
Статус: production public read path активен; admin mutations и admin UI не реализованы.

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
- Схема каталога: 21 таблица с RLS, 5 views, 10 migrations, storage buckets/policies и 6 pgTAP suites.
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

## Какие backend methods нужны до admin UI

### Products

- `admin_create_product` / `admin_update_product` с optimistic concurrency (`updated_at` или version).
- Отдельные команды draft/publish/hide/archive; публикация не должна быть побочным эффектом обычного edit.
- Управляемая смена brand/category/series и проверка обязательных attributes.
- Bulk mutation/import preview, validation summary, confirm и rollback/revert release.
- Запрет изменения `legacy_id` после создания без отдельной migration-команды.

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

- Server-side signed upload/create token; service role никогда не попадает в browser.
- MIME/size/path validation, virus/content scan по выбранной инфраструктуре.
- Attach/detach/reorder, alt text, primary image, document title/type.
- Reference checks до удаления объекта storage.

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
3. Products + publish workflow.
4. Brands/categories/attributes.
5. Media/documents.
6. Collections.
7. Только после contract/security tests — admin UI.

## Итог

Production read-only storefront foundation готова для будущей админки. Public site и будущий Admin будут работать с Supabase PROD, а Preview/admin validation — с Supabase DEV. Mutation surface, RBAC, audit/versioning и media signing остаются обязательными блокерами перед созданием полноценного admin UI.
