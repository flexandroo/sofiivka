-- TD Sofiivka Row Level Security v1
-- Apply after schema.sql. The idempotent core seed may run before or after this file.

begin;
set local search_path = public, extensions;

create or replace function public.current_admin_role()
returns public.admin_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.admin_profiles
  where user_id = auth.uid() and active
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid() and active
  )
$$;

create or replace function public.can_admin_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_admin_role() in ('owner', 'admin'), false)
$$;

create or replace function public.can_manage_products()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_admin_role() in ('owner', 'admin', 'manager'), false)
$$;

create or replace function public.can_manage_content()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_admin_role() in ('owner', 'admin', 'content_manager'), false)
$$;

create or replace function public.is_public_product(target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id
    join public.categories category on category.internal_id = product.primary_category_id
    where product.internal_id = target_product_id
      and product.publication_status = 'published'
      and brand.status = 'active'
      and brand.visibility <> 'hidden'
      and category.status = 'active'
      and category.visibility <> 'hidden'
  )
$$;

create or replace function public.is_public_collection(target_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_collections collection
    where collection.internal_id = target_collection_id
      and collection.active
      and (collection.date_from is null or collection.date_from <= now())
      and (collection.date_to is null or collection.date_to >= now())
  )
$$;

revoke all on function public.current_admin_role() from public;
revoke all on function public.is_active_admin() from public;
revoke all on function public.can_admin_catalog() from public;
revoke all on function public.can_manage_products() from public;
revoke all on function public.can_manage_content() from public;
revoke all on function public.is_public_product(uuid) from public;
revoke all on function public.is_public_collection(uuid) from public;
grant execute on function public.current_admin_role() to anon, authenticated;
grant execute on function public.is_active_admin() to anon, authenticated;
grant execute on function public.can_admin_catalog() to anon, authenticated;
grant execute on function public.can_manage_products() to anon, authenticated;
grant execute on function public.can_manage_content() to anon, authenticated;
grant execute on function public.is_public_product(uuid) to anon, authenticated;
grant execute on function public.is_public_collection(uuid) to anon, authenticated;

alter table public.admin_profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.import_runs enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.attribute_definitions enable row level security;
alter table public.category_attributes enable row level security;
alter table public.attribute_options enable row level security;
alter table public.product_series enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_media enable row level security;
alter table public.product_documents enable row level security;
alter table public.tags enable row level security;
alter table public.product_tags enable row level security;
alter table public.product_collections enable row level security;
alter table public.product_collection_items enable row level security;
alter table public.product_source_records enable row level security;
alter table public.product_source_attributes enable row level security;
alter table public.category_mapping_reviews enable row level security;

-- Public storefront reads. No raw payload, source attribute, import or admin table is public.
create policy brands_public_read on public.brands
for select using (status = 'active' and visibility <> 'hidden');

create policy categories_public_read on public.categories
for select using (status = 'active' and visibility <> 'hidden');

create policy attributes_public_read on public.attribute_definitions
for select using (status = 'active');

create policy category_attributes_public_read on public.category_attributes
for select using (
  exists (
    select 1 from public.categories category
    where category.internal_id = category_attributes.category_id
      and category.status = 'active'
      and category.visibility <> 'hidden'
  )
  and exists (
    select 1 from public.attribute_definitions attribute
    where attribute.internal_id = category_attributes.attribute_id and attribute.status = 'active'
  )
);

create policy attribute_options_public_read on public.attribute_options
for select using (
  active and exists (
    select 1 from public.attribute_definitions attribute
    where attribute.internal_id = attribute_options.attribute_id and attribute.status = 'active'
  )
);

create policy product_series_public_read on public.product_series
for select using (
  status = 'active' and exists (
    select 1 from public.brands brand
    where brand.internal_id = product_series.brand_id
      and brand.status = 'active'
      and brand.visibility <> 'hidden'
  )
);

create policy products_public_read on public.products
for select using (public.is_public_product(internal_id));

create policy product_categories_public_read on public.product_categories
for select using (
  public.is_public_product(product_id)
  and exists (
    select 1 from public.categories category
    where category.internal_id = category_id
      and category.status = 'active'
      and category.visibility <> 'hidden'
  )
);

create policy product_attributes_public_read on public.product_attribute_values
for select using (public.is_public_product(product_id));

create policy product_media_public_read on public.product_media
for select using (active and public.is_public_product(product_id));

create policy product_documents_public_read on public.product_documents
for select using (active and public.is_public_product(product_id));

create policy tags_public_read on public.tags
for select using (status = 'active');

create policy product_tags_public_read on public.product_tags
for select using (public.is_public_product(product_id));

create policy collections_public_read on public.product_collections
for select using (
  active
  and (date_from is null or date_from <= now())
  and (date_to is null or date_to >= now())
);

create policy collection_items_public_read on public.product_collection_items
for select using (
  public.is_public_collection(collection_id)
  and public.is_public_product(product_id)
);

-- Every active admin may read catalog/content tables. Public policies continue to apply to ordinary authenticated users.
do $admin_read_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'brands', 'categories', 'attribute_definitions',
    'category_attributes', 'attribute_options', 'product_series', 'products',
    'product_categories', 'product_attribute_values', 'product_media',
    'product_documents', 'tags', 'product_tags', 'product_collections',
    'product_collection_items'
  ] loop
    execute format(
      'create policy %I on public.%I for select using (public.is_active_admin())',
      table_name || '_admin_read', table_name
    );
  end loop;
end
$admin_read_policies$;

-- Supplier/import provenance is limited to commercial/catalog managers and higher roles.
do $import_read_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'suppliers', 'import_runs', 'product_source_records',
    'product_source_attributes', 'category_mapping_reviews'
  ] loop
    execute format(
      'create policy %I on public.%I for select using (public.can_manage_products())',
      table_name || '_import_read', table_name
    );
  end loop;
end
$import_read_policies$;

-- Owner/admin may perform unrestricted catalog and import mutations, still subject to table constraints.
do $catalog_admin_write_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'suppliers', 'import_runs', 'brands', 'categories', 'attribute_definitions',
    'category_attributes', 'attribute_options', 'product_series', 'products',
    'product_categories', 'product_attribute_values', 'product_media',
    'product_documents', 'tags', 'product_tags', 'product_collections',
    'product_collection_items', 'product_source_records',
    'product_source_attributes', 'category_mapping_reviews'
  ] loop
    execute format(
      'create policy %I on public.%I for all using (public.can_admin_catalog()) with check (public.can_admin_catalog())',
      table_name || '_catalog_admin_write', table_name
    );
  end loop;
end
$catalog_admin_write_policies$;

-- Manager scope: normalized specifications and mapping-review workflow.
create policy product_attributes_manager_write on public.product_attribute_values
for all using (public.can_manage_products()) with check (public.can_manage_products());

create policy source_attributes_manager_update on public.product_source_attributes
for update using (public.can_manage_products()) with check (public.can_manage_products());

create policy category_reviews_manager_write on public.category_mapping_reviews
for all using (public.can_manage_products()) with check (public.can_manage_products());

-- Content scope: media, documents, editorial tags, collections and their ordered items.
create policy product_media_content_write on public.product_media
for all using (public.can_manage_content()) with check (public.can_manage_content());

create policy product_documents_content_write on public.product_documents
for all using (public.can_manage_content()) with check (public.can_manage_content());

create policy tags_content_write on public.tags
for all using (public.can_manage_content()) with check (public.can_manage_content());

create policy product_tags_content_write on public.product_tags
for all using (public.can_manage_content()) with check (public.can_manage_content());

create policy collections_content_write on public.product_collections
for all using (public.can_manage_content()) with check (public.can_manage_content());

create policy collection_items_content_write on public.product_collection_items
for all using (public.can_manage_content()) with check (public.can_manage_content());

-- Admin profile policies. First owner must be bootstrapped with the service role or SQL console.
create policy admin_profiles_self_or_admin_read on public.admin_profiles
for select using (user_id = auth.uid() or public.can_admin_catalog());

create policy admin_profiles_owner_insert on public.admin_profiles
for insert with check (
  public.current_admin_role() = 'owner'
  or (public.current_admin_role() = 'admin' and role <> 'owner')
);

create policy admin_profiles_owner_update on public.admin_profiles
for update using (
  public.current_admin_role() = 'owner'
  or (public.current_admin_role() = 'admin' and role <> 'owner')
) with check (
  public.current_admin_role() = 'owner'
  or (public.current_admin_role() = 'admin' and role <> 'owner')
);

create policy admin_profiles_owner_delete on public.admin_profiles
for delete using (
  public.current_admin_role() = 'owner'
  or (public.current_admin_role() = 'admin' and role <> 'owner')
);

-- Column-scoped operations for non-admin roles. SECURITY DEFINER is used only after an explicit role check.
create or replace function public.update_product_commercial(
  target_product_id uuid,
  new_amount numeric,
  new_old_amount numeric,
  new_currency varchar,
  new_price_status public.product_price_status,
  new_inventory_status public.product_inventory_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_products() then
    raise exception 'Not authorized';
  end if;
  update public.products
  set amount = new_amount,
      old_amount = new_old_amount,
      currency = new_currency,
      price_status = new_price_status,
      inventory_status = new_inventory_status,
      updated_by = auth.uid()
  where internal_id = target_product_id;
  if not found then
    raise exception 'Product not found';
  end if;
end;
$$;

create or replace function public.update_product_content(
  target_product_id uuid,
  new_description text,
  new_short_description text,
  new_full_description text,
  new_description_sections jsonb,
  new_seo_title text,
  new_seo_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception 'Not authorized';
  end if;
  if new_description_sections is null or jsonb_typeof(new_description_sections) <> 'array' then
    raise exception 'description_sections must be a JSON array';
  end if;
  update public.products
  set description = coalesce(new_description, ''),
      short_description = coalesce(new_short_description, ''),
      full_description = coalesce(new_full_description, ''),
      description_sections = new_description_sections,
      seo_title = new_seo_title,
      seo_description = new_seo_description,
      updated_by = auth.uid()
  where internal_id = target_product_id;
  if not found then
    raise exception 'Product not found';
  end if;
end;
$$;

revoke all on function public.update_product_commercial(uuid, numeric, numeric, varchar, public.product_price_status, public.product_inventory_status) from public;
revoke all on function public.update_product_content(uuid, text, text, text, jsonb, text, text) from public;
grant execute on function public.update_product_commercial(uuid, numeric, numeric, varchar, public.product_price_status, public.product_inventory_status) to authenticated;
grant execute on function public.update_product_content(uuid, text, text, text, jsonb, text, text) to authenticated;

revoke all on table public.admin_profiles, public.suppliers, public.import_runs,
  public.brands, public.categories, public.attribute_definitions,
  public.category_attributes, public.attribute_options, public.product_series,
  public.products, public.product_categories, public.product_attribute_values,
  public.product_media, public.product_documents, public.tags, public.product_tags,
  public.product_collections, public.product_collection_items,
  public.product_source_records, public.product_source_attributes,
  public.category_mapping_reviews
from anon, authenticated;

grant select on public.brands, public.categories, public.attribute_definitions,
  public.category_attributes, public.attribute_options, public.product_series,
  public.products, public.product_categories, public.product_attribute_values,
  public.product_media, public.product_documents, public.tags, public.product_tags,
  public.product_collections, public.product_collection_items,
  public.effective_category_facets, public.public_products, public.catalog_products,
  public.product_search_view, public.product_facets_view
to anon, authenticated;

grant select on public.admin_profiles, public.suppliers, public.import_runs,
  public.product_source_records, public.product_source_attributes,
  public.category_mapping_reviews
to authenticated;

grant insert, update, delete on public.admin_profiles, public.suppliers,
  public.import_runs, public.brands, public.categories, public.attribute_definitions,
  public.category_attributes, public.attribute_options, public.product_series,
  public.products, public.product_categories, public.product_attribute_values,
  public.product_media, public.product_documents, public.tags, public.product_tags,
  public.product_collections, public.product_collection_items,
  public.product_source_records, public.product_source_attributes,
  public.category_mapping_reviews
to authenticated;

commit;
