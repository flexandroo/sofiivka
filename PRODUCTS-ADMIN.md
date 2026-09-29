# SOFIEVKA PRODUCTS ADMIN v1

Дата: 2026-09-29

Среда этапа: Vercel Preview → Supabase DEV `wfxcklglujgramasdzyr`

Production admin: не развёрнут

## Назначение

Products Admin — рабочий back-office для канонического каталога ТД «Софіївка». Он управляет 3 215 товарами без загрузки полного каталога в browser и без прямых multi-table mutations из frontend.

Маршруты:

- `/admin/products` — server-side список, поиск, фильтры, сортировка, pagination и bulk actions;
- `/admin/products/{legacy_id}` — редактор товара;
- public identity остаётся `/product?id={legacy_id}`.

## Environment boundary

```text
Vercel Preview Admin
  → publishable key + authenticated user JWT
  → Supabase DEV / wfxcklglujgramasdzyr

Production storefront
  → Supabase PROD / fkjarsouuchjiedrrblc
  → не изменён этим этапом
```

Admin runtime жёстко отклоняет любой project ref, кроме DEV. Service role, access token и DB password не попадают в browser, repository, отчёты или build artifacts.

## Products list contract

`admin_list_products(...)` выполняет list/search/filter/sort/page на сервере и возвращает только lightweight table payload.

- page size по умолчанию: 50, server maximum: 100;
- exact filtered count и `hasMore`;
- поиск: title, SKU, model, brand;
- 350 ms debounce и отмена предыдущего list request через `AbortController`;
- category filter включает descendants и показывает hierarchy path;
- filters: category, brand, publication, inventory, price status;
- sorting: updated asc/desc, title asc/desc, price asc/desc, SKU;
- при price sorting known price идёт раньше unknown/on-request;
- admin search видит published, draft, hidden и archived;
- current-page selection; нет неявного «выбрать все 3 215».

Bulk actions подтверждаются в dialog и выполняются одной транзакционной RPC:

- publish;
- hide;
- change category;
- change brand;
- archive.

Category change сохраняет series и attributes. Bulk brand change не обнуляет series: если выбранный товар имеет series другого бренда, RPC отклоняет весь batch и требует явного решения в single-product editor.

## Product editor

Editor загружает один полный товар через `admin_get_product(legacy_id)` и разделён на вкладки:

1. Основне — identity, classification, price, inventory, publication.
2. Контент — short/regular/full descriptions, structured JSON sections, badges.
3. Характеристики — canonical typed values и отдельный read-only source evidence block.
4. Медіа — URL/upload, type, role, alt, ordering.
5. Документи — title, type, URL/upload, ordering.
6. SEO — title, description и snippet preview.

Sticky action bar показывает dirty state, `Скасувати зміни` и `Зберегти зміни`. Browser unload и internal navigation предупреждают только при наличии несохранённых изменений. Tabs поддерживают mouse, Tab focus, arrow keys, Home и End.

## Identity and product creation

`admin_create_product(payload)` создаёт только draft. Immutable public identity генерируется независимо от title/slug:

```text
manual_<20 lowercase hex characters>
```

Create dialog собирает title, SKU, model, brand и category; publication=`draft`, price status=`unknown`, inventory=`unknown` показаны как фиксированные безопасные defaults. SKU и slug защищены DB uniqueness constraints. Legacy ID нельзя изменить ни UI, ни mutation RPC.

Duplicate action оставлена disabled и явно помечена как post-v1: безопасное клонирование должно потребовать новый legacy ID и новый SKU.

## Canonical attributes

`admin_product_reference_data()` возвращает:

- 64 active definitions с value type, unit, options и global filterable flag;
- 648 category-attribute relations с group, order, required и facet metadata;
- category hierarchy, brands и brand-scoped series.

Picker показывает только attributes выбранной category. Existing values, не входящие в новую category, не удаляются: editor показывает предупреждение и сохраняет их до явного решения. `Фільтр каталогу` — read-only indicator; product editor не меняет global/category facet configuration.

Input mapping:

- number → numeric input + unit;
- boolean → yes/no select;
- select → curated options;
- string → text input.

Source/unmapped evidence выводится отдельно, без raw supplier payload и без возможности случайно перезаписать provenance.

## Media and documents

Существующие external URLs сохраняются. Новые файлы загружаются browser-safe запросом с publishable key + authenticated JWT:

- media → `product-media/{product_uuid}/...`;
- PDF → `documents/{product_uuid}/...`.

Client проверяет allowlisted MIME и limits (media 50 MB, PDF 25 MB); Storage buckets/policies повторно проверяют MIME, size, role и принадлежность path существующему product UUID.

Удаление строки в editor отсоединяет asset от товара при save. Физическое orphan cleanup Storage сознательно не выполняется в v1, чтобы пользовательская ошибка не уничтожила файл; это задача будущей global media library/lifecycle stage.

## Save and transaction model

Browser никогда не выполняет последовательность прямых `UPDATE/DELETE/INSERT` по product tables. Он отправляет один sectioned JSON payload в `admin_save_product(payload)`.

В одной database transaction выполняются:

1. authentication/active-profile/role checks;
2. row lock товара;
3. optimistic concurrency по `expectedUpdatedAt`;
4. immutable legacy ID validation;
5. core/commercial/content validation;
6. typed attribute validation и replacement;
7. media/documents replacement;
8. audit record;
9. point refresh public scoped read model;
10. increment catalog revision.

Ошибка любого шага откатывает всю mutation. DB constraints остаются source of truth: known price требует amount > 0, old price должна быть больше current, SKU/slug уникальны, primary media одна.

## Roles

| Role | Read | Core/classification | Price/inventory/specs | Content/SEO/media/docs | Roles/settings |
|---|---:|---:|---:|---:|---:|
| owner | yes | yes | yes | yes | yes |
| admin | yes | yes | yes | yes | yes |
| manager | yes | yes | yes | no | no |
| content_manager | yes | no | no | yes | no |

UI disables unavailable controls, но security обеспечивается server functions и RLS. Anon и authenticated user без active profile не могут читать admin RPC payloads или выполнять mutations.

## Cache invalidation and public read model

`catalog_admin_cache_revision` и sequence создают монотонную revision. Public `catalogVersion` имеет формат:

```text
<canonical-release-hash>:admin:<revision>
```

Mutation выполняет O(1) refresh затронутого product snapshot/card вместо пересборки 3 215 товаров. Scoped RPCs `get_catalog_bootstrap`, `get_catalog_products`, `get_catalog_facets`, `get_catalog_product`, `search_catalog`, `get_catalog_collection` возвращают новую version сразу после commit.

Legacy `get_catalog_snapshot()` сохранён только как rollback/debug compatibility surface и не используется normal catalog flows или verifier. Его полный materialized payload обновляет canonical publisher, а не каждая admin mutation.

## Database migrations

- `20260929000600_products_admin_v1.sql` — list/editor reads, transactional create/save/bulk, audit, immutable ID, role gates.
- `20260929000700_products_admin_cache_revision.sql` — point refresh и revision-based invalidation.
- `20260929000800_products_admin_pdp_wrapper_fix.sql` — корректная PDP wrapper binding.
- `20260929000900_products_admin_attribute_metadata.sql` — category-scoped attribute/facet/group metadata.
- `20260929001000_products_admin_relation_safety.sql` — запрет скрытого сброса series при bulk classification changes.

Все migrations forward-only, применены сначала и только к DEV. Предыдущие migrations не редактировались.

## Verification commands

```powershell
npm run admin:products:qa
npm run admin:qa
npm run admin:products:dev
npm run admin:auth:dev
npm run catalog:adapter:verify
npm run catalog:scoped:parity
npm run catalog:cutover:qa
node tests/supabase-schema-qa.js
node scripts/verify-supabase-catalog.mjs --project-ref=wfxcklglujgramasdzyr --report-dir=reports
npm run site:build
```

`admin:products:dev` создаёт dedicated draft product и временных users, проверяет mutations/roles/Storage/public update и удаляет fixtures. После теста ожидаются 3 215 products, 3 214 published и 0 admin profiles.

## Production gate

Этот этап не переносит migrations `006`–`010` в PROD, не создаёт production owner и не выполняет production deploy. Для Production Admin нужен отдельный gate: PROD migration/reconciliation, owner bootstrap, Production Vercel env, security regression, deployment и rollback procedure.
