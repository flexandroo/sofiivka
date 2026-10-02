-- Customer accounts v1: storefront sign-in (Supabase Auth, email + password), profile and order history.
--
-- Access model
--   * Customers are ordinary Supabase Auth users WITHOUT an admin_profiles row. Every admin_* RPC and every
--     staff RLS policy keeps checking admin_profiles (is_active_admin / current_admin_role), so a customer
--     account never grants staff access.
--   * customer_profiles has RLS on and no table grants: customers read and change only their own row,
--     through customer_* RPCs (security definer, keyed by auth.uid()).
--   * Order history = orders placed while signed in (crm_orders.customer_user_id) plus orders whose contact
--     email equals the account's CONFIRMED email. A self-entered phone number never unlocks history, so
--     the Supabase "Confirm email" setting must stay on (see the report / docs).
--   * crm_customers link (customer_profiles.crm_customer_id) is informational for staff ("has an account"):
--     set on the first signed-in order (the order's CRM card, deduplicated by phone as before) or, on first
--     sign-in, to the single CRM card with the same confirmed email.
--   * crm_submit_order keeps its signature and anonymous behaviour; when the caller is signed in it also
--     records the auth user on the order and fills empty profile fields from it.
--
-- NOTE for the Supabase connector: crm_submit_order contains a `delete from` statement in its body.
-- Apply this file through the Supabase SQL Editor if the connector times out.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table public.customer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  crm_customer_id uuid references public.crm_customers (internal_id) on delete set null,
  name text not null default '' check (char_length(name) <= 160),
  phone text check (phone is null or phone ~ '^\+[0-9]{10,15}$'),
  delivery_city text check (delivery_city is null or char_length(delivery_city) <= 120),
  delivery_point text check (delivery_point is null or char_length(delivery_point) <= 240),
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_profiles_crm_customer_idx on public.customer_profiles (crm_customer_id);

create trigger customer_profiles_updated_at before update on public.customer_profiles
  for each row execute function public.set_updated_at();

alter table public.customer_profiles enable row level security;
revoke all on table public.customer_profiles from public, anon, authenticated;

alter table public.crm_orders
  add column customer_user_id uuid references auth.users (id) on delete set null;
create index crm_orders_customer_user_idx on public.crm_orders (customer_user_id, created_at desc)
  where customer_user_id is not null;
create index crm_orders_contact_email_idx on public.crm_orders (lower(contact_email), created_at desc)
  where contact_email is not null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._customer_require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not exists (select 1 from auth.users account where account.id = caller) then
    raise exception using errcode = '42501', message = 'Увійдіть до особистого кабінету.';
  end if;
  return caller;
end;
$$;

-- The account email, only once the customer has confirmed it.
create or replace function public._customer_confirmed_email(target_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(btrim(account.email)), '')
  from auth.users account
  where account.id = target_user and account.email_confirmed_at is not null
$$;

-- Creates the profile on first use. Name comes from the sign-up form (user metadata); the CRM card is
-- linked when exactly one card carries the same confirmed email.
create or replace function public._customer_ensure_profile(target_user uuid)
returns public.customer_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.customer_profiles%rowtype;
  confirmed_email text := public._customer_confirmed_email(target_user);
  matched uuid;
  signup_name text;
begin
  select * into profile from public.customer_profiles where user_id = target_user;
  if found then
    if profile.crm_customer_id is null and confirmed_email is not null then
      select min(customer.internal_id::text)::uuid into matched from public.crm_customers customer
      where lower(customer.email) = confirmed_email
      having count(*) = 1;
      if matched is not null then
        update public.customer_profiles set crm_customer_id = matched where user_id = target_user
        returning * into profile;
      end if;
    end if;
    return profile;
  end if;

  select public._crm_clean_text(account.raw_user_meta_data ->> 'name', 160) into signup_name
  from auth.users account where account.id = target_user;

  if confirmed_email is not null then
    select min(customer.internal_id::text)::uuid into matched from public.crm_customers customer
    where lower(customer.email) = confirmed_email
    having count(*) = 1;
  end if;

  insert into public.customer_profiles (user_id, crm_customer_id, name)
  values (target_user, matched, coalesce(signup_name, ''))
  on conflict (user_id) do nothing;

  select * into profile from public.customer_profiles where user_id = target_user;
  return profile;
end;
$$;

create or replace function public._customer_profile_json(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', account.email,
    'emailConfirmed', account.email_confirmed_at is not null,
    'name', profile.name,
    'phone', profile.phone,
    'deliveryCity', profile.delivery_city,
    'deliveryPoint', profile.delivery_point,
    'marketingConsent', profile.marketing_consent,
    'createdAt', profile.created_at,
    'updatedAt', profile.updated_at
  )
  from public.customer_profiles profile
  join auth.users account on account.id = profile.user_id
  where profile.user_id = target_user
$$;

-- Orders the account may see. Staff-only fields (manager comment, assignee, activity) are never exposed.
create or replace function public._customer_visible_order(target_user uuid, target_order public.crm_orders)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce: a NULL here must mean "not visible", never "unknown".
  select coalesce(target_order.customer_user_id = target_user, false)
    or coalesce(lower(target_order.contact_email) = public._customer_confirmed_email(target_user), false)
$$;

create or replace function public._customer_order_items_json(target_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'productId', item.legacy_id,
      'sku', item.sku,
      'title', item.title,
      'brandName', item.brand_name,
      'quantity', item.quantity,
      'unitAmount', item.unit_amount,
      'lineTotal', item.line_total,
      'available', coalesce(product.publication_status = 'published', false)
    ) order by item.position), '[]'::jsonb)
  from public.crm_order_items item
  left join public.products product on product.internal_id = item.product_id
  where item.order_id = target_order
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
    'currency', target_order.currency,
    'items', public._customer_order_items_json(target_order.internal_id)
  ) || case when with_contacts then jsonb_build_object(
    'contactName', target_order.contact_name,
    'contactPhone', target_order.contact_phone,
    'contactEmail', target_order.contact_email,
    'customerComment', target_order.customer_comment
  ) else '{}'::jsonb end
$$;

-- Called by crm_submit_order for a signed-in customer: links the CRM card and fills empty profile fields.
create or replace function public._customer_link_order(
  target_user uuid, crm_customer uuid, order_name text, order_phone text, order_city text, order_point text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._customer_ensure_profile(target_user);
  update public.customer_profiles profile set
    crm_customer_id = coalesce(profile.crm_customer_id, crm_customer),
    name = case when profile.name = '' then coalesce(order_name, '') else profile.name end,
    phone = coalesce(profile.phone, order_phone),
    delivery_city = coalesce(profile.delivery_city, order_city),
    delivery_point = case when profile.delivery_city is null and profile.delivery_point is null then order_point
      else profile.delivery_point end
  where profile.user_id = target_user;
end;
$$;

revoke all on function public._customer_require_user() from public, anon, authenticated;
revoke all on function public._customer_confirmed_email(uuid) from public, anon, authenticated;
revoke all on function public._customer_ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public._customer_profile_json(uuid) from public, anon, authenticated;
revoke all on function public._customer_visible_order(uuid, public.crm_orders) from public, anon, authenticated;
revoke all on function public._customer_order_items_json(uuid) from public, anon, authenticated;
revoke all on function public._customer_order_json(public.crm_orders, boolean) from public, anon, authenticated;
revoke all on function public._customer_link_order(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer RPCs (authenticated, caller only)
-- ---------------------------------------------------------------------------
-- { profile, orders: [{ number, createdAt, status, itemsCount, itemsTotal, hasUnpricedItems, items: [...] }] }
create or replace function public.customer_get_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := public._customer_require_user();
  confirmed_email text;
begin
  perform public._customer_ensure_profile(caller);
  confirmed_email := public._customer_confirmed_email(caller);
  return jsonb_build_object(
    'profile', public._customer_profile_json(caller),
    'orders', coalesce((select jsonb_agg(public._customer_order_json(visible, false) order by visible.created_at desc)
      from (select crm_order.* from public.crm_orders crm_order
        where crm_order.customer_user_id = caller
          or (confirmed_email is not null and lower(crm_order.contact_email) = confirmed_email)
        order by crm_order.created_at desc limit 100) visible), '[]'::jsonb)
  );
end;
$$;

-- One order with contacts and delivery; "not found" for orders of other customers.
create or replace function public.customer_get_order(order_number bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := public._customer_require_user();
  target public.crm_orders%rowtype;
begin
  select * into target from public.crm_orders crm_order where crm_order.number = order_number;
  if not found or not coalesce(public._customer_visible_order(caller, target), false) then
    raise exception using errcode = 'P0002', message = 'Замовлення не знайдено.';
  end if;
  return jsonb_build_object('order', public._customer_order_json(target, true));
end;
$$;

-- patch: { name?, phone?, deliveryCity?, deliveryPoint?, marketingConsent? }; returns { profile }.
create or replace function public.customer_update_profile(patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := public._customer_require_user();
  target public.customer_profiles%rowtype;
  phone_raw text;
begin
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані профілю.';
  end if;
  perform public._customer_ensure_profile(caller);
  select * into target from public.customer_profiles where user_id = caller for update;

  if patch ? 'name' then
    target.name := coalesce(public._crm_clean_text(patch ->> 'name', 160), '');
  end if;
  if patch ? 'phone' then
    phone_raw := public._crm_clean_text(patch ->> 'phone', 40);
    if phone_raw is null then
      target.phone := null;
    else
      target.phone := public._crm_normalize_phone(phone_raw);
      if target.phone is null then
        raise exception using errcode = '22023', message = 'Вкажіть коректний номер телефону.';
      end if;
    end if;
  end if;
  if patch ? 'deliveryCity' then target.delivery_city := public._crm_clean_text(patch ->> 'deliveryCity', 120); end if;
  if patch ? 'deliveryPoint' then target.delivery_point := public._crm_clean_text(patch ->> 'deliveryPoint', 240); end if;
  if patch ? 'marketingConsent' then
    if jsonb_typeof(patch -> 'marketingConsent') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Некоректне значення згоди на розсилку.';
    end if;
    if (patch ->> 'marketingConsent')::boolean is distinct from target.marketing_consent then
      target.marketing_consent := (patch ->> 'marketingConsent')::boolean;
      target.marketing_consent_at := case when target.marketing_consent then now() else null end;
    end if;
  end if;

  update public.customer_profiles set
    name = target.name, phone = target.phone, delivery_city = target.delivery_city,
    delivery_point = target.delivery_point, marketing_consent = target.marketing_consent,
    marketing_consent_at = target.marketing_consent_at
  where user_id = caller;

  return jsonb_build_object('profile', public._customer_profile_json(caller));
end;
$$;

revoke all on function public.customer_get_account() from public, anon;
revoke all on function public.customer_get_order(bigint) from public, anon;
revoke all on function public.customer_update_profile(jsonb) from public, anon;
grant execute on function public.customer_get_account() to authenticated;
grant execute on function public.customer_get_order(bigint) to authenticated;
grant execute on function public.customer_update_profile(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storefront checkout: same as 20261002000300 plus the signed-in customer link.
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

  update public.crm_orders set
    items_count = totals.items_count,
    items_total = totals.items_total,
    has_unpriced_items = coalesce(totals.has_unpriced, false)
  where internal_id = new_order_id;

  insert into public.crm_activity (customer_id, order_id, kind, body)
  values (customer, new_order_id, 'created',
    case when signed_in_user is null then 'Замовлення з сайту' else 'Замовлення з сайту (особистий кабінет)' end);

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
    'currency', 'UAH'
  );
end;
$$;

revoke all on function public.crm_submit_order(jsonb) from public;
grant execute on function public.crm_submit_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: customers list / card show whether the customer has a storefront account.
-- Same as 20261001000200 plus "hasAccount".
-- ---------------------------------------------------------------------------
create or replace function public.admin_crm_list_customers(
  query_text text default null,
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
    select customer.* from public.crm_customers customer
    where normalized_query is null
      or customer.name ilike '%' || normalized_query || '%'
      or coalesce(customer.email, '') ilike '%' || normalized_query || '%'
      or coalesce(customer.company, '') ilike '%' || normalized_query || '%'
      or (char_length(query_digits) >= 5 and customer.phone like '%' || query_digits || '%')
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', page_rows.internal_id,
      'name', page_rows.name,
      'phone', page_rows.phone,
      'email', page_rows.email,
      'company', page_rows.company,
      'city', page_rows.city,
      'ordersCount', page_rows.orders_count,
      'leadsCount', page_rows.leads_count,
      'ordersTotal', page_rows.orders_total,
      'lastActivityAt', page_rows.last_activity_at,
      'hasAccount', exists (select 1 from public.customer_profiles profile where profile.crm_customer_id = page_rows.internal_id)
    ) order by page_rows.last_activity_at desc)
    from (select * from filtered order by last_activity_at desc
      offset (safe_page - 1) * safe_size limit safe_size) page_rows), '[]'::jsonb)
  into total, result_rows;

  return jsonb_build_object('total', total, 'page', safe_page, 'pageSize', safe_size, 'customers', result_rows);
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
        'itemsTotal', crm_order.items_total, 'hasUnpricedItems', crm_order.has_unpriced_items,
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

revoke all on function public.admin_crm_list_customers(text, integer, integer) from public, anon;
revoke all on function public.admin_crm_get_customer(uuid) from public, anon;
grant execute on function public.admin_crm_list_customers(text, integer, integer) to authenticated;
grant execute on function public.admin_crm_get_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hardening: with open customer sign-up every visitor can hold an `authenticated` token.
-- admin_create_product compared a NULL role with NOT IN, which let a user without an admin profile
-- through. Same function as 20260929000600 with an explicit NULL check.
-- ---------------------------------------------------------------------------
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
begin
  if role_value is null or role_value not in ('owner', 'admin', 'manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if coalesce(title_value, '') = '' or coalesce(sku_value, '') = '' or coalesce(model_value, '') = '' then
    raise exception 'Title, SKU and model are required';
  end if;
  if not exists (select 1 from public.brands where internal_id = brand_value and status <> 'archived') then raise exception 'Brand not found'; end if;
  if not exists (select 1 from public.categories where internal_id = category_value and status <> 'archived') then raise exception 'Category not found'; end if;

  insert into public.products (
    internal_id, legacy_id, sku, slug, title, short_title, model, brand_id,
    primary_category_id, publication_status, price_status, inventory_status,
    created_by, updated_by
  ) values (
    product_id, legacy_value, sku_value, 'manual-' || substr(legacy_value, 8),
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
