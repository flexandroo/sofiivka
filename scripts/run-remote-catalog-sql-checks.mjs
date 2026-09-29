import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT, writeJson } from './catalog-db-utils.mjs';

function parseArguments(argumentsList) {
  const options = { projectRef: '', reportDir: 'reports' };
  for (const argument of argumentsList) {
    if (argument.startsWith('--project-ref=')) options.projectRef = argument.slice('--project-ref='.length);
    else if (argument.startsWith('--report-dir=')) options.reportDir = argument.slice('--report-dir='.length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.projectRef) throw new Error('--project-ref is required.');
  if (!['wfxcklglujgramasdzyr', 'fkjarsouuchjiedrrblc'].includes(options.projectRef)) {
    throw new Error('Refusing SQL checks outside approved Sofievka projects.');
  }
  return options;
}

async function runSql({ projectRef, accessToken, query }) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new Error(`Management SQL failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

function planRoot(payload) {
  const value = payload?.[0]?.['QUERY PLAN'];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }
  return value ?? null;
}

function collectPlanNodes(plan, nodes = []) {
  if (!plan || typeof plan !== 'object') return nodes;
  if (plan['Node Type']) nodes.push({
    nodeType: plan['Node Type'],
    relation: plan['Relation Name'] ?? null,
    index: plan['Index Name'] ?? null,
    actualRows: plan['Actual Rows'] ?? null,
    loops: plan['Actual Loops'] ?? null,
  });
  for (const child of plan.Plans ?? []) collectPlanNodes(child, nodes);
  return nodes;
}

const PLAN_QUERIES = {
  category: `
    select legacy_id from public.products
    where primary_category_id = (
      select primary_category_id from public.products group by primary_category_id order by count(*) desc limit 1
    ) and publication_status = 'published'
    order by updated_at desc limit 24`,
  brand: `
    select legacy_id from public.products
    where brand_id = (select brand_id from public.products group by brand_id order by count(*) desc limit 1)
      and publication_status = 'published'
    order by updated_at desc limit 24`,
  categoryBrand: `
    select legacy_id from public.products
    where (primary_category_id, brand_id) = (
      select primary_category_id, brand_id from public.products
      group by primary_category_id, brand_id order by count(*) desc limit 1
    ) and publication_status = 'published'
    order by updated_at desc limit 24`,
  priceSort: `
    select legacy_id, amount from public.products
    where publication_status = 'published' and price_status = 'known'
    order by amount asc limit 24`,
  inventory: `
    select legacy_id from public.products
    where publication_status = 'published' and inventory_status = 'in_stock'
    limit 24`,
  numericFacet: `
    select value.product_id from public.product_attribute_values value
    where value.attribute_id = (
      select attribute_id from public.product_attribute_values where value_number is not null
      group by attribute_id order by count(*) desc limit 1
    ) and value.value_number is not null
    order by value.value_number limit 24`,
  textFacet: `
    select value.product_id from public.product_attribute_values value
    where value.attribute_id = (
      select attribute_id from public.product_attribute_values where value_text is not null
      group by attribute_id order by count(*) desc limit 1
    ) and value.value_text is not null
    order by value.value_text limit 24`,
  collection: `
    select item.product_id from public.product_collection_items item
    where item.collection_id = (
      select collection_id from public.product_collection_items group by collection_id order by count(*) desc limit 1
    ) order by item.sort_order limit 24`,
  legacyId: `
    select internal_id from public.products
    where legacy_id = (select min(legacy_id) from public.products)`,
  exactSku: `
    select internal_id from public.products
    where lower(sku) = lower((select min(sku) from public.products))`,
  fullText: `
    select legacy_id from public.products
    where search_document @@ plainto_tsquery('simple', 'насос')
    limit 24`,
  brandTitle: `
    select product.legacy_id
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id
    where product.search_document @@ plainto_tsquery('simple', 'насос')
       or brand.name ilike '%wilo%'
    limit 24`,
  trigram: `
    select legacy_id from public.products
    where title % 'насос'
    order by similarity(title, 'насос') desc limit 24`,
};

export async function runRemoteSqlChecks({ projectRef, reportDir = 'reports' }) {
  const accessToken = process.env.SOFIEVKA_SUPABASE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('SOFIEVKA_SUPABASE_ACCESS_TOKEN is required in process memory.');
  const startedAt = new Date().toISOString();
  const summaryRows = await runSql({ projectRef, accessToken, query: `
    select
      (select count(*) from public.products)::integer as products,
      (select count(*) from public.products where publication_status = 'published')::integer as published,
      (select count(*) from public.products where publication_status = 'hidden')::integer as hidden,
      (select count(*) from public.product_series)::integer as series,
      (select count(*) from public.product_attribute_values)::integer as typed_attributes,
      (select count(*) from public.product_source_records)::integer as source_records,
      (select count(*) from public.product_source_attributes)::integer as source_attributes,
      (select count(*) from public.product_media)::integer as media,
      (select count(*) from public.product_documents)::integer as documents,
      (select count(*) from public.tags)::integer as tags,
      (select count(*) from public.product_tags)::integer as product_tags,
      (select count(*) from public.product_collections)::integer as collections,
      (select count(*) from public.product_collection_items)::integer as collection_items,
      (select count(*) from public.category_mapping_reviews)::integer as category_reviews,
      (select count(*) from public.import_runs where status = 'succeeded')::integer as succeeded_import_runs,
      (select (metadata #>> '{productWriteSummary,inserted}')::integer from public.import_runs where status = 'succeeded' order by finished_at desc limit 1) as latest_run_inserted,
      (select (metadata #>> '{productWriteSummary,updated}')::integer from public.import_runs where status = 'succeeded' order by finished_at desc limit 1) as latest_run_updated,
      (select (metadata #>> '{productWriteSummary,failed}')::integer from public.import_runs where status = 'succeeded' order by finished_at desc limit 1) as latest_run_failed,
      (select jsonb_array_length(metadata->'warnings') from public.import_runs where status = 'succeeded' order by finished_at desc limit 1) as latest_run_warnings,
      (select count(*) from public.products where price_status = 'known')::integer as price_known,
      (select count(*) from public.products where price_status = 'unknown')::integer as price_unknown,
      (select count(*) from public.products where price_status = 'on_request')::integer as price_on_request,
      (select count(*) from public.products where old_amount is not null)::integer as old_price_rows,
      (select count(*) from public.products where price_status = 'known' and (amount is null or amount <= 0))::integer as invalid_known_prices,
      (select count(*) from public.products where price_status <> 'known' and amount is not null)::integer as invalid_unknown_prices,
      (select count(*) from public.products where currency <> 'UAH')::integer as non_uah_currency,
      (select count(*) from public.products where inventory_status = 'in_stock')::integer as inventory_in_stock,
      (select count(*) from public.products where inventory_status = 'out_of_stock')::integer as inventory_out_of_stock,
      (select count(*) from public.products where inventory_status = 'preorder')::integer as inventory_preorder,
      (select count(*) from public.products where inventory_status = 'discontinued')::integer as inventory_discontinued,
      (select count(*) from public.products where inventory_status = 'unknown')::integer as inventory_unknown,
      (select count(*) from public.products where seo_title is not null or seo_description is not null)::integer as explicit_seo,
      (select count(*) from public.products where seo_title is null and seo_description is null)::integer as fallback_only_seo,
      (select count(*) from public.product_attribute_values where value_number is not null)::integer as typed_numbers,
      (select count(*) from public.product_attribute_values where value_boolean is not null)::integer as typed_booleans,
      (select count(*) from public.product_attribute_values where value_text is not null)::integer as typed_text,
      (select count(*) from public.product_attribute_values where option_id is not null)::integer as typed_options,
      (select count(*) from public.product_attribute_values where num_nonnulls(value_number, value_text, value_boolean, option_id) <> 1)::integer as invalid_typed_values,
      (select count(*) from public.product_source_attributes where source_metadata->>'canonicalLayer' = 'sourceAttributes')::integer as canonical_source_attribute_rows,
      (select count(*) from public.product_source_attributes where source_metadata->>'canonicalLayer' = 'unmappedAttributes')::integer as canonical_unmapped_attribute_rows,
      (select count(distinct product_id) from public.product_source_attributes where source_metadata->>'canonicalLayer' = 'unmappedAttributes')::integer as unmapped_products,
      (select count(*) from public.product_media where role = 'primary' and active)::integer as primary_media,
      (select count(*) from (select product_id from public.product_media where role = 'primary' and active group by product_id having count(*) > 1) duplicate)::integer as duplicate_primary_media,
      (select count(*) from public.product_documents where url is null or btrim(url) = '')::integer as invalid_document_urls,
      (select count(*) from (select product_id, url, title from public.product_documents group by product_id, url, title having count(*) > 1) duplicate)::integer as duplicate_documents,
      (select count(*) from (select legacy_id from public.products group by legacy_id having count(*) > 1) duplicate)::integer as duplicate_legacy_ids,
      (select count(*) from (select lower(sku) from public.products group by lower(sku) having count(*) > 1) duplicate)::integer as duplicate_skus,
      (select count(*) from (select lower(slug) from public.products group by lower(slug) having count(*) > 1) duplicate)::integer as duplicate_slugs,
      (select count(*) from (select product_id, attribute_id from public.product_attribute_values group by product_id, attribute_id having count(*) > 1) duplicate)::integer as duplicate_typed_attributes,
      (select count(*) from (select source_record_id, ordinal from public.product_source_attributes group by source_record_id, ordinal having count(*) > 1) duplicate)::integer as duplicate_source_ordinals
  ` });
  const summary = summaryRows[0];

  const policyRows = await runSql({ projectRef, accessToken, query: `
    select policyname, qual
    from pg_policies
    where schemaname = 'public' and tablename = 'product_tags' and policyname = 'product_tags_public_read'
  ` });
  const indexRows = await runSql({ projectRef, accessToken, query: `
    select indexname
    from pg_indexes
    where schemaname = 'public' and indexname in (
      'products_sku_normalized_uidx', 'products_primary_category_idx', 'products_brand_idx',
      'products_category_publication_idx', 'products_brand_publication_idx', 'products_inventory_idx',
      'products_price_idx', 'products_search_document_idx', 'products_title_trgm_idx',
      'product_attribute_number_idx', 'product_attribute_text_idx', 'product_collection_items_product_idx'
    ) order by indexname
  ` });

  const plans = {};
  for (const [name, query] of Object.entries(PLAN_QUERIES)) {
    const payload = await runSql({
      projectRef, accessToken,
      query: `explain (analyze, buffers, format json) ${query}`,
    });
    const root = planRoot(payload);
    plans[name] = {
      planningTimeMs: root?.['Planning Time'] ?? null,
      executionTimeMs: root?.['Execution Time'] ?? null,
      nodes: collectPlanNodes(root?.Plan),
    };
  }

  const expectedSummary = {
    products: 3215, published: 3214, hidden: 1, series: 368,
    typed_attributes: 23988, source_records: 3215, source_attributes: 92554,
    media: 13006, documents: 3885, tags: 225, product_tags: 4204,
    collections: 5, collection_items: 149, category_reviews: 29,
    latest_run_inserted: 0, latest_run_updated: 3215, latest_run_failed: 0, latest_run_warnings: 3,
    price_known: 631, price_unknown: 2584, price_on_request: 0, old_price_rows: 112,
    invalid_known_prices: 0, invalid_unknown_prices: 0, non_uah_currency: 0,
    inventory_in_stock: 599, inventory_out_of_stock: 32, inventory_preorder: 0,
    inventory_discontinued: 29, inventory_unknown: 2555,
    explicit_seo: 2696, fallback_only_seo: 519,
    typed_numbers: 12401, typed_booleans: 301, typed_text: 11286, typed_options: 0,
    invalid_typed_values: 0,
    canonical_source_attribute_rows: 7148, canonical_unmapped_attribute_rows: 85406,
    unmapped_products: 3096, duplicate_primary_media: 0, invalid_document_urls: 0,
    duplicate_documents: 0, duplicate_legacy_ids: 0, duplicate_skus: 0, duplicate_slugs: 0,
    duplicate_typed_attributes: 0, duplicate_source_ordinals: 0,
  };
  const mismatches = Object.entries(expectedSummary)
    .filter(([key, value]) => summary[key] !== value)
    .map(([key, value]) => ({ key, expected: value, actual: summary[key] }));
  const policyValid = policyRows.length === 1 && /tag\.status = 'active'/i.test(policyRows[0].qual);
  const expectedIndexes = 12;
  const slowPlans = Object.entries(plans)
    .filter(([, plan]) => plan.executionTimeMs === null || plan.executionTimeMs > 250)
    .map(([name, plan]) => ({ name, executionTimeMs: plan.executionTimeMs }));

  const report = {
    reportVersion: 'catalog-migration-sql-checks-v1',
    status: mismatches.length === 0 && policyValid && indexRows.length === expectedIndexes && slowPlans.length === 0 ? 'ok' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    projectRef,
    summary,
    expectedSummary,
    mismatches,
    rls: { productTagsPolicyValid: policyValid, policyName: policyRows[0]?.policyname ?? null },
    indexes: { expected: expectedIndexes, actual: indexRows.length, names: indexRows.map((row) => row.indexname) },
    plans,
    slowPlans,
    notes: [
      'A sequential scan is not automatically a defect at 3,215 rows; execution time and available indexes are evaluated together.',
      'Management API SQL was read-only. No catalog rows or schema objects were modified by this audit.',
    ],
  };
  const reportPath = path.resolve(PROJECT_ROOT, reportDir, 'catalog-migration-sql-checks.json');
  writeJson(reportPath, report);
  console.log(JSON.stringify({ status: report.status, reportPath, summary, planTimesMs: Object.fromEntries(Object.entries(plans).map(([name, plan]) => [name, plan.executionTimeMs])) }, null, 2));
  if (report.status !== 'ok') throw new Error('Remote catalog SQL checks failed. See the sanitized JSON report.');
  return report;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  await runRemoteSqlChecks(options);
}
