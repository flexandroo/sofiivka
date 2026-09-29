-- SOFIEVKA PRODUCTS ADMIN v1: category-scoped attribute metadata.
-- Keeps the editor lightweight and exposes only canonical configuration,
-- never supplier raw payloads or mutable facet configuration.

begin;

create or replace function public.admin_product_reference_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_active_admin() then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  with recursive category_paths as (
    select category.internal_id, category.stable_id, category.parent_id, category.level,
      category.title, category.title::text path, category.status, category.visibility, category.sort_order
    from public.categories category where category.parent_id is null
    union all
    select child.internal_id, child.stable_id, child.parent_id, child.level,
      child.title, parent.path || ' / ' || child.title, child.status, child.visibility, child.sort_order
    from public.categories child join category_paths parent on parent.internal_id = child.parent_id
  )
  select jsonb_build_object(
    'role', public.current_admin_role(),
    'capabilities', jsonb_build_object(
      'manageCore', public.can_manage_products(),
      'manageContent', public.can_manage_content(),
      'manageEverything', public.can_admin_catalog()
    ),
    'brands', coalesce((select jsonb_agg(jsonb_build_object(
      'id', brand.internal_id, 'stableId', brand.stable_id, 'name', brand.name, 'status', brand.status
    ) order by brand.name) from public.brands brand where brand.status <> 'archived'), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', category.internal_id, 'stableId', category.stable_id, 'parentId', category.parent_id,
      'level', category.level, 'title', category.title, 'path', category.path,
      'status', category.status, 'visibility', category.visibility
    ) order by category.path) from category_paths category where category.status <> 'archived'), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
      'id', series.internal_id, 'stableId', series.stable_id, 'brandId', series.brand_id, 'name', series.name
    ) order by series.name) from public.product_series series where series.status = 'active'), '[]'::jsonb),
    'attributes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', definition.internal_id, 'stableId', definition.stable_id, 'label', definition.label,
      'valueType', definition.value_type, 'unit', definition.unit, 'filterable', definition.filterable,
      'sortOrder', definition.sort_order,
      'options', coalesce((select jsonb_agg(jsonb_build_object(
        'id', option.internal_id, 'value', option.value, 'label', option.label
      ) order by option.sort_order, option.label) from public.attribute_options option
        where option.attribute_id = definition.internal_id and option.active), '[]'::jsonb)
    ) order by definition.sort_order, definition.label) from public.attribute_definitions definition
      where definition.status = 'active'), '[]'::jsonb),
    'categoryAttributes', coalesce((select jsonb_agg(jsonb_build_object(
      'categoryId', relation.category_id, 'attributeId', relation.attribute_id,
      'facetEnabled', relation.facet_enabled, 'required', relation.required,
      'displayGroup', relation.display_group, 'sortOrder', relation.sort_order
    ) order by relation.category_id, relation.sort_order, relation.attribute_id)
      from public.category_attributes relation), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_product_reference_data() from public, anon;
grant execute on function public.admin_product_reference_data() to authenticated;

commit;
