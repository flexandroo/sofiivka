"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const schema = read("supabase/schema.sql");
const rls = read("supabase/rls.sql");
const seed = read("supabase/seed-core.sql");
const storage = read("supabase/storage.sql");
const config = read("supabase/config.toml");
const envExample = read(".env.example");
const publicSnapshotMigration = read("supabase/migrations/20260929000100_catalog_public_snapshot.sql");
const snapshotMaterializationMigration = read("supabase/migrations/20260929000200_catalog_snapshot_materialization.sql");
const snapshotTimeoutMigration = read("supabase/migrations/20260929000300_catalog_snapshot_rpc_timeout.sql");
const scopedReadMigration = read("supabase/migrations/20260929000400_catalog_scoped_read_api.sql");
const scopedFacetFixMigration = read("supabase/migrations/20260929000500_catalog_facets_object_length_fix.sql");

const tableMatches = [...schema.matchAll(/create table public\.(\w+)\s*\(/gi)];
const tables = tableMatches.map(match => match[1]);
const tableSet = new Set(tables);
assert.equal(tableSet.size, tables.length, "schema contains duplicate table declarations");

const requiredTables = [
  "admin_profiles", "suppliers", "import_runs", "brands", "categories",
  "attribute_definitions", "category_attributes", "attribute_options",
  "product_series", "products", "product_categories", "product_attribute_values",
  "product_media", "product_documents", "tags", "product_tags",
  "product_collections", "product_collection_items", "product_source_records",
  "product_source_attributes", "category_mapping_reviews"
];
assert.deepEqual([...tableSet].sort(), [...requiredTables].sort(), "entity table set changed unexpectedly");

for (const reference of schema.matchAll(/references\s+(public\.)?(\w+)\s*\(/gi)) {
  if (!reference[1]) {
    assert.equal(reference[2], "users", `unexpected non-public FK target: ${reference[2]}`);
    continue;
  }
  assert.ok(tableSet.has(reference[2]), `FK references missing table public.${reference[2]}`);
}

const tableBlocks = [...schema.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)];
assert.equal(tableBlocks.length, tables.length, "static parser could not isolate every table body");
for (const block of tableBlocks) {
  for (const reference of block[2].matchAll(/references\s+public\.(\w+)\s*\(/gi)) {
    const targetPosition = schema.indexOf(`create table public.${reference[1]} (`);
    assert.ok(targetPosition >= 0, `${block[1]} references missing ${reference[1]}`);
    assert.ok(targetPosition <= block.index || reference[1] === block[1], `${block[1]} references ${reference[1]} before it is created`);
  }
}

for (const type of [
  "product_price_status", "product_inventory_status", "product_publication_status",
  "attribute_value_type", "record_status", "brand_visibility", "category_status",
  "category_visibility", "collection_type", "media_type", "media_role",
  "document_type", "import_run_status", "mapping_status", "mapping_review_status",
  "admin_role", "tag_origin"
]) assert.match(schema, new RegExp(`create type public\\.${type} as enum`, "i"), `missing enum ${type}`);

assert.match(schema, /legacy_id text not null unique/i, "legacy product ID must be unique");
assert.match(schema, /products_legacy_id_immutable/i, "legacy product ID immutability trigger missing");
assert.match(schema, /products_sku_normalized_uidx on public\.products \(lower\(sku\)\)/i, "normalized SKU uniqueness constraint missing");
assert.match(schema, /products_slug_normalized_uidx on public\.products \(lower\(slug\)\)/i, "normalized slug uniqueness constraint missing");
assert.match(schema, /admin_profiles_preserve_active_owner/i, "last active owner protection trigger missing");
assert.match(schema, /At least one active owner must remain/i, "last active owner protection error missing");
assert.match(schema, /product_source_records[\s\S]*?product_id uuid not null references public\.products\(internal_id\) on delete restrict/i, "supplier provenance must block physical product deletion");
assert.match(schema, /category_mapping_reviews[\s\S]*?product_id uuid not null references public\.products\(internal_id\) on delete restrict/i, "unresolved mapping audit must block physical product deletion");
assert.match(schema, /num_nonnulls\(value_number, value_text, value_boolean, option_id\) = 1/i, "typed attribute exclusivity check missing");
assert.match(schema, /categories_root_slug_uidx/i, "root category slug uniqueness missing");
assert.match(schema, /categories_sibling_slug_uidx/i, "sibling category slug uniqueness missing");
assert.match(schema, /sort_order integer not null default 0 check \(sort_order >= 0\)/i, "non-negative category ordering constraint missing");
assert.match(schema, /product_media_one_primary_uidx/i, "single primary media constraint missing");
assert.match(schema, /to_tsvector\('simple'/i, "generated search vector missing");
assert.match(schema, /products_category_publication_idx/i, "category PLP composite index missing");
assert.match(schema, /products_brand_publication_idx/i, "brand PLP composite index missing");

const indexNames = [...schema.matchAll(/create\s+(?:unique\s+)?index\s+(\w+)/gi)].map(match => match[1]);
assert.equal(new Set(indexNames).size, indexNames.length, "duplicate index names detected");

const viewNames = [...schema.matchAll(/create or replace view public\.(\w+)/gi)].map(match => match[1]);
assert.deepEqual(viewNames.sort(), ["catalog_products", "effective_category_facets", "product_facets_view", "product_search_view", "public_products"].sort(), "API view set changed unexpectedly");
assert.equal((schema.match(/with \(security_invoker = true\)/gi) || []).length, viewNames.length, "every API view must use security_invoker");

const rlsTables = [...rls.matchAll(/alter table public\.(\w+) enable row level security/gi)].map(match => match[1]);
assert.deepEqual([...rlsTables].sort(), [...requiredTables].sort(), "RLS must be enabled on every entity table");
assert.match(rls, /products_public_read[\s\S]*is_public_product/i, "published-product RLS policy missing");
assert.match(rls, /update_product_commercial/i, "manager commercial RPC missing");
assert.match(rls, /update_product_content/i, "content-manager RPC missing");
assert.match(rls, /new_description_sections is null or jsonb_typeof\(new_description_sections\) <> 'array'/i, "content RPC must reject a null or non-array section payload");
assert.doesNotMatch(rls, /product_source_records_public_read/i, "raw supplier records must not have a public policy");
assert.doesNotMatch(rls, /product_source_attributes_public_read/i, "raw supplier attributes must not have a public policy");
assert.equal((rls.match(/^security definer$/gim) || []).length, (rls.match(/^set search_path = ''$/gim) || []).length, "every SECURITY DEFINER function must use an empty search_path");
const catalogReadPolicyBlock = rls.match(/do \$admin_read_policies\$[\s\S]*?\$admin_read_policies\$;/i)?.[0] || "";
const importReadPolicyBlock = rls.match(/do \$import_read_policies\$[\s\S]*?\$import_read_policies\$;/i)?.[0] || "";
assert.ok(catalogReadPolicyBlock, "catalog staff-read policy block missing");
assert.ok(importReadPolicyBlock, "supplier/import read policy block missing");
assert.doesNotMatch(catalogReadPolicyBlock, /product_source_records|import_runs|suppliers/i, "content-manager catalog reads must not include supplier/import tables");
assert.match(importReadPolicyBlock, /product_source_records/i, "supplier provenance read policy missing");
assert.match(importReadPolicyBlock, /public\.can_manage_products\(\)/i, "supplier provenance must require manager-or-higher scope");

const dollarTags = new Map();
for (const file of [["schema.sql", schema], ["rls.sql", rls], ["seed-core.sql", seed], ["storage.sql", storage]]) {
  dollarTags.clear();
  for (const match of file[1].matchAll(/\$[A-Za-z_]*\$/g)) dollarTags.set(match[0], (dollarTags.get(match[0]) || 0) + 1);
  for (const [tag, count] of dollarTags) assert.equal(count % 2, 0, `${file[0]} has an unpaired ${tag} delimiter`);
  assert.match(file[1], /begin;/i, `${file[0]} must begin a transaction`);
  assert.match(file[1], /commit;/i, `${file[0]} must commit its transaction`);
}

const migrationPairs = [
  ["supabase/schema.sql", "supabase/migrations/20260928000100_catalog_schema.sql"],
  ["supabase/seed-core.sql", "supabase/migrations/20260928000300_core_seed.sql"],
  ["supabase/storage.sql", "supabase/migrations/20260928000400_storage.sql"],
  ["supabase/seed-core.sql", "supabase/seed.sql"]
];
for (const [source, generated] of migrationPairs) {
  assert.equal(read(source), read(generated), `${generated} is not synchronized with ${source}`);
}

const tagVisibilityMigration = read("supabase/migrations/20260928000500_tag_relation_visibility.sql");
for (const sql of [rls, tagVisibilityMigration]) {
  assert.match(sql, /create policy product_tags_public_read[\s\S]*tag\.status = 'active'/i,
    "public product/tag relations must require an active tag");
}

for (const table of ["catalog_snapshot_releases", "catalog_product_snapshots", "catalog_snapshot_pointer"]) {
  assert.match(publicSnapshotMigration, new RegExp(`create table public\\.${table}\\s*\\(`, "i"), `missing public read-model table ${table}`);
  assert.match(publicSnapshotMigration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must have RLS enabled`);
  assert.match(publicSnapshotMigration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"), `${table} must not be directly readable`);
}
assert.match(publicSnapshotMigration, /create or replace function public\.get_catalog_snapshot\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i,
  "public snapshot RPC must be SECURITY DEFINER with an empty search_path");
assert.match(publicSnapshotMigration, /grant execute on function public\.get_catalog_snapshot\(\) to anon, authenticated/i,
  "anon/authenticated RPC grant missing");
assert.match(publicSnapshotMigration, /product\.publication_status = 'published'/i, "snapshot RPC must filter unpublished products");
assert.doesNotMatch(publicSnapshotMigration, /raw_payload|payload_checksum|mapping_notes|error_summary/i,
  "snapshot read model must not expose private import/evidence columns");
assert.match(snapshotMaterializationMigration, /create or replace function public\.finalize_catalog_snapshot\(target_snapshot_version text\)[\s\S]*set statement_timeout = '120s'/i,
  "snapshot finalization must run once with a bounded extended timeout");
assert.match(snapshotMaterializationMigration, /grant execute on function public\.finalize_catalog_snapshot\(text\) to service_role/i,
  "snapshot finalization must be service-role only");
assert.match(snapshotMaterializationMigration, /'products', release\.products/i,
  "anon RPC must read the materialized product array");
assert.doesNotMatch(snapshotMaterializationMigration, /grant execute on function public\.finalize_catalog_snapshot\(text\) to (?:anon|authenticated)/i,
  "anon/authenticated must not finalize snapshots");
assert.match(snapshotTimeoutMigration, /create or replace function public\.get_catalog_snapshot\(\)[\s\S]*set statement_timeout = '60s'/i,
  "only the large read-only snapshot RPC must receive a bounded extended timeout");
assert.match(snapshotTimeoutMigration, /grant execute on function public\.get_catalog_snapshot\(\) to anon, authenticated/i,
  "public snapshot RPC grant must survive the timeout replacement");

assert.match(scopedReadMigration, /create table public\.catalog_product_cards\s*\(/i,
  "scoped product-card read model missing");
assert.match(scopedReadMigration, /alter table public\.catalog_product_cards enable row level security/i,
  "scoped read model must have RLS enabled");
assert.match(scopedReadMigration, /revoke all on table public\.catalog_product_cards from public, anon, authenticated/i,
  "scoped read rows must not be directly readable");
for (const rpc of [
  "get_catalog_version", "get_catalog_bootstrap", "get_catalog_products", "get_catalog_facets",
  "get_catalog_product", "search_catalog", "get_catalog_collection"
]) {
  assert.match(scopedReadMigration, new RegExp(`create or replace function public\\.${rpc}\\(`, "i"), `missing scoped RPC ${rpc}`);
}
assert.match(scopedReadMigration, /least\(greatest\(page_size, 1\), 96\)/i,
  "PLP RPC must cap page size at 96");
assert.match(scopedReadMigration, /candidate\.legacy_id <> target\.legacy_id[\s\S]*?limit 4/i,
  "PDP RPC must return a bounded related-product set");
assert.match(scopedReadMigration, /product\.publication_status = 'published'/i,
  "scoped read model must include only published products");
assert.match(scopedReadMigration, /grant execute on function public\.search_catalog\(text, integer, integer, integer, integer\) to anon, authenticated/i,
  "server search must be available through the shaped RPC only");
assert.match(scopedReadMigration, /revoke all on function public\.finalize_catalog_snapshot\(text\) from public, anon, authenticated/i,
  "read-model publication must remain private");
assert.doesNotMatch(scopedReadMigration, /grant execute on function public\.finalize_catalog_snapshot\(text\) to (?:anon|authenticated)/i,
  "anon/authenticated must not publish scoped read models");
assert.match(scopedFacetFixMigration, /create or replace function extensions\.jsonb_object_length\(value jsonb\)/i,
  "facet compatibility helper missing");
assert.match(scopedFacetFixMigration, /set search_path = 'pg_catalog', 'extensions'/i,
  "facet RPC replacement must use an explicit safe search path");

const pgTapTests = fs.readdirSync(path.join(root, "supabase", "tests"))
  .filter(file => file.endsWith(".test.sql"))
  .sort();
assert.deepEqual(pgTapTests, [
  "001_schema.test.sql",
  "002_integrity.test.sql",
  "003_rls.test.sql",
  "004_queries.test.sql",
  "005_public_snapshot.test.sql",
  "006_scoped_read_api.test.sql"
], "pgTAP suite changed unexpectedly");
for (const testFile of pgTapTests) {
  const sql = read(path.join("supabase", "tests", testFile));
  assert.match(sql, /^begin;/i, `${testFile} must isolate fixtures in a transaction`);
  assert.match(sql, /select \* from finish\(\);/i, `${testFile} must finish pgTAP output`);
  assert.match(sql, /rollback;\s*$/i, `${testFile} must roll back fixtures`);
  assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, `${testFile} has an unpaired $$ delimiter`);
}

for (const bucket of ["product-media", "brand-media", "site-media", "documents", "import-private"]) {
  assert.match(storage, new RegExp(`'${bucket}'`, "i"), `missing storage bucket ${bucket}`);
}
assert.match(storage, /'import-private',[\s\S]*?false,/i, "supplier-import bucket must be private");
assert.match(storage, /can_manage_content\(\)/i, "content storage role policy missing");
assert.match(storage, /can_admin_catalog\(\)/i, "private import storage role policy missing");
assert.match(storage, /is_allowed_storage_path/i, "storage path guard missing");
assert.equal((storage.match(/create policy sofievka_/gi) || []).length, 8, "storage policy count changed");
assert.equal((storage.match(/^security definer$/gim) || []).length, (storage.match(/^set search_path = ''$/gim) || []).length, "storage SECURITY DEFINER functions must use an empty search_path");

assert.match(config, /^project_id = "sofievka"$/m, "local Supabase project ID missing");
assert.match(config, /sql_paths = \["\.\/seed\.sql"\]/, "local reset must apply the idempotent core seed");
assert.match(config, /\[experimental\.pgdelta\][\s\S]*?enabled = true/i, "current pg-delta migration diff engine must be enabled");
assert.doesNotMatch(config, /project_ref|access_token|service_role|sb_secret_/i, "Supabase config must not contain link state or secrets");
const publicEnvLines = envExample.split(/\r?\n/).filter(line => line && !line.startsWith("#"));
assert.deepEqual(publicEnvLines.map(line => line.split("=")[0]), [
  "SOFIEVKA_CATALOG_SOURCE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SOFIEVKA_SUPABASE_PROJECT_REF",
  "SOFIEVKA_ALLOW_PRODUCTION_SUPABASE"
], ".env.example public configuration contract changed unexpectedly");
assert.doesNotMatch(envExample, /SERVICE_ROLE|DB_PASSWORD|ACCESS_TOKEN|SB_SECRET_/i, ".env.example must expose only browser-safe placeholders");

const seedPayloads = [...seed.matchAll(/jsonb_to_recordset\(\$seed\$([\s\S]*?)\$seed\$::jsonb\)/g)].map(match => JSON.parse(match[1]));
assert.equal(seedPayloads.length, 4, "seed must contain brands, categories, attributes and category relations only");
const [brands, categories, attributes, categoryAttributes] = seedPayloads;
assert.equal(brands.length, 36, "brand seed count changed");
assert.equal(categories.length, 87, "category seed count changed");
assert.equal(attributes.length, 64, "attribute seed count changed");
assert.equal(categoryAttributes.length, 648, "category-attribute seed count changed");
assert.equal(categoryAttributes.filter(item => !item.facet_enabled).length, 47, "disabled non-filterable category facets changed");
assert.doesNotMatch(seed, /insert into public\.products/i, "seed-core must not import products");

const unique = (items, field, label) => assert.equal(new Set(items.map(item => item[field])).size, items.length, `${label} contains duplicates`);
unique(brands, "stable_id", "brand stable IDs");
unique(categories, "stable_id", "category stable IDs");
unique(attributes, "stable_id", "attribute stable IDs");

const categoryById = new Map(categories.map(category => [category.stable_id, category]));
for (const category of categories) {
  if (!category.parent_stable_id) assert.equal(category.level, 1, `${category.stable_id}: root level must be 1`);
  else {
    const parent = categoryById.get(category.parent_stable_id);
    assert.ok(parent, `${category.stable_id}: missing seed parent`);
    assert.equal(category.level, parent.level + 1, `${category.stable_id}: invalid seed level`);
  }
}

const siblingSlugs = categories.map(category => `${category.parent_stable_id || "ROOT"}|${category.slug}`);
assert.equal(new Set(siblingSlugs).size, siblingSlugs.length, "category seed has duplicate sibling slugs");
const attributeIds = new Set(attributes.map(attribute => attribute.stable_id));
for (const relation of categoryAttributes) {
  assert.ok(categoryById.has(relation.category_stable_id), "category relation references missing category");
  assert.ok(attributeIds.has(relation.attribute_stable_id), "category relation references missing attribute");
  const definition = attributes.find(attribute => attribute.stable_id === relation.attribute_stable_id);
  assert.ok(!relation.facet_enabled || definition.filterable, "category enables a globally non-filterable facet");
}

const regeneratedSeed = childProcess.execFileSync(process.execPath, [path.join(root, "scripts", "generate-supabase-seed.mjs")], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024
}).replace(/\r\n/g, "\n");
assert.equal(seed, regeneratedSeed, "seed-core.sql is stale; regenerate it from the canonical registries");

console.log(JSON.stringify({
  status: "ok",
  tables: tables.length,
  views: viewNames.length,
  rlsTables: rlsTables.length,
  migrations: fs.readdirSync(path.join(root, "supabase", "migrations")).filter(file => file.endsWith(".sql")).length,
  pgTapTests: pgTapTests.length,
  storagePolicies: (storage.match(/create policy sofievka_/gi) || []).length,
  seed: {
    brands: brands.length,
    categories: categories.length,
    attributes: attributes.length,
    categoryAttributes: categoryAttributes.length,
    disabledCategoryFacets: categoryAttributes.filter(item => !item.facet_enabled).length
  },
  sqlExecution: "not-run-no-local-postgresql"
}, null, 2));
