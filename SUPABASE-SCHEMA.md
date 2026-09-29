# Sofiivka Supabase Database Design v1

Status: repository setup and static validation complete; database runtime validation is blocked by the absence of Docker/PostgreSQL/Supabase CLI. No Supabase project is connected and no product data has been imported.

## 1. Scope and source facts

The design is derived from `CATALOG-CONTRACT.md`, `ADMIN-DESIGN-BRIEF.md`, the current normalizer and legacy adapter, the category/brand/attribute registries, and `category-mapping-review.json`.

Current verified baseline:

- 3,215 products; 3,214 catalog products and one hidden service item;
- 36 brands;
- 87 categories: 7 level-1, 28 level-2 and 52 level-3;
- 64 attribute definitions and 648 category-attribute relations;
- 368 distinct series used by 2,743 products;
- 13,006 images and 3,885 documents;
- 29 product-category mappings awaiting review;
- 3,096 products retain unmapped source attributes;
- SKU and product slug sets are each unique across all 3,215 products.

This is a catalog/content database, not an ERP. Warehouses, accounting, purchasing, invoices, logistics, CRM, coupons and sales analytics are outside this version.

## 2. Entity map

Core catalog:

- `products`
- `brands`
- `categories`
- `product_categories` for secondary categories only
- `product_series`
- `attribute_definitions`
- `attribute_options`
- `category_attributes`
- `product_attribute_values`
- `product_media`
- `product_documents`
- `tags` / `product_tags`
- `product_collections` / `product_collection_items`

Import and provenance:

- `suppliers`
- `import_runs`
- `product_source_records`
- `product_source_attributes`
- `category_mapping_reviews`

Administration:

- Supabase `auth.users`
- `admin_profiles`

## 3. ER overview

```text
auth.users ──────────────── 1─1 admin_profiles
    │
    └──────────── created_by / updated_by audit references

brands 1 ──────────────── * products * ─────────────── 1 categories
  │                             │                         │
  └──── * product_series ───────┘                         └── self parent_id
                                │
                                ├── * product_categories ───── 1 categories
                                ├── * product_media
                                ├── * product_documents
                                ├── * product_attribute_values ── 1 attribute_definitions
                                │                                   │
                                │                                   ├── * attribute_options
                                │                                   └── * category_attributes ── 1 categories
                                ├── * product_tags ─────────────── 1 tags
                                ├── * product_collection_items ─── 1 product_collections
                                ├── * product_source_records ───── 1 suppliers
                                │          │                          │
                                │          ├── * product_source_attributes
                                │          └── 1 import_runs ─────────┘
                                └── * category_mapping_reviews
```

## 4. Identity strategy

Every public business entity uses two identity layers:

- `internal_id uuid`: database primary key and FK target. It is never the storefront URL identity.
- `stable_id text`: immutable application identifier for brands, categories, attributes, series, tags and collections.

Products use `legacy_id text` instead of `stable_id`; it is the existing `product.id`, remains unique and immutable, and continues to back `/product?id={id}` and localStorage references. A trigger rejects changes to it.

`sku` is a unique business identifier because the stabilized snapshot contains 3,215 non-empty values with no exact, case-insensitive, trim or Unicode-normalization collisions. Surrounding whitespace is rejected and a unique index on `lower(sku)` protects future imports. Product `slug` has the same verified collision profile and normalized constraint, but is not the current public identity. Brand slugs are globally unique because the current route is `/brands/{slug}`.

Category slugs are unique only among siblings. Two partial indexes enforce one unique root slug and `UNIQUE(parent_id, slug)` semantics for non-root categories.

## 5. Products table

Pricing remains in `products`. There is exactly one current price per product, which matches current requirements and keeps catalog filtering simple. A later `product_price_history` table can reference `products.internal_id` without changing these columns or the public contract.

| Column | Type | Nullable/default | Rule |
| --- | --- | --- | --- |
| `internal_id` | `uuid` | PK, generated | Non-public database identity. |
| `legacy_id` | `text` | required, unique | Current immutable `product.id`. |
| `sku` | `text` | required | Trimmed and unique case-insensitively. |
| `slug` | `text` | required | Trimmed and unique case-insensitively; not public identity. |
| `title`, `short_title`, `model` | `text` | required | Product identity/display content. |
| `brand_id` | `uuid` | required FK | Restrict deletion. |
| `primary_category_id` | `uuid` | required FK | Authoritative primary category. |
| `series_id` | `uuid` | optional FK | Minimal normalized series relation. |
| `amount` | `numeric(14,2)` | nullable | Positive only when `price_status=known`. |
| `old_amount` | `numeric(14,2)` | nullable | Must be greater than current known amount. |
| `currency` | `varchar(3)` | `UAH` | Uppercase ISO-style code. |
| `price_status` | enum | `unknown` | `known`, `on_request`, `unknown`. |
| `inventory_status` | enum | `unknown` | Canonical inventory status. |
| `publication_status` | enum | `draft` | Independent publication state. |
| descriptions | `text` | empty string | Short, default and full description. |
| `description_sections` | `jsonb` | `[]` | Ordered structured content; array-checked. |
| `badges` | `text[]` | `{}` | Lightweight display labels, not taxonomy. |
| SEO fields | `text` | nullable | `seo_title`, `seo_description`. |
| archive/import fields | timestamps/FK | nullable | Soft archive and latest import metadata. |
| `search_document` | `tsvector` | generated | Title/model/SKU server-search foundation. |
| audit fields | timestamps/UUID | populated | `created_at`, `updated_at`, actor IDs. |

Publication rules:

- Public product policies require `publication_status='published'` plus an active, visible brand and category.
- `hidden`, `draft` and `archived` records remain in the database.
- `archived` requires `archived_at`; no hard deletion is needed for normal catalog work.
- Inventory never changes publication implicitly. A discontinued product may remain published.

## 6. Brands and categories

`brands` supports stable ID, slug, aliases, logo, optional website, description, country, visibility, featured placement, inline SEO, status and audit fields. Products reference the brand UUID; API views return `brands.stable_id` so the adapter can reproduce the current `brandId`.

`categories` uses a self-referencing `parent_id`. `level` is retained for fast admin display and validated against the parent. A trigger rejects invalid levels and hierarchy cycles. `sectionId` and `categoryGroup` are not stored as independent truths; they are derived from the tree.

Delete behavior is restrictive for referenced brands, categories, definitions and series. Operational removal uses status/archive fields rather than destructive deletion.

## 7. Primary and secondary categories

`products.primary_category_id` is authoritative and indexed, which makes PLP and admin list queries direct. `product_categories` contains secondary assignments only. A trigger rejects duplication of the primary category in that relation.

This avoids two competing primary-category sources while retaining future multi-category support. The current snapshot has zero secondary assignments, so the first migration leaves `product_categories` empty.

## 8. Attribute model

### Definitions and category configuration

`attribute_definitions` stores stable ID, label, canonical type, unit, global filtering/sorting capability, rank, aliases, normalization configuration and status. Aliases are JSONB because current aliases include regular-expression pattern and flag metadata; they are configuration, not query dimensions.

`category_attributes` replaces category JSON arrays and stores category/attribute, `facet_enabled`, `required`, ordering and display group.

Precedence is explicit:

```text
effective facet =
  attribute_definitions.filterable
  AND attribute_definitions.status = active
  AND category_attributes.facet_enabled
```

A trigger prevents a category from enabling a globally non-filterable definition. Disabling a global definition automatically disables its category facets. The seed preserves all 648 configured relations while setting the current 47 invalid/non-filterable relations to `facet_enabled=false`.

### Options and typed product values

`attribute_options` is used for curated select values. Supplier values are not automatically promoted into options.

`product_attribute_values` has exactly one of:

- `value_number`
- `value_text`
- `value_boolean`
- `option_id`

`num_nonnulls(...) = 1` prevents ambiguous values, and a trigger checks compatibility with the definition type. A select may temporarily use `value_text` when it is canonical but not yet curated as an option. This is deliberate: it preserves the current snapshot without generating thousands of unreviewed option records.

Numeric, text, boolean and option facets have separate partial indexes by `(attribute_id, typed_value)`.

## 9. Raw and unmapped attributes

Raw data is not stored in canonical product columns.

- `product_source_records` stores supplier/source identity, source category/URL, mapping state, raw JSONB payload, checksum and import-run provenance.
- `product_source_attributes` stores every source label/value in source order. It may point to a canonical definition and retains mapping status, notes, metadata and mapping actor/time.

The admin mapping workflow is:

```text
unmapped source attribute
  -> choose canonical attribute
  -> mark review/mapped
  -> run normalization job
  -> upsert product_attribute_values
  -> retain original source record unchanged
```

This makes the 3,096 products with unmapped values migration-safe and non-blocking.

## 10. Media and documents

Images are normalized into `product_media`, with media type, role, URL, future Storage path, source URL, alt text, ordering and active state. A partial unique index allows one active primary image per product. Existing external and local asset URLs can be imported unchanged; Supabase Storage migration is optional later.

Documents use `product_documents` with canonical document type, title, URL/Storage path, source URL, ordering and active state.

`storage.sql` provisions public `product-media`, `brand-media`, `site-media` and `documents` buckets plus private `import-private`. Public retrieval does not imply public mutation: content-manager/admin/owner policies govern storefront assets, admin/owner policies govern supplier imports, and path validation ties product/brand/document objects to canonical UUIDs and imports to supplier stable IDs. Full path and MIME/size rules are documented in `SUPABASE-SETUP.md`.

## 11. Product series and tags

Series warrants a table: 368 distinct `seriesId` values cover 2,743 products. `product_series` is deliberately minimal and brand-scoped. During migration, stable ID and brand are trusted; inferred series names can enter `review` status until edited.

Current tags are not clean editorial taxonomy: 225 values mix series names, product types, suppliers and commercial markers. They are imported losslessly into `tags`/`product_tags` with `origin=supplier|migration` and `status=review` where appropriate. They do not drive category or attribute behavior. Clean editorial tags use `origin=editorial`.

## 12. Collections and promotions

`product_collections` implements the established contract with stable ID, slug, title, description, `manual|promotion|featured`, active/date window, ordering and inline SEO. `product_collection_items` preserves explicit product ordering.

For v1, collections plus `old_amount` are sufficient. No promotion engine is added. Campaign-specific prices, coupons, stacking and loyalty rules would require a later pricing/promotion domain rather than overloading collections.

The current `homepageProductIds`, `homepageSaleProductIds` and canonical `horeca`, `sale`, `sinum` groupings can later migrate into this model without changing the homepage now.

## 13. SEO choice

Products, brands, categories and collections each have `seo_title` and `seo_description`. A polymorphic SEO table was rejected because only two fields are currently required; inline fields provide simpler constraints, queries, forms and RLS. A shared relation can be introduced later if canonical URLs, robots rules, Open Graph media or localization justify it.

## 14. Supplier and import provenance

`suppliers` identifies each feed. `import_runs` records execution state, counts, timing, source reference, errors and metadata. `product_source_records` links a canonical product to a supplier source ID and raw payload.

Canonical tables never query raw JSONB to render the catalog. Import code reads raw records, normalizes them, and writes canonical rows in one transaction. Checksums support unchanged-record detection. Raw rows are retained for debugging, audit and re-normalization.

The 29 category-review products retain their current category assignment. `category_mapping_reviews` stores current/suggested categories, source category, reason, confidence and resolution audit. No suggestion is auto-accepted.

## 15. Admin users, roles and RLS

Passwords remain in Supabase Auth. `admin_profiles.user_id` references `auth.users.id`.

| Role | Effective scope |
| --- | --- |
| `owner` | All catalog, import and user administration. |
| `admin` | Catalog/import administration and non-owner profiles. |
| `manager` | Current price, old price, price state, inventory, typed specifications and mapping review. |
| `content_manager` | Descriptions/SEO through scoped RPC; media, documents, tags and homepage collections. |

RLS does not trust UI visibility. Public policies expose only published products and active related entities. Raw payloads, import runs, source attributes and review queues require an active manager, admin or owner profile; content managers cannot read supplier provenance.

Owner/admin receive constrained table writes. Manager and content-manager edits to columns inside `products` use `update_product_commercial` and `update_product_content` SECURITY DEFINER functions that verify application role before updating only approved columns. This avoids the column-permission gap of row-level policies.

The first owner is bootstrapped once through the Supabase SQL editor or service role after Auth signup; there is no password table.

A trigger prevents the final active owner from being demoted, deactivated or deleted. Admin profile policies also prevent an `admin` from creating or promoting an `owner`; only an existing owner may do so.

## 16. API and view layer

Provided views:

- `public_products`: published scalar product projection with stable brand/category/series IDs;
- `catalog_products`: public products additionally constrained to catalog-visible active brand/category;
- `product_search_view`: server-search input;
- `product_facets_view`: typed facet rows;
- `effective_category_facets`: global-and-category facet intersection.

Recommended data access:

1. Fetch brands, category tree and effective facet definitions as cacheable registries.
2. Fetch product scalar rows paginated from `catalog_products`.
3. Fetch media, documents, categories and attributes in batched queries by product UUID.
4. Assemble the existing `CatalogSnapshot` server-side or in a dedicated data adapter.
5. Pass that snapshot through the existing legacy adapter until public consumers are migrated.

Do not expose `product_source_records.raw_payload` to storefront code. A monolithic JSON RPC is unnecessary for 3,215 products and can be added only if measured request patterns justify it.

## 17. Index strategy

The schema includes indexes for:

- unique legacy ID, SKU and product slug;
- brand, primary category and series joins, including composite brand/category publication ordering for PLP queries;
- publication, inventory and price status;
- known-price range filtering;
- secondary category lookup;
- typed attribute facets;
- ordered media/documents/collections;
- supplier source identity, import runs and mapping queues;
- generated full-text search vector;
- trigram title/model and source-label search.

`pg_trgm` and PostgreSQL full-text search are foundations only. The current JavaScript search engine is not replaced during this phase.

## 18. Canonical migration mapping

| Source field | Target table | Target column | Transformation | Lossless? | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `products` | `legacy_id` | Copy as text | Yes | Immutable public identity. |
| generated DB identity | `products` | `internal_id` | `gen_random_uuid()` | Yes | Never replaces legacy ID. |
| `sku` | `products` | `sku` | Copy | Yes | Unique verified. |
| `slug` | `products` | `slug` | Copy | Yes | Remains non-public identity. |
| titles/model | `products` | corresponding columns | Copy | Yes | Required. |
| `brandId` | `products` | `brand_id` | Resolve `brands.stable_id` | Yes | FK UUID internally. |
| `primaryCategoryId` | `products` | `primary_category_id` | Resolve category stable ID | Yes | Current assignment retained. |
| `secondaryCategoryIds` | `product_categories` | relation rows | Resolve each stable ID | Yes | Empty in current snapshot. |
| `seriesId` | `product_series`, `products` | series row/FK | Upsert minimal brand-scoped series | Yes | Names may start in review. |
| `pricing.amount` | `products` | `amount` | Positive numeric or NULL | Yes | Zero placeholder remains in raw payload. |
| `pricing.oldAmount` | `products` | `old_amount` | Copy only when greater than amount | Yes | Canonical rule. |
| currency/status | `products` | price columns | Enum/currency cast | Yes | Unknown stays unknown. |
| `inventory.status` | `products` | `inventory_status` | Enum cast | Yes | Discontinued preserved. |
| `publicationStatus` | `products` | `publication_status` | Enum cast | Yes | 3,214 published; one hidden. |
| descriptions | `products` | content columns | Copy | Yes | Sections remain ordered JSONB. |
| `images[]` | `product_media` | ordered rows | First image primary, rest gallery | Yes | Original URL retained. |
| `documents[]` | `product_documents` | ordered rows | Map known type; otherwise `other` | Yes | Metadata may remain in source payload. |
| `catalogAttributes` | `product_attribute_values` | typed value/provenance fields | Resolve definition and typed column | Yes | Select text allowed until option curated. |
| `normalizedAttributes` | `product_attribute_values` | typed value | Consistency cross-check | Yes | Not stored twice. |
| `sourceAttributes` | `product_source_attributes` | ordered raw rows | JSONB value, source label | Yes | Original form retained. |
| `unmappedAttributes` | `product_source_attributes` | raw row + `unmapped` | Copy | Yes | Does not block import. |
| `tags[]` | `tags`, `product_tags` | relation rows | Preserve and classify origin/status | Yes | Not promoted to taxonomy. |
| `collections[]` | collection tables | ordered relation | Resolve/create reviewed collections | Yes | Commercial grouping, not category. |
| `badges[]` | `products` | `badges` | Copy text array | Yes | Currently empty. |
| `source` | `product_source_records` | source columns | Resolve supplier and status | Yes | Raw payload stored separately. |
| raw supplier record | `product_source_records` | `raw_payload` | Store JSONB + checksum | Yes | Canonical rendering never depends on it. |
| `seo` | `products` | SEO columns | Copy nullable strings | Yes | Same inline pattern across entities. |
| 29 review report rows | `category_mapping_reviews` | review fields | Resolve product/categories | Yes | No automatic reassignment. |

Project setup order:

1. Apply `20260928000100_catalog_schema.sql`.
2. Apply `20260928000200_catalog_rls.sql`.
3. Apply `20260928000300_core_seed.sql`.
4. Apply `20260928000400_storage.sql`.
5. Replay the idempotent `seed.sql` during local reset.
6. Run all pgTAP files and database linting in a disposable runtime.

Catalog-data migration begins only after that setup passes. Its later order remains: create suppliers/import run; upsert reviewed series/tags/collections; insert products and relations; insert media/documents/typed attributes; preserve source/unmapped records and review rows; compare counts, identity hash, URLs and CatalogSnapshot regressions.

## 19. Seed and SQL files

- `supabase/schema.sql`: extensions, types, tables, constraints, triggers, indexes and views.
- `supabase/seed-core.sql`: generated idempotent seed for 36 brands, 87 categories, 64 attribute definitions and 648 category relations. It contains no products.
- `supabase/rls.sql`: public/admin policies, grants and scoped update functions.
- `supabase/storage.sql`: bucket definitions, path validator and object policies.
- `supabase/migrations/`: timestamped, byte-checked migration chain.
- `supabase/tests/`: pgTAP schema, integrity, RLS/storage and query checks.
- `SUPABASE-SETUP.md`: repeatable setup, role matrix, lifecycle policy and manual blocker.
- `scripts/generate-supabase-seed.mjs`: deterministic seed generator from the current registries.

## 20. Deliberate non-decisions and future extensions

- No production Supabase project, Storage bucket or user is created.
- No products are imported in this phase.
- No admin UI or public frontend integration is created.
- No price history; add it only when history becomes a requirement.
- No warehouse quantity model; a future stock table can reference product and warehouse while preserving `inventory_status` as the storefront summary.
- No promotion engine; collections plus current/old price cover v1.
- No generic polymorphic SEO relation.
- No automatic acceptance of series names, supplier tags, select options or category suggestions.
- No server-search cutover; current search remains unchanged.

## 21. Validation status

Neither Docker, `psql` nor Supabase CLI is available locally, so no global tooling was installed. Static checks now cover SQL structure, migration/source parity, table/FK references, enum usage, RLS enablement, storage policy shape, seed cardinalities, identity collision policy, client secret rejection and source-registry parity. Four pgTAP files are ready but remain unexecuted. `SUPABASE-SETUP.md` gives the exact local and isolated-development commands and the acceptance gate.

The security model follows current official Supabase guidance: combine grants with RLS on every exposed table, use `security_invoker` views so underlying RLS applies, reference the `auth.users` primary key from the public profile table, and lock down every SECURITY DEFINER function with an empty search path and explicit execute grants.

Official references:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/views
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/guides/database/extensions
