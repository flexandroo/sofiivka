# TD Sofiivka — Supabase Project Setup & Database Validation v1

Status: **prepared, runtime validation blocked**. The repository is ready for a disposable local or dedicated development Supabase run, but no database migration has been executed in this environment. Product import and frontend cutover remain out of scope.

## 1. Environment audit

Audit date: 2026-09-28.

| Item | Result |
| --- | --- |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| pnpm | `11.19.0` |
| Supabase CLI | Not installed |
| Docker | Not installed/available |
| `psql` | Not installed |
| WSL | Launcher exists, but no usable distribution/runtime was found |
| Existing Supabase project ref/link | None |
| Existing Supabase URL/key variables | None |
| Existing environment files | Local Vercel variables only; values were not printed |
| Product import | Not run |
| Frontend integration | Not changed |

No CLI, Docker image, package or global tool was installed. No unknown hosted project was linked and no credentials were invented. The preferred strategy is a local Supabase stack. A separately created hosted **development** project is an explicit fallback; production must not be used for this validation.

## 2. Repository structure

```text
.env.example
lib/
  supabase-client.mjs
scripts/
  check-supabase-readiness.mjs
supabase/
  config.toml
  schema.sql
  rls.sql
  storage.sql
  seed-core.sql
  seed.sql
  migrations/
    20260928000100_catalog_schema.sql
    20260928000200_catalog_rls.sql
    20260928000300_core_seed.sql
    20260928000400_storage.sql
  tests/
    001_schema.test.sql
    002_integrity.test.sql
    003_rls.test.sql
    004_queries.test.sql
tests/
  product-identity-audit.js
  supabase-client-qa.mjs
  supabase-schema-qa.js
```

`.gitignore` excludes local Supabase state and all environment files while retaining `.env.example`.

`config.toml` enables the current `pg-delta` diff engine for future schema-diff work. This v1 chain itself uses reviewed imperative migrations, so no declarative-schema directory is maintained in parallel.

## 3. Migration convention

Migration filenames use sortable UTC-style timestamps plus a short domain name. Applied migrations are immutable: corrections must be new migrations, never edits to a migration already used by a shared project.

| Order | Migration | Purpose |
| --- | --- | --- |
| 1 | `20260928000100_catalog_schema.sql` | Extensions, enums, 21 tables, constraints, triggers, indexes and five security-invoker views. |
| 2 | `20260928000200_catalog_rls.sql` | RLS, table grants, role helpers and column-scoped product RPCs. |
| 3 | `20260928000300_core_seed.sql` | Idempotent core registries: brands, categories, attribute definitions and category relations. No products. |
| 4 | `20260928000400_storage.sql` | Five buckets, storage path validator and eight object policies. |

The source SQL files remain review-friendly and are byte-checked against their migrations by `tests/supabase-schema-qa.js`. `supabase/seed.sql` is an exact copy of the idempotent core seed. A local reset therefore replays the seed after the migration that already applied it; this intentionally tests idempotency.

## 4. Preferred local setup

Prerequisites:

1. Install and start Docker Desktop.
2. Use the Supabase CLI through `npx` or install it with one of the officially supported CLI methods. Do not use an unsupported global npm install.
3. Run all commands from the repository root.

Preflight and clean reset:

```powershell
node scripts/check-supabase-readiness.mjs
npx supabase@latest --version
npx supabase@latest start
npx supabase@latest db reset --local
npx supabase@latest test db
npx supabase@latest db lint --local --level warning
npx supabase@latest status
```

Expected reset sequence:

1. Create a clean local database.
2. Apply all four migrations in filename order.
3. Replay `supabase/seed.sql` without duplicates or constraint failures.
4. Run all four pgTAP files and roll their fixtures back.
5. Report no schema-lint errors that affect this project.

To stop the local stack later:

```powershell
npx supabase@latest stop
```

Do not use `db reset --linked` for validation. Local is the safe default.

## 5. Dedicated hosted development fallback

Use this only if a local Docker runtime cannot be provided.

1. Manually create a new Supabase project whose name clearly ends in `-dev` or `-validation`.
2. Confirm it contains no production data or users.
3. Authenticate the CLI interactively.
4. Link only the new project reference.
5. Review a dry run before pushing migrations.
6. Run pgTAP against that development project, then unlink when finished.

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref <DEV_PROJECT_REF>
npx supabase@latest db push --dry-run --linked
npx supabase@latest db push --linked
npx supabase@latest test db --linked
npx supabase@latest unlink
```

Before the push, verify the project reference in the Supabase dashboard. Never substitute an unknown reference and never point these commands at the production database.

### Migration promotion ladder

1. Local/disposable: clean reset, pgTAP, lint and synthetic fixtures.
2. Dedicated development: `db push --dry-run`, push, pgTAP, lint and application smoke checks.
3. Staging, when introduced: repeat the same migration history against production-like cardinality and verify query plans/backups.
4. Production later: confirm backup/recovery, review pending migration list and dry run, schedule the change, apply only recorded migrations, then run non-destructive smoke checks.

Never edit an applied migration, manually patch production outside migration history, or use `db reset --linked` on a non-disposable project.

## 6. Environment and client boundary

Only browser-safe placeholders exist in `.env.example`:

```dotenv
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

Rules:

- Keep real values in an ignored local environment file or the deployment platform's encrypted environment settings.
- The publishable key is allowed in browser code only because database authorization is enforced by RLS.
- Never put `sb_secret_*`, legacy `service_role`, database passwords, access tokens or JWT signing secrets in browser code, `.env.example`, logs or commits.
- `lib/supabase-client.mjs` is intentionally dependency-injected and unused by the current storefront. It rejects secret/service-role keys and invalid remote HTTP URLs.
- The current catalog, search, URLs, product IDs and frontend data source remain unchanged.

Future integration example, after `@supabase/supabase-js` is deliberately added:

```js
import { createClient } from "@supabase/supabase-js";
import { createSofievkaSupabaseClient } from "./lib/supabase-client.mjs";

const supabase = createSofievkaSupabaseClient(createClient, {
  url: runtimeConfig.SUPABASE_URL,
  publishableKey: runtimeConfig.SUPABASE_PUBLISHABLE_KEY
});
```

## 7. Core seed expectations

The idempotent seed must produce exactly:

| Entity | Count |
| --- | ---: |
| Brands | 36 |
| Categories | 87 |
| Attribute definitions | 64 |
| Category-attribute relations | 648 |
| Disabled non-filterable category facets | 47 |
| Products | 0 |

Category checks cover valid parents, level consistency, no cycles and no duplicate sibling slugs. Product migration is deliberately absent.

## 8. Product identity policy

The complete 3,215-product source snapshot was audited for `legacy_id`, SKU and slug. Every set has:

- zero null or empty values;
- zero exact duplicates;
- zero case-insensitive collisions;
- zero trim collisions;
- zero Unicode NFKC normalization collisions;
- zero leading/trailing whitespace values.

Database policy:

- `legacy_id` is required, unique, trimmed and immutable;
- SKU and slug are required and trimmed;
- unique indexes on `lower(sku)` and `lower(slug)` reject future case-only collisions;
- no automatic suffix, rewrite or silent merge is allowed;
- a future import must stop and report a collision before writing canonical rows.

## 9. Auth and role architecture

Supabase Auth owns credentials, password recovery and sessions. `public.admin_profiles` owns application role and activation state.

| Action | Public | Inactive staff | Content manager | Manager | Admin | Owner |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Read eligible published catalog | Yes | Yes | Yes | Yes | Yes | Yes |
| Read draft/hidden catalog and operational data | No | No | Yes | Yes | Yes | Yes |
| Read raw supplier/import data | No | No | No | Yes | Yes | Yes |
| Edit descriptions/SEO through scoped RPC | No | No | Yes | No | Yes | Yes |
| Manage public media/documents/collections/tags | No | No | Yes | No | Yes | Yes |
| Edit price/inventory through scoped RPC | No | No | No | Yes | Yes | Yes |
| Edit normalized attributes/mapping review | No | No | No | Yes | Yes | Yes |
| Unrestricted catalog/import row writes | No | No | No | No | Yes | Yes |
| Manage non-owner profiles | No | No | No | No | Yes | Yes |
| Create/promote/demote owners | No | No | No | No | No | Yes |

Additional safeguards:

- every application table has RLS enabled;
- views use `security_invoker=true`;
- public product visibility requires published state plus an active visible brand and category;
- supplier raw payloads, imports and mapping queues have no public policy;
- manager/content writes to shared product rows use SECURITY DEFINER RPCs with explicit role checks and an empty search path;
- the final active owner cannot be demoted, deactivated or deleted;
- an admin cannot promote itself or anyone else to owner;
- an inactive profile immediately loses staff policies even if its Auth session still exists.

The first owner must be bootstrapped once, after a development Auth user exists, through the SQL editor or another trusted server-side administrative path:

```sql
insert into public.admin_profiles (user_id, name, role)
values ('<AUTH_USER_UUID>', '<NAME>', 'owner');
```

Do not create real production users during validation. For a hosted production project, disable open signup, use invitations, enable MFA for owner/admin accounts, and configure Auth email/password-reset URLs before onboarding staff.

## 10. RLS scenario matrix

`supabase/tests/003_rls.test.sql` verifies the following in a rollback-only transaction:

- anonymous users see eligible published and discontinued products;
- draft, inactive-brand and archived-category products remain hidden;
- public API views cannot bypass base-table RLS;
- anonymous users cannot read raw supplier payloads;
- content managers cannot read raw supplier/import payloads;
- inactive staff have public scope only;
- manager direct product writes change no rows, while the commercial RPC succeeds;
- manager cannot call the content RPC;
- content manager can call the content RPC but not the commercial RPC;
- content RPC rejects null/non-array structured sections;
- admin can write catalog rows but cannot self-promote to owner;
- owner can promote/demote another owner while an active owner remains;
- content manager can write valid public asset paths but not import files;
- manager cannot write content assets;
- admin can write private supplier-import paths;
- anonymous users cannot list private import objects.

## 11. Storage architecture

| Bucket | Public | Limit | Allowed content | Path convention | Writers |
| --- | ---: | ---: | --- | --- | --- |
| `product-media` | Yes | 50 MiB | JPEG, PNG, WebP, AVIF, MP4, WebM | `{product_uuid}/{asset-id}.{ext}` | content manager, admin, owner |
| `brand-media` | Yes | 5 MiB | JPEG, PNG, WebP, AVIF, SVG | `{brand_uuid}/{role}.{ext}` | content manager, admin, owner |
| `site-media` | Yes | 50 MiB | Images/SVG/video | `{section-or-collection}/{asset-id}.{ext}` | content manager, admin, owner |
| `documents` | Yes | 25 MiB | PDF | `{product_uuid}/{document_uuid}.pdf` | content manager, admin, owner |
| `import-private` | No | 50 MiB | CSV, JSON, ZIP, XML | `{supplier_stable_id}/{yyyy}/{mm}/{run_uuid}/{filename}` | admin, owner |

Public buckets are public because these assets are storefront content, not private records. Upload/update/delete still require RLS. Product, document and brand paths must resolve to an existing canonical row; site folders must use a conservative slug; import paths must begin with an existing supplier stable ID. Supplier files remain private and are never referenced by storefront tables.

## 12. Delete and lifecycle policy

Physical deletion is exceptional. Normal removal uses `status`, `publication_status`, `active` and `archived_at`.

| Parent | Child/reference behavior | Rationale |
| --- | --- | --- |
| Brand/category/series/attribute definition | `RESTRICT` while referenced | Prevent taxonomy and identity damage. |
| Product → media/documents/facets/tags/collection items/secondary categories | `CASCADE` | These are product-owned projections and cannot stand alone. |
| Product → supplier source records | `RESTRICT` | Preserve import provenance and raw audit records. |
| Product → category mapping reviews | `RESTRICT` | Preserve unresolved/resolved categorization audit. |
| Source record → source attributes | `CASCADE` | Raw attributes belong exclusively to the source record. |
| Import run referenced by source record | `RESTRICT` | Preserve provenance chain. |
| Latest import pointer on product | `SET NULL` | Product remains valid if a non-referenced run is deliberately removed. |
| Auth user audit columns | `SET NULL` | Preserve business records after staff departure. |
| Auth user → own admin profile | `CASCADE`, guarded for last owner | Remove profile with Auth account without allowing an ownerless system. |

If a product has provenance or mapping reviews, archive it. A deliberate purge requires separately reviewed removal of audit rows before the product can be deleted.

## 13. Query and performance checks

The database tests exercise representative storefront/search/facet queries. Index coverage includes:

- full-text GIN search vector;
- trigram GIN indexes for product title/model and source labels;
- case-insensitive unique SKU/slug indexes;
- composite category/publication/update and brand/publication/update indexes for PLP/brand listings;
- known-price and price-state indexes;
- typed partial facet indexes for number/text/boolean/options;
- supplier/import/mapping queue indexes;
- ordered media/document/collection indexes.

At 3,215 products, PostgreSQL may correctly choose a sequential scan in a disposable test database. Runtime tests therefore assert plan validity and index existence, not a brittle exact planner node. After real product migration, run `EXPLAIN (ANALYZE, BUFFERS)` with production-like cardinality before changing indexes.

## 14. Automated validation

Static checks that run without a database:

```powershell
node tests/supabase-schema-qa.js
node tests/supabase-client-qa.mjs
node tests/product-identity-audit.js
node scripts/check-supabase-readiness.mjs
```

Database checks that require local Supabase or a dedicated dev project:

| File | Coverage |
| --- | --- |
| `001_schema.test.sql` | Tables, types, columns, critical indexes/triggers, RLS enablement, security-invoker views, buckets and storage policies. |
| `002_integrity.test.sql` | Seed counts, category tree, identity collisions, price constraints, timestamps, immutable IDs, provenance deletes and last-owner protection. |
| `003_rls.test.sql` | Public visibility, leaks, inactive staff, role/RPC boundaries, owner/admin escalation and storage access. |
| `004_queries.test.sql` | Full-text/trigram/SKU search, facet views, representative PLP/facet plans and orphan checks. |

Every pgTAP file opens a transaction, calls `finish()` and rolls back all fixtures.

A supplemental in-memory PostgreSQL/WASM smoke run was also completed using the PGlite dependency already present in `node_modules`. After omitting only the two unavailable extensions and their three trigram operator-class indexes, it executed the then-current remaining schema, exact current RLS migration, idempotent core seed twice and exact storage migration against minimal `auth`/`storage` mocks; seed counts, normalized SKU rejection, public/content/manager RLS and last-owner protection passed. The final additive category-order check and expanded pgTAP fixtures are covered by static/migration-parity checks but were added after that smoke run. This increases SQL confidence but does **not** count as Supabase managed-runtime or pgTAP acceptance.

## 15. Current blocker and completion gate

Exact blocker: this machine has no Docker runtime, Supabase CLI, `psql`, existing safe development project or Supabase credentials. Therefore the migration chain and pgTAP suite cannot be truthfully reported as executed.

The database setup becomes runtime-validated only after all of the following are captured from a local/disposable run:

1. `db reset --local` completes all four migrations and the repeated seed without error.
2. `test db` passes all pgTAP assertions.
3. `db lint --local --level warning` has no actionable security/schema error.
4. Seed counts match the table in section 7.
5. No product has been imported and the existing frontend still reads its current catalog source.

Until those steps pass, the correct release status is **NOT READY FOR CATALOG DATA MIGRATION**. The blocker is runtime validation only; repository preparation is complete.

## 16. Official references

- Supabase local CLI workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- CLI configuration: https://supabase.com/docs/guides/local-development/cli/config
- Database testing with pgTAP: https://supabase.com/docs/guides/local-development/testing/overview
- Database testing and linting: https://supabase.com/docs/guides/local-development/cli/testing-and-linting
- Database seeding: https://supabase.com/docs/guides/local-development/seeding-your-database
- Storage buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- API keys and browser client initialization: https://supabase.com/docs/guides/api/creating-routes
