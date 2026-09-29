# SOFIEVKA ADMIN ARCHITECTURE v1

Date: 2026-09-29

Status: Preview foundation implemented; no production admin deployment.

## Scope boundary

Admin Foundation v1 provides authentication, authorization, guarded routing, the application shell, real dashboard reads, reusable visual primitives and responsive behavior. It does not provide catalog mutations, editors, uploads, user management, analytics, CRM, ERP or order management.

The public storefront remains unchanged and continues to use Read Model v2.

## Environment topology

```text
Vercel Preview /admin
  → browser-safe Preview runtime config
  → Supabase DEV Auth + RLS
  → sofievka / wfxcklglujgramasdzyr

Future Vercel Production /admin
  → browser-safe Production runtime config
  → Supabase PROD Auth + RLS
  → sofievka-prod / fkjarsouuchjiedrrblc
```

Source code contains one environment-independent admin client. `catalog-runtime-config.js` supplies URL, publishable key and project ref at build time. The current build guard rejects a Preview build unless its ref is `wfxcklglujgramasdzyr`, and rejects the DEV ref in a Production build.

No service-role key, database password or Supabase access token is available to browser code.

## Routing

Vercel rewrites `/admin` and `/admin/:path*` to the vanilla entry document `admin/index.html`. Client navigation uses the History API while preserving direct-link and refresh support.

| Route | Purpose in v1 | Roles |
| --- | --- | --- |
| `/admin/login` | Email/password login | Public shell only |
| `/admin` | Real operational dashboard | All active admin roles |
| `/admin/products` | Products foundation | owner, admin, manager, content_manager |
| `/admin/categories` | Taxonomy foundation | owner, admin, manager, content_manager |
| `/admin/brands` | Brands foundation | owner, admin, manager, content_manager |
| `/admin/attributes` | Characteristics foundation | owner, admin, manager, content_manager |
| `/admin/collections` | Collections foundation | owner, admin, manager, content_manager |
| `/admin/media` | Media foundation | owner, admin, manager, content_manager |
| `/admin/settings` | Settings foundation | owner, admin |

Unknown protected routes render an admin 404 state. Insufficient roles render a 403-style state.

## Authentication and session lifecycle

`admin/admin-auth.mjs` is a small browser-safe Supabase Auth client. It implements:

1. email/password sign-in through `/auth/v1/token?grant_type=password`;
2. per-project session persistence in `localStorage`;
3. session validation through `/auth/v1/user`;
4. refresh-token renewal before expiry;
5. local and remote logout;
6. expired/revoked session cleanup and redirect to `/admin/login`.

There is no signup, social login or password-reset surface.

## Authorization and guards

Authentication alone is insufficient. After restoring a session, the application reads the current user’s `admin_profiles` row through their JWT and RLS. Access requires:

- matching `user_id`;
- `active = true`;
- role in `owner`, `admin`, `manager`, `content_manager`.

Protected markup is not rendered until both session and profile checks complete. Missing or inactive profiles see a dedicated access-denied screen and logout action. UI permissions only hide or reject routes; PostgreSQL RLS remains authoritative.

## Admin data-access layer

`admin/admin-api.mjs` centralizes authenticated PostgREST calls. Components do not query tables directly.

Dashboard v1 performs lightweight exact-count requests only:

- all products;
- published products;
- products with unknown price;
- products with unknown inventory;
- category mapping reviews requiring attention;
- brands;
- optional latest import and catalog version.

The dashboard never downloads the full catalog or supplier feeds. Import and mapping information follows existing role-sensitive RLS; restricted roles receive an explicit unavailable state.

No new view, RPC or migration was required for v1.

## Application shell

Desktop uses a fixed 256px graphite sidebar, compact 68px top bar and wide workspace. The sidebar groups only roadmap routes and ends with the current user, translated role and logout. The top bar contains lightweight product/SKU search and a small DEV indicator.

At 900px and below the sidebar becomes an overlay drawer with:

- visible close control;
- backdrop click close;
- Escape close;
- focus trap;
- focus restoration to the opener.

## Design system

The admin token layer is declared once in `admin/admin.css` and derives from public Sofiivka values: Manrope, `#151515`/`#202020` graphite, `#ffc808` signal yellow, mineral canvas, shared dividers, focus outline, control radii and restrained overlay elevation.

`admin/admin-components.mjs` exposes reusable DOM factories for:

- Button: primary, secondary, ghost and danger;
- IconButton;
- Input and native Select form fields;
- status badges with publication, inventory and price language;
- PageHeader and Toolbar;
- EmptyState, ErrorState and Skeleton;
- Dialog and Drawer foundations;
- Table shell;
- load-more foundation.

Icons use one 24px outline system from `admin/admin-icons.mjs`. No emoji or mixed icon libraries are used.

## Responsive contract

- 1440 / 1280: six-column summary strip and fixed sidebar.
- 1024: fixed sidebar, three-column summary, tighter workspace.
- 900 and below: drawer navigation.
- 768: three-column summary and single-column work panels.
- 620 and below: two-column summary, stacked rows and full-width actions.
- 390×844: compact top bar, drawer, readable metrics and login action in the initial mobile flow.
- 320–360: reduced gutters and no fixed-width actions.

## Accessibility and state handling

The shell provides a skip link, persistent field labels, semantic headings, native form controls, visible 3px yellow focus, `aria-current`, live login errors, alert states, keyboard drawer behavior and reduced-motion support.

Loading blocks protected-content flash. Error states preserve navigation and provide retry. Empty/skeleton/dialog/table foundations are available for the next feature stage.

## Future CRUD architecture

Each management stage should add a domain API module behind `admin/admin-api.mjs`, then build on the shared component layer. Mutation work must follow this order:

1. define server authorization, validation, concurrency and audit contracts;
2. add a new migration when schema/RPC changes are necessary;
3. validate in DEV with role/RLS tests;
4. implement the admin screen without service-role browser access;
5. perform Preview QA;
6. promote schema and UI to Production only in a separately approved stage.

Product identity (`legacy_id`), public URLs and storefront localStorage contracts remain outside ordinary edit surfaces.
