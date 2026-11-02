# Handoff: TD Sofiivka (state on 2026-11-02)

Read `AGENTS.md` first (design rules, publishing). This file says where things are, which rules the owner set, and where work stopped.
`CLAUDE.md` holds older working notes; its "Admin and CRM status (2026-10-02)" section is out of date (PROD now has every migration through `20261005000700`).

The owner is Alex (GitHub `flexandroo`). He writes in Ukrainian; answer him in Ukrainian, plainly.

## Stack

- Static storefront: plain HTML/CSS/JS modules, no framework. `page-shell.js` (shared header/footer/pages), `catalog-ui.js` + `catalog/` (catalogue, routing, data source), `script.js` (homepage), `styles.css`, `pages.css`, `homepage.css`.
- Admin and CRM: `admin/` (ES modules, served at `/admin`), talks to Supabase RPCs. `admin/admin-env.mjs` maps project refs to DEV/PROD.
- Data: Supabase Postgres. Schema in `supabase/migrations/` (ordered by timestamp), edge functions in `supabase/functions/` (`admin-staff`, `crm-notify`).
- Build: `node scripts/build-static-site.mjs` → `dist/` (hashed assets, sitemap, prerendered company pages). Vercel runs it (`vercel.json`).

## Environments

| What | Value |
| --- | --- |
| GitHub | `flexandroo/sofiivka`, `master` = production |
| Vercel | project `sofievka`, team `flexandroos-projects` |
| Live site | https://sofievka.vercel.app |
| Supabase PROD | `sofievka-prod`, ref `fkjarsouuchjiedrrblc` (Vercel Production) |
| Supabase DEV | `sofievka`, ref `wfxcklglujgramasdzyr` (Vercel Preview) |

- A push to `master` deploys the live site. Any other branch gets a Vercel Preview build against DEV.
- Supabase and Vercel accounts belong to Alex. No keys or service-role secrets live in the repo; never ask for them in chat. Scripts that need the service-role key (`resolveProjectApiKeys`: catalog import/verify, `admin:*:dev`) run only on Alex's Windows machine with the Supabase CLI linked.
- When an agent cannot write to PROD, it prepares one SQL file (single transaction, safe to re-run) and Alex runs it in the Supabase SQL Editor of `sofievka-prod`.

## Owner's rules

- **«пуш»** is Alex's go-ahead word. Show him what will change (a table or short list) and wait for «пуш» before: any SQL or data change on PROD, PROD migrations, price changes, hiding/publishing products. Code fixes he asked for follow "Publishing completed changes" in `AGENTS.md`.
- **Schema changes**: new file in `supabase/migrations/` → `npm run -s db:local:test` → DEV → verify → PROD after «пуш».
- **Never delete products.** Hide them with publication status «Приховано» (`hidden`); admin filters by it (Публікація → Приховано).
- **Pricing** (migration `20261005000700_fx_pricing.sql`):
  - `product_price_sources` holds the supplier price per product: `base_amount`, `currency` (UAH/EUR/USD), `vat_included`, `source`, `active`.
  - UAH price lists go to the site as is. EUR/USD are converted at the NBU rate + 2.5% markup (`price_fx_settings.markup_percent`). A price without VAT gets +20%. Only retail price is stored; site price is rounded to whole hryvnia.
  - pg_cron fetches NBU rates and runs `fx_recalculate_prices()` at 09:00 and 16:00 Kyiv. Products without an active source are never touched; for products with one, a manual admin price edit is overwritten by the next run.
  - Price list «за запитом» → `products.price_status = 'on_request'` with no amount; the site shows «Ціна за запитом».
- **New products**: follow `docs/product-import-standard.md` and `scripts/import-check.mjs`. New products go in as drafts only, existing products are never overwritten, no new categories/brands/filter values.
- **Never run `scripts/import-catalog-to-supabase.mjs`** (`npm run catalog:migrate`) against a live project: it rewrites the whole catalogue and wipes manual edits.
- **Gardia is not sold.** Skip Gardia products in any import (see `scripts/import/tekkhaus-batch.mjs`).
- The company is a full engineering supplier (heating, water supply, water treatment, climate, solutions), not only a heating store.

## Gotchas

- `.vercelignore` drops `scripts/*` except an allowlist (`build-static-site.mjs`, `generate-sitemap.mjs`, `catalog-db-utils.mjs`, `prerender-company-pages.mjs`). A new script the build imports must be added to that allowlist, or the Vercel build fails (see commit `073610f`). It also drops `*.md`, `tmp`, `reports`, `backups`.
- The Supabase MCP connector can silently time out on SQL with `drop trigger`, function bodies containing `delete from`, or trigger loops. Use the SQL Editor for those.
- `taxonomy_admin_audit.entity_type` is extended by several migrations; a new one must keep all values (`brand`, `category`, `homepage`, `collection`, `attribute`, `series`).
- After data changes, product cards and facets are rebuilt by `_admin_refresh_catalog`; the storefront reads snapshots via RPC (`get_catalog_bootstrap`, `get_catalog_products`, `get_catalog_product_by_slug`).
- Shallow clones need `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` before switching branches.

## Checks

```bash
npm run -s db:local:test        # every migration + scenarios on in-process Postgres (PGlite)
npm run -s admin:qa
npm run -s admin:products:qa
npm run -s crm:qa
npm run -s storefront:qa        # storefront regression flows
node tests/static-assets-qa.js
node scripts/build-static-site.mjs --output-dir=dist --skip-assets
```

Local browser QA without Supabase: build `dist`, then `node tests/db-local/qa-server.mjs --port=4300` (site + PGlite-backed Supabase look-alike, QA users in the file). Check desktop (1440) and phone (390).

## Current state (live site, checked 2026-11-02)

- 2359 published products, 809 hidden (not in any supplier price list).
- 1340 with a price, 27 «Ціна за запитом», 992 without a price.
  - With price: Wilo 388, Feniks 310, Grundfos 246, TECH 137, Ecosoft 129, Altep 112, Buderus 18.
  - Without price: 131 "problem" items of those 7 brands (Wilo 65, TECH 19, Altep 13, Ecosoft 13, Buderus 13, Feniks 4, Grundfos 4) and 861 items of brands with no price list yet (Termojet 343, FOCUS 342, TEKK HAUS 112, BAXI 64). Alex chose to keep those 861 visible.
- Daily NBU recalculation is running (catalogue snapshot updated 2026-10-31).
- Final audit waves 1 and 2 are merged; mobile app-like navigation is live. Last code change on `master`: 2026-10-05.

## Where work stopped / open items

1. **131 problem prices.** Waiting on Alex to pick the first brand and confirm the proposals (per-item proposals are in the owner's spreadsheet `4-Проблемні-всі-бренди-2026-10-05.xlsx`, not in the repo).
2. **Missing price lists:** Termojet, FOCUS, TEKK HAUS, BAXI; Wilo commercial list; a newer TECH list (current one is from 2024-10-01).
3. **Data cleanups prepared but not applied on PROD** (verified: old filter values such as `230V AC` are still live): facets (1730 products), characteristics (1486), leftovers (581), air UV lamps/ozonators (choose: new section in «Клімат» or hide). The SQL files were written before the 2026-10-05 price work; re-check them against current PROD before Alex runs them, in this order: facets → characteristics → leftovers2 → air-uv.
4. **Owner inputs still missing:** working B2B email, seller details and legal texts, Telegram bot or Resend key for lead notifications, SMTP on PROD Auth (or disable customer sign-up), store address wording, founding year, `/portfolio` keep/hide, 17 BAXI group records, homepage H1 and first slide.
5. **Final audit wave 3** (tech debt, accessibility, thumbnails, closing direct table access for anon, CSP enforcement) not started.
6. About 28 old remote branches are fully merged into `master` and can be deleted once Alex agrees.
