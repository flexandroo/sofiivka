# Sofiivka Catalog Data Migration v1

Этот runbook переносит текущий `Canonical CatalogSnapshot` в отдельный Supabase DEV-проект. Он не переключает frontend, не меняет production, public URLs или legacy IDs и не удаляет JS feeds.

## Безопасность и prerequisites

- Рабочая директория: корень репозитория Sofiivka.
- Node.js 20+ и project-local Supabase CLI установлены через `npm install`.
- `npx supabase login` выполнен локально; секрет хранится только в Supabase CLI/Windows Credential Manager.
- Проект должен быть linked к `sofievka`, ref `wfxcklglujgramasdzyr`, status `ACTIVE_HEALTHY`.
- Локальная и remote migration history должны совпадать по версиям `20260928000100`–`20260928000500`.
- До первого импорта `public.products` должен быть пуст. Повторный импорт разрешён только если существующий набор — точное множество deterministic UUID/legacy IDs текущего snapshot.
- Service role и access token нельзя передавать аргументом, писать в `.env`, log или report. Importer получает ключи в память через авторизованный CLI.

Проверка проекта и миграций:

```powershell
npx supabase projects list --output json --agent no
npx supabase migration list --linked --agent no
```

Importer сам повторяет эти проверки и отказывается работать с другим именем/ref, нездоровым проектом, несовпадающей историей или посторонним набором товаров.

## Источник данных и pipeline

Порядок данных неизменяем:

```text
Raw supplier feeds
  -> existing normalizer
  -> Canonical CatalogSnapshot
  -> deterministic DB mapper
  -> Supabase DEV
```

Raw supplier objects не используются как `products`. Полный raw JSON хранится только в `product_source_records`; lossless source/unmapped evidence — в `product_source_attributes`.

Runtime snapshot собирается в том же порядке файлов, что и legacy catalog. Baseline создаётся командой:

```powershell
npm run catalog:snapshot
```

Результат: `reports/catalog-migration-baseline.json`. Reports не содержат credentials и исключены из Git как generated artifacts.

## Dry run

```powershell
npm run catalog:migrate -- --dry-run --project-ref=wfxcklglujgramasdzyr
```

Dry run:

1. подтверждает identity/status linked DEV;
2. сверяет пять migration versions;
3. получает service role только в память процесса;
4. собирает и валидирует snapshot;
5. строит весь normalized payload без записи;
6. проверяет, что DB пустая или содержит только тот же deterministic catalog set;
7. пишет sanitized baseline/preflight reports.

## Apply

```powershell
npm run catalog:migrate -- --apply --project-ref=wfxcklglujgramasdzyr --batch-size=250
```

Dependency order: suppliers, series, products, secondary categories, options, typed attributes, source records, source attributes, media, documents, tags, product tags, collections, collection items, mapping reviews.

Core seed (`brands`, `categories`, `attribute_definitions`, `category_attributes`) не импортируется повторно. Products upsert по `legacy_id`; остальные mutable child projections используют deterministic identity или controlled replace только для 3215 managed product UUID. Raw payload batches дополнительно ограничены по bytes.

Progress logs содержат только имя таблицы, строки и batch number. Raw payload и секреты не печатаются.

## Verify

Полная REST/RLS/hash reconciliation:

```powershell
npm run catalog:migrate -- --verify --project-ref=wfxcklglujgramasdzyr
```

Она перечитывает данные из DEV и сравнивает canonical hashes для products, series, typed attributes, raw JSON/source records, всех 92 554 source rows, media, documents, tags, collections и review queue. Затем отдельным publishable client проверяет public RLS, отсутствие hidden/raw leaks и реальные brand/category/price/inventory/media/attribute/collection запросы.

Server-side counts, duplicates, indexes и plans:

```powershell
npm run catalog:sql-checks -- -ProjectRef wfxcklglujgramasdzyr
```

Windows wrapper читает Supabase access token из `Supabase CLI:supabase` в Credential Manager, передаёт его только через process environment и очищает переменную в `finally`. SQL audit выполняет read-only reconciliation и `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

## Повторный запуск

Перед каждым apply сначала выполняйте dry run. Для того же snapshot он должен вывести:

```text
exactProductsBefore: 3215
existingCatalogState.state: same-catalog
```

После повторного apply снова запустите обе verify-команды. Catalog counts и hashes должны остаться неизменными; новая строка допустима только в `import_runs`, потому что это журнал запусков. Если существующий product set отличается, importer останавливается и ничего не очищает.

## Ожидаемые количества

| Сущность | Ожидается |
|---|---:|
| Products | 3215 |
| Published / hidden | 3214 / 1 |
| Core brands / categories / attributes | 36 / 87 / 64 |
| Brands/categories with products | 11 / 65 |
| Series | 368 |
| Typed attributes | 23988 |
| Source records / evidence rows | 3215 / 92554 |
| Canonical source / unmapped layers | 7148 / 85406 |
| Products with unmapped layer | 3096 |
| Media / documents | 13006 / 3885 |
| Review tags / product-tag rows | 225 / 4204 |
| Collections / items | 5 / 149 |
| Category mapping reviews | 29 |

Identity hash: `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`.

## Очистка catalog data в DEV

Очистка является destructive операцией. Выполняйте её только вручную в SQL Editor после повторного подтверждения project name/ref. Она не должна применяться к production. Core taxonomy seed сохраняется.

```sql
begin;
delete from public.category_mapping_reviews;
delete from public.product_source_attributes;
delete from public.product_source_records;
delete from public.product_collection_items;
delete from public.product_collections;
delete from public.product_tags;
delete from public.tags where origin in ('supplier', 'migration');
delete from public.product_documents;
delete from public.product_media;
delete from public.product_attribute_values;
delete from public.product_categories;
delete from public.products;
delete from public.product_series;
delete from public.import_runs;
delete from public.suppliers;
commit;
```

После очистки проверьте exact `products = 0`, выполните dry run, apply и обе verify-команды.

## Export и backup strategy

Source-controlled canonical feeds + deterministic importer являются основным воспроизводимым backup. Для аудита сохраняются sanitized JSON reports: baseline, apply, verification и SQL checks. Полный dump `auth` не создаётся и не коммитится. При необходимости catalog-only backup создаётся отдельно из schema `public`, хранится вне Git и проверяется на отсутствие credentials/private auth data.

## Troubleshooting

- `Migration history mismatch`: не импортировать; сначала выяснить, почему local/remote versions расходятся.
- `expected linked ACTIVE_HEALTHY DEV`: проверить login/link, project name и ref; не обходить guard.
- `existing products are not the exact deterministic catalog set`: не удалять данные автоматически; провести reconciliation вручную.
- HTTP 413/timeout: уменьшить `--batch-size` (допустимо 25–500); raw batches всё равно ограничены по bytes.
- Partial/failed `import_runs`: исправить причину, выполнить dry run и повторить apply. Ошибочная строка журнала остаётся как audit trail.
- Verification hash mismatch: открыть `reports/catalog-migration-verification.json`; mismatch является CRITICAL до объяснения/исправления.
- Sequential scan: при 3215 строках сам по себе не дефект. Оценивать `Execution Time`, buffers и наличие подходящего индекса вместе.

Frontend adapter, production deploy, Storage download всех изображений и admin UI не входят в этот этап.
