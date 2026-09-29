begin;

select plan(26);

select has_table('public', 'catalog_product_cards', 'scoped product-card read model exists');
select has_function('public', 'get_catalog_version', array[]::text[], 'catalog version RPC exists');
select has_function('public', 'get_catalog_bootstrap', array[]::text[], 'catalog bootstrap RPC exists');
select has_function('public', 'get_catalog_products', array['text', 'text', 'text[]', 'text[]', 'text[]', 'jsonb', 'numeric', 'numeric', 'text', 'integer', 'integer', 'text[]', 'text'], 'paginated PLP RPC exists');
select has_function('public', 'get_catalog_facets', array['text', 'text', 'text[]', 'text[]', 'text[]', 'jsonb', 'numeric', 'numeric', 'text'], 'server facet RPC exists');
select has_function('public', 'get_catalog_product', array['text'], 'dedicated PDP RPC exists');
select has_function('public', 'search_catalog', array['text', 'integer', 'integer', 'integer', 'integer'], 'server search RPC exists');
select has_function('public', 'get_catalog_collection', array['text'], 'collection RPC exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.catalog_product_cards'::regclass),
  'scoped product-card table has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.catalog_product_cards', 'select'),
  'anon cannot read scoped rows directly'
);
select ok(has_function_privilege('anon', 'public.get_catalog_version()', 'execute'), 'anon can read the catalog version');
select ok(has_function_privilege('anon', 'public.get_catalog_bootstrap()', 'execute'), 'anon can read bootstrap metadata');
select ok(has_function_privilege('anon', 'public.get_catalog_products(text,text,text[],text[],text[],jsonb,numeric,numeric,text,integer,integer,text[],text)', 'execute'), 'anon can query paginated products');
select ok(has_function_privilege('anon', 'public.get_catalog_facets(text,text,text[],text[],text[],jsonb,numeric,numeric,text)', 'execute'), 'anon can query scoped facets');
select ok(has_function_privilege('anon', 'public.get_catalog_product(text)', 'execute'), 'anon can query a PDP payload');
select ok(has_function_privilege('anon', 'public.search_catalog(text,integer,integer,integer,integer)', 'execute'), 'anon can execute server search');
select ok(has_function_privilege('anon', 'public.get_catalog_collection(text)', 'execute'), 'anon can query editorial collections');
select ok(not has_function_privilege('anon', 'public.finalize_catalog_snapshot(text)', 'execute'), 'anon cannot publish read models');
select ok(not has_function_privilege('anon', 'public._catalog_card(jsonb,text)', 'execute'), 'anon cannot execute private card shaping');

select is(public.get_catalog_version(), null::jsonb, 'version RPC returns null before a release is published');
select is(public.get_catalog_bootstrap(), null::jsonb, 'bootstrap RPC returns null before a release is published');
select is(public.get_catalog_products(), null::jsonb, 'PLP RPC returns null before a release is published');
select is(public.get_catalog_facets(), null::jsonb, 'facet RPC returns null before a release is published');
select is(public.get_catalog_product('missing'), null::jsonb, 'PDP RPC does not leak a missing product');
select is(public.search_catalog('probe'), null::jsonb, 'search RPC returns null before a release is published');
select is(public.get_catalog_collection('missing'), null::jsonb, 'collection RPC does not leak a missing collection');

select * from finish();
rollback;
