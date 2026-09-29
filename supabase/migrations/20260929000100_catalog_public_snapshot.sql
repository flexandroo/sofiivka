-- Public canonical catalogue read model. This migration intentionally leaves the
-- normalized/private import tables behind RLS and exposes one whitelist-shaped RPC.
begin;
set local search_path = public, extensions;

create table public.catalog_snapshot_releases (
  snapshot_version text primary key check (length(btrim(snapshot_version)) > 0),
  contract_version text not null check (length(btrim(contract_version)) > 0),
  categories jsonb not null check (jsonb_typeof(categories) = 'array'),
  brands jsonb not null check (jsonb_typeof(brands) = 'array'),
  attribute_definitions jsonb not null check (jsonb_typeof(attribute_definitions) = 'object'),
  product_count integer not null check (product_count >= 0),
  public_product_count integer not null check (public_product_count between 0 and product_count),
  product_id_hash text not null check (length(product_id_hash) = 64),
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_product_snapshots (
  snapshot_version text not null references public.catalog_snapshot_releases(snapshot_version) on delete cascade,
  legacy_id text not null references public.products(legacy_id) on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snapshot_version, legacy_id),
  unique (snapshot_version, sort_order),
  check (payload ->> 'id' = legacy_id)
);

create table public.catalog_snapshot_pointer (
  singleton boolean primary key default true check (singleton),
  snapshot_version text not null references public.catalog_snapshot_releases(snapshot_version) on delete restrict,
  updated_at timestamptz not null default now()
);

create index catalog_product_snapshots_order_idx
  on public.catalog_product_snapshots (snapshot_version, sort_order);

alter table public.catalog_snapshot_releases enable row level security;
alter table public.catalog_product_snapshots enable row level security;
alter table public.catalog_snapshot_pointer enable row level security;

revoke all on table public.catalog_snapshot_releases from public, anon, authenticated;
revoke all on table public.catalog_product_snapshots from public, anon, authenticated;
revoke all on table public.catalog_snapshot_pointer from public, anon, authenticated;

create or replace function public.get_catalog_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', release.snapshot_version,
    'products', coalesce((
      select jsonb_agg(snapshot.payload order by snapshot.sort_order)
      from public.catalog_product_snapshots snapshot
      join public.products product on product.legacy_id = snapshot.legacy_id
      join public.brands brand on brand.internal_id = product.brand_id
      join public.categories category on category.internal_id = product.primary_category_id
      where snapshot.snapshot_version = release.snapshot_version
        and product.publication_status = 'published'
        and brand.status = 'active'
        and category.status = 'active'
    ), '[]'::jsonb),
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
