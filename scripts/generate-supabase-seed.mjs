import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);

for (const file of ["brands-data.js", "catalog/categories.js", "catalog/attribute-schema.js"]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), "utf8"), context, { filename: file });
}

const brands = context.window.sofievkaBrands.map(brand => ({
  stable_id: brand.id,
  slug: brand.slug,
  name: brand.name,
  aliases: brand.aliases || [],
  logo_url: brand.logo || null,
  description: brand.description || "",
  country: brand.country || null,
  visibility: brand.visibility,
  featured: Boolean(brand.featured),
  featured_order: brand.featuredOrder,
  seo_title: brand.seo?.title || null,
  seo_description: brand.seo?.description || null,
  status: "active"
}));

const taxonomy = context.window.sofievkaTaxonomy;
const definitions = context.window.sofievkaAttributeSchema.definitions;
const categories = taxonomy.nodes.map(category => ({
  stable_id: category.id,
  slug: category.slug,
  parent_stable_id: category.parentId,
  level: category.level,
  title: category.title,
  short_title: category.shortTitle || null,
  description: category.description || "",
  menu_description: category.menuDescription || "",
  sort_order: category.order || 0,
  status: category.status,
  visibility: category.visibility,
  seo_title: category.seo?.title || null,
  seo_description: category.seo?.description || null
}));

const attributes = Object.values(definitions).map(definition => ({
  stable_id: definition.id,
  label: definition.label,
  value_type: definition.type,
  unit: definition.unit || null,
  filterable: Boolean(definition.filterable),
  sortable: Boolean(definition.sortable),
  sort_order: Number(definition.rank || 0),
  aliases: (definition.aliases || []).map(alias => alias && typeof alias === "object" && typeof alias.source === "string"
    ? { pattern: alias.source, flags: alias.flags }
    : { value: String(alias) }),
  normalization_config: {
    booleanValues: definition.booleanValues || { true: [], false: [] },
    legacyValues: definition.legacyValues || {}
  },
  status: "active"
}));

const categoryAttributes = taxonomy.nodes.flatMap(category => (category.facetIds || []).map((attributeId, index) => ({
  category_stable_id: category.id,
  attribute_stable_id: attributeId,
  facet_enabled: Boolean(definitions[attributeId]?.filterable),
  required: false,
  sort_order: index,
  display_group: null
})));

if (process.argv.includes("--catalog-audit")) {
  for (const file of [
    "products-data.js",
    "water-catalog-data.js",
    "termojet-products-data.js",
    "wilo-products-data.js",
    "grundfos-products-data.js",
    "tekkhaus-products-data.js",
    "tech-products-data.js",
    "heating-brands-products-data.js",
    "baxi-buderus-products-data.js",
    "catalog-data.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(projectRoot, file), "utf8"), context, { filename: file });
  }
  const products = context.window.sofievkaCanonicalProducts;
  const countValues = values => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]));
  const series = [...new Set(products.map(product => product.seriesId).filter(Boolean))].sort();
  const tags = [...new Set(products.flatMap(product => product.tags))].sort();
  const collections = [...new Set(products.flatMap(product => product.collections))].sort();
  const badges = [...new Set(products.flatMap(product => product.badges))].sort();
  console.log(JSON.stringify({
    products: products.length,
    uniqueSkus: new Set(products.map(product => product.sku)).size,
    uniqueSlugs: new Set(products.map(product => product.slug)).size,
    seriesCount: series.length,
    productsWithSeries: products.filter(product => product.seriesId).length,
    series,
    productsWithSecondaryCategories: products.filter(product => product.secondaryCategoryIds.length).length,
    tagCount: tags.length,
    productsWithTags: products.filter(product => product.tags.length).length,
    tags,
    collectionCount: collections.length,
    productsWithCollections: products.filter(product => product.collections.length).length,
    collections,
    badgeCount: badges.length,
    productsWithBadges: products.filter(product => product.badges.length).length,
    badges,
    productsWithDocuments: products.filter(product => product.documents.length).length,
    documentCount: products.reduce((sum, product) => sum + product.documents.length, 0),
    imageCount: products.reduce((sum, product) => sum + product.images.length, 0),
    suppliers: countValues(products.map(product => product.source.supplier)),
    mappingStatuses: countValues(products.map(product => product.source.mappingStatus)),
    inventoryStatuses: countValues(products.map(product => product.inventory.status)),
    publicationStatuses: countValues(products.map(product => product.publicationStatus)),
    priceStatuses: countValues(products.map(product => product.pricing.priceStatus))
  }, null, 2));
  process.exit(0);
}

if (process.argv.includes("--audit")) {
  const duplicate = values => values.filter((value, index) => values.indexOf(value) !== index);
  console.log(JSON.stringify({
    brands: brands.length,
    categories: categories.length,
    categoryLevels: Object.fromEntries([...new Set(categories.map(item => item.level))].sort().map(level => [level, categories.filter(item => item.level === level).length])),
    categoryStatuses: Object.fromEntries([...new Set(categories.map(item => item.status))].sort().map(status => [status, categories.filter(item => item.status === status).length])),
    categoryVisibilities: Object.fromEntries([...new Set(categories.map(item => item.visibility))].sort().map(visibility => [visibility, categories.filter(item => item.visibility === visibility).length])),
    attributes: attributes.length,
    attributeTypes: Object.fromEntries([...new Set(attributes.map(item => item.value_type))].sort().map(type => [type, attributes.filter(item => item.value_type === type).length])),
    categoryAttributes: categoryAttributes.length,
    disabledCategoryFacets: categoryAttributes.filter(item => !item.facet_enabled).length,
    duplicateBrandStableIds: duplicate(brands.map(item => item.stable_id)),
    duplicateCategoryStableIds: duplicate(categories.map(item => item.stable_id)),
    duplicateAttributeStableIds: duplicate(attributes.map(item => item.stable_id))
  }, null, 2));
  process.exit(0);
}

const json = value => JSON.stringify(value, null, 2).replaceAll("$seed$", "$seed_safe$");

process.stdout.write(`-- Generated from the stabilized Sofiivka registries. Do not add products here.
-- Source: brands-data.js, catalog/categories.js, catalog/attribute-schema.js

begin;

insert into public.brands (
  stable_id, slug, name, aliases, logo_url, description, country, visibility,
  featured, featured_order, seo_title, seo_description, status
)
select
  stable_id, slug, name, aliases, logo_url, description, nullif(country, ''), visibility::public.brand_visibility,
  featured, featured_order, seo_title, seo_description, status::public.record_status
from jsonb_to_recordset($seed$${json(brands)}$seed$::jsonb) as seed(
  stable_id text, slug text, name text, aliases text[], logo_url text, description text,
  country text, visibility text, featured boolean, featured_order integer,
  seo_title text, seo_description text, status text
)
on conflict (stable_id) do update set
  slug = excluded.slug,
  name = excluded.name,
  aliases = excluded.aliases,
  logo_url = excluded.logo_url,
  description = excluded.description,
  country = excluded.country,
  visibility = excluded.visibility,
  featured = excluded.featured,
  featured_order = excluded.featured_order,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  status = excluded.status;

create temporary table _seed_categories on commit drop as
select *
from jsonb_to_recordset($seed$${json(categories)}$seed$::jsonb) as seed(
  stable_id text, slug text, parent_stable_id text, level smallint, title text,
  short_title text, description text, menu_description text, sort_order integer,
  status text, visibility text, seo_title text, seo_description text
);

do $seed_categories$
declare
  current_level smallint;
begin
  for current_level in 1..(select max(level) from _seed_categories) loop
    insert into public.categories (
      stable_id, slug, parent_id, level, title, short_title, description,
      menu_description, sort_order, status, visibility, seo_title, seo_description
    )
    select
      seed.stable_id,
      seed.slug,
      parent.internal_id,
      seed.level,
      seed.title,
      seed.short_title,
      seed.description,
      seed.menu_description,
      seed.sort_order,
      seed.status::public.category_status,
      seed.visibility::public.category_visibility,
      seed.seo_title,
      seed.seo_description
    from _seed_categories seed
    left join public.categories parent on parent.stable_id = seed.parent_stable_id
    where seed.level = current_level
    on conflict (stable_id) do update set
      slug = excluded.slug,
      parent_id = excluded.parent_id,
      level = excluded.level,
      title = excluded.title,
      short_title = excluded.short_title,
      description = excluded.description,
      menu_description = excluded.menu_description,
      sort_order = excluded.sort_order,
      status = excluded.status,
      visibility = excluded.visibility,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description;
  end loop;
end
$seed_categories$;

insert into public.attribute_definitions (
  stable_id, label, value_type, unit, filterable, sortable, sort_order,
  aliases, normalization_config, status
)
select
  stable_id, label, value_type::public.attribute_value_type, unit,
  filterable, sortable, sort_order, aliases, normalization_config,
  status::public.record_status
from jsonb_to_recordset($seed$${json(attributes)}$seed$::jsonb) as seed(
  stable_id text, label text, value_type text, unit text, filterable boolean,
  sortable boolean, sort_order numeric, aliases jsonb,
  normalization_config jsonb, status text
)
on conflict (stable_id) do update set
  label = excluded.label,
  value_type = excluded.value_type,
  unit = excluded.unit,
  filterable = excluded.filterable,
  sortable = excluded.sortable,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases,
  normalization_config = excluded.normalization_config,
  status = excluded.status;

insert into public.category_attributes (
  category_id, attribute_id, facet_enabled, required, sort_order, display_group
)
select
  category.internal_id,
  attribute.internal_id,
  seed.facet_enabled,
  seed.required,
  seed.sort_order,
  seed.display_group
from jsonb_to_recordset($seed$${json(categoryAttributes)}$seed$::jsonb) as seed(
  category_stable_id text, attribute_stable_id text, facet_enabled boolean,
  required boolean, sort_order integer, display_group text
)
join public.categories category on category.stable_id = seed.category_stable_id
join public.attribute_definitions attribute on attribute.stable_id = seed.attribute_stable_id
on conflict (category_id, attribute_id) do update set
  facet_enabled = excluded.facet_enabled,
  required = excluded.required,
  sort_order = excluded.sort_order,
  display_group = excluded.display_group;

commit;
`);
