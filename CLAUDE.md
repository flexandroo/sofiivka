# Claude working notes — TD Sofiivka

Read `AGENTS.md` first: it holds the design rules and the publishing workflow.

## Environments

| What | Value |
| --- | --- |
| GitHub | `flexandroo/sofiivka`; `master` = production |
| Vercel project | `sofievka` (`prj_rzamGxxsH5ke6X4h9e2JHiwWL6PO`, scope `flexandroos-projects`) |
| Production site | https://sofievka.vercel.app |
| Supabase DEV | `sofievka` / `wfxcklglujgramasdzyr` — used by Vercel Preview |
| Supabase PROD | `sofievka-prod` / `fkjarsouuchjiedrrblc` — used by Vercel Production |

Push to `master` deploys production. Other branches deploy Vercel Preview builds against DEV.

## How Claude reaches each service

- **GitHub**: the repo is attached to the session with push access. Shallow clones need
  `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` before switching branches.
- **Supabase**: through the Supabase connector (`list_tables`, `execute_sql`, `apply_migration`,
  `list_migrations`, `get_advisors`). Schema changes go in `supabase/migrations/` first,
  are applied to DEV, verified, and only then to PROD with explicit user approval.
- **Vercel**: through the Vercel connector. Call deployment tools without `teamId` (the connection
  is not scoped to the team); protected Preview URLs may not be fetchable — the user opens them.
- **Not available in cloud sessions**: the Supabase CLI login and service-role key. Scripts that
  call `resolveProjectApiKeys` (`admin:auth:dev`, `admin:products:dev`, catalog import/verify)
  only run on the owner's Windows machine where the CLI is linked. Never ask for keys in chat.

## Checks that run anywhere

```bash
npm run -s admin:qa
npm run -s admin:products:qa
npm run -s crm:qa
npm run -s db:local:test        # every migration on in-process Postgres (PGlite) + CRM scenarios
node tests/static-assets-qa.js
node scripts/build-static-site.mjs --output-dir=dist --skip-assets
```

Full local browser QA without touching Supabase: build `dist`, then
`node tests/db-local/qa-server.mjs --port=4300` serves the site plus a PGlite-backed Supabase
look-alike (QA users `owner@qa.test`, `manager@qa.test`, `content@qa.test`, password in the file).
Playwright: `/opt/npm-tools/node_modules/playwright` with Chromium in `/opt/pw-browsers` (the
Playwright MCP blocks localhost, so drive the browser from a script).

## Admin and CRM status (2026-10-02)

- Branch `codex/audit-phase-0`: Products Admin v1 (Codex) + CRM v1 and fixes (Claude).
- All migrations through `20261002000100_taxonomy_admin_v1` are applied on DEV; PROD has none of them.
  `20261002000200_taxonomy_admin_v2` is on DEV except the two `admin_delete_*` functions, which wait
  for `/mnt/project-files/sofiivka/dev-apply-taxonomy-admin-v2-delete.sql` in the SQL Editor.
- The Supabase MCP connector silently times out on SQL with `drop trigger`, `delete from` function
  bodies or trigger loops; apply such migrations through the Supabase SQL Editor instead.
- CRM: storefront calls `crm_submit_order` / `crm_submit_lead` (anon); staff use `admin_crm_*`
  RPCs (owner/admin/manager). Admin routes `/admin/orders`, `/admin/leads`, `/admin/customers`.
- Brands/categories admin (`/admin/brands`, `/admin/categories`, `admin/admin-taxonomy.mjs`):
  content edits patch the active catalog release and bump the cache revision. Create/delete add or
  drop the release entry; delete is refused while products, series, children or mapping reviews
  reference the record. Identity fields (name, slug, parent) are set at creation, then read-only.
  `categories.homepage_order` picks the homepage «Категорії» block (release `homepageOrder`;
  empty selection falls back to active top-level sections). Storefront routing and the legacy
  adapter use the live snapshot taxonomy, so admin-created categories resolve without a rebuild.
  Homepage brand wall and brands.html still use static `brands-data.js`.
- Admin runs against DEV in Preview and PROD in Production (`admin/admin-env.mjs`).
- Go-live order: apply all pending migrations to PROD first, then merge to `master` (production
  serves `/admin` and the live checkout as soon as it deploys), then create the PROD owner profile.
