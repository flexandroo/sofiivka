begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.brands (internal_id, stable_id, slug, name)
values ('81000000-0000-0000-0000-000000000001', 'query-brand', 'query-brand', 'Query Brand');
insert into public.categories (internal_id, stable_id, slug, level, title)
values ('82000000-0000-0000-0000-000000000001', 'query-category', 'query-category', 1, 'Query Category');
insert into public.attribute_definitions (
  internal_id, stable_id, label, value_type, unit, filterable, sortable
)
values (
  '83000000-0000-0000-0000-000000000001', 'query-flow-rate', 'Flow rate', 'number', 'l/min', true, true
);
insert into public.category_attributes (category_id, attribute_id, facet_enabled, required, sort_order)
values (
  '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', true, true, 1
);
insert into public.products (
  internal_id, legacy_id, sku, slug, title, short_title, model,
  brand_id, primary_category_id, publication_status, amount, price_status, inventory_status
)
values (
  '84000000-0000-0000-0000-000000000001', 'query-product', 'QUERY-PUMP-42', 'query-pump-42',
  'Sofiivka Search Probe Alpha Pump', 'Alpha Pump', 'Probe 42',
  '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  'published', 2500, 'known', 'in_stock'
);
insert into public.product_attribute_values (product_id, attribute_id, value_number)
values (
  '84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 42.5
);
insert into public.product_collections (internal_id, stable_id, slug, title, collection_type)
values (
  '85000000-0000-0000-0000-000000000001', 'query-collection', 'query-collection', 'Query Collection', 'manual'
);
insert into public.product_collection_items (collection_id, product_id, sort_order)
values (
  '85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 1
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select id, sku, brand_id, primary_category_id, amount, price_status::text
     from public.catalog_products where id = 'query-product' $$,
  $$ values ('query-product'::text, 'QUERY-PUMP-42'::text, 'query-brand'::text, 'query-category'::text, 2500::numeric, 'known'::text) $$,
  'catalog product projection supplies stable IDs and typed commercial fields for a future adapter'
);
select results_eq(
  $$ select stable_id, slug, name from public.brands where stable_id = 'query-brand' $$,
  $$ values ('query-brand'::text, 'query-brand'::text, 'Query Brand'::text) $$,
  'public brand registry is queryable in adapter-ready form'
);
select results_eq(
  $$ select stable_id, slug, title from public.categories where stable_id = 'query-category' $$,
  $$ values ('query-category'::text, 'query-category'::text, 'Query Category'::text) $$,
  'public category registry is queryable in adapter-ready form'
);
select results_eq(
  $$ select collection.stable_id, item.product_id
     from public.product_collections collection
     join public.product_collection_items item on item.collection_id = collection.internal_id
     where collection.stable_id = 'query-collection' $$,
  $$ values ('query-collection'::text, '84000000-0000-0000-0000-000000000001'::uuid) $$,
  'active public collection items return only a public product relation'
);
select results_eq(
  $$ select legacy_id from public.product_search_view where search_document @@ plainto_tsquery('simple', 'Probe Alpha') $$,
  $$ values ('query-product'::text) $$,
  'full-text product search returns the expected public product'
);
select results_eq(
  $$ select legacy_id from public.product_search_view where similarity(title, 'Sofiivka Search Proeb Alpha Pump') > 0.5 $$,
  $$ values ('query-product'::text) $$,
  'trigram similarity tolerates a representative title typo'
);
select results_eq(
  $$ select legacy_id from public.product_search_view where sku = 'QUERY-PUMP-42' $$,
  $$ values ('query-product'::text) $$,
  'exact SKU search returns the expected product'
);
select results_eq(
  $$ select legacy_id, attribute_id, value_number from public.product_facets_view where legacy_id = 'query-product' $$,
  $$ values ('query-product'::text, 'query-flow-rate'::text, 42.5::numeric) $$,
  'facet view returns a typed numeric value'
);
select results_eq(
  $$ select category_id, attribute_id from public.effective_category_facets where category_id = 'query-category' $$,
  $$ values ('query-category'::text, 'query-flow-rate'::text) $$,
  'effective category facet view returns the configured filter'
);
select lives_ok(
  $$ explain (costs off) select * from public.products where search_document @@ plainto_tsquery('simple', 'Probe') $$,
  'full-text search query plans successfully'
);
select lives_ok(
  $$ explain (costs off) select * from public.product_attribute_values where attribute_id = '83000000-0000-0000-0000-000000000001' and value_number between 40 and 50 $$,
  'numeric facet query plans successfully'
);
select lives_ok(
  $$ explain (costs off) select * from public.products where primary_category_id = '82000000-0000-0000-0000-000000000001' and publication_status = 'published' order by updated_at desc limit 24 $$,
  'representative PLP query plans successfully'
);
select lives_ok(
  $$ explain (costs off) select * from public.products where brand_id = '81000000-0000-0000-0000-000000000001' and publication_status = 'published' order by updated_at desc limit 24 $$,
  'representative brand listing query plans successfully'
);
select lives_ok(
  $$ explain (costs off) select * from public.products where publication_status = 'published' and price_status = 'known' order by amount asc nulls last limit 24 $$,
  'published known-price sorting query plans successfully'
);
select lives_ok(
  $$ explain (costs off) select * from public.products where publication_status = 'published' and inventory_status = 'in_stock' limit 24 $$,
  'published inventory filter query plans successfully'
);
select lives_ok(
  $$ explain (costs off)
     select item.product_id
     from public.product_collection_items item
     join public.product_collections collection on collection.internal_id = item.collection_id
     where collection.stable_id = 'query-collection'
     order by item.sort_order $$,
  'ordered collection-products query plans successfully'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.product_attribute_values value
    left join public.products product on product.internal_id = value.product_id
    left join public.attribute_definitions definition on definition.internal_id = value.attribute_id
    where product.internal_id is null or definition.internal_id is null
  ),
  0,
  'facet values contain no product or definition orphans'
);

select * from finish();
rollback;
