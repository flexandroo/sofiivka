-- The canonical v1 response is intentionally large (~45 MB uncompressed).
-- Extend timeout only for this read-only function; all other anon statements keep
-- the project defaults. Phase 2 will replace this full snapshot with scoped APIs.
begin;
set local search_path = public, extensions;

create or replace function public.get_catalog_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '60s'
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
