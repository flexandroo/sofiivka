-- Read-only snapshot of what a product import is checked against (docs/product-import-standard.md).
-- Run on PROD (Supabase SQL Editor or connector), save the single JSON value as imports/reference-prod.json.
with leaf as (
  select c.stable_id, c.title, c.status::text status, c.visibility::text visibility,
    not exists (select 1 from public.categories child where child.parent_id = c.internal_id and child.status = 'active') is_leaf,
    coalesce((select array_agg(d.stable_id order by d.stable_id)
      from public.category_attributes ca join public.attribute_definitions d on d.internal_id = ca.attribute_id
      where ca.category_id = c.internal_id and d.status = 'active'), '{}') facets
  from public.categories c
), attrs as (
  select d.stable_id, d.value_type::text type, d.unit, d.label,
    (select array_agg(distinct v order by v) from (
      select o.value v from public.attribute_options o where o.attribute_id = d.internal_id and o.active
      union select pav.value_text from public.product_attribute_values pav where pav.attribute_id = d.internal_id and pav.value_text is not null
    ) values_) known_values
  from public.attribute_definitions d where d.status = 'active'
)
select jsonb_build_object(
  'source', 'prod',
  'exportedAt', now(),
  'brands', (select jsonb_agg(jsonb_build_object('id', stable_id, 'name', name, 'status', status) order by stable_id) from public.brands),
  'suppliers', (select jsonb_agg(stable_id order by stable_id) from public.suppliers),
  'categories', (select jsonb_agg(jsonb_build_object('id', stable_id, 'title', title, 'status', status,
    'visibility', visibility, 'leaf', is_leaf, 'facets', to_jsonb(facets)) order by stable_id) from leaf),
  'attributes', (select jsonb_object_agg(stable_id, jsonb_build_object('type', type, 'unit', unit, 'label', label,
    'values', to_jsonb(coalesce(known_values, '{}')))) from attrs),
  'products', (select jsonb_agg(jsonb_build_object(
      'id', p.legacy_id, 'sku', p.sku, 'title', p.title, 'status', p.publication_status,
      'brand', b.stable_id, 'category', c.stable_id, 'amount', p.amount,
      'sources', (select coalesce(jsonb_agg(s.stable_id || ':' || r.source_id), '[]'::jsonb)
        from public.product_source_records r join public.suppliers s on s.internal_id = r.supplier_id
        where r.product_id = p.internal_id)
    ) order by p.legacy_id)
    from public.products p
    join public.brands b on b.internal_id = p.brand_id
    join public.categories c on c.internal_id = p.primary_category_id)
) reference;
