# SOFIEVKA PRODUCTION SUPABASE RUNBOOK

Дата: 2026-09-29
Область: public catalog database, Read Model v2 и Vercel storefront. Admin UI не входит в этот runbook.

## Environment contract

| Environment | Supabase project | Project ref | Vercel scope |
|---|---|---|---|
| DEV / staging | `sofievka` | `wfxcklglujgramasdzyr` | Preview |
| Production | `sofievka-prod` | `fkjarsouuchjiedrrblc` | Production |

Refs обязаны различаться. Preview никогда не должен использовать PROD, а Production — DEV. Перед каждой remote-командой выполнить `npx supabase projects list` и сверить `name`, `ref`, `linked` и `ACTIVE_HEALTHY`.

## Secrets policy

- В Git, reports, screenshots и generated bundles не сохраняются DB password, access token, secret/service-role key или production `.env`.
- Service-role разрешён только в памяти процесса контролируемого importer/verifier.
- Storefront получает только `SUPABASE_URL` и publishable/public key.
- `catalog-runtime-config.js` не должен содержать `sb_secret_`, JWT с ролью `service_role`, DB URL с паролем или access token.

## Bootstrap нового environment

1. Зафиксировать текущий DEV ref.
2. Подтвердить целевой project через `npx supabase projects list`.
3. Выполнить `npx supabase link --project-ref <target-ref>`.
4. До migrations проверить:
   - `npx supabase migration list --linked`;
   - `npx supabase inspect db table-stats --linked --output json`;
   - application tables и `products` count;
   - Auth users и Storage buckets безопасной count-only проверкой.
5. При неожиданных migrations/data остановиться. Не использовать `db reset` для production.

## Migrations

Используется только существующий immutable chain в `supabase/migrations`:

1. `20260928000100_catalog_schema.sql`
2. `20260928000200_catalog_rls.sql`
3. `20260928000300_core_seed.sql`
4. `20260928000400_storage.sql`
5. `20260928000500_tag_relation_visibility.sql`
6. `20260929000100_catalog_public_snapshot.sql`
7. `20260929000200_catalog_snapshot_materialization.sql`
8. `20260929000300_catalog_snapshot_rpc_timeout.sql`
9. `20260929000400_catalog_scoped_read_api.sql`
10. `20260929000500_catalog_facets_object_length_fix.sql`

Команды:

```powershell
npx supabase db push --linked --dry-run --include-all
npx supabase db push --linked --include-all
npx supabase migration list --linked
```

После migrations и до product import ожидаются: brands 36, categories 87, attribute definitions 64, category attributes 648, products 0 и пять Storage buckets (`product-media`, `brand-media`, `site-media`, `documents`, private `import-private`).

## Catalog import and reconciliation

Canonical source загружается только существующим importer:

```powershell
node scripts/import-catalog-to-supabase.mjs --dry-run --project-ref=<target-ref> --report-dir=reports/<environment>
node scripts/import-catalog-to-supabase.mjs --apply --project-ref=<target-ref> --report-dir=reports/<environment>/first-import
node scripts/publish-catalog-read-model.mjs --project-ref=<target-ref> --report-dir=reports/<environment>
node scripts/publish-catalog-read-model.mjs --apply --project-ref=<target-ref> --report-dir=reports/<environment>
node scripts/import-catalog-to-supabase.mjs --verify --project-ref=<target-ref> --report-dir=reports/<environment>/first-import
```

Expected dataset:

- products 3 215; published 3 214; hidden 1;
- legacy ID hash `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`;
- series 368; typed attributes 23 988; source evidence 92 554;
- media 13 006; documents 3 885;
- duplicate legacy ID/SKU/slug 0.

Затем выполнить второй `--apply` и повторный `--verify`. Latest import metadata должны показывать `inserted=0`, `updated=3215`, `failed=0`; все counts и hashes остаются неизменными.

SQL/count/RLS/index/EXPLAIN audit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-remote-catalog-sql-checks.ps1 -ProjectRef <target-ref> -ReportDir reports/<environment>
```

## Read Model v2 and performance

```powershell
node tests/catalog-scoped-parity.mjs --project-ref=<target-ref>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/measure-catalog-performance-v2.ps1 -ProjectRef <target-ref>
```

Critical parity differences должны быть 0. Обычные PLP/PDP/search flows используют scoped RPC/API; debug full snapshot не входит в normal load.

## Vercel configuration

Production scope:

```text
SOFIEVKA_CATALOG_SOURCE=supabase
SUPABASE_URL=https://fkjarsouuchjiedrrblc.supabase.co
SUPABASE_PUBLISHABLE_KEY=<PROD publishable key>
SOFIEVKA_SUPABASE_PROJECT_REF=fkjarsouuchjiedrrblc
SOFIEVKA_ALLOW_PRODUCTION_SUPABASE=true
```

Preview сохраняет DEV ref `wfxcklglujgramasdzyr` и не изменяется production config-командами.

Reproducible configuration:

```powershell
node scripts/configure-vercel-preview.mjs --environment=production --source=supabase
npx vercel env ls production
npx vercel env ls preview
```

Build gate обязан показать `source=supabase`, `environment=production`, PROD ref, `supplierFeedFilesIncluded=false` и удалённые supplier script tags.

## Deploy and smoke checks

Штатный workflow: commit task files и push в `origin/master`; Vercel Git integration использует production branch `master` и production domain `https://sofievka.vercel.app`.

После READY deployment проверить `/`, `/catalog`, representative category routes, `/brands`, `/brands/wilo`, `/search?q=wilo` и `/product?id=MO550MECOSTD`. Проверить HTTP status, DOM content, scoped source, PLP/facets/PDP/search, cart/favorites/compare/viewed, desktop и 390×844.

Network acceptance:

- `document.documentElement.dataset.catalogDataSource` = `supabase-scoped`;
- runtime config ref = PROD;
- supplier feeds отсутствуют;
- normal flows не вызывают full snapshot RPC и не загружают full product payload;
- browser bundles не содержат privileged credentials.

## Rollback

Rollback не откатывает database migrations и не удаляет imported PROD data.

1. Установить Production source в `local`:

   ```powershell
   node scripts/configure-vercel-preview.mjs --environment=production --source=local
   ```

2. Redeploy последнего проверенного Git revision штатным Vercel workflow.
3. Проверить `catalog-build-manifest.json`: `source=local`, supplier feeds included.
4. Smoke-check catalog/PDP/search и stateful IDs.

Для возврата на Supabase повторить production configuration с `--source=supabase` и redeploy. Local data layer и supplier feeds не удалять до отдельного cleanup stage.

Rollback обязателен при catalog outage, массовых 5xx/API errors, hidden/private data leak, broken PDP identity/localStorage IDs, severe performance regression, массово неверных prices/categories или длительной недоступности PROD Supabase.

## Future schema changes

1. Создать новую timestamp migration; старые migrations не редактировать.
2. Применить и проверить на DEV `wfxcklglujgramasdzyr`.
3. Прогнать schema/client/parity/security tests и preview.
4. Отдельно link PROD `fkjarsouuchjiedrrblc`, проверить identity/history/data и выполнить dry-run.
5. Применить migration, запустить reconciliation/read-model/security/performance checks.
6. После завершения вернуть CLI link к DEV, если production maintenance окончено.
