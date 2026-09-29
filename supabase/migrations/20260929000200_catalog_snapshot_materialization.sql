-- Materialize the expensive products[] aggregation at publish time so the public
-- request remains a predictable one-row read under the anon statement timeout.
begin;
set local search_path = public, extensions;

alter table public.catalog_snapshot_releases
  add column products jsonb not null default '[]'::jsonb
  check (jsonb_typeof(products) = 'array');

update public.catalog_snapshot_releases
set ready = false
where products = '[]'::jsonb;

create or replace function public.finalize_catalog_snapshot(target_snapshot_version text)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  materialized_products jsonb;
  materialized_count integer;
  expected_count integer;
begin
  select release.public_product_count
  into expected_count
  from public.catalog_snapshot_releases release
  where release.snapshot_version = target_snapshot_version;

  if expected_count is null then
    raise exception 'Unknown catalog snapshot version %', target_snapshot_version;
  end if;

  select coalesce(jsonb_agg(snapshot.payload order by snapshot.sort_order), '[]'::jsonb)
  into materialized_products
  from public.catalog_product_snapshots snapshot
  join public.products product on product.legacy_id = snapshot.legacy_id
  join public.brands brand on brand.internal_id = product.brand_id
  join public.categories category on category.internal_id = product.primary_category_id
  where snapshot.snapshot_version = target_snapshot_version
    and product.publication_status = 'published'
    and brand.status = 'active'
    and category.status = 'active';

  materialized_count := jsonb_array_length(materialized_products);
  if materialized_count <> expected_count then
    raise exception 'Catalog snapshot count mismatch: expected %, got %', expected_count, materialized_count;
  end if;

  update public.catalog_snapshot_releases
  set products = materialized_products,
      ready = true,
      updated_at = now()
  where snapshot_version = target_snapshot_version;

  return materialized_count;
end;
$$;

revoke all on function public.finalize_catalog_snapshot(text) from public, anon, authenticated;
grant execute on function public.finalize_catalog_snapshot(text) to service_role;

create or replace function public.get_catalog_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', release.snapshot_version,
    'products', release.products,
    'categories', release.categories,
    'brands', release.brands,
    'attributeDefinitions', release.attribute_definitions
  )
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release
    on release.snapshot_version = pointer.snapshot_version
   and release.ready
  where pointer.singleton
$$;

revoke all on function public.get_catalog_snapshot() from public;
grant execute on function public.get_catalog_snapshot() to anon, authenticated;

commit;
