# TD Sofiivka Admin Design Brief

Status: Admin Foundation v1 implemented and validated in Vercel Preview against Supabase DEV. Full CRUD remains out of scope.

## Implemented foundation v1

The approved direction is now encoded in `admin/admin.css`, `admin/admin-components.mjs` and the `/admin/*` application shell:

- graphite sidebar, white/mineral workspace and signal-yellow action/focus states;
- compact Manrope hierarchy and dense operational rows rather than marketing composition;
- shared buttons, icon buttons, form fields/selects, statuses, page headers, toolbars, empty/error/loading states, dialog, drawer, table shell and load-more primitives;
- desktop sidebar with mobile drawer at 900px, deliberate two-column metric layout at 620px and no horizontal overflow down to 320px;
- public-site focus outline, control radii, divider logic and restrained overlay shadow;
- no gradients, glass, glow, stock imagery, decorative charts or oversized KPI cards.

Foundation routes are real, but only the dashboard has active data behavior. Product, taxonomy, brand, attribute, collection, media and settings routes remain clearly labelled placeholders until their server mutation contracts are approved.

## Product character

This is the operating interface of a comprehensive engineering supplier and contractor: heating, water supply, water treatment, plumbing, climate systems and complete project outfitting. It must feel like a precise Sofiivka workbench, not a generic SaaS dashboard.

The public site was inspected as the visual source of truth: header and navigation, product cards, buttons, forms, filters, focus states and responsive rules in `styles.css` and `pages.css`. The admin must extend the same system rather than introduce a separate visual brand.

## Visual direction

- Use graphite, white and signal yellow with disciplined contrast. Yellow indicates action and focus; it is not a decorative background effect.
- Prefer dense tables, clear grouping, strong alignment and compact metadata over repeated cards.
- Product names, SKU, brand, category, status and data-quality signals dominate the screen. Decoration never competes with engineering content.
- No gradients, glows, glass panels, oversized rounded cards, floating islands or decorative charts. Skeleton loading may use the existing neutral shimmer treatment.
- Use photography only when a product image materially helps identification. Do not add stock imagery or abstract illustrations.

## Shared tokens

Use CSS custom properties. Reuse these current public-site values as the base:

```css
--yellow: #ffc808;
--yellow-hover: #f2bb00;
--yellow-pressed: #dfaa00;
--yellow-tint: #fff5ce;
--canvas: #fff;
--surface: #fff;
--surface-soft: #fff;
--graphite: #202020;
--graphite-deep: #151515;
--text: #202020;
--text-secondary: #686762;
--text-subtle: #77756f;
--divider: #dedede;
--success: #18794e;
--danger: #b42318;
--info: #275d8c;
--radius-control: 8px;
--radius-card: 12px;
--container: 1440px;
--gutter: clamp(20px, 4vw, 64px);
--section-space: clamp(76px, 8vw, 128px);
--ease: cubic-bezier(.16, 1, .3, 1);
--shadow-soft: 0 16px 48px rgba(58, 53, 43, .09);
```

Admin semantic aliases may map to these values: `--admin-sidebar-bg: var(--graphite-deep)`, `--admin-action: var(--yellow)`, `--admin-border: var(--divider)`. Do not create near-duplicate colors for individual screens.

## Typography

- Family: `Manrope`, weights 400, 500, 600, 700 and 800; fallback `Arial, sans-serif`.
- Base text: 16px/1.5 on general pages. Dense tables may use 13–14px/1.35 while retaining legibility.
- Page title: 28–36px, weight 700–800, tight line height.
- Section title: 20–24px, weight 700.
- Table header and compact label: 11–12px, weight 700, restrained letter spacing; uppercase only for short system labels.
- Numeric values, SKU and IDs should align consistently. Use tabular numerals where supported.
- Avoid large marketing headlines inside operational screens.

## Spacing, density and shape

- Base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40 and 48px.
- Standard form controls: 50px minimum height, 12px vertical and 14px horizontal padding.
- Dense toolbar/filter controls: 36px height with 10–12px labels, following current catalog controls.
- Default panel spacing: 16–24px. Use a divider or heading before wrapping every group in another container.
- Radius 3–4px for dense segmented controls and table utilities, 6px for compact records/product media, 8px for standard controls, and 12px only for major panels. Pills are reserved for tags and compact statuses.
- Use `--shadow-soft` only for overlays, drawers and other elevated layers. Static tables and panels rely on borders, background and spacing.

## Application shell

- Retain a graphite-deep navigation surface and yellow active/action cue from the public header.
- Desktop sidebar: approximately 240–272px, fixed or sticky, with clear groups for Catalog, Taxonomy, Brands, Collections, Data quality and Settings.
- Main workspace is wide and information-dense; support the existing 1440px container logic but let tables use available space.
- Top bar contains page title/context, global product search and the primary action. Do not fill it with low-priority widgets.
- Breadcrumbs describe taxonomy or editing context, not marketing navigation.

## Core screens

### Product list

- Table-first layout with selection, thumbnail, product/SKU, brand, category, price state, inventory, publication and data-quality status.
- Sticky header, predictable column alignment, visible sort direction and keyboard-accessible row actions.
- Filters live in a compact toolbar or a single drawer at narrower widths. Active filters must be removable and reflected in the URL/state.
- Bulk actions remain disabled until selection and always state the affected record count.
- Unknown price, unknown inventory, unmapped attributes and review mapping are distinct signals; do not collapse them into one generic warning.

### Product editor

- Use one continuous editorial canvas with anchored sections: identity, classification, pricing, inventory/publication, descriptions/media, specifications, documents, SEO and provenance.
- Show immutable public `id` and supplier provenance as read-only fields. Visually separate canonical values from raw evidence.
- Attribute controls derive from definition type. Unsafe source values remain visible beside the normalized field and are never silently coerced.
- Save bar shows dirty state, validation errors and last saved state. Destructive actions stay secondary and require explicit confirmation.

### Taxonomy and mapping review

- Use a tree/table combination with category level, visibility, status, product count and configured facets.
- Mapping review compares source category, current canonical category and suggested category in aligned columns. Confidence supports review priority but never auto-publishes a reassignment.
- Provide a clear audit trail for who accepted a mapping and when.

## Components and interaction states

- Primary button: yellow, graphite text, 50px standard height, 8px radius; hover `--yellow-hover`, pressed `--yellow-pressed`.
- Secondary button: white/transparent with a clear divider-colored border and graphite text.
- Destructive action: text or outlined danger treatment until the final confirmation step. Never use yellow to mean destructive.
- Inputs: white surface, divider border, 8px radius. Error state uses `--danger` plus an explanatory message; color alone is insufficient.
- Focus: preserve the existing 3px yellow outline with 3px offset on all interactive elements.
- Icons: simple outline geometry, usually 20–24px, `currentColor`, meaningful labels/tooltips. Avoid decorative icon tiles.
- Tables: visible header hierarchy, subtle row separators, 44–52px row height, hover highlight without vertical movement.
- Status chips: compact and categorical, with icon/text where ambiguity is possible. Do not render every metadata field as a pill.
- Loading: retain table geometry with neutral skeleton rows; disable repeat actions during submission.
- Empty state: explain why the list is empty and offer the single relevant next action.
- Error state: name the failed operation, preserve entered data, and provide retry or recovery guidance.
- Success feedback: concise inline confirmation or toast; do not block the workflow with celebratory modals.

## Responsive behavior

Align admin behavior with the public breakpoints at approximately 1100, 900, 620 and 360px.

- Below 1100px, reduce nonessential table columns and tighten workspace gutters.
- At 900px, collapse the sidebar into an accessible drawer; mirror the public catalog filter-drawer pattern with a maximum practical width around 420px.
- At 620px, replace wide tables with deliberate record rows or a horizontal detail view. Keep SKU, product name, primary status and row action visible.
- At 360px, avoid fixed-width controls and multi-column forms. Primary actions remain reachable without horizontal scrolling.
- Drawers and dialogs need focus trapping, Escape close, visible close controls and restored focus.

## Accessibility and motion

- Target WCAG 2.2 AA contrast and keyboard operation.
- Every field has a persistent label; placeholders are examples, not labels.
- Validation connects messages to fields and sends focus to the first error after submission.
- Selection, sort and expanded states expose their semantics to assistive technology.
- Respect `prefers-reduced-motion`. Use the existing easing for short purposeful transitions only; no ambient motion.

## Guardrails for implementation

- Build shared table, toolbar, field, status, drawer, dialog and feedback components before screen-specific variations.
- Reuse the public design tokens and component behavior; add a token only when it represents a reusable semantic need.
- Never expose raw supplier payloads directly to editable form state. Edit the canonical model and show raw provenance as reference.
- Keep public IDs, URLs and current storefront localStorage contracts outside the admin's mutation surface unless a separately approved migration exists.
- Run desktop, tablet and mobile visual QA plus the anti-AI-slop review before an admin release is considered complete.
