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
node scripts/build-static-site.mjs --output-dir=dist --skip-assets
```

## Admin status (2026-10-01)

- Products Admin v1 lives on branch `codex/audit-phase-0` (commits `e3ae6fd`, `b390ade`).
- Migrations `20260929000600`–`20260929001000` are applied on DEV only; repo files match DEV exactly.
- Before merging to `master`: apply those migrations to PROD first, because the production build
  serves `/admin` as soon as the branch is merged.
- Open hardening item: legacy RPCs `update_product_commercial` / `update_product_content` and direct
  table writes bypass `admin_save_product` (audit, concurrency check, public card refresh).
