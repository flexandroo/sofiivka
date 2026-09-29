begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'products', 'products table exists');
select has_table('public', 'product_source_records', 'supplier provenance table exists');
select has_table('public', 'category_mapping_reviews', 'category review queue exists');
select has_view('public', 'catalog_products', 'catalog API view exists');
select has_view('public', 'product_search_view', 'search API view exists');
select has_view('public', 'product_facets_view', 'facet API view exists');
select has_type('public', 'admin_role', 'admin role enum exists');
select has_type('public', 'product_publication_status', 'publication state enum exists');

select col_not_null('public', 'products', 'legacy_id', 'legacy product ID is required');
select col_not_null('public', 'products', 'sku', 'SKU is required');
select col_not_null('public', 'products', 'slug', 'slug is required');
select col_not_null('public', 'products', 'updated_at', 'product updated_at is required');

select has_index('public', 'products', 'products_sku_normalized_uidx', 'normalized SKU index exists');
select has_index('public', 'products', 'products_slug_normalized_uidx', 'normalized slug index exists');
select has_index('public', 'products', 'products_search_document_idx', 'full-text search index exists');
select has_index('public', 'products', 'products_title_trgm_idx', 'title trigram index exists');
select has_index('public', 'products', 'products_category_publication_idx', 'category PLP index exists');
select has_index('public', 'products', 'products_brand_publication_idx', 'brand PLP index exists');
select has_index('public', 'product_attribute_values', 'product_attribute_number_idx', 'numeric facet index exists');
select has_trigger('public', 'admin_profiles', 'admin_profiles_preserve_active_owner', 'last-owner trigger exists');
select has_trigger('public', 'products', 'products_updated_at', 'product updated_at trigger exists');
select has_trigger('public', 'categories', 'categories_validate_hierarchy', 'category hierarchy trigger exists');

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'admin_profiles', 'suppliers', 'import_runs', 'brands', 'categories',
        'attribute_definitions', 'category_attributes', 'attribute_options',
        'product_series', 'products', 'product_categories', 'product_attribute_values',
        'product_media', 'product_documents', 'tags', 'product_tags',
        'product_collections', 'product_collection_items', 'product_source_records',
        'product_source_attributes', 'category_mapping_reviews'
      )
      and relation.relrowsecurity
  ),
  21,
  'RLS is enabled on every application table'
);

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'effective_category_facets', 'public_products', 'catalog_products',
        'product_search_view', 'product_facets_view'
      )
      and coalesce(relation.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ),
  5,
  'every storefront/API view is security invoker'
);

select results_eq(
  $$ select id from storage.buckets order by id $$,
  $$ values ('brand-media'::text), ('documents'::text), ('import-private'::text), ('product-media'::text), ('site-media'::text) $$,
  'expected storage buckets exist and no extra bucket is introduced by this project'
);

select is(
  (select public from storage.buckets where id = 'import-private'),
  false,
  'supplier import bucket is private'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'sofievka_%'),
  8,
  'all Sofiivka storage policies exist'
);

select * from finish();
rollback;
