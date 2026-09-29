-- SOFIEVKA PRODUCTS ADMIN v1: preserve normalized relations during bulk edits.
-- Category changes never touch series. Brand changes with an incompatible
-- series must be resolved explicitly in the single-product editor.

begin;

create or replace function public.admin_bulk_products(
  target_legacy_ids text[],
  action_name text,
  action_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  affected integer;
  version_value text;
  audit_action text;
  changed text[];
begin
  if not public.can_manage_products() then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if coalesce(cardinality(target_legacy_ids), 0) = 0 or cardinality(target_legacy_ids) > 100 then raise exception 'Select 1 to 100 products'; end if;
  if action_name not in ('publish', 'hide', 'archive', 'category', 'brand') then raise exception 'Unsupported bulk action'; end if;
  perform 1 from public.products product
  where product.legacy_id = any(target_legacy_ids)
  order by product.legacy_id for update;
  select array_agg(product.internal_id order by product.legacy_id) into ids
  from public.products product where product.legacy_id = any(target_legacy_ids);
  if coalesce(cardinality(ids), 0) <> cardinality(target_legacy_ids) then raise exception 'One or more products were not found'; end if;

  if action_name in ('publish', 'hide', 'archive') then
    update public.products set
      publication_status = case action_name when 'publish' then 'published'::public.product_publication_status
        when 'hide' then 'hidden'::public.product_publication_status else 'archived'::public.product_publication_status end,
      archived_at = case when action_name = 'archive' then coalesce(archived_at, now()) else null end,
      updated_by = auth.uid(), updated_at = now()
    where internal_id = any(ids);
    audit_action := 'bulk_' || action_name;
    changed := array['publication'];
  elsif action_name = 'category' then
    if not exists (select 1 from public.categories where internal_id = action_value::uuid and status <> 'archived') then raise exception 'Category not found'; end if;
    update public.products set primary_category_id = action_value::uuid,
      updated_by = auth.uid(), updated_at = now() where internal_id = any(ids);
    audit_action := 'bulk_category'; changed := array['classification'];
  else
    if not exists (select 1 from public.brands where internal_id = action_value::uuid and status <> 'archived') then raise exception 'Brand not found'; end if;
    if exists (
      select 1 from public.products product
      join public.product_series series on series.internal_id = product.series_id
      where product.internal_id = any(ids) and series.brand_id <> action_value::uuid
    ) then
      raise exception 'Bulk brand change requires clearing or choosing series per product';
    end if;
    update public.products set brand_id = action_value::uuid,
      updated_by = auth.uid(), updated_at = now() where internal_id = any(ids);
    audit_action := 'bulk_brand'; changed := array['classification'];
  end if;
  get diagnostics affected = row_count;

  insert into public.product_admin_audit (product_id, legacy_id, actor_id, action, changed_sections, after_state)
  select product.internal_id, product.legacy_id, auth.uid(), audit_action, changed,
    jsonb_build_object('publicationStatus', product.publication_status, 'brandId', product.brand_id, 'categoryId', product.primary_category_id, 'seriesId', product.series_id)
  from public.products product where product.internal_id = any(ids);

  version_value := public._admin_refresh_catalog(ids);
  return jsonb_build_object('affected', affected, 'catalogVersion', version_value);
end;
$$;

revoke all on function public.admin_bulk_products(text[], text, text) from public, anon;
grant execute on function public.admin_bulk_products(text[], text, text) to authenticated;

commit;
