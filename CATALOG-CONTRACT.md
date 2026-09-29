# Sofiivka Catalog Contract v1

Status: active frontend contract. This document describes the stable boundary that must be preserved before a database or admin panel is introduced.

## 1. Data flow

```text
supplier feeds
  -> RawSupplierProduct[]
  -> normalizer + taxonomy/source mappings
  -> CanonicalProduct[] / CatalogSnapshot
  -> legacy adapter
  -> current PLP, PDP, search, compare, cart and favorites consumers
```

- `RawSupplierProduct` is evidence from the supplier. It is retained separately in `window.sofievkaRawSupplierCatalog` and must not be treated as the public domain model.
- `CanonicalProduct` is the clean, whitelist-based domain DTO. Supplier-specific top-level fields are forbidden here.
- `LegacyProduct` is a temporary compatibility projection. It may contain supplier fields required by existing UI code, but they must not leak back into `CanonicalProduct`.
- `CatalogSnapshot` is the database-ready read boundary exposed as `window.sofievkaCatalogSnapshot`.

## 2. Product identity

| Field | Meaning | Stability rule |
| --- | --- | --- |
| `internalId` | Future database UUID or opaque primary key. It does not exist in the current frontend DTO and must never appear in a public URL. | May be generated during database import; never reused. |
| `id` | Current immutable public/legacy product identity. It is used by `/product?id=…`, cart, favorites and comparison state. | Never regenerate from titles, slugs or database IDs. Never reuse. Current ordered-set hash: `215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733`. |
| `slug` | Human-readable identifier for content and future routing. | Unique in the snapshot, but not the current public identity. A slug edit must not change `id`. |
| `sku` | Supplier/business identifier. | Unique in the current snapshot. Change only after an authoritative supplier correction and preserve the old value in an audit/alias record. Never use it as an implicit replacement for `id`. |

If a future migration must replace a public `id`, it requires an explicit old-to-new alias table, URL redirects, and localStorage migration for cart, comparison and favorites. Silent ID replacement is prohibited.

## 3. CanonicalProduct

Only these top-level fields are allowed:

```js
{
  id: string,
  slug: string,
  sku: string,
  title: string,
  shortTitle: string,
  model: string,
  brandId: string,
  primaryCategoryId: string,
  secondaryCategoryIds: string[],
  seriesId: string | null,
  pricing: {
    amount: number | null,
    oldAmount: number | null,
    currency: string,
    priceStatus: "known" | "unknown" | "on_request"
  },
  inventory: {
    status: "in_stock" | "out_of_stock" | "preorder" | "discontinued" | "unknown"
  },
  publicationStatus: "draft" | "published" | "hidden" | "archived",
  images: string[],
  description: string,
  shortDescription: string,
  fullDescription: string,
  descriptionSections: Array<{ title: string, paragraphs: string[] }>,
  sourceAttributes: Array<{ label: string, value: unknown }>,
  catalogAttributes: Array<{
    id: string,
    label: string,
    value: number | string | boolean,
    unit: string,
    provenance: string,
    rule: string,
    sourceLabel: string,
    sourceValue: unknown,
    unitStatus: string
  }>,
  normalizedAttributes: Record<string, number | string | boolean>,
  unmappedAttributes: Array<{ label: string, value: unknown, provenance: string }>,
  documents: Array<{ url: string, ...metadata }>,
  tags: string[],
  collections: string[],
  badges: string[],
  source: {
    supplier: string,
    sourceId: string,
    sourceCategory: string,
    mappingStatus: string
  },
  seo: { title: string, description: string } | null
}
```

Legacy and supplier-only fields such as `price`, `availability`, `manufacturerUrl`, `technicalDetails`, `variants`, `instructions` and category display aliases are not valid canonical top-level fields.

## 4. Price semantics

- A finite supplier price greater than zero becomes `pricing.amount` and `priceStatus: "known"`.
- Supplier price `0`, a blank value or an invalid number becomes `amount: null` and `priceStatus: "unknown"`.
- `priceStatus: "on_request"` is accepted only when the source explicitly supplies that status. It is never inferred from zero.
- `oldAmount` is retained only when the current amount is known and the old amount is positive and greater than the current amount.
- Unknown-price products remain visible, searchable and purchasable according to the existing UI contract. They are excluded only when the shopper applies an actual numeric price bound.
- In ascending and descending price sorts, known prices are ordered first and unknown prices are placed last.
- The legacy adapter may expose `price: 0` for old consumers. That compatibility value is not the domain price.

Current baseline: 631 known prices, 2,584 unknown prices, 0 explicitly on request.

## 5. Inventory and publication

Inventory is independent of price and publication. Allowed inventory values are:

```text
in_stock | out_of_stock | preorder | discontinued | unknown
```

Publication controls whether a record is intended for a public surface:

```text
draft | published | hidden | archived
```

Current mapping is deterministic: active catalog categories become `published`; the service record becomes `hidden`; future taxonomy nodes become `draft`; other inactive records become `archived`. A discontinued product may still be published so its PDP can explain the status and support replacement-product journeys.

## 6. Attributes and facets

- Attribute definitions declare `number`, `string`, `boolean` or `select`.
- Numbers are parsed only by a definition-aware unit rule. A range or unsafe mixed value remains in `unmappedAttributes` instead of being coerced.
- Boolean parsing is allow-list based per definition. Only explicit tokens are converted to `true` or `false`.
- Strings and selects are normalized as strings.
- `sourceAttributes` retains the supplier representation; `catalogAttributes` records provenance and conversion metadata; `normalizedAttributes` is the typed consumer index.
- A PLP facet is allowed only when both conditions are true: the category lists the attribute ID and the attribute definition has `filterable: true`.
- Boolean filters may serialize through `legacyValues` until public query parameters can be migrated. Existing filter URLs must continue to resolve.
- Unmapped attributes are migration debt, not validation errors. They remain visible to the audit pipeline and must not be bulk-converted without definition-specific evidence.

## 7. Legacy adapter

`catalog/legacy-adapter.js` is the only sanctioned compatibility bridge. It reconstructs the historical fields used by the current UI, including price, availability labels, category aliases, brand name, main image, comparison type, technical details, variants and instructions.

New domain logic must read `CanonicalProduct` or `CatalogSnapshot`. New supplier fields must be normalized deliberately; they must not be added to the canonical DTO by spreading raw records.

## 8. ProductCollection future contract

Homepage selections and commercial groupings will later migrate to an explicit entity:

```js
{
  id: string,
  title: string,
  type: "manual" | "promotion" | "featured",
  productIds: string[],
  order: number,
  active: boolean
}
```

`productIds` reference immutable public product IDs and preserve editorial order. A promotion is a collection, never a taxonomy category. The current homepage arrays remain unchanged until a dedicated migration is approved.

## 9. Public compatibility invariants

The following require an explicit versioned migration and regression snapshot update:

- product IDs, SKU/slug sets, brand IDs or taxonomy IDs;
- `/product?id={id}`, category paths or brand URLs;
- brand/category product assignments or PLP counts;
- current query parameter names and supported values;
- cart, favorites and comparison localStorage keys and stored product IDs;
- representative search availability;
- PDP lookup, compare grouping and existing category/brand navigation.

`tests/catalog-contract-qa.js` checks these invariants against `catalog/catalog-contract-baseline-v1.json`. Any intentional exception must be documented in that baseline and reviewed as a public behavior change.

## 10. Database handoff rule

The future database should store canonical entities and raw provenance separately. It must not make the frontend depend on supplier payload shapes. Schema design may begin only while the full validator and both snapshot layers pass with zero errors.
