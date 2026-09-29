-- TD Sofiivka catalog schema v1
-- PostgreSQL 15+ / Supabase. This file defines structure only; it does not import products.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
set local search_path = public, extensions;

create type public.product_price_status as enum ('known', 'on_request', 'unknown');
create type public.product_inventory_status as enum ('in_stock', 'out_of_stock', 'preorder', 'discontinued', 'unknown');
create type public.product_publication_status as enum ('published', 'draft', 'hidden', 'archived');
create type public.attribute_value_type as enum ('number', 'string', 'boolean', 'select');
create type public.record_status as enum ('active', 'inactive', 'review', 'archived');
create type public.brand_visibility as enum ('catalog', 'service', 'hidden');
create type public.category_status as enum ('active', 'future', 'internal', 'archived');
create type public.category_visibility as enum ('catalog', 'landing', 'service', 'hidden');
create type public.collection_type as enum ('manual', 'promotion', 'featured');
create type public.media_type as enum ('image', 'diagram', 'video');
create type public.media_role as enum ('primary', 'gallery', 'dimension', 'other');
create type public.document_type as enum ('manual', 'datasheet', 'certificate', 'instruction', 'other');
create type public.import_run_status as enum ('pending', 'running', 'succeeded', 'partial', 'failed');
create type public.mapping_status as enum ('mapped', 'classifier', 'review', 'unmapped', 'ignored', 'rejected');
create type public.mapping_review_status as enum ('review', 'accepted', 'rejected', 'deferred');
create type public.admin_role as enum ('owner', 'admin', 'manager', 'content_manager');
create type public.tag_origin as enum ('editorial', 'supplier', 'migration');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_identifier_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if to_jsonb(old) ->> tg_argv[0] is distinct from to_jsonb(new) ->> tg_argv[0] then
    raise exception '% is immutable on %.%', tg_argv[0], tg_table_schema, tg_table_name;
  end if;
  return new;
end;
$$;

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  role public.admin_role not null default 'content_manager',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.prevent_last_active_owner_loss()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  loses_active_owner boolean;
begin
  if old.role <> 'owner' or not old.active then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  loses_active_owner := tg_op = 'DELETE';
  if tg_op = 'UPDATE' then
    loses_active_owner := new.role <> 'owner' or not new.active;
  end if;

  if loses_active_owner then
    perform pg_advisory_xact_lock(hashtext('public.admin_profiles.active_owner'));
    if not exists (
      select 1
      from public.admin_profiles
      where user_id <> old.user_id
        and role = 'owner'
        and active
    ) then
      raise exception using
        errcode = '23514',
        message = 'At least one active owner must remain';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger admin_profiles_preserve_active_owner
before update of role, active or delete on public.admin_profiles
for each row execute function public.prevent_last_active_owner_loss();

create table public.suppliers (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  website_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.import_runs (
  internal_id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(internal_id) on delete restrict,
  status public.import_run_status not null default 'pending',
  source_ref text,
  started_at timestamptz,
  finished_at timestamptz,
  records_seen integer not null default 0 check (records_seen >= 0),
  records_succeeded integer not null default 0 check (records_succeeded >= 0),
  records_failed integer not null default 0 check (records_failed >= 0),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create table public.brands (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  name text not null check (length(btrim(name)) > 0),
  aliases text[] not null default '{}',
  logo_url text,
  website_url text,
  description text not null default '',
  country text,
  visibility public.brand_visibility not null default 'catalog',
  featured boolean not null default false,
  featured_order integer check (featured_order is null or featured_order >= 0),
  seo_title text,
  seo_description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (featured or featured_order is null)
);

create table public.categories (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  slug text not null check (length(btrim(slug)) > 0),
  parent_id uuid references public.categories(internal_id) on delete restrict,
  level smallint not null check (level >= 1),
  title text not null check (length(btrim(title)) > 0),
  short_title text,
  description text not null default '',
  menu_description text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  status public.category_status not null default 'active',
  visibility public.category_visibility not null default 'catalog',
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (parent_id is null or parent_id <> internal_id)
);

create unique index categories_root_slug_uidx
  on public.categories (slug)
  where parent_id is null;
create unique index categories_sibling_slug_uidx
  on public.categories (parent_id, slug)
  where parent_id is not null;

create or replace function public.validate_category_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_level smallint;
begin
  if new.parent_id is null then
    if new.level <> 1 then
      raise exception 'Root category % must have level 1', new.stable_id;
    end if;
  else
    select level into parent_level from public.categories where internal_id = new.parent_id;
    if parent_level is null then
      raise exception 'Parent category does not exist for %', new.stable_id;
    end if;
    if new.level <> parent_level + 1 then
      raise exception 'Category % must have parent level + 1', new.stable_id;
    end if;
    if exists (
      with recursive ancestors as (
        select internal_id, parent_id from public.categories where internal_id = new.parent_id
        union all
        select category.internal_id, category.parent_id
        from public.categories category
        join ancestors on category.internal_id = ancestors.parent_id
      )
      select 1 from ancestors where internal_id = new.internal_id
    ) then
      raise exception 'Category hierarchy cycle detected for %', new.stable_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_validate_hierarchy
before insert or update of parent_id, level on public.categories
for each row execute function public.validate_category_hierarchy();

create table public.attribute_definitions (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  label text not null check (length(btrim(label)) > 0),
  value_type public.attribute_value_type not null,
  unit text,
  filterable boolean not null default true,
  sortable boolean not null default false,
  sort_order numeric(8, 2) not null default 100,
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases) = 'array'),
  normalization_config jsonb not null default '{}'::jsonb check (jsonb_typeof(normalization_config) = 'object'),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.category_attributes (
  category_id uuid not null references public.categories(internal_id) on delete cascade,
  attribute_id uuid not null references public.attribute_definitions(internal_id) on delete restrict,
  facet_enabled boolean not null default false,
  required boolean not null default false,
  sort_order integer not null default 0,
  display_group text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (category_id, attribute_id)
);

create or replace function public.validate_category_attribute()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facet_enabled and not exists (
    select 1 from public.attribute_definitions
    where internal_id = new.attribute_id and filterable and status = 'active'
  ) then
    raise exception 'A category cannot enable a globally non-filterable attribute as a facet';
  end if;
  return new;
end;
$$;

create trigger category_attributes_validate
before insert or update of attribute_id, facet_enabled on public.category_attributes
for each row execute function public.validate_category_attribute();

create or replace function public.disable_invalid_category_facets()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.filterable or new.status <> 'active' then
    update public.category_attributes
    set facet_enabled = false, updated_at = now()
    where attribute_id = new.internal_id and facet_enabled;
  end if;
  return new;
end;
$$;

create trigger attribute_definitions_disable_facets
after update of filterable, status on public.attribute_definitions
for each row execute function public.disable_invalid_category_facets();

create table public.attribute_options (
  internal_id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.attribute_definitions(internal_id) on delete cascade,
  value text not null check (length(btrim(value)) > 0),
  label text not null check (length(btrim(label)) > 0),
  code text,
  slug text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (attribute_id, value),
  unique (internal_id, attribute_id)
);

create unique index attribute_options_code_uidx
  on public.attribute_options (attribute_id, code)
  where code is not null;
create unique index attribute_options_slug_uidx
  on public.attribute_options (attribute_id, slug)
  where slug is not null;

create table public.product_series (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  brand_id uuid not null references public.brands(internal_id) on delete restrict,
  slug text not null check (length(btrim(slug)) > 0),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  seo_title text,
  seo_description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (brand_id, slug)
);

create table public.products (
  internal_id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique check (length(btrim(legacy_id)) > 0 and legacy_id = btrim(legacy_id)),
  sku text not null check (length(btrim(sku)) > 0 and sku = btrim(sku)),
  slug text not null check (length(btrim(slug)) > 0 and slug = btrim(slug)),
  title text not null check (length(btrim(title)) > 0),
  short_title text not null check (length(btrim(short_title)) > 0),
  model text not null check (length(btrim(model)) > 0),
  brand_id uuid not null references public.brands(internal_id) on delete restrict,
  primary_category_id uuid not null references public.categories(internal_id) on delete restrict,
  series_id uuid references public.product_series(internal_id) on delete restrict,
  amount numeric(14, 2),
  old_amount numeric(14, 2),
  currency varchar(3) not null default 'UAH' check (currency = upper(currency)),
  price_status public.product_price_status not null default 'unknown',
  inventory_status public.product_inventory_status not null default 'unknown',
  publication_status public.product_publication_status not null default 'draft',
  description text not null default '',
  short_description text not null default '',
  full_description text not null default '',
  description_sections jsonb not null default '[]'::jsonb check (jsonb_typeof(description_sections) = 'array'),
  badges text[] not null default '{}',
  seo_title text,
  seo_description text,
  archived_at timestamptz,
  last_import_run_id uuid references public.import_runs(internal_id) on delete set null,
  last_imported_at timestamptz,
  last_verified_at timestamptz,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(short_title, '') || ' ' || coalesce(model, '') || ' ' || coalesce(sku, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (
    (price_status = 'known' and amount is not null and amount > 0)
    or (price_status in ('unknown', 'on_request') and amount is null)
  ),
  check (old_amount is null or (amount is not null and old_amount > amount)),
  check (
    (publication_status = 'archived' and archived_at is not null)
    or publication_status <> 'archived'
  )
);

create unique index products_sku_normalized_uidx on public.products (lower(sku));
create unique index products_slug_normalized_uidx on public.products (lower(slug));

create table public.product_categories (
  product_id uuid not null references public.products(internal_id) on delete cascade,
  category_id uuid not null references public.categories(internal_id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (product_id, category_id)
);

create or replace function public.prevent_primary_category_duplication()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.products
    where internal_id = new.product_id and primary_category_id = new.category_id
  ) then
    raise exception 'product_categories stores secondary categories only';
  end if;
  return new;
end;
$$;

create trigger product_categories_secondary_only
before insert or update on public.product_categories
for each row execute function public.prevent_primary_category_duplication();

create table public.product_attribute_values (
  product_id uuid not null references public.products(internal_id) on delete cascade,
  attribute_id uuid not null references public.attribute_definitions(internal_id) on delete restrict,
  value_number numeric,
  value_text text,
  value_boolean boolean,
  option_id uuid,
  source_label text,
  source_value jsonb,
  provenance text not null default 'canonical',
  normalization_rule text,
  source_unit text,
  unit_override text,
  unit_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (product_id, attribute_id),
  foreign key (option_id, attribute_id)
    references public.attribute_options(internal_id, attribute_id) on delete restrict,
  check (num_nonnulls(value_number, value_text, value_boolean, option_id) = 1)
);

create or replace function public.validate_product_attribute_value()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_type public.attribute_value_type;
begin
  select value_type into expected_type
  from public.attribute_definitions
  where internal_id = new.attribute_id;

  if expected_type = 'number' and new.value_number is null then
    raise exception 'Number attribute requires value_number';
  elsif expected_type = 'string' and new.value_text is null then
    raise exception 'String attribute requires value_text';
  elsif expected_type = 'boolean' and new.value_boolean is null then
    raise exception 'Boolean attribute requires value_boolean';
  elsif expected_type = 'select' and new.option_id is null and new.value_text is null then
    raise exception 'Select attribute requires option_id or an unoptioned canonical value_text';
  elsif expected_type <> 'select' and new.option_id is not null then
    raise exception 'Only select attributes may reference attribute_options';
  end if;
  return new;
end;
$$;

create trigger product_attribute_values_validate_type
before insert or update on public.product_attribute_values
for each row execute function public.validate_product_attribute_value();

create table public.product_media (
  internal_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(internal_id) on delete cascade,
  media_type public.media_type not null default 'image',
  role public.media_role not null default 'gallery',
  url text not null check (length(btrim(url)) > 0),
  storage_path text,
  source_url text,
  alt_text text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create unique index product_media_one_primary_uidx
  on public.product_media (product_id)
  where role = 'primary' and active;

create table public.product_documents (
  internal_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(internal_id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  document_type public.document_type not null default 'other',
  url text not null check (length(btrim(url)) > 0),
  storage_path text,
  source_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.tags (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  name text not null check (length(btrim(name)) > 0),
  origin public.tag_origin not null default 'editorial',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.product_tags (
  product_id uuid not null references public.products(internal_id) on delete cascade,
  tag_id uuid not null references public.tags(internal_id) on delete restrict,
  provenance text not null default 'editorial',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (product_id, tag_id)
);

create table public.product_collections (
  internal_id uuid primary key default gen_random_uuid(),
  stable_id text not null unique check (length(btrim(stable_id)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  collection_type public.collection_type not null,
  active boolean not null default true,
  date_from timestamptz,
  date_to timestamptz,
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (date_to is null or date_from is null or date_to >= date_from)
);

create table public.product_collection_items (
  collection_id uuid not null references public.product_collections(internal_id) on delete cascade,
  product_id uuid not null references public.products(internal_id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (collection_id, product_id)
);

create table public.product_source_records (
  internal_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(internal_id) on delete restrict,
  supplier_id uuid not null references public.suppliers(internal_id) on delete restrict,
  source_id text not null check (length(btrim(source_id)) > 0),
  source_category text,
  source_url text,
  mapping_status public.mapping_status not null default 'unmapped',
  raw_payload jsonb not null default '{}'::jsonb,
  payload_checksum text,
  import_run_id uuid references public.import_runs(internal_id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  verified_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (supplier_id, source_id),
  check (last_seen_at >= first_seen_at)
);

create table public.product_source_attributes (
  internal_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(internal_id) on delete cascade,
  source_record_id uuid not null references public.product_source_records(internal_id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  label text not null check (length(btrim(label)) > 0),
  source_value jsonb not null,
  normalized_attribute_id uuid references public.attribute_definitions(internal_id) on delete set null,
  mapping_status public.mapping_status not null default 'unmapped',
  mapping_notes text,
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  mapped_at timestamptz,
  mapped_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_record_id, ordinal),
  check (
    (mapping_status in ('mapped', 'classifier', 'review') and normalized_attribute_id is not null)
    or (mapping_status in ('unmapped', 'ignored', 'rejected'))
  )
);

create or replace function public.validate_source_attribute_product()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.product_source_records
    where internal_id = new.source_record_id and product_id = new.product_id
  ) then
    raise exception 'Source attribute product must match its source record';
  end if;
  return new;
end;
$$;

create trigger product_source_attributes_validate_product
before insert or update of product_id, source_record_id on public.product_source_attributes
for each row execute function public.validate_source_attribute_product();

create table public.category_mapping_reviews (
  internal_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(internal_id) on delete restrict,
  source_record_id uuid references public.product_source_records(internal_id) on delete set null,
  current_category_id uuid not null references public.categories(internal_id) on delete restrict,
  suggested_category_id uuid references public.categories(internal_id) on delete restrict,
  source_category text,
  reason text not null default '',
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  status public.mapping_review_status not null default 'review',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (
    (status = 'review' and resolved_at is null)
    or status <> 'review'
  )
);

-- Immutable application/public identifiers.
create trigger suppliers_stable_id_immutable before update on public.suppliers
for each row execute function public.prevent_identifier_change('stable_id');
create trigger brands_stable_id_immutable before update on public.brands
for each row execute function public.prevent_identifier_change('stable_id');
create trigger categories_stable_id_immutable before update on public.categories
for each row execute function public.prevent_identifier_change('stable_id');
create trigger attributes_stable_id_immutable before update on public.attribute_definitions
for each row execute function public.prevent_identifier_change('stable_id');
create trigger series_stable_id_immutable before update on public.product_series
for each row execute function public.prevent_identifier_change('stable_id');
create trigger products_legacy_id_immutable before update on public.products
for each row execute function public.prevent_identifier_change('legacy_id');
create trigger tags_stable_id_immutable before update on public.tags
for each row execute function public.prevent_identifier_change('stable_id');
create trigger collections_stable_id_immutable before update on public.product_collections
for each row execute function public.prevent_identifier_change('stable_id');

-- Consistent updated_at handling for mutable records.
create trigger admin_profiles_updated_at before update on public.admin_profiles
for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create trigger brands_updated_at before update on public.brands
for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger attribute_definitions_updated_at before update on public.attribute_definitions
for each row execute function public.set_updated_at();
create trigger category_attributes_updated_at before update on public.category_attributes
for each row execute function public.set_updated_at();
create trigger attribute_options_updated_at before update on public.attribute_options
for each row execute function public.set_updated_at();
create trigger product_series_updated_at before update on public.product_series
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_attribute_values_updated_at before update on public.product_attribute_values
for each row execute function public.set_updated_at();
create trigger product_media_updated_at before update on public.product_media
for each row execute function public.set_updated_at();
create trigger product_documents_updated_at before update on public.product_documents
for each row execute function public.set_updated_at();
create trigger tags_updated_at before update on public.tags
for each row execute function public.set_updated_at();
create trigger product_collections_updated_at before update on public.product_collections
for each row execute function public.set_updated_at();
create trigger product_source_records_updated_at before update on public.product_source_records
for each row execute function public.set_updated_at();
create trigger product_source_attributes_updated_at before update on public.product_source_attributes
for each row execute function public.set_updated_at();
create trigger category_mapping_reviews_updated_at before update on public.category_mapping_reviews
for each row execute function public.set_updated_at();

-- Purposeful query indexes.
create index import_runs_supplier_started_idx on public.import_runs (supplier_id, started_at desc);
create index brands_public_idx on public.brands (status, visibility, featured_order);
create index categories_parent_order_idx on public.categories (parent_id, sort_order, title);
create index categories_public_idx on public.categories (status, visibility);
create index category_attributes_facets_idx on public.category_attributes (category_id, sort_order) where facet_enabled;
create index attribute_definitions_facets_idx on public.attribute_definitions (filterable, sort_order) where status = 'active';
create index product_series_brand_idx on public.product_series (brand_id, status, name);
create index products_brand_idx on public.products (brand_id);
create index products_primary_category_idx on public.products (primary_category_id);
create index products_series_idx on public.products (series_id) where series_id is not null;
create index products_publication_idx on public.products (publication_status, updated_at desc);
create index products_category_publication_idx on public.products (primary_category_id, publication_status, updated_at desc);
create index products_brand_publication_idx on public.products (brand_id, publication_status, updated_at desc);
create index products_inventory_idx on public.products (inventory_status);
create index products_price_idx on public.products (amount) where price_status = 'known';
create index products_price_status_idx on public.products (price_status);
create index products_search_document_idx on public.products using gin (search_document);
create index products_title_trgm_idx on public.products using gin (title gin_trgm_ops);
create index products_model_trgm_idx on public.products using gin (model gin_trgm_ops);
create index product_categories_category_idx on public.product_categories (category_id, product_id);
create index product_attribute_number_idx on public.product_attribute_values (attribute_id, value_number) where value_number is not null;
create index product_attribute_text_idx on public.product_attribute_values (attribute_id, value_text) where value_text is not null;
create index product_attribute_boolean_idx on public.product_attribute_values (attribute_id, value_boolean) where value_boolean is not null;
create index product_attribute_option_idx on public.product_attribute_values (attribute_id, option_id) where option_id is not null;
create index product_media_product_order_idx on public.product_media (product_id, active, sort_order);
create index product_documents_product_order_idx on public.product_documents (product_id, active, sort_order);
create index product_tags_tag_idx on public.product_tags (tag_id, product_id);
create index product_collections_active_idx on public.product_collections (active, collection_type, sort_order);
create index product_collection_items_product_idx on public.product_collection_items (product_id, collection_id);
create index product_source_records_product_idx on public.product_source_records (product_id, active);
create index product_source_records_import_idx on public.product_source_records (import_run_id) where import_run_id is not null;
create index product_source_records_mapping_idx on public.product_source_records (mapping_status, supplier_id);
create index product_source_attributes_product_idx on public.product_source_attributes (product_id, mapping_status);
create index product_source_attributes_target_idx on public.product_source_attributes (normalized_attribute_id) where normalized_attribute_id is not null;
create index product_source_attributes_label_trgm_idx on public.product_source_attributes using gin (label gin_trgm_ops);
create index category_mapping_reviews_queue_idx on public.category_mapping_reviews (status, confidence desc, created_at);
create index admin_profiles_role_idx on public.admin_profiles (role, active);

create or replace view public.effective_category_facets
with (security_invoker = true)
as
select
  category.stable_id as category_id,
  attribute.stable_id as attribute_id,
  attribute.label,
  attribute.value_type,
  attribute.unit,
  relation.required,
  relation.sort_order,
  relation.display_group
from public.category_attributes relation
join public.categories category on category.internal_id = relation.category_id
join public.attribute_definitions attribute on attribute.internal_id = relation.attribute_id
where relation.facet_enabled
  and attribute.filterable
  and attribute.status = 'active';

create or replace view public.public_products
with (security_invoker = true)
as
select
  product.internal_id,
  product.legacy_id as id,
  product.sku,
  product.slug,
  product.title,
  product.short_title,
  product.model,
  brand.stable_id as brand_id,
  category.stable_id as primary_category_id,
  series.stable_id as series_id,
  product.amount,
  product.old_amount,
  product.currency,
  product.price_status,
  product.inventory_status,
  product.publication_status,
  product.description,
  product.short_description,
  product.full_description,
  product.description_sections,
  product.badges,
  product.seo_title,
  product.seo_description,
  product.updated_at
from public.products product
join public.brands brand on brand.internal_id = product.brand_id
join public.categories category on category.internal_id = product.primary_category_id
left join public.product_series series on series.internal_id = product.series_id
where product.publication_status = 'published';

create or replace view public.catalog_products
with (security_invoker = true)
as
select product.*
from public.public_products product
join public.brands brand on brand.stable_id = product.brand_id
join public.categories category on category.stable_id = product.primary_category_id
where brand.status = 'active'
  and brand.visibility = 'catalog'
  and category.status = 'active'
  and category.visibility = 'catalog';

create or replace view public.product_search_view
with (security_invoker = true)
as
select
  product.internal_id,
  product.legacy_id,
  product.sku,
  product.slug,
  product.title,
  product.model,
  brand.name as brand_name,
  category.title as category_title,
  product.publication_status,
  product.search_document
from public.products product
join public.brands brand on brand.internal_id = product.brand_id
join public.categories category on category.internal_id = product.primary_category_id;

create or replace view public.product_facets_view
with (security_invoker = true)
as
select
  value.product_id,
  product.legacy_id,
  definition.stable_id as attribute_id,
  definition.value_type,
  value.value_number,
  value.value_text,
  value.value_boolean,
  option.value as option_value,
  option.label as option_label
from public.product_attribute_values value
join public.products product on product.internal_id = value.product_id
join public.attribute_definitions definition on definition.internal_id = value.attribute_id
left join public.attribute_options option on option.internal_id = value.option_id
where product.publication_status = 'published'
  and definition.status = 'active';

commit;
