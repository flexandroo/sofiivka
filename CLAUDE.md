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

- Branch `codex/audit-phase-0`: Products Admin v1 (Codex) + CRM + every admin section from the
  2026-10-02 audit (Claude). PROD has none of the admin/CRM migrations.
- DEV has everything through `20261002000100`, plus parts applied through the connector:
  `0200` (all but the delete functions), `0300` (all but `crm_submit_order`), `0800` (staff).
  Everything else (`0200`/`0300` remainders, `0500`–`0700`, `0900`–`1400`) is in one transaction in
  `/mnt/project-files/sofiivka/dev-apply-all-pending-2026-10-02.sql` for the SQL Editor (verified on
  PGlite against an emulated DEV). Until it runs, the new admin sections fail on DEV with "function not found".
- The Supabase MCP connector silently times out on SQL with `drop trigger`, `delete from` function
  bodies or trigger loops; apply such migrations through the Supabase SQL Editor instead.
- Edge functions on DEV: `admin-staff` (creates Auth accounts for new staff; verify_jwt on) and
  `crm-notify` (Telegram; verify_jwt off, own secret header). `crm-notify` needs secrets
  `TELEGRAM_BOT_TOKEN`, `CRM_NOTIFY_SECRET` and the `crm_notify_config` row (docs/notifications-setup.md).
- Admin sections: orders (edit lines, manual orders, print, CSV), leads, customers, products (+ price
  CSV/XLSX import at `/admin/products/import`, related products tab), collections (homepage hits/sale),
  banners, pages + FAQ, categories (+ per-category filters), brands (+ series), attributes, settings
  (stores, checkout, social, company, notifications, integrations, page SEO), users, account.
  Still a stub: media. Not built: blog/cases, customer accounts.
- Storefront reads at runtime: `get_site_settings` (site-settings.js), `get_homepage_banners`,
  `get_site_page`/`get_site_faq` (site-pages.js); static markup stays as first paint/fallback.
  Homepage brand wall and /brands read the live release brands merged with `brands-data.js`.
  sitemap.xml/robots.txt are generated at build (scripts/generate-sitemap.mjs).
- `taxonomy_admin_audit.entity_type` is extended by several migrations; any new one must keep all
  values ('brand','category','homepage','collection','attribute','series').
- Admin runs against DEV in Preview and PROD in Production (`admin/admin-env.mjs`).
- Go-live order: apply all pending migrations to PROD first, then merge to `master` (production
  serves `/admin` and the live checkout as soon as it deploys), then create the PROD owner profile.
