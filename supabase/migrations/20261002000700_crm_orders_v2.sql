-- CRM orders v2: staff edit order lines, create manual orders, export orders/customers, product search.
--
-- * Lines are edited as a whole list: existing lines keep their id, new lines reference a catalogue
--   product (legacy_id) or are free-text lines (no product). Unit prices may be confirmed by a manager,
--   including for "on request" products. Line and order totals are always computed on the server.
-- * Every change of the line list is written to crm_activity (kind 'update') with a structured diff.
-- * crm_submit_order (storefront) is not changed here.
--
-- NOTE for the Supabase connector: _crm_write_order_lines contains a `delete from` statement in its body.
-- Apply this file through the Supabase SQL Editor if the connector times out.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
-- Free-text lines have no catalogue product.
alter table public.crm_order_items alter column legacy_id drop not null;
alter table public.crm_order_items
  add column price_source text not null default 'catalogue' check (price_source in ('catalogue', 'manager'));
alter table public.crm_order_items
  add constraint crm_order_items_custom_line_check check (legacy_id is not null or product_id is null);
-- A manager may confirm a zero price (e.g. a bonus item).
alter table public.crm_order_items drop constraint crm_order_items_unit_amount_check;
alter table public.crm_order_items
  add constraint crm_order_items_unit_amount_check check (unit_amount is null or unit_amount >= 0);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._crm_parse_quantity(raw jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  text_value text := btrim(coalesce(raw #>> '{}', ''));
begin
  if raw is not null and jsonb_typeof(raw) in ('number', 'string') and text_value ~ '^[0-9]{1,4}$' then
    if text_value::integer between 1 and 999 then
      return text_value::integer;
    end if;
  end if;
  raise exception using errcode = '22023', message = 'Кількість має бути цілим числом від 1 до 999.';
end;
$$;

-- null / '' → null (price to be clarified). Up to 9 999 999.99 so 100 lines × 999 pcs fit numeric(14, 2).
create or replace function public._crm_parse_amount(raw jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  text_value text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return null; end if;
  if jsonb_typeof(raw) not in ('number', 'string') then
    raise exception using errcode = '22023', message = 'Перевірте ціну позиції.';
  end if;
  text_value := replace(regexp_replace(raw #>> '{}', '\s', '', 'g'), ',', '.');
  if text_value = '' then return null; end if;
  if text_value !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then
    raise exception using errcode = '22023', message = 'Ціна має бути числом від 0 до 9 999 999,99 (до двох знаків після коми).';
  end if;
  return round(text_value::numeric, 2);
end;
$$;

-- Validates the requested line list against the order and the catalogue.
-- lines: [{ id: crm_order_items.internal_id, quantity, unitAmount? }            existing line
--         { productId: products.legacy_id, quantity, unitAmount? }             catalogue product
--         { title, sku?, quantity, unitAmount? }]                              free-text line
-- unitAmount omitted keeps the stored price (existing line) or uses the catalogue price (new product line).
-- Returns a jsonb array of fully resolved rows; nothing is written.
create or replace function public._crm_resolve_order_lines(target_order uuid, lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  line jsonb;
  existing public.crm_order_items%rowtype;
  existing_id uuid;
  product record;
  quantity_value integer;
  amount_value numeric;
  amount_given boolean;
  line_title text;
  catalogue_amount numeric;
  resolved jsonb := '[]'::jsonb;
  seen_items uuid[] := '{}';
  seen_products text[] := '{}';
begin
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
    raise exception using errcode = '22023', message = 'Додайте хоча б одну позицію.';
  end if;
  if jsonb_array_length(lines) > 100 then
    raise exception using errcode = '22023', message = 'Забагато позицій в одному замовленні (максимум 100).';
  end if;

  for line in select value from jsonb_array_elements(lines) loop
    if jsonb_typeof(line) <> 'object' then
      raise exception using errcode = '22023', message = 'Некоректна позиція замовлення.';
    end if;
    quantity_value := public._crm_parse_quantity(line -> 'quantity');
    amount_given := line ? 'unitAmount';
    amount_value := public._crm_parse_amount(line -> 'unitAmount');

    if nullif(btrim(coalesce(line ->> 'id', '')), '') is not null then
      begin
        existing_id := (line ->> 'id')::uuid;
      exception when others then
        raise exception using errcode = '22023', message = 'Позицію не знайдено. Оновіть сторінку.';
      end;
      select * into existing from public.crm_order_items item
      where item.internal_id = existing_id and item.order_id = target_order;
      if target_order is null or not found then
        raise exception using errcode = '22023', message = 'Позицію не знайдено. Оновіть сторінку.';
      end if;
      if existing_id = any(seen_items) or (existing.legacy_id is not null and existing.legacy_id = any(seen_products)) then
        raise exception using errcode = '22023', message = 'Позиція повторюється в замовленні.';
      end if;
      seen_items := seen_items || existing_id;
      if existing.legacy_id is not null then seen_products := seen_products || existing.legacy_id; end if;
      if not amount_given then amount_value := existing.unit_amount; end if;
      resolved := resolved || jsonb_build_array(jsonb_build_object(
        'internal_id', existing.internal_id, 'product_id', existing.product_id, 'legacy_id', existing.legacy_id,
        'sku', existing.sku, 'title', existing.title, 'brand_name', existing.brand_name,
        'quantity', quantity_value, 'unit_amount', amount_value, 'price_status', existing.price_status,
        'price_source', case when amount_value is not distinct from existing.unit_amount then existing.price_source else 'manager' end
      ));

    elsif nullif(btrim(coalesce(line ->> 'productId', '')), '') is not null then
      select item.internal_id, item.legacy_id, item.sku, item.title, item.amount, item.price_status,
        coalesce(brand.name, '') as brand_name
      into product
      from public.products item
      left join public.brands brand on brand.internal_id = item.brand_id
      where item.legacy_id = btrim(line ->> 'productId') and item.publication_status <> 'archived';
      if not found then
        raise exception using errcode = '22023', message = 'Товар не знайдено в каталозі.';
      end if;
      if product.legacy_id = any(seen_products) then
        raise exception using errcode = '22023', message = 'Товар уже є в замовленні — змініть кількість у наявній позиції.';
      end if;
      seen_products := seen_products || product.legacy_id;
      catalogue_amount := case when product.price_status = 'known' then product.amount end;
      if amount_value is null then amount_value := catalogue_amount; end if;
      resolved := resolved || jsonb_build_array(jsonb_build_object(
        'internal_id', null, 'product_id', product.internal_id, 'legacy_id', product.legacy_id,
        'sku', product.sku, 'title', product.title, 'brand_name', product.brand_name,
        'quantity', quantity_value, 'unit_amount', amount_value, 'price_status', product.price_status,
        'price_source', case when amount_value is not distinct from catalogue_amount then 'catalogue' else 'manager' end
      ));

    else
      line_title := public._crm_clean_text(line ->> 'title', 300);
      if line_title is null or char_length(line_title) < 2 then
        raise exception using errcode = '22023', message = 'Вкажіть назву позиції.';
      end if;
      resolved := resolved || jsonb_build_array(jsonb_build_object(
        'internal_id', null, 'product_id', null, 'legacy_id', null,
        'sku', coalesce(public._crm_clean_text(line ->> 'sku', 120), ''), 'title', line_title, 'brand_name', '',
        'quantity', quantity_value, 'unit_amount', amount_value,
        'price_status', case when amount_value is null then 'on_request' else 'known' end,
        'price_source', 'manager'
      ));
    end if;
  end loop;

  return resolved;
end;
$$;

-- Current lines of an order in the same shape as _crm_resolve_order_lines.
create or replace function public._crm_order_lines_json(target_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'internal_id', item.internal_id, 'product_id', item.product_id, 'legacy_id', item.legacy_id,
      'sku', item.sku, 'title', item.title, 'brand_name', item.brand_name,
      'quantity', item.quantity, 'unit_amount', item.unit_amount, 'price_status', item.price_status,
      'price_source', item.price_source
    ) order by item.position), '[]'::jsonb)
  from public.crm_order_items item where item.order_id = target_order
$$;

-- Structured diff for the activity timeline: { added: [], removed: [], changed: [] }.
create or replace function public._crm_order_lines_diff(previous jsonb, resolved jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with old_lines as (
    select value as line, (value ->> 'internal_id')::uuid as id from jsonb_array_elements(previous)
  ), new_lines as (
    select value as line, nullif(value ->> 'internal_id', '')::uuid as id from jsonb_array_elements(resolved)
  )
  select jsonb_build_object(
    'added', coalesce((select jsonb_agg(jsonb_build_object(
        'title', line ->> 'title', 'sku', line ->> 'sku',
        'quantity', (line ->> 'quantity')::integer, 'unitAmount', (line ->> 'unit_amount')::numeric))
      from new_lines where id is null), '[]'::jsonb),
    'removed', coalesce((select jsonb_agg(jsonb_build_object(
        'title', line ->> 'title', 'sku', line ->> 'sku',
        'quantity', (line ->> 'quantity')::integer, 'unitAmount', (line ->> 'unit_amount')::numeric))
      from old_lines where id not in (select new_lines.id from new_lines where new_lines.id is not null)), '[]'::jsonb),
    'changed', coalesce((select jsonb_agg(jsonb_build_object(
        'title', old_lines.line ->> 'title', 'sku', old_lines.line ->> 'sku',
        'from', jsonb_build_object('quantity', (old_lines.line ->> 'quantity')::integer, 'unitAmount', (old_lines.line ->> 'unit_amount')::numeric),
        'to', jsonb_build_object('quantity', (new_lines.line ->> 'quantity')::integer, 'unitAmount', (new_lines.line ->> 'unit_amount')::numeric)))
      from old_lines join new_lines on new_lines.id = old_lines.id
      where (old_lines.line ->> 'quantity')::integer <> (new_lines.line ->> 'quantity')::integer
         or (old_lines.line ->> 'unit_amount')::numeric is distinct from (new_lines.line ->> 'unit_amount')::numeric), '[]'::jsonb)
  )
$$;

-- Replaces the lines of an order with the resolved list and recalculates the order totals.
create or replace function public._crm_write_order_lines(target_order uuid, resolved jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  totals record;
begin
  delete from public.crm_order_items where order_id = target_order;

  insert into public.crm_order_items (
    internal_id, order_id, position, product_id, legacy_id, sku, title, brand_name,
    quantity, unit_amount, price_status, line_total, price_source
  )
  select coalesce(nullif(entry.line ->> 'internal_id', '')::uuid, gen_random_uuid()), target_order,
    (entry.ordinality - 1)::integer,
    nullif(entry.line ->> 'product_id', '')::uuid,
    entry.line ->> 'legacy_id',
    coalesce(entry.line ->> 'sku', ''),
    entry.line ->> 'title',
    coalesce(entry.line ->> 'brand_name', ''),
    (entry.line ->> 'quantity')::integer,
    (entry.line ->> 'unit_amount')::numeric,
    (entry.line ->> 'price_status')::public.product_price_status,
    round((entry.line ->> 'unit_amount')::numeric * (entry.line ->> 'quantity')::integer, 2),
    entry.line ->> 'price_source'
  from jsonb_array_elements(resolved) with ordinality as entry(line, ordinality);

  select coalesce(sum(item.quantity), 0)::integer as items_count,
    coalesce(sum(item.line_total), 0) as items_total,
    coalesce(bool_or(item.line_total is null), false) as has_unpriced
  into totals
  from public.crm_order_items item where item.order_id = target_order;

  update public.crm_orders set
    items_count = totals.items_count,
    items_total = totals.items_total,
    has_unpriced_items = totals.has_unpriced
  where internal_id = target_order;
end;
$$;

revoke all on function public._crm_parse_quantity(jsonb) from public, anon, authenticated;
revoke all on function public._crm_parse_amount(jsonb) from public, anon, authenticated;
revoke all on function public._crm_resolve_order_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._crm_order_lines_json(uuid) from public, anon, authenticated;
revoke all on function public._crm_order_lines_diff(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._crm_write_order_lines(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order detail: line ids, price source and free-text lines
-- ---------------------------------------------------------------------------
create or replace function public.admin_crm_get_order(order_number bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.crm_orders%rowtype;
  customer public.crm_customers%rowtype;
begin
  perform public._crm_require_staff();
  select * into target from public.crm_orders where number = order_number;
  if not found then return null; end if;
  select * into customer from public.crm_customers where internal_id = target.customer_id;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'number', target.number,
      'status', target.status,
      'source', target.source,
      'contactName', target.contact_name,
      'contactPhone', target.contact_phone,
      'contactEmail', target.contact_email,
      'deliveryMethod', target.delivery_method,
      'deliveryCity', target.delivery_city,
      'deliveryPoint', target.delivery_point,
      'customerComment', target.customer_comment,
      'managerComment', target.manager_comment,
      'itemsCount', target.items_count,
      'itemsTotal', target.items_total,
      'hasUnpricedItems', target.has_unpriced_items,
      'currency', target.currency,
      'assignedTo', target.assigned_to,
      'assignedName', public._crm_staff_name(target.assigned_to),
      'itemsEditable', target.status not in ('completed', 'cancelled'),
      'createdAt', target.created_at,
      'updatedAt', target.updated_at
    ),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', item.internal_id,
        'position', item.position,
        'legacyId', item.legacy_id,
        'sku', item.sku,
        'title', item.title,
        'brand', item.brand_name,
        'quantity', item.quantity,
        'unitAmount', item.unit_amount,
        'priceStatus', item.price_status,
        'priceSource', item.price_source,
        'lineTotal', item.line_total,
        'custom', item.legacy_id is null,
        'productAvailable', item.product_id is not null
      ) order by item.position)
      from public.crm_order_items item where item.order_id = target.internal_id), '[]'::jsonb),
    'customer', jsonb_build_object(
      'id', customer.internal_id,
      'name', customer.name,
      'phone', customer.phone,
      'email', customer.email,
      'company', customer.company,
      'ordersCount', customer.orders_count,
      'leadsCount', customer.leads_count
    ),
    'activity', public._crm_activity_json(target.internal_id, null, null, 100),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', profile.user_id, 'name', profile.name) order by profile.name)
      from public.admin_profiles profile
      where profile.active and profile.role in ('owner', 'admin', 'manager')), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff RPCs
-- ---------------------------------------------------------------------------
-- lines: see _crm_resolve_order_lines. The whole list is sent; lines left out are removed.
create or replace function public.admin_crm_update_order_items(order_number bigint, lines jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.crm_orders%rowtype;
  previous jsonb;
  resolved jsonb;
  diff jsonb;
  next_total numeric;
begin
  perform public._crm_require_staff();

  select * into target from public.crm_orders where number = order_number for update;
  if not found then raise exception using errcode = 'P0002', message = 'Замовлення не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Замовлення вже змінив інший працівник. Оновіть сторінку.';
  end if;
  if target.status in ('completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Виконане або скасоване замовлення не редагується. Спершу змініть статус.';
  end if;

  previous := public._crm_order_lines_json(target.internal_id);
  resolved := public._crm_resolve_order_lines(target.internal_id, lines);
  diff := public._crm_order_lines_diff(previous, resolved);
  if jsonb_array_length(diff -> 'added') = 0 and jsonb_array_length(diff -> 'removed') = 0
      and jsonb_array_length(diff -> 'changed') = 0 then
    return public.admin_crm_get_order(order_number);
  end if;

  perform public._crm_write_order_lines(target.internal_id, resolved);
  select items_total into next_total from public.crm_orders where internal_id = target.internal_id;

  insert into public.crm_activity (customer_id, order_id, actor_id, kind, body, data)
  values (target.customer_id, target.internal_id, auth.uid(), 'update', 'Склад замовлення змінено',
    jsonb_build_object('items', diff, 'total', jsonb_build_object('from', target.items_total, 'to', next_total)));

  perform public._crm_refresh_customer_stats(target.customer_id);
  return public.admin_crm_get_order(order_number);
end;
$$;

-- payload: { name, phone, email?, company?, delivery: 'carrier'|'pickup', city?, deliveryPoint?, comment?,
--            managerComment?, assignedTo? (uuid; defaults to the caller), status?: 'new'|'confirmed', lines: [...] }
create or replace function public.admin_crm_create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  contact_name text;
  normalized_phone text;
  contact_email text;
  company text;
  delivery text;
  city text;
  delivery_point text;
  initial_status text;
  assignee uuid := auth.uid();
  resolved jsonb;
  customer uuid;
  new_order_id uuid;
  order_number bigint;
begin
  perform public._crm_require_staff();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані замовлення.';
  end if;

  contact_name := public._crm_clean_text(payload ->> 'name', 160);
  normalized_phone := public._crm_normalize_phone(payload ->> 'phone');
  contact_email := public._crm_clean_email(payload ->> 'email');
  company := public._crm_clean_text(payload ->> 'company', 200);
  delivery := coalesce(nullif(payload ->> 'delivery', ''), 'carrier');
  city := public._crm_clean_text(payload ->> 'city', 120);
  delivery_point := public._crm_clean_text(payload ->> 'deliveryPoint', 240);
  initial_status := coalesce(nullif(payload ->> 'status', ''), 'new');

  if contact_name is null or char_length(contact_name) < 2 then
    raise exception using errcode = '22023', message = 'Вкажіть ім’я клієнта.';
  end if;
  if normalized_phone is null then
    raise exception using errcode = '22023', message = 'Вкажіть коректний номер телефону.';
  end if;
  if delivery not in ('carrier', 'pickup') then
    raise exception using errcode = '22023', message = 'Оберіть спосіб отримання.';
  end if;
  if initial_status not in ('new', 'confirmed') then
    raise exception using errcode = '22023', message = 'Нове замовлення може мати статус «Нове» або «Підтверджено».';
  end if;
  if payload ? 'assignedTo' then
    if nullif(payload ->> 'assignedTo', '') is null then
      assignee := null;
    else
      begin
        assignee := (payload ->> 'assignedTo')::uuid;
      exception when others then
        assignee := null;
      end;
      if assignee is null or not exists (select 1 from public.admin_profiles profile
          where profile.user_id = assignee and profile.active and profile.role in ('owner', 'admin', 'manager')) then
        raise exception using errcode = '22023', message = 'Відповідального не знайдено.';
      end if;
    end if;
  end if;

  resolved := public._crm_resolve_order_lines(null, payload -> 'lines');

  customer := public._crm_upsert_customer(normalized_phone, contact_name, contact_email, company,
    case when delivery = 'carrier' then city else null end);

  insert into public.crm_orders (
    customer_id, status, source, contact_name, contact_phone, contact_email, delivery_method,
    delivery_city, delivery_point, customer_comment, manager_comment, assigned_to
  ) values (
    customer, initial_status::public.crm_order_status, 'manual', contact_name, normalized_phone, contact_email,
    delivery::public.crm_delivery_method,
    case when delivery = 'carrier' then city else null end,
    delivery_point,
    coalesce(public._crm_clean_text(payload ->> 'comment', 4000), ''),
    coalesce(public._crm_clean_text(payload ->> 'managerComment', 8000), ''),
    assignee
  ) returning internal_id, number into new_order_id, order_number;

  perform public._crm_write_order_lines(new_order_id, resolved);

  insert into public.crm_activity (customer_id, order_id, actor_id, kind, body)
  values (customer, new_order_id, auth.uid(), 'created', 'Замовлення створено вручну');

  perform public._crm_refresh_customer_stats(customer);
  return public.admin_crm_get_order(order_number);
end;
$$;

-- Product picker for order lines: catalogue products that are not archived.
create or replace function public.admin_crm_search_products(query_text text, max_rows integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  needle text := btrim(coalesce(query_text, ''));
begin
  perform public._crm_require_staff();
  if char_length(needle) < 2 then return '[]'::jsonb; end if;

  return coalesce((select jsonb_agg(jsonb_build_object(
      'legacyId', found.legacy_id,
      'sku', found.sku,
      'title', found.title,
      'brand', found.brand_name,
      'amount', case when found.price_status = 'known' then found.amount end,
      'priceStatus', found.price_status,
      'publicationStatus', found.publication_status
    ) order by found.rank, found.title)
    from (
      select product.legacy_id, product.sku, product.title, product.amount, product.price_status,
        product.publication_status, coalesce(brand.name, '') as brand_name,
        case when lower(product.sku) = lower(needle) or product.legacy_id = needle then 0
          when product.publication_status = 'published' then 1 else 2 end as rank
      from public.products product
      left join public.brands brand on brand.internal_id = product.brand_id
      where product.publication_status <> 'archived'
        and (lower(product.sku) = lower(needle) or product.legacy_id = needle
          or concat_ws(' ', product.title, product.sku, product.model, brand.name) ilike '%' || needle || '%')
      order by rank, product.title
      limit greatest(1, least(coalesce(max_rows, 12), 25))
    ) found), '[]'::jsonb);
end;
$$;

-- CSV export source: same filters as admin_crm_list_orders, up to 1000 rows per page.
create or replace function public.admin_crm_export_orders(
  query_text text default null,
  filter_status public.crm_order_status default null,
  page_number integer default 1,
  page_size integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  normalized_query text := nullif(btrim(coalesce(query_text, '')), '');
  query_digits text := regexp_replace(coalesce(query_text, ''), '[^0-9]', '', 'g');
  safe_size integer := greatest(1, least(coalesce(page_size, 500), 1000));
  safe_page integer := greatest(1, coalesce(page_number, 1));
  total integer;
  result_rows jsonb;
begin
  perform public._crm_require_staff();

  with filtered as (
    select crm_order.* from public.crm_orders crm_order
    where (filter_status is null or crm_order.status = filter_status)
      and (normalized_query is null
        or crm_order.number::text = query_digits
        or crm_order.contact_name ilike '%' || normalized_query || '%'
        or coalesce(crm_order.contact_email, '') ilike '%' || normalized_query || '%'
        or (char_length(query_digits) >= 5 and crm_order.contact_phone like '%' || query_digits || '%'))
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'number', page_rows.number,
      'createdAt', page_rows.created_at,
      'status', page_rows.status,
      'source', page_rows.source,
      'contactName', page_rows.contact_name,
      'contactPhone', page_rows.contact_phone,
      'contactEmail', page_rows.contact_email,
      'deliveryMethod', page_rows.delivery_method,
      'deliveryCity', page_rows.delivery_city,
      'deliveryPoint', page_rows.delivery_point,
      'itemsCount', page_rows.items_count,
      'itemsTotal', page_rows.items_total,
      'hasUnpricedItems', page_rows.has_unpriced_items,
      'currency', page_rows.currency,
      'assignedTo', public._crm_staff_name(page_rows.assigned_to),
      'customerComment', page_rows.customer_comment,
      'managerComment', page_rows.manager_comment,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'sku', item.sku, 'title', item.title, 'quantity', item.quantity,
          'unitAmount', item.unit_amount, 'lineTotal', item.line_total) order by item.position)
        from public.crm_order_items item where item.order_id = page_rows.internal_id), '[]'::jsonb)
    ) order by page_rows.created_at desc, page_rows.number desc)
    from (select * from filtered order by created_at desc, number desc
      offset (safe_page - 1) * safe_size limit safe_size) page_rows), '[]'::jsonb)
  into total, result_rows;

  return jsonb_build_object('total', total, 'page', safe_page, 'pageSize', safe_size, 'rows', result_rows);
end;
$$;

create or replace function public.admin_crm_export_customers(
  query_text text default null,
  page_number integer default 1,
  page_size integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  normalized_query text := nullif(btrim(coalesce(query_text, '')), '');
  query_digits text := regexp_replace(coalesce(query_text, ''), '[^0-9]', '', 'g');
  safe_size integer := greatest(1, least(coalesce(page_size, 500), 1000));
  safe_page integer := greatest(1, coalesce(page_number, 1));
  total integer;
  result_rows jsonb;
begin
  perform public._crm_require_staff();

  with filtered as (
    select customer.* from public.crm_customers customer
    where normalized_query is null
      or customer.name ilike '%' || normalized_query || '%'
      or coalesce(customer.email, '') ilike '%' || normalized_query || '%'
      or coalesce(customer.company, '') ilike '%' || normalized_query || '%'
      or (char_length(query_digits) >= 5 and customer.phone like '%' || query_digits || '%')
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'name', page_rows.name,
      'phone', page_rows.phone,
      'email', page_rows.email,
      'company', page_rows.company,
      'city', page_rows.city,
      'ordersCount', page_rows.orders_count,
      'leadsCount', page_rows.leads_count,
      'ordersTotal', page_rows.orders_total,
      'notes', page_rows.notes,
      'createdAt', page_rows.created_at,
      'lastActivityAt', page_rows.last_activity_at
    ) order by page_rows.last_activity_at desc, page_rows.internal_id)
    from (select * from filtered order by last_activity_at desc, internal_id
      offset (safe_page - 1) * safe_size limit safe_size) page_rows), '[]'::jsonb)
  into total, result_rows;

  return jsonb_build_object('total', total, 'page', safe_page, 'pageSize', safe_size, 'rows', result_rows);
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.admin_crm_get_order(bigint)',
    'public.admin_crm_update_order_items(bigint, jsonb, timestamptz)',
    'public.admin_crm_create_order(jsonb)',
    'public.admin_crm_search_products(text, integer)',
    'public.admin_crm_export_orders(text, public.crm_order_status, integer, integer)',
    'public.admin_crm_export_customers(text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;
