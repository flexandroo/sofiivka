begin;

select plan(8);

select has_table('public', 'catalog_snapshot_releases', 'snapshot release table exists');
select has_table('public', 'catalog_product_snapshots', 'snapshot product table exists');
select has_table('public', 'catalog_snapshot_pointer', 'snapshot pointer table exists');
select has_function('public', 'get_catalog_snapshot', array[]::text[], 'public snapshot RPC exists');

select ok(
  not has_table_privilege('anon', 'public.catalog_snapshot_releases', 'select'),
  'anon cannot read release metadata directly'
);
select ok(
  not has_table_privilege('anon', 'public.catalog_product_snapshots', 'select'),
  'anon cannot read product read-model rows directly'
);
select ok(
  has_function_privilege('anon', 'public.get_catalog_snapshot()', 'execute'),
  'anon can execute only the shaped snapshot RPC'
);
select is(public.get_catalog_snapshot(), null::jsonb, 'RPC returns null before a release is published');

select * from finish();
rollback;
