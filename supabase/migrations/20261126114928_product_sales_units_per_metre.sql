-- A sale unit is independent of pipe/pack dimensions. Existing goods and order
-- history remain piece-based; confirmed metre-priced IDs are changed separately.
begin;

alter table public.products add column sale_unit text not null default 'piece'
  check (sale_unit in ('piece', 'm'));
alter table public.crm_order_items add column sale_unit text not null default 'piece'
  check (sale_unit in ('piece', 'm'));

-- Preserve the currently deployed payload implementation (including source and
-- related-product wrappers), and enrich only pricing.unit from canonical data.
alter function public._admin_product_payload(uuid, jsonb) rename to _admin_product_payload_without_sale_unit;
create function public._admin_product_payload(target_product_id uuid, existing_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with v as materialized (
    select public._admin_product_payload_without_sale_unit(target_product_id, existing_payload) payload
  )
  select case when v.payload is null then null else
    jsonb_set(v.payload, '{pricing}', coalesce(v.payload->'pricing', '{}'::jsonb)
      || jsonb_build_object('unit', p.sale_unit), true) end
  from public.products p
  cross join v
  where p.internal_id = target_product_id
$$;
revoke all on function public._admin_product_payload_without_sale_unit(uuid,jsonb) from public, anon, authenticated;
revoke all on function public._admin_product_payload(uuid,jsonb) from public, anon, authenticated;

-- Patch only known, unique anchors in the current functions. This retains live
-- promo/account/authorization behavior, function grants, timeouts and signatures.
-- A changed upstream shape aborts the entire migration rather than partly wiring
-- units or overwriting an unknown function body.
create function pg_temp._sales_unit_patch(target regprocedure, old_text text, new_text text, expected_matches integer default 1)
returns void language plpgsql as $$
declare definition text := pg_get_functiondef(target); matches integer;
begin
  matches := (length(definition)-length(replace(definition,old_text,'')))/length(old_text);
  if matches <> expected_matches then
    raise exception 'Sales-unit migration: expected % anchors in %, found %', expected_matches, target, matches;
  end if;
  execute replace(definition,old_text,new_text);
end
$$;

-- Staff resolver: existing line snapshots survive later catalogue-unit changes.
-- Client saleUnit/unit fields are never read. New catalogue lines use products;
-- free-text lines keep the backwards-compatible piece unit.
select pg_temp._sales_unit_patch('public._crm_resolve_order_lines(uuid,jsonb)',
  '''sku'', existing.sku, ''title'', existing.title, ''brand_name'', existing.brand_name,',
  '''sku'', existing.sku, ''title'', existing.title, ''brand_name'', existing.brand_name, ''sale_unit'', existing.sale_unit,');
select pg_temp._sales_unit_patch('public._crm_resolve_order_lines(uuid,jsonb)',
  'item.title, item.amount, item.price_status,', 'item.title, item.amount, item.price_status, item.sale_unit,');
select pg_temp._sales_unit_patch('public._crm_resolve_order_lines(uuid,jsonb)',
  '''sku'', product.sku, ''title'', product.title, ''brand_name'', product.brand_name,',
  '''sku'', product.sku, ''title'', product.title, ''brand_name'', product.brand_name, ''sale_unit'', product.sale_unit,');
select pg_temp._sales_unit_patch('public._crm_resolve_order_lines(uuid,jsonb)',
  '''price_source'', ''manager''', '''price_source'', ''manager'', ''sale_unit'', ''piece''');
select pg_temp._sales_unit_patch('public._crm_order_lines_json(uuid)',
  '''price_source'', item.price_source', '''price_source'', item.price_source, ''sale_unit'', item.sale_unit');
select pg_temp._sales_unit_patch('public._crm_write_order_lines(uuid,jsonb)',
  'quantity, unit_amount, price_status, line_total, price_source',
  'quantity, unit_amount, price_status, line_total, price_source, sale_unit');
select pg_temp._sales_unit_patch('public._crm_write_order_lines(uuid,jsonb)',
  'entry.line ->> ''price_source''', 'entry.line ->> ''price_source'', coalesce(entry.line ->> ''sale_unit'', ''piece'')');

-- Storefront checkout has its own canonical-price insertion (including promos).
select pg_temp._sales_unit_patch('public.crm_submit_order(jsonb)',
  'quantity, unit_amount, price_status, line_total',
  'quantity, unit_amount, price_status, line_total, sale_unit');
select pg_temp._sales_unit_patch('public.crm_submit_order(jsonb)',
  'case when product.price_status = ''known'' then round(product.amount * requested_item.quantity, 2) end',
  'case when product.price_status = ''known'' then round(product.amount * requested_item.quantity, 2) end, product.sale_unit');

-- Every order-facing projection reads the stored snapshot, never today's unit.
select pg_temp._sales_unit_patch('public._customer_order_items_json(uuid)',
  '''quantity'', item.quantity,', '''quantity'', item.quantity, ''saleUnit'', item.sale_unit,');
select pg_temp._sales_unit_patch('public.admin_crm_get_order(bigint)',
  '''quantity'', item.quantity,', '''quantity'', item.quantity, ''saleUnit'', item.sale_unit,');
select pg_temp._sales_unit_patch('public.admin_crm_export_orders(text,public.crm_order_status,integer,integer)',
  '''quantity'', item.quantity,', '''quantity'', item.quantity, ''saleUnit'', item.sale_unit,');
select pg_temp._sales_unit_patch('public.admin_crm_search_products(text,integer)',
  '''priceStatus'', found.price_status,', '''priceStatus'', found.price_status, ''saleUnit'', found.sale_unit,');
select pg_temp._sales_unit_patch('public.admin_crm_search_products(text,integer)',
  'product.publication_status, coalesce(brand.name, '''') as brand_name,',
  'product.publication_status, product.sale_unit, coalesce(brand.name, '''') as brand_name,');

-- Timeline diffs are immutable order snapshots as well.
select pg_temp._sales_unit_patch('public._crm_order_lines_diff(jsonb,jsonb)',
  '''title'', line ->> ''title'', ''sku'', line ->> ''sku'',',
  '''title'', line ->> ''title'', ''sku'', line ->> ''sku'', ''saleUnit'', line ->> ''sale_unit'',', 2);
select pg_temp._sales_unit_patch('public._crm_order_lines_diff(jsonb,jsonb)',
  '''title'', old_lines.line ->> ''title'', ''sku'', old_lines.line ->> ''sku'',',
  '''title'', old_lines.line ->> ''title'', ''sku'', old_lines.line ->> ''sku'', ''saleUnit'', old_lines.line ->> ''sale_unit'',');
drop function pg_temp._sales_unit_patch(regprocedure,text,text,integer);
commit;
