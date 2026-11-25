-- Promo codes v1: codes are managed in /admin/promo-codes (owner and admin), previewed on /checkout and
-- applied by crm_submit_order.
--
--   * crm_promo_codes: code (Latin letters, digits, - and _; stored upper-case), percent (1–90) or fixed
--     amount in UAH, optional minimum order, first and last day, use limit; used_count grows with every
--     order and drops when a manager removes the code from one. RLS on and no table grants: only the RPCs
--     below read or change it.
--   * Dates are Kyiv calendar days: the admin sends startsOn / endsOn ("YYYY-MM-DD", endsOn is the last day
--     the code works); starts_at is the first day's 00:00 Europe/Kyiv, ends_at the 00:00 Europe/Kyiv after
--     the last day (so a DST day lasts 23 or 25 hours, as in Kyiv).
--   * The discount is taken from the priced lines only; «за запитом» lines are priced by a manager later
--     and are not discounted. crm_orders keeps items_total as the sum of the lines and gets promo_code /
--     promo_kind / promo_value, discount_base (the priced total the discount was computed from at
--     submission) and discount_amount; to pay = items_total - discount_amount. Trigger crm_orders_discount
--     recomputes discount_amount whenever the total changes: a percent applies to
--     min(items_total, discount_base), so a manager pricing an «за запитом» line or adding lines never grows
--     the discount, while removing lines can shrink it; a fixed amount never exceeds the total.
--   * crm_check_promo_code(payload) is public: { code: "" } only answers { available } (the field is shown
--     while active codes exist); with a code it returns the discount for the posted cart, priced on the
--     server.
--   * Brute-force guard (crm_promo_attempts): every unknown code (not found, switched off, not started yet,
--     expired) sent to crm_check_promo_code or crm_submit_order is logged. After 20 in an hour from one
--     client address, or 200 in 10 minutes across the site (a bot rotating addresses), both stop checking
--     codes. Real codes that merely do not apply yet (minimum order, used up, no priced items) are not
--     logged, so customers behind one office address do not lock each other out.
--   * crm_submit_order: same as 20261002001700 plus payload.promoCode, checked again under a row lock before
--     anything is written. A code that does not apply returns { accepted: false, promoError } with HTTP 200:
--     no order, no customer card, no submission rate-limit slot, and the logged guess is kept (an exception
--     would roll it back).
--   * admin_crm_remove_order_promo(order_number, expected_updated_at): CRM staff remove the code from an open
--     order (the discount goes, used_count drops, the timeline says which code).
--   * Customer totals (crm_customers.orders_total, admin_crm_overview revenue30d) are net of the discount;
--     admin_crm_get_customer order rows carry discountAmount and promoCode.
--   * admin_crm_get_order and _customer_order_json: same as before plus the promo fields.
--
-- Replaced functions (their PROD bodies equal the repo versions): crm_submit_order, admin_crm_get_order,
-- admin_crm_list_orders, admin_crm_export_orders, _customer_order_json, _crm_refresh_customer_stats,
-- admin_crm_overview, admin_crm_get_customer.
--
-- NOTE for the Supabase connector: crm_submit_order, _crm_promo_record_failure and admin_delete_promo_code
-- contain `delete from`, and the file creates a trigger. Apply it through the Supabase SQL Editor (or the
-- Management API) if the connector times out.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table public.crm_promo_codes (
  internal_id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(14, 2) not null check (value > 0),
  min_order_total numeric(14, 2) check (min_order_total is null or min_order_total > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.crm_promo_codes enable row level security;
revoke all on table public.crm_promo_codes from anon, authenticated;

-- Unknown codes per client address (brute-force guard of crm_check_promo_code and crm_submit_order);
-- '' when the address is unknown (still counted by the site-wide backstop).
create table public.crm_promo_attempts (
  id bigint generated always as identity primary key,
  client_fingerprint text not null,
  created_at timestamptz not null default now()
);
create index crm_promo_attempts_recent on public.crm_promo_attempts (client_fingerprint, created_at);
create index crm_promo_attempts_created on public.crm_promo_attempts (created_at);
alter table public.crm_promo_attempts enable row level security;
revoke all on table public.crm_promo_attempts from anon, authenticated;

alter table public.crm_orders
  add column promo_code text check (promo_code is null or char_length(promo_code) <= 40),
  add column promo_kind text check (promo_kind is null or promo_kind in ('percent', 'fixed')),
  add column promo_value numeric(14, 2) check (promo_value is null or promo_value > 0),
  add column discount_base numeric(14, 2) check (discount_base is null or discount_base >= 0),
  add column discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0);
create index crm_orders_promo_code on public.crm_orders (promo_code) where promo_code is not null;

-- A percent applies to the priced total the code was accepted for (discount_base) or to the current
-- total when that is smaller: lines priced or added later are not discounted, removed lines shrink it.
create or replace function public._crm_order_discount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.discount_amount := case
    when new.promo_kind = 'percent'
      then round(least(new.items_total, coalesce(new.discount_base, new.items_total)) * new.promo_value / 100, 2)
    when new.promo_kind = 'fixed' then least(new.promo_value, new.items_total)
    else 0
  end;
  return new;
end;
$$;
revoke all on function public._crm_order_discount() from public, anon, authenticated;

create trigger crm_orders_discount before insert or update of items_total, promo_kind, promo_value, discount_base
  on public.crm_orders for each row execute function public._crm_order_discount();

-- ---------------------------------------------------------------------------
-- Evaluation: { valid, reason, message } or { valid, id, code, kind, value, discount, itemsTotal }.
-- reason: 'empty' | 'unknown' (not found, off, not started, expired) | 'used_up' | 'no_priced' | 'min_order';
-- only 'unknown' counts as a guess for the brute-force guard.
-- ---------------------------------------------------------------------------
create or replace function public._crm_promo_evaluate(raw_code text, priced_total numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := upper(btrim(coalesce(raw_code, '')));
  promo public.crm_promo_codes%rowtype;
  base numeric := coalesce(priced_total, 0);
begin
  if normalized = '' then
    return jsonb_build_object('valid', false, 'reason', 'empty', 'message', 'Введіть промокод.');
  end if;
  select * into promo from public.crm_promo_codes promo_row where promo_row.code = normalized;
  if not found or not promo.active
      or (promo.starts_at is not null and promo.starts_at > now())
      or (promo.ends_at is not null and promo.ends_at <= now()) then
    return jsonb_build_object('valid', false, 'reason', 'unknown', 'message', 'Такого промокоду немає або він уже не діє.');
  end if;
  if promo.max_uses is not null and promo.used_count >= promo.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'used_up', 'message', 'Цей промокод уже використано.');
  end if;
  if base <= 0 then
    return jsonb_build_object('valid', false, 'reason', 'no_priced',
      'message', 'Промокод діє на товари з ціною — у кошику таких немає.');
  end if;
  if promo.min_order_total is not null and base < promo.min_order_total then
    return jsonb_build_object('valid', false, 'reason', 'min_order',
      'message', 'Промокод діє для замовлень від ' || to_char(promo.min_order_total, 'FM9999999990') || ' грн.');
  end if;
  return jsonb_build_object(
    'valid', true,
    'id', promo.internal_id,
    'code', promo.code,
    'kind', promo.kind,
    'value', promo.value,
    'discount', case when promo.kind = 'percent' then round(base * promo.value / 100, 2) else least(promo.value, base) end,
    'itemsTotal', base
  );
end;
$$;
revoke all on function public._crm_promo_evaluate(text, numeric) from public, anon, authenticated;

-- Brute-force guard: 20 unknown codes per hour from one address, or 200 per 10 minutes across the site.
create or replace function public._crm_promo_blocked(fingerprint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (_crm_promo_blocked.fingerprint is not null and (select count(*) from public.crm_promo_attempts attempt
      where attempt.client_fingerprint = _crm_promo_blocked.fingerprint
        and attempt.created_at > now() - interval '1 hour') >= 20)
    or (select count(*) from public.crm_promo_attempts attempt
      where attempt.created_at > now() - interval '10 minutes') >= 200
$$;

create or replace function public._crm_promo_record_failure(fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.crm_promo_attempts where created_at < now() - interval '1 day';
  insert into public.crm_promo_attempts (client_fingerprint) values (coalesce(fingerprint, ''));
end;
$$;

revoke all on function public._crm_promo_blocked(text) from public, anon, authenticated;
revoke all on function public._crm_promo_record_failure(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storefront: preview on /checkout
-- ---------------------------------------------------------------------------
create or replace function public.crm_check_promo_code(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  raw_code text := btrim(coalesce(payload ->> 'code', ''));
  requested jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  fingerprint text := public._crm_client_fingerprint();
  priced_total numeric;
  result jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані.';
  end if;
  if raw_code = '' then
    return jsonb_build_object('available', exists (
      select 1 from public.crm_promo_codes promo
      where promo.active
        and (promo.starts_at is null or promo.starts_at <= now())
        and (promo.ends_at is null or promo.ends_at > now())
        and (promo.max_uses is null or promo.used_count < promo.max_uses)));
  end if;
  if char_length(raw_code) > 40 then
    return jsonb_build_object('available', true, 'valid', false, 'message', 'Такого промокоду немає або він уже не діє.');
  end if;
  if public._crm_promo_blocked(fingerprint) then
    return jsonb_build_object('available', true, 'valid', false, 'message', 'Забагато спроб. Спробуйте пізніше або зателефонуйте нам.');
  end if;
  if jsonb_typeof(requested) <> 'array' or jsonb_array_length(requested) > 50 then
    raise exception using errcode = '22023', message = 'Некоректні дані кошика.';
  end if;

  select coalesce(sum(round(product.amount * item.quantity, 2)), 0) into priced_total
  from (
    select btrim(entry ->> 'id') as legacy_id,
      case when (entry ->> 'quantity') ~ '^[0-9]{1,4}$' then (entry ->> 'quantity')::integer end as quantity
    from jsonb_array_elements(requested) as entry
  ) item
  join public.products product on product.legacy_id = item.legacy_id
    and product.publication_status = 'published' and product.price_status = 'known'
  where item.quantity between 1 and 999;

  result := public._crm_promo_evaluate(raw_code, priced_total);
  -- Only guesses count: a real code below its minimum or used up does not lock the address out.
  if result ->> 'reason' = 'unknown' then
    perform public._crm_promo_record_failure(fingerprint);
  end if;
  return (result - 'id' - 'reason') || jsonb_build_object('available', true);
end;
$$;
revoke all on function public.crm_check_promo_code(jsonb) from public;
grant execute on function public.crm_check_promo_code(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storefront: order submission (20261002001700 + payload.promoCode)
-- ---------------------------------------------------------------------------

create or replace function public.crm_submit_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  contact_name text := public._crm_clean_text(payload ->> 'name', 160);
  normalized_phone text := public._crm_normalize_phone(payload ->> 'phone');
  contact_email text := public._crm_clean_email(payload ->> 'email');
  delivery text := coalesce(nullif(payload ->> 'delivery', ''), 'carrier');
  city text := public._crm_clean_text(payload ->> 'city', 120);
  delivery_point text := public._crm_clean_text(payload ->> 'deliveryPoint', 240);
  order_comment text := coalesce(public._crm_clean_text(payload ->> 'comment', 4000), '');
  fingerprint text := public._crm_client_fingerprint();
  -- Signed-in storefront customer (null for anonymous checkout).
  signed_in_user uuid := (select account.id from auth.users account where account.id = auth.uid());
  customer uuid;
  new_order_id uuid;
  order_number bigint;
  requested jsonb;
  requested_count integer;
  resolved_count integer;
  totals record;
  promo_input text := upper(btrim(coalesce(payload ->> 'promoCode', '')));
  promo_total numeric;
  promo jsonb;
  final_order public.crm_orders%rowtype;
begin
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані замовлення.';
  end if;
  -- Honeypot: real visitors never see this field.
  if coalesce(payload ->> 'website', '') <> '' then
    return jsonb_build_object('accepted', true);
  end if;
  if contact_name is null or char_length(contact_name) < 2 then
    raise exception using errcode = '22023', message = 'Вкажіть ім’я.';
  end if;
  if normalized_phone is null then
    raise exception using errcode = '22023', message = 'Вкажіть коректний номер телефону.';
  end if;
  if delivery not in ('carrier', 'pickup') then
    raise exception using errcode = '22023', message = 'Оберіть спосіб отримання.';
  end if;

  requested := coalesce(payload -> 'items', '[]'::jsonb);
  if jsonb_typeof(requested) <> 'array' or jsonb_array_length(requested) = 0 then
    raise exception using errcode = '22023', message = 'Кошик порожній.';
  end if;
  if jsonb_array_length(requested) > 50 then
    raise exception using errcode = '22023', message = 'Забагато позицій в одному замовленні (максимум 50).';
  end if;

  create temporary table if not exists pg_temp.crm_requested_items (
    position integer, legacy_id text, quantity integer
  ) on commit drop;
  delete from pg_temp.crm_requested_items;

  insert into pg_temp.crm_requested_items (position, legacy_id, quantity)
  select (ordinality - 1)::integer, btrim(item ->> 'id'),
    case when (item ->> 'quantity') ~ '^[0-9]{1,4}$' then (item ->> 'quantity')::integer else null end
  from jsonb_array_elements(requested) with ordinality as entry(item, ordinality);

  if exists (select 1 from pg_temp.crm_requested_items where legacy_id is null or legacy_id = ''
      or quantity is null or quantity < 1 or quantity > 999) then
    raise exception using errcode = '22023', message = 'Перевірте кількість товарів у кошику.';
  end if;
  if (select count(distinct legacy_id) from pg_temp.crm_requested_items) <> jsonb_array_length(requested) then
    raise exception using errcode = '22023', message = 'Товар повторюється в кошику.';
  end if;

  select count(*) into requested_count from pg_temp.crm_requested_items;
  select count(*) into resolved_count
  from pg_temp.crm_requested_items requested_item
  join public.products product on product.legacy_id = requested_item.legacy_id
    and product.publication_status = 'published';
  if resolved_count <> requested_count then
    raise exception using errcode = '22023', message = 'Деякі товари більше недоступні. Оновіть кошик.';
  end if;

  -- Promo code: checked again under a row lock (/checkout only previews it) before anything is written.
  -- A code that does not apply stops the order with the reason, so the customer never gets another total
  -- without seeing it. It is returned, not raised, so a logged guess survives (brute-force guard).
  if promo_input <> '' then
    if public._crm_promo_blocked(fingerprint) then
      return jsonb_build_object('accepted', false, 'promoError', 'Забагато спроб. Спробуйте пізніше або зателефонуйте нам.');
    end if;
    perform 1 from public.crm_promo_codes promo_row where promo_row.code = promo_input for update;
    -- The same figure items_total gets below: priced lines only.
    select coalesce(sum(round(product.amount * requested_item.quantity, 2)), 0) into promo_total
    from pg_temp.crm_requested_items requested_item
    join public.products product on product.legacy_id = requested_item.legacy_id
      and product.publication_status = 'published' and product.price_status = 'known';
    promo := public._crm_promo_evaluate(promo_input, promo_total);
    if not (promo ->> 'valid')::boolean then
      if promo ->> 'reason' = 'unknown' then
        perform public._crm_promo_record_failure(fingerprint);
      end if;
      return jsonb_build_object('accepted', false,
        'promoError', (promo ->> 'message') || ' Приберіть промокод або введіть інший.');
    end if;
    update public.crm_promo_codes set used_count = used_count + 1 where internal_id = (promo ->> 'id')::uuid;
  end if;

  perform public._crm_enforce_rate_limit('order', normalized_phone, fingerprint);

  customer := public._crm_upsert_customer(normalized_phone, contact_name, contact_email, null,
    case when delivery = 'carrier' then city else null end);

  insert into public.crm_orders (
    customer_id, contact_name, contact_phone, contact_email, delivery_method,
    delivery_city, delivery_point, customer_comment, client_fingerprint, customer_user_id
  ) values (
    customer, contact_name, normalized_phone, contact_email, delivery::public.crm_delivery_method,
    case when delivery = 'carrier' then city else null end,
    case when delivery = 'carrier' then delivery_point else public._crm_clean_text(payload ->> 'pickupStore', 240) end,
    order_comment, fingerprint, signed_in_user
  ) returning internal_id, number into new_order_id, order_number;

  insert into public.crm_order_items (
    order_id, position, product_id, legacy_id, sku, title, brand_name,
    quantity, unit_amount, price_status, line_total
  )
  select new_order_id, requested_item.position, product.internal_id, product.legacy_id, product.sku,
    product.title, coalesce(brand.name, ''), requested_item.quantity,
    case when product.price_status = 'known' then product.amount end,
    product.price_status,
    case when product.price_status = 'known' then round(product.amount * requested_item.quantity, 2) end
  from pg_temp.crm_requested_items requested_item
  join public.products product on product.legacy_id = requested_item.legacy_id
  left join public.brands brand on brand.internal_id = product.brand_id
  order by requested_item.position;

  select coalesce(sum(quantity), 0)::integer as items_count,
    coalesce(sum(line_total), 0) as items_total,
    bool_or(line_total is null) as has_unpriced
  into totals
  from public.crm_order_items item where item.order_id = new_order_id;

  -- discount_amount follows from items_total and the promo fields (trigger crm_orders_discount).
  update public.crm_orders set
    items_count = totals.items_count,
    items_total = totals.items_total,
    has_unpriced_items = coalesce(totals.has_unpriced, false),
    promo_code = promo ->> 'code',
    promo_kind = promo ->> 'kind',
    promo_value = (promo ->> 'value')::numeric,
    discount_base = (promo ->> 'itemsTotal')::numeric
  where internal_id = new_order_id
  returning * into final_order;

  insert into public.crm_activity (customer_id, order_id, kind, body)
  values (customer, new_order_id, 'created',
    case when signed_in_user is null then 'Замовлення з сайту' else 'Замовлення з сайту (особистий кабінет)' end
      || case when promo is null then '' else ' · промокод ' || (promo ->> 'code') end);

  perform public._crm_refresh_customer_stats(customer);

  if signed_in_user is not null then
    perform public._customer_link_order(signed_in_user, customer, contact_name, normalized_phone,
      case when delivery = 'carrier' then city else null end,
      case when delivery = 'carrier' then delivery_point else null end);
  end if;

  return jsonb_build_object(
    'accepted', true,
    'number', order_number,
    'itemsCount', totals.items_count,
    'itemsTotal', totals.items_total,
    'hasUnpricedItems', coalesce(totals.has_unpriced, false),
    'promoCode', final_order.promo_code,
    'discount', final_order.discount_amount,
    'total', final_order.items_total - final_order.discount_amount,
    'currency', 'UAH'
  );
end;
$$;

revoke all on function public.crm_submit_order(jsonb) from public;
grant execute on function public.crm_submit_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: promo codes (owner and admin)
-- ---------------------------------------------------------------------------
create or replace function public._promo_code_json(promo public.crm_promo_codes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', promo.internal_id,
    'code', promo.code,
    'kind', promo.kind,
    'value', promo.value,
    'minOrderTotal', promo.min_order_total,
    'startsAt', promo.starts_at,
    'endsAt', promo.ends_at,
    -- Kyiv calendar days; endsOn is the last day the code works (ends_at is the moment it stops).
    'startsOn', to_char(promo.starts_at at time zone 'Europe/Kyiv', 'YYYY-MM-DD'),
    'endsOn', to_char((promo.ends_at - interval '1 microsecond') at time zone 'Europe/Kyiv', 'YYYY-MM-DD'),
    'maxUses', promo.max_uses,
    'usedCount', promo.used_count,
    'active', promo.active,
    'note', promo.note,
    'state', case
      when not promo.active then 'off'
      when promo.ends_at is not null and promo.ends_at <= now() then 'expired'
      when promo.starts_at is not null and promo.starts_at > now() then 'scheduled'
      when promo.max_uses is not null and promo.used_count >= promo.max_uses then 'used_up'
      else 'active'
    end,
    'ordersCount', (select count(*) from public.crm_orders crm_order where crm_order.promo_code = promo.code),
    'discountTotal', (select coalesce(sum(crm_order.discount_amount), 0) from public.crm_orders crm_order
      where crm_order.promo_code = promo.code and crm_order.status <> 'cancelled'),
    'createdAt', promo.created_at,
    'updatedAt', promo.updated_at
  )
$$;
revoke all on function public._promo_code_json(public.crm_promo_codes) from public, anon, authenticated;

create or replace function public._promo_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_admin_catalog() then
    raise exception using errcode = '42501', message = 'Промокоди можуть змінювати лише власник і адміністратор.';
  end if;
end;
$$;
revoke all on function public._promo_require_admin() from public, anon, authenticated;

create or replace function public.admin_list_promo_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._promo_require_admin();
  return coalesce((select jsonb_agg(public._promo_code_json(promo) order by promo.active desc, promo.created_at desc)
    from public.crm_promo_codes promo), '[]'::jsonb);
end;
$$;

-- payload: { id?, code, kind: percent|fixed, value, minOrderTotal?, startsOn?, endsOn?, maxUses?, active, note? }
-- startsOn / endsOn: Kyiv calendar days "YYYY-MM-DD" ("" for none), endsOn being the last day the code works;
-- stored as starts_at = startsOn 00:00 Europe/Kyiv and ends_at = the 00:00 Europe/Kyiv after endsOn. Without
-- those keys the older ISO startsAt / endsAt are read as they are.
-- Without id a new code is created. Returns the saved code.
create or replace function public.admin_save_promo_code(payload jsonb, expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  new_code text := upper(btrim(coalesce(payload ->> 'code', '')));
  new_kind text := coalesce(payload ->> 'kind', '');
  new_value numeric;
  new_min numeric;
  new_starts timestamptz;
  new_ends timestamptz;
  new_max integer;
  new_note text := btrim(coalesce(payload ->> 'note', ''));
  current_row public.crm_promo_codes%rowtype;
  saved public.crm_promo_codes%rowtype;
  amount_text text;
  day_text text;
  by_days boolean;
begin
  perform public._promo_require_admin();
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані промокоду.';
  end if;
  begin
    target_id := nullif(payload ->> 'id', '')::uuid;
  exception when others then
    raise exception using errcode = '22023', message = 'Промокод не знайдено.';
  end;
  if new_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then
    raise exception using errcode = '22023', message = 'Код: від 3 до 40 латинських літер і цифр (можна «-» та «_»).';
  end if;
  if new_kind not in ('percent', 'fixed') then
    raise exception using errcode = '22023', message = 'Оберіть тип знижки: відсоток або сума.';
  end if;

  amount_text := replace(regexp_replace(coalesce(payload ->> 'value', ''), '\s', '', 'g'), ',', '.');
  if amount_text !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' or amount_text::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Вкажіть розмір знижки — число більше нуля.';
  end if;
  new_value := amount_text::numeric;
  if new_kind = 'percent' and new_value > 90 then
    raise exception using errcode = '22023', message = 'Знижка у відсотках — від 1 до 90.';
  end if;

  amount_text := replace(regexp_replace(coalesce(payload ->> 'minOrderTotal', ''), '\s', '', 'g'), ',', '.');
  if amount_text <> '' then
    if amount_text !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' or amount_text::numeric <= 0 then
      raise exception using errcode = '22023', message = 'Мінімальна сума замовлення — число більше нуля або порожньо.';
    end if;
    new_min := amount_text::numeric;
  end if;

  if coalesce(payload ->> 'maxUses', '') <> '' then
    if (payload ->> 'maxUses') !~ '^[0-9]{1,6}$' or (payload ->> 'maxUses')::integer < 1 then
      raise exception using errcode = '22023', message = 'Ліміт використань — ціле число від 1 або порожньо.';
    end if;
    new_max := (payload ->> 'maxUses')::integer;
  end if;

  by_days := payload ? 'startsOn' or payload ? 'endsOn';
  begin
    if payload ? 'startsOn' then
      day_text := btrim(coalesce(payload ->> 'startsOn', ''));
      if day_text <> '' and day_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'bad day';
      end if;
      new_starts := nullif(day_text, '')::date::timestamp at time zone 'Europe/Kyiv';
    else
      new_starts := nullif(payload ->> 'startsAt', '')::timestamptz;
    end if;
    if payload ? 'endsOn' then
      day_text := btrim(coalesce(payload ->> 'endsOn', ''));
      if day_text <> '' and day_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'bad day';
      end if;
      new_ends := (nullif(day_text, '')::date + 1)::timestamp at time zone 'Europe/Kyiv';
    else
      new_ends := nullif(payload ->> 'endsAt', '')::timestamptz;
    end if;
  exception when others then
    raise exception using errcode = '22023', message = 'Перевірте дати дії промокоду.';
  end;
  if new_starts is not null and new_ends is not null and new_ends <= new_starts then
    raise exception using errcode = '22023', message = case when by_days
      then 'Дата «Діє до» не може бути раніше за дату «Діє з».'
      else 'Дата завершення має бути пізніше за дату початку.' end;
  end if;
  if char_length(new_note) > 500 then
    raise exception using errcode = '22023', message = 'Нотатка — до 500 символів.';
  end if;

  if target_id is null then
    if exists (select 1 from public.crm_promo_codes promo where promo.code = new_code) then
      raise exception using errcode = '23505', message = 'Промокод з таким кодом уже є.';
    end if;
    insert into public.crm_promo_codes (code, kind, value, min_order_total, starts_at, ends_at, max_uses, active, note, created_by)
    values (new_code, new_kind, new_value, new_min, new_starts, new_ends, new_max,
      coalesce((payload ->> 'active')::boolean, true), new_note, auth.uid())
    returning * into saved;
    return public._promo_code_json(saved);
  end if;

  select * into current_row from public.crm_promo_codes promo where promo.internal_id = target_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Промокод не знайдено.';
  end if;
  if expected_updated_at is not null and current_row.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Промокод уже змінив інший працівник. Оновіть сторінку.';
  end if;
  -- Orders keep the code as text: a used code cannot be renamed.
  if new_code <> current_row.code and current_row.used_count > 0 then
    raise exception using errcode = '22023', message = 'Код уже використано в замовленнях — його не можна перейменувати. Створіть новий.';
  end if;
  if new_code <> current_row.code and exists (select 1 from public.crm_promo_codes promo where promo.code = new_code) then
    raise exception using errcode = '23505', message = 'Промокод з таким кодом уже є.';
  end if;
  update public.crm_promo_codes set
    code = new_code, kind = new_kind, value = new_value, min_order_total = new_min,
    starts_at = new_starts, ends_at = new_ends, max_uses = new_max,
    active = coalesce((payload ->> 'active')::boolean, current_row.active), note = new_note, updated_at = now()
  where internal_id = target_id
  returning * into saved;
  return public._promo_code_json(saved);
end;
$$;

-- A code used in orders is switched off rather than deleted (the orders keep pointing at it).
create or replace function public.admin_delete_promo_code(promo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.crm_promo_codes%rowtype;
begin
  perform public._promo_require_admin();
  select * into target from public.crm_promo_codes promo where promo.internal_id = promo_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Промокод не знайдено.';
  end if;
  if target.used_count > 0 or exists (select 1 from public.crm_orders crm_order where crm_order.promo_code = target.code) then
    update public.crm_promo_codes set active = false, updated_at = now() where internal_id = promo_id;
    return jsonb_build_object('deleted', false, 'deactivated', true);
  end if;
  delete from public.crm_promo_codes where internal_id = promo_id;
  return jsonb_build_object('deleted', true, 'deactivated', false);
end;
$$;

revoke all on function public.admin_list_promo_codes() from public, anon;
revoke all on function public.admin_save_promo_code(jsonb, timestamptz) from public, anon;
revoke all on function public.admin_delete_promo_code(uuid) from public, anon;
grant execute on function public.admin_list_promo_codes() to authenticated;
grant execute on function public.admin_save_promo_code(jsonb, timestamptz) to authenticated;
grant execute on function public.admin_delete_promo_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff and customer order views: same as before plus the promo fields
-- (admin_crm_get_order and admin_crm_export_orders from 20261002000700, admin_crm_list_orders from
-- 20261001000200, _customer_order_json from 20261002001700).
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
      'promoCode', target.promo_code,
      'promoKind', target.promo_kind,
      'promoValue', target.promo_value,
      'discountAmount', target.discount_amount,
      'totalDue', target.items_total - target.discount_amount,
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

create or replace function public.admin_crm_list_orders(
  query_text text default null,
  filter_status public.crm_order_status default null,
  page_number integer default 1,
  page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := nullif(btrim(coalesce(query_text, '')), '');
  query_digits text := regexp_replace(coalesce(query_text, ''), '[^0-9]', '', 'g');
  safe_size integer := greatest(1, least(coalesce(page_size, 50), 100));
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
      'status', page_rows.status,
      'source', page_rows.source,
      'contactName', page_rows.contact_name,
      'contactPhone', page_rows.contact_phone,
      'deliveryMethod', page_rows.delivery_method,
      'deliveryCity', page_rows.delivery_city,
      'itemsCount', page_rows.items_count,
      'itemsTotal', page_rows.items_total,
      'discountAmount', page_rows.discount_amount,
      'promoCode', page_rows.promo_code,
      'hasUnpricedItems', page_rows.has_unpriced_items,
      'assignedTo', public._crm_staff_name(page_rows.assigned_to),
      'createdAt', page_rows.created_at,
      'updatedAt', page_rows.updated_at
    ) order by page_rows.created_at desc)
    from (select * from filtered order by created_at desc
      offset (safe_page - 1) * safe_size limit safe_size) page_rows), '[]'::jsonb)
  into total, result_rows;

  return jsonb_build_object('total', total, 'page', safe_page, 'pageSize', safe_size, 'orders', result_rows);
end;
$$;

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
      'discountAmount', page_rows.discount_amount,
      'promoCode', page_rows.promo_code,
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

create or replace function public._customer_order_json(target_order public.crm_orders, with_contacts boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', target_order.number,
    'createdAt', target_order.created_at,
    'updatedAt', target_order.updated_at,
    'status', target_order.status,
    'source', target_order.source,
    'deliveryMethod', target_order.delivery_method,
    'deliveryCity', target_order.delivery_city,
    'deliveryPoint', target_order.delivery_point,
    'itemsCount', target_order.items_count,
    'itemsTotal', target_order.items_total,
    'hasUnpricedItems', target_order.has_unpriced_items,
    'promoCode', target_order.promo_code,
    'discountAmount', target_order.discount_amount,
    'totalDue', target_order.items_total - target_order.discount_amount,
    'currency', target_order.currency,
    'items', public._customer_order_items_json(target_order.internal_id)
  ) || case when with_contacts then jsonb_build_object(
    'contactName', target_order.contact_name,
    'contactPhone', target_order.contact_phone,
    'contactEmail', target_order.contact_email,
    'customerComment', target_order.customer_comment
  ) else '{}'::jsonb end
$$;

-- ---------------------------------------------------------------------------
-- Staff: remove the promo code from an open order
-- ---------------------------------------------------------------------------
-- The trigger sets discount_amount to 0; the use goes back to the code; the timeline names the code.
-- Returns admin_crm_get_order(order_number).
create or replace function public.admin_crm_remove_order_promo(order_number bigint, expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.crm_orders%rowtype;
begin
  perform public._crm_require_staff();

  select * into target from public.crm_orders where number = order_number for update;
  if not found then raise exception using errcode = 'P0002', message = 'Замовлення не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Замовлення вже змінив інший працівник. Оновіть сторінку.';
  end if;
  if target.promo_code is null then
    raise exception using errcode = '22023', message = 'Замовлення без промокоду.';
  end if;
  if target.status in ('completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Знижку виконаного або скасованого замовлення не змінюють. Спершу змініть статус.';
  end if;

  update public.crm_orders set
    promo_code = null, promo_kind = null, promo_value = null, discount_base = null, updated_at = now()
  where internal_id = target.internal_id;
  -- Orders keep the code as text (a used code cannot be renamed).
  update public.crm_promo_codes set used_count = greatest(used_count - 1, 0) where code = target.promo_code;

  insert into public.crm_activity (customer_id, order_id, actor_id, kind, body, data)
  values (target.customer_id, target.internal_id, auth.uid(), 'update',
    'Прибрано промокод ' || target.promo_code || ' (знижка '
      || replace(to_char(target.discount_amount, 'FM9999999990.00'), '.', ',') || ' грн)',
    jsonb_build_object('promo', jsonb_build_object('code', target.promo_code, 'kind', target.promo_kind,
      'value', target.promo_value, 'discount', target.discount_amount)));

  perform public._crm_refresh_customer_stats(target.customer_id);
  return public.admin_crm_get_order(order_number);
end;
$$;

revoke all on function public.admin_crm_remove_order_promo(bigint, timestamptz) from public, anon;
grant execute on function public.admin_crm_remove_order_promo(bigint, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer totals net of the discount: same as before except the summed amount
-- (_crm_refresh_customer_stats and admin_crm_overview from 20261001000200, admin_crm_get_customer from
-- 20261002001700, which also gains discountAmount and promoCode on its order rows).
-- ---------------------------------------------------------------------------
create or replace function public._crm_refresh_customer_stats(target_customer uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.crm_customers customer set
    orders_count = (select count(*) from public.crm_orders o where o.customer_id = customer.internal_id),
    leads_count = (select count(*) from public.crm_leads l where l.customer_id = customer.internal_id),
    orders_total = coalesce((select sum(o.items_total - o.discount_amount) from public.crm_orders o
      where o.customer_id = customer.internal_id and o.status <> 'cancelled'), 0),
    last_activity_at = greatest(customer.last_activity_at,
      coalesce((select max(o.updated_at) from public.crm_orders o where o.customer_id = customer.internal_id), customer.last_activity_at),
      coalesce((select max(l.updated_at) from public.crm_leads l where l.customer_id = customer.internal_id), customer.last_activity_at))
  where customer.internal_id = target_customer
$$;
revoke all on function public._crm_refresh_customer_stats(uuid) from public, anon, authenticated;

create or replace function public.admin_crm_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._crm_require_staff();
  return jsonb_build_object(
    'newOrders', (select count(*) from public.crm_orders where status = 'new'),
    'activeOrders', (select count(*) from public.crm_orders where status in ('confirmed', 'processing', 'shipped')),
    'ordersToday', (select count(*) from public.crm_orders where created_at >= date_trunc('day', now() at time zone 'Europe/Kyiv') at time zone 'Europe/Kyiv'),
    'revenue30d', (select coalesce(sum(items_total - discount_amount), 0) from public.crm_orders
      where status = 'completed' and created_at >= now() - interval '30 days'),
    'newLeads', (select count(*) from public.crm_leads where status = 'new'),
    'customers', (select count(*) from public.crm_customers)
  );
end;
$$;

create or replace function public.admin_crm_get_customer(customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.crm_customers%rowtype;
begin
  perform public._crm_require_staff();
  select * into target from public.crm_customers where internal_id = customer_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', target.internal_id,
      'name', target.name,
      'phone', target.phone,
      'email', target.email,
      'company', target.company,
      'city', target.city,
      'notes', target.notes,
      'ordersCount', target.orders_count,
      'leadsCount', target.leads_count,
      'ordersTotal', target.orders_total,
      'lastActivityAt', target.last_activity_at,
      'createdAt', target.created_at,
      'updatedAt', target.updated_at,
      'hasAccount', exists (select 1 from public.customer_profiles profile where profile.crm_customer_id = target.internal_id),
      'accountSince', (select min(profile.created_at) from public.customer_profiles profile where profile.crm_customer_id = target.internal_id)
    ),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
        'number', crm_order.number, 'status', crm_order.status, 'itemsCount', crm_order.items_count,
        'itemsTotal', crm_order.items_total, 'discountAmount', crm_order.discount_amount,
        'promoCode', crm_order.promo_code, 'hasUnpricedItems', crm_order.has_unpriced_items,
        'createdAt', crm_order.created_at
      ) order by crm_order.created_at desc)
      from public.crm_orders crm_order where crm_order.customer_id = target.internal_id), '[]'::jsonb),
    'leads', coalesce((select jsonb_agg(jsonb_build_object(
        'number', lead.number, 'type', lead.type, 'status', lead.status,
        'preview', left(coalesce(nullif(lead.subject, ''), lead.message), 140), 'createdAt', lead.created_at
      ) order by lead.created_at desc)
      from public.crm_leads lead where lead.customer_id = target.internal_id), '[]'::jsonb),
    'activity', public._crm_activity_json(null, null, target.internal_id, 100)
  );
end;
$$;

-- One-off: customers with a discounted order get their totals recounted (nothing to do on a fresh apply).
do $$
begin
  perform public._crm_refresh_customer_stats(discounted.customer_id)
  from (select distinct crm_order.customer_id from public.crm_orders crm_order
    where crm_order.discount_amount > 0) discounted;
end;
$$;
