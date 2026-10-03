-- New products created in the admin get their address from the title, like every other product since
-- 20261002001900: /product/<_catalog_slugify(title)>. A taken slug gets the SKU appended, then the legacy id.
-- The function is otherwise the 20261002001700 definition unchanged.
begin;

create or replace function public.admin_create_product(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_value public.admin_role := public.current_admin_role();
  product_id uuid := gen_random_uuid();
  legacy_value text := 'manual_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  title_value text := btrim(payload ->> 'title');
  sku_value text := btrim(payload ->> 'sku');
  model_value text := btrim(coalesce(payload ->> 'model', payload ->> 'title'));
  brand_value uuid := (payload ->> 'brandId')::uuid;
  category_value uuid := (payload ->> 'categoryId')::uuid;
  version_value text;
  slug_value text;
begin
  if role_value is null or role_value not in ('owner', 'admin', 'manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if coalesce(title_value, '') = '' or coalesce(sku_value, '') = '' or coalesce(model_value, '') = '' then
    raise exception 'Title, SKU and model are required';
  end if;
  if not exists (select 1 from public.brands where internal_id = brand_value and status <> 'archived') then raise exception 'Brand not found'; end if;
  if not exists (select 1 from public.categories where internal_id = category_value and status <> 'archived') then raise exception 'Category not found'; end if;

  slug_value := public._catalog_slugify(title_value);
  if exists (select 1 from public.products where lower(slug) = slug_value) then
    slug_value := slug_value || '-' || public._catalog_slugify(sku_value);
  end if;
  if exists (select 1 from public.products where lower(slug) = slug_value) then
    slug_value := slug_value || '-' || replace(substr(legacy_value, 8), '_', '-');
  end if;

  insert into public.products (
    internal_id, legacy_id, sku, slug, title, short_title, model, brand_id,
    primary_category_id, publication_status, price_status, inventory_status,
    created_by, updated_by
  ) values (
    product_id, legacy_value, sku_value, slug_value,
    title_value, title_value, model_value, brand_value, category_value,
    'draft', 'unknown', 'unknown', auth.uid(), auth.uid()
  );

  insert into public.product_admin_audit (
    product_id, legacy_id, actor_id, action, changed_sections, after_state
  ) values (
    product_id, legacy_value, auth.uid(), 'create', array['core'],
    jsonb_build_object('legacyId', legacy_value, 'sku', sku_value, 'publicationStatus', 'draft')
  );

  version_value := public._admin_refresh_catalog(array[product_id]);
  return jsonb_build_object('legacyId', legacy_value, 'internalId', product_id, 'catalogVersion', version_value);
end;
$$;

revoke all on function public.admin_create_product(jsonb) from public, anon;
grant execute on function public.admin_create_product(jsonb) to authenticated;

commit;
