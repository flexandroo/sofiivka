-- Products Admin v1 performance correction.
-- Keep the immutable snapshot key stable, refresh one product/card at a time,
-- and expose a cheap admin revision through every scoped public RPC.
begin;
set local search_path = public, extensions;

create table public.catalog_admin_cache_revision (
  singleton boolean primary key default true check (singleton),
  base_snapshot_version text not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

insert into public.catalog_admin_cache_revision (singleton, base_snapshot_version)
select true, pointer.snapshot_version from public.catalog_snapshot_pointer pointer where pointer.singleton
on conflict (singleton) do nothing;

alter table public.catalog_admin_cache_revision enable row level security;
revoke all on table public.catalog_admin_cache_revision from public, anon, authenticated;

create or replace function public._admin_catalog_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when revision.base_snapshot_version <> pointer.snapshot_version then pointer.snapshot_version
    when revision.revision = 0 then revision.base_snapshot_version
    else revision.base_snapshot_version || ':admin:' || revision.revision::text
  end
  from public.catalog_snapshot_pointer pointer
  join public.catalog_admin_cache_revision revision on revision.singleton
  where pointer.singleton
$$;

revoke all on function public._admin_catalog_version() from public, anon, authenticated;

create or replace function public._admin_refresh_catalog(target_product_ids uuid[])
returns text
language plpgsql
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  active_version text;
  target_id uuid;
  current_payload jsonb;
  next_order integer;
  product_payload jsonb;
  all_count integer;
  public_count integer;
  id_hash text;
  version_value text;
begin
  select pointer.snapshot_version into active_version
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release on release.snapshot_version = pointer.snapshot_version and release.ready
  where pointer.singleton
  for update of pointer, release;

  if active_version is null then raise exception 'Active catalogue release not found'; end if;

  foreach target_id in array target_product_ids loop
    current_payload := null;
    next_order := null;
    select snapshot.payload, snapshot.sort_order into current_payload, next_order
    from public.catalog_product_snapshots snapshot
    where snapshot.snapshot_version = active_version and snapshot.legacy_id = (
      select product.legacy_id from public.products product where product.internal_id = target_id
    );

    if next_order is null then
      select coalesce(max(snapshot.sort_order), -1) + 1 into next_order
      from public.catalog_product_snapshots snapshot where snapshot.snapshot_version = active_version;
    end if;

    product_payload := public._admin_product_payload(target_id, coalesce(current_payload, '{}'::jsonb));
    if product_payload is null then raise exception 'Product not found while refreshing catalogue'; end if;

    insert into public.catalog_product_snapshots (snapshot_version, legacy_id, sort_order, payload, updated_at)
    select active_version, product.legacy_id, next_order, product_payload, now()
    from public.products product where product.internal_id = target_id
    on conflict (snapshot_version, legacy_id) do update
      set payload = excluded.payload, updated_at = excluded.updated_at;

    delete from public.catalog_product_cards card
    where card.snapshot_version = active_version and card.legacy_id = product_payload ->> 'id';

    insert into public.catalog_product_cards (
      snapshot_version, legacy_id, sort_order, brand_id, category_id, series_id,
      amount, price_status, inventory_status, normalized_attributes, search_text, card
    )
    select active_version, product.legacy_id, next_order, brand.stable_id, category.stable_id,
      series.stable_id, product.amount, product.price_status, product.inventory_status,
      coalesce(product_payload -> 'normalizedAttributes', '{}'::jsonb),
      concat_ws(' ', product.sku, product.title, product.short_title, product.model,
        brand.name, brand.stable_id, category.title, category.stable_id,
        series.name, series.stable_id, product_payload ->> 'normalizedAttributes'),
      public._catalog_card(product_payload, brand.name)
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id and brand.status = 'active'
    join public.categories category on category.internal_id = product.primary_category_id and category.status = 'active'
    left join public.product_series series on series.internal_id = product.series_id
    where product.internal_id = target_id and product.publication_status = 'published';
  end loop;

  select count(*)::integer,
    count(*) filter (where product.publication_status = 'published')::integer,
    encode(extensions.digest(coalesce(string_agg(product.legacy_id, E'\n' order by product.legacy_id), ''), 'sha256'), 'hex')
  into all_count, public_count, id_hash from public.products product;

  update public.catalog_snapshot_releases
  set product_count = all_count,
      public_product_count = public_count,
      product_id_hash = id_hash,
      updated_at = now()
  where snapshot_version = active_version;

  update public.catalog_admin_cache_revision
  set base_snapshot_version = active_version,
      revision = case when base_snapshot_version = active_version then revision + 1 else 1 end,
      updated_at = now()
  where singleton
  returning case when revision = 0 then base_snapshot_version
    else base_snapshot_version || ':admin:' || revision::text end into version_value;

  return version_value;
end;
$$;

revoke all on function public._admin_refresh_catalog(uuid[]) from public, anon, authenticated;

alter function public.get_catalog_version() rename to _catalog_version_v2;
alter function public.get_catalog_bootstrap() rename to _catalog_bootstrap_v2;
alter function public.get_catalog_products(text, text, text[], text[], text[], jsonb, numeric, numeric, text, integer, integer, text[], text)
  rename to _catalog_products_v2;
alter function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text)
  rename to _catalog_facets_v2;
alter function public.get_catalog_product(text) rename to _catalog_product_v2;
alter function public.search_catalog(text, integer, integer, integer, integer) rename to _catalog_search_v2;
alter function public.get_catalog_collection(text) rename to _catalog_collection_v2;
alter function public.get_catalog_snapshot() rename to _catalog_snapshot_v2;

revoke all on function public._catalog_version_v2() from public, anon, authenticated;
revoke all on function public._catalog_bootstrap_v2() from public, anon, authenticated;
revoke all on function public._catalog_products_v2(text, text, text[], text[], text[], jsonb, numeric, numeric, text, integer, integer, text[], text) from public, anon, authenticated;
revoke all on function public._catalog_facets_v2(text, text, text[], text[], text[], jsonb, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public._catalog_product_v2(text) from public, anon, authenticated;
revoke all on function public._catalog_search_v2(text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public._catalog_collection_v2(text) from public, anon, authenticated;
revoke all on function public._catalog_snapshot_v2() from public, anon, authenticated;

create or replace function public.get_catalog_version()
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '3s'
as $$
  select jsonb_build_object('version', public._admin_catalog_version(), 'updated_at', revision.updated_at)
  from public.catalog_admin_cache_revision revision where revision.singleton
$$;

create or replace function public.get_catalog_bootstrap()
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '8s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_bootstrap_v2() value) response
$$;

create or replace function public.get_catalog_products(
  scope_category text default null,
  scope_brand text default null,
  category_ids text[] default null,
  brand_ids text[] default null,
  availability_ids text[] default null,
  technical_filters jsonb default '{}'::jsonb,
  minimum_price numeric default null,
  maximum_price numeric default null,
  sort_mode text default 'default',
  page_number integer default 1,
  page_size integer default 24,
  product_ids text[] default null,
  query_text text default null
)
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '8s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_products_v2(scope_category, scope_brand, category_ids, brand_ids, availability_ids,
    technical_filters, minimum_price, maximum_price, sort_mode, page_number, page_size, product_ids, query_text) value) response
$$;

create or replace function public.get_catalog_facets(
  scope_category text default null,
  scope_brand text default null,
  category_ids text[] default null,
  brand_ids text[] default null,
  availability_ids text[] default null,
  technical_filters jsonb default '{}'::jsonb,
  minimum_price numeric default null,
  maximum_price numeric default null,
  query_text text default null
)
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '8s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_facets_v2(scope_category, scope_brand, category_ids, brand_ids, availability_ids,
    technical_filters, minimum_price, maximum_price, query_text) value) response
$$;

create or replace function public.get_catalog_product(legacy_id text)
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '5s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_product_v2(legacy_id) value) response
$$;

create or replace function public.search_catalog(
  query_text text,
  product_limit integer default 12,
  category_limit integer default 6,
  brand_limit integer default 6,
  series_limit integer default 6
)
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '5s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_search_v2(query_text, product_limit, category_limit, brand_limit, series_limit) value) response
$$;

create or replace function public.get_catalog_collection(collection_id text)
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '5s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_collection_v2(collection_id) value) response
$$;

-- The legacy full snapshot remains a rollback/debug surface. Normal catalogue
-- flows use the scoped RPCs above; its payload is refreshed by the canonical
-- publisher, while its version still participates in cache invalidation.
create or replace function public.get_catalog_snapshot()
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '8s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_snapshot_v2() value) response
$$;

revoke all on function public.get_catalog_version() from public;
revoke all on function public.get_catalog_bootstrap() from public;
revoke all on function public.get_catalog_products(text, text, text[], text[], text[], jsonb, numeric, numeric, text, integer, integer, text[], text) from public;
revoke all on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) from public;
revoke all on function public.get_catalog_product(text) from public;
revoke all on function public.search_catalog(text, integer, integer, integer, integer) from public;
revoke all on function public.get_catalog_collection(text) from public;
revoke all on function public.get_catalog_snapshot() from public;

grant execute on function public.get_catalog_version() to anon, authenticated;
grant execute on function public.get_catalog_bootstrap() to anon, authenticated;
grant execute on function public.get_catalog_products(text, text, text[], text[], text[], jsonb, numeric, numeric, text, integer, integer, text[], text) to anon, authenticated;
grant execute on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) to anon, authenticated;
grant execute on function public.get_catalog_product(text) to anon, authenticated;
grant execute on function public.search_catalog(text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_catalog_collection(text) to anon, authenticated;
grant execute on function public.get_catalog_snapshot() to anon, authenticated;

commit;
