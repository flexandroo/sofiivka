-- CRM v1: customers, orders, leads and an activity timeline.
--
-- Access model
--   * Storefront (anon) can only call crm_submit_order / crm_submit_lead.
--     Prices, titles and SKUs are taken from the catalogue on the server, never from the browser.
--   * Staff read and change CRM data only through admin_crm_* RPCs.
--     owner / admin / manager may work with CRM; content_manager may not.
--   * All crm_* tables have RLS enabled and no table grants for anon/authenticated.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.crm_order_status as enum ('new', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled');
create type public.crm_lead_type as enum ('contact', 'partner_spec', 'callback');
create type public.crm_lead_status as enum ('new', 'in_progress', 'done', 'spam');
create type public.crm_delivery_method as enum ('carrier', 'pickup');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.crm_customers (
  internal_id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+[0-9]{10,15}$'),
  name text not null default '' check (char_length(name) <= 160),
  email text check (email is null or char_length(email) <= 254),
  company text check (company is null or char_length(company) <= 200),
  city text check (city is null or char_length(city) <= 120),
  notes text not null default '' check (char_length(notes) <= 8000),
  orders_count integer not null default 0 check (orders_count >= 0),
  leads_count integer not null default 0 check (leads_count >= 0),
  orders_total numeric(14, 2) not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.crm_order_number_seq start with 1001;
create sequence public.crm_lead_number_seq start with 1001;

create table public.crm_orders (
  internal_id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.crm_order_number_seq'),
  customer_id uuid not null references public.crm_customers (internal_id) on delete restrict,
  status public.crm_order_status not null default 'new',
  source text not null default 'website' check (source in ('website', 'manual')),
  contact_name text not null check (char_length(contact_name) between 2 and 160),
  contact_phone text not null check (contact_phone ~ '^\+[0-9]{10,15}$'),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  delivery_method public.crm_delivery_method not null default 'carrier',
  delivery_city text check (delivery_city is null or char_length(delivery_city) <= 120),
  delivery_point text check (delivery_point is null or char_length(delivery_point) <= 240),
  customer_comment text not null default '' check (char_length(customer_comment) <= 4000),
  manager_comment text not null default '' check (char_length(manager_comment) <= 8000),
  items_count integer not null default 0 check (items_count >= 0),
  items_total numeric(14, 2) not null default 0 check (items_total >= 0),
  has_unpriced_items boolean not null default false,
  currency varchar(3) not null default 'UAH',
  assigned_to uuid references auth.users (id) on delete set null,
  client_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_order_items (
  internal_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.crm_orders (internal_id) on delete cascade,
  position integer not null check (position >= 0),
  product_id uuid references public.products (internal_id) on delete set null,
  legacy_id text not null,
  sku text not null default '',
  title text not null,
  brand_name text not null default '',
  quantity integer not null check (quantity between 1 and 999),
  unit_amount numeric(14, 2) check (unit_amount is null or unit_amount > 0),
  price_status public.product_price_status not null,
  line_total numeric(14, 2) check (line_total is null or line_total >= 0),
  unique (order_id, position)
);

create table public.crm_leads (
  internal_id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.crm_lead_number_seq'),
  customer_id uuid not null references public.crm_customers (internal_id) on delete restrict,
  type public.crm_lead_type not null,
  status public.crm_lead_status not null default 'new',
  contact_name text not null check (char_length(contact_name) between 2 and 160),
  contact_phone text not null check (contact_phone ~ '^\+[0-9]{10,15}$'),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  company text check (company is null or char_length(company) <= 200),
  subject text not null default '' check (char_length(subject) <= 240),
  message text not null default '' check (char_length(message) <= 8000),
  spec_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(spec_lines) = 'array'),
  page_url text check (page_url is null or char_length(page_url) <= 500),
  manager_comment text not null default '' check (char_length(manager_comment) <= 8000),
  assigned_to uuid references auth.users (id) on delete set null,
  client_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_activity (
  internal_id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers (internal_id) on delete cascade,
  order_id uuid references public.crm_orders (internal_id) on delete cascade,
  lead_id uuid references public.crm_leads (internal_id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('created', 'status', 'note', 'update')),
  body text not null default '' check (char_length(body) <= 4000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  check (num_nonnulls(customer_id, order_id, lead_id) >= 1)
);

-- Rate limiting for anonymous submissions.
create table public.crm_submission_log (
  internal_id bigint generated always as identity primary key,
  kind text not null check (kind in ('order', 'lead')),
  phone text,
  client_fingerprint text,
  created_at timestamptz not null default now()
);

create index crm_orders_status_created_idx on public.crm_orders (status, created_at desc);
create index crm_orders_created_idx on public.crm_orders (created_at desc);
create index crm_orders_customer_idx on public.crm_orders (customer_id, created_at desc);
create index crm_order_items_order_idx on public.crm_order_items (order_id, position);
create index crm_leads_status_created_idx on public.crm_leads (status, created_at desc);
create index crm_leads_customer_idx on public.crm_leads (customer_id, created_at desc);
create index crm_customers_activity_idx on public.crm_customers (last_activity_at desc);
create index crm_activity_order_idx on public.crm_activity (order_id, created_at desc);
create index crm_activity_lead_idx on public.crm_activity (lead_id, created_at desc);
create index crm_activity_customer_idx on public.crm_activity (customer_id, created_at desc);
create index crm_submission_log_phone_idx on public.crm_submission_log (phone, created_at desc);
create index crm_submission_log_fingerprint_idx on public.crm_submission_log (client_fingerprint, created_at desc);

create trigger crm_customers_updated_at before update on public.crm_customers
  for each row execute function public.set_updated_at();
create trigger crm_orders_updated_at before update on public.crm_orders
  for each row execute function public.set_updated_at();
create trigger crm_leads_updated_at before update on public.crm_leads
  for each row execute function public.set_updated_at();

alter table public.crm_customers enable row level security;
alter table public.crm_orders enable row level security;
alter table public.crm_order_items enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_activity enable row level security;
alter table public.crm_submission_log enable row level security;

revoke all on table public.crm_customers, public.crm_orders, public.crm_order_items,
  public.crm_leads, public.crm_activity, public.crm_submission_log
from public, anon, authenticated;
revoke all on sequence public.crm_order_number_seq, public.crm_lead_number_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_crm()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_admin_role() in ('owner', 'admin', 'manager'), false)
$$;
revoke all on function public.can_manage_crm() from public, anon;
grant execute on function public.can_manage_crm() to authenticated;

-- Ukrainian numbers are normalised to +380XXXXXXXXX; other international numbers keep their digits.
create or replace function public._crm_normalize_phone(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g');
begin
  if char_length(digits) = 10 and left(digits, 1) = '0' then digits := '38' || digits;
  elsif char_length(digits) = 11 and left(digits, 2) = '80' then digits := '3' || digits;
  elsif char_length(digits) = 9 then digits := '380' || digits;
  end if;
  if char_length(digits) between 10 and 15 then return '+' || digits; end if;
  return null;
end;
$$;

create or replace function public._crm_clean_text(raw text, maximum integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(raw, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), maximum), '')
$$;

create or replace function public._crm_clean_email(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text := lower(btrim(coalesce(raw, '')));
begin
  if value = '' then return null; end if;
  if char_length(value) > 254 or value !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = '22023', message = 'Перевірте email.';
  end if;
  return value;
end;
$$;

-- Hash of the caller's IP (from the API gateway headers). Never stores the raw address.
create or replace function public._crm_client_fingerprint()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  headers jsonb;
  address text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  address := split_part(coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''), ',', 1);
  if btrim(address) = '' then return null; end if;
  return encode(extensions.digest('sofievka-crm:' || btrim(address), 'sha256'), 'hex');
end;
$$;

create or replace function public._crm_enforce_rate_limit(submission_kind text, normalized_phone text, fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.crm_submission_log where created_at < now() - interval '2 days';

  if (select count(*) from public.crm_submission_log
      where phone = normalized_phone and kind = submission_kind and created_at > now() - interval '1 hour') >= 5 then
    raise exception using errcode = '54000', message = 'Забагато звернень з цього номера. Спробуйте пізніше або зателефонуйте нам.';
  end if;
  if fingerprint is not null and (select count(*) from public.crm_submission_log
      where client_fingerprint = fingerprint and created_at > now() - interval '1 hour') >= 20 then
    raise exception using errcode = '54000', message = 'Забагато звернень. Спробуйте пізніше або зателефонуйте нам.';
  end if;

  insert into public.crm_submission_log (kind, phone, client_fingerprint)
  values (submission_kind, normalized_phone, fingerprint);
end;
$$;

create or replace function public._crm_upsert_customer(
  normalized_phone text, contact_name text, contact_email text, contact_company text, contact_city text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid;
begin
  insert into public.crm_customers (phone, name, email, company, city)
  values (normalized_phone, coalesce(contact_name, ''), contact_email, contact_company, contact_city)
  on conflict (phone) do update set
    name = case when public.crm_customers.name = '' then excluded.name else public.crm_customers.name end,
    email = coalesce(public.crm_customers.email, excluded.email),
    company = coalesce(public.crm_customers.company, excluded.company),
    city = coalesce(public.crm_customers.city, excluded.city),
    last_activity_at = now()
  returning internal_id into customer;
  return customer;
end;
$$;

create or replace function public._crm_refresh_customer_stats(target_customer uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.crm_customers customer set
    orders_count = (select count(*) from public.crm_orders o where o.customer_id = customer.internal_id),
    leads_count = (select count(*) from public.crm_leads l where l.customer_id = customer.internal_id),
    orders_total = coalesce((select sum(o.items_total) from public.crm_orders o
      where o.customer_id = customer.internal_id and o.status <> 'cancelled'), 0),
    last_activity_at = greatest(customer.last_activity_at,
      coalesce((select max(o.updated_at) from public.crm_orders o where o.customer_id = customer.internal_id), customer.last_activity_at),
      coalesce((select max(l.updated_at) from public.crm_leads l where l.customer_id = customer.internal_id), customer.last_activity_at))
  where customer.internal_id = target_customer
$$;

revoke all on function public._crm_normalize_phone(text) from public, anon, authenticated;
revoke all on function public._crm_clean_text(text, integer) from public, anon, authenticated;
revoke all on function public._crm_clean_email(text) from public, anon, authenticated;
revoke all on function public._crm_client_fingerprint() from public, anon, authenticated;
revoke all on function public._crm_enforce_rate_limit(text, text, text) from public, anon, authenticated;
revoke all on function public._crm_upsert_customer(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public._crm_refresh_customer_stats(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public submissions (storefront)
-- ---------------------------------------------------------------------------
-- payload: { name, phone, email?, delivery: 'carrier'|'pickup', city?, deliveryPoint?, comment?,
--            items: [{ id: legacy_id, quantity }], website?: honeypot (must be empty) }
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
    delivery_city, delivery_point, customer_comment, client_fingerprint
  ) values (
    customer, contact_name, normalized_phone, contact_email, delivery::public.crm_delivery_method,
    case when delivery = 'carrier' then city else null end,
    case when delivery = 'carrier' then delivery_point else null end,
    order_comment, fingerprint
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
  values (customer, new_order_id, 'created', 'Замовлення з сайту');

  perform public._crm_refresh_customer_stats(customer);

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

-- payload: { type: 'contact'|'partner_spec'|'callback', name, phone, email?, company?, subject?,
--            message?, specLines?: [{ code, quantity, note }], pageUrl?, website?: honeypot }
create or replace function public.crm_submit_lead(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  lead_type text := coalesce(nullif(payload ->> 'type', ''), 'contact');
  contact_name text := public._crm_clean_text(payload ->> 'name', 160);
  normalized_phone text := public._crm_normalize_phone(payload ->> 'phone');
  contact_email text := public._crm_clean_email(payload ->> 'email');
  company text := public._crm_clean_text(payload ->> 'company', 200);
  subject text := coalesce(public._crm_clean_text(payload ->> 'subject', 240), '');
  message text := coalesce(public._crm_clean_text(payload ->> 'message', 8000), '');
  page_url text := public._crm_clean_text(payload ->> 'pageUrl', 500);
  lines jsonb := '[]'::jsonb;
  fingerprint text := public._crm_client_fingerprint();
  customer uuid;
  lead_id uuid;
  lead_number bigint;
begin
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані звернення.';
  end if;
  if coalesce(payload ->> 'website', '') <> '' then
    return jsonb_build_object('accepted', true);
  end if;
  if lead_type not in ('contact', 'partner_spec', 'callback') then
    raise exception using errcode = '22023', message = 'Невідомий тип звернення.';
  end if;
  if contact_name is null or char_length(contact_name) < 2 then
    raise exception using errcode = '22023', message = 'Вкажіть ім’я.';
  end if;
  if normalized_phone is null then
    raise exception using errcode = '22023', message = 'Вкажіть коректний номер телефону.';
  end if;

  if jsonb_typeof(payload -> 'specLines') = 'array' then
    if jsonb_array_length(payload -> 'specLines') > 200 then
      raise exception using errcode = '22023', message = 'Специфікація задовга (максимум 200 рядків).';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', public._crm_clean_text(line ->> 'code', 120),
        'quantity', case when (line ->> 'quantity') ~ '^[0-9]{1,6}$' then (line ->> 'quantity')::integer end,
        'note', public._crm_clean_text(line ->> 'note', 240)
      ) order by ordinality), '[]'::jsonb)
    into lines
    from jsonb_array_elements(payload -> 'specLines') with ordinality as entry(line, ordinality)
    where public._crm_clean_text(line ->> 'code', 120) is not null;
  end if;

  if message = '' and jsonb_array_length(lines) = 0 and lead_type <> 'callback' then
    raise exception using errcode = '22023', message = 'Опишіть запит або додайте позиції.';
  end if;

  perform public._crm_enforce_rate_limit('lead', normalized_phone, fingerprint);

  customer := public._crm_upsert_customer(normalized_phone, contact_name, contact_email, company, null);

  insert into public.crm_leads (
    customer_id, type, contact_name, contact_phone, contact_email, company,
    subject, message, spec_lines, page_url, client_fingerprint
  ) values (
    customer, lead_type::public.crm_lead_type, contact_name, normalized_phone, contact_email, company,
    subject, message, lines, page_url, fingerprint
  ) returning internal_id, number into lead_id, lead_number;

  insert into public.crm_activity (customer_id, lead_id, kind, body)
  values (customer, lead_id, 'created', case lead_type
    when 'partner_spec' then 'Специфікація з сайту'
    when 'callback' then 'Запит дзвінка з сайту'
    else 'Звернення з сайту' end);

  perform public._crm_refresh_customer_stats(customer);

  return jsonb_build_object('accepted', true, 'number', lead_number);
end;
$$;

revoke all on function public.crm_submit_order(jsonb) from public;
revoke all on function public.crm_submit_lead(jsonb) from public;
grant execute on function public.crm_submit_order(jsonb) to anon, authenticated;
grant execute on function public.crm_submit_lead(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff RPCs
-- ---------------------------------------------------------------------------
create or replace function public._crm_require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_crm() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
end;
$$;
revoke all on function public._crm_require_staff() from public, anon, authenticated;

create or replace function public._crm_staff_name(user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.name from public.admin_profiles profile where profile.user_id = _crm_staff_name.user_id
$$;
revoke all on function public._crm_staff_name(uuid) from public, anon, authenticated;

create or replace function public._crm_activity_json(target_order uuid, target_lead uuid, target_customer uuid, max_rows integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', activity.internal_id,
      'kind', activity.kind,
      'body', activity.body,
      'data', activity.data,
      'actor', public._crm_staff_name(activity.actor_id),
      'orderNumber', crm_order.number,
      'leadNumber', crm_lead.number,
      'createdAt', activity.created_at
    ) order by activity.created_at desc), '[]'::jsonb)
  from (
    select * from public.crm_activity activity
    where (target_order is not null and activity.order_id = target_order)
       or (target_lead is not null and activity.lead_id = target_lead)
       or (target_customer is not null and activity.customer_id = target_customer)
    order by activity.created_at desc
    limit greatest(1, least(max_rows, 200))
  ) activity
  left join public.crm_orders crm_order on crm_order.internal_id = activity.order_id
  left join public.crm_leads crm_lead on crm_lead.internal_id = activity.lead_id
$$;
revoke all on function public._crm_activity_json(uuid, uuid, uuid, integer) from public, anon, authenticated;

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
    'revenue30d', (select coalesce(sum(items_total), 0) from public.crm_orders
      where status = 'completed' and created_at >= now() - interval '30 days'),
    'newLeads', (select count(*) from public.crm_leads where status = 'new'),
    'customers', (select count(*) from public.crm_customers)
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
      'createdAt', target.created_at,
      'updatedAt', target.updated_at
    ),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'position', item.position,
        'legacyId', item.legacy_id,
        'sku', item.sku,
        'title', item.title,
        'brand', item.brand_name,
        'quantity', item.quantity,
        'unitAmount', item.unit_amount,
        'priceStatus', item.price_status,
        'lineTotal', item.line_total,
        'productAvailable', item.product_id is not null
      ) order by item.position)
      from public.crm_order_items item where item.order_id = target.internal_id), '[]'::jsonb),
    'customer', jsonb_build_object(
      'id', customer.internal_id,
      'name', customer.name,
      'phone', customer.phone,
      'email', customer.email,
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

-- patch: { status?, managerComment?, deliveryMethod?, deliveryCity?, deliveryPoint?, assignedTo? (uuid|null) }
create or replace function public.admin_crm_update_order(order_number bigint, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.crm_orders%rowtype;
  next_status public.crm_order_status;
  changes jsonb := '{}'::jsonb;
begin
  perform public._crm_require_staff();
  if jsonb_typeof(patch) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні зміни.'; end if;

  select * into target from public.crm_orders where number = order_number for update;
  if not found then raise exception using errcode = 'P0002', message = 'Замовлення не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Замовлення вже змінив інший працівник. Оновіть сторінку.';
  end if;

  if patch ? 'status' then
    begin
      next_status := (patch ->> 'status')::public.crm_order_status;
    exception when others then
      raise exception using errcode = '22023', message = 'Невідомий статус.';
    end;
    if next_status <> target.status then
      changes := changes || jsonb_build_object('status', jsonb_build_object('from', target.status, 'to', next_status));
      target.status := next_status;
    end if;
  end if;

  if patch ? 'managerComment' then
    target.manager_comment := coalesce(public._crm_clean_text(patch ->> 'managerComment', 8000), '');
  end if;
  if patch ? 'deliveryMethod' then
    if patch ->> 'deliveryMethod' not in ('carrier', 'pickup') then
      raise exception using errcode = '22023', message = 'Невідомий спосіб доставки.';
    end if;
    target.delivery_method := (patch ->> 'deliveryMethod')::public.crm_delivery_method;
  end if;
  if patch ? 'deliveryCity' then target.delivery_city := public._crm_clean_text(patch ->> 'deliveryCity', 120); end if;
  if patch ? 'deliveryPoint' then target.delivery_point := public._crm_clean_text(patch ->> 'deliveryPoint', 240); end if;
  if patch ? 'assignedTo' then
    if nullif(patch ->> 'assignedTo', '') is null then
      target.assigned_to := null;
    elsif exists (select 1 from public.admin_profiles profile
        where profile.user_id = (patch ->> 'assignedTo')::uuid and profile.active
          and profile.role in ('owner', 'admin', 'manager')) then
      target.assigned_to := (patch ->> 'assignedTo')::uuid;
    else
      raise exception using errcode = '22023', message = 'Відповідального не знайдено.';
    end if;
  end if;

  update public.crm_orders set
    status = target.status,
    manager_comment = target.manager_comment,
    delivery_method = target.delivery_method,
    delivery_city = target.delivery_city,
    delivery_point = target.delivery_point,
    assigned_to = target.assigned_to
  where internal_id = target.internal_id
  returning updated_at into target.updated_at;

  insert into public.crm_activity (customer_id, order_id, actor_id, kind, body, data)
  values (target.customer_id, target.internal_id, auth.uid(),
    case when changes ? 'status' then 'status' else 'update' end,
    case when changes ? 'status' then 'Статус змінено' else 'Замовлення оновлено' end,
    changes);

  perform public._crm_refresh_customer_stats(target.customer_id);
  return public.admin_crm_get_order(order_number);
end;
$$;

create or replace function public.admin_crm_list_leads(
  query_text text default null,
  filter_status public.crm_lead_status default null,
  filter_type public.crm_lead_type default null,
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
    select lead.* from public.crm_leads lead
    where (filter_status is null or lead.status = filter_status)
      and (filter_type is null or lead.type = filter_type)
      and (normalized_query is null
        or lead.number::text = query_digits
        or lead.contact_name ilike '%' || normalized_query || '%'
        or coalesce(lead.company, '') ilike '%' || normalized_query || '%'
        or lead.message ilike '%' || normalized_query || '%'
        or (char_length(query_digits) >= 5 and lead.contact_phone like '%' || query_digits || '%'))
  )
  select (select count(*) from filtered),
    coalesce((select jsonb_agg(jsonb_build_object(
      'number', page_rows.number,
      'type', page_rows.type,
      'status', page_rows.status,
      'contactName', page_rows.contact_name,
      'contactPhone', page_rows.contact_phone,
      'company', page_rows.company,
      'preview', left(coalesce(nullif(page_rows.subject, ''), page_rows.message), 140),
      'specLinesCount', jsonb_array_length(page_rows.spec_lines),
      'assignedTo', public._crm_staff_name(page_rows.assigned_to),
      'createdAt', page_rows.created_at
    ) order by page_rows.created_at desc)
    from (select * from filtered order by created_at desc
      offset (safe_page - 1) * safe_size limit safe_size) page_rows), '[]'::jsonb)
  into total, result_rows;

  return jsonb_build_object('total', total, 'page', safe_page, 'pageSize', safe_size, 'leads', result_rows);
end;
$$;

create or replace function public.admin_crm_get_lead(lead_number bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.crm_leads%rowtype;
  customer public.crm_customers%rowtype;
begin
  perform public._crm_require_staff();
  select * into target from public.crm_leads where number = lead_number;
  if not found then return null; end if;
  select * into customer from public.crm_customers where internal_id = target.customer_id;

  return jsonb_build_object(
    'lead', jsonb_build_object(
      'number', target.number,
      'type', target.type,
      'status', target.status,
      'contactName', target.contact_name,
      'contactPhone', target.contact_phone,
      'contactEmail', target.contact_email,
      'company', target.company,
      'subject', target.subject,
      'message', target.message,
      'specLines', target.spec_lines,
      'pageUrl', target.page_url,
      'managerComment', target.manager_comment,
      'assignedTo', target.assigned_to,
      'assignedName', public._crm_staff_name(target.assigned_to),
      'createdAt', target.created_at,
      'updatedAt', target.updated_at
    ),
    'customer', jsonb_build_object(
      'id', customer.internal_id,
      'name', customer.name,
      'phone', customer.phone,
      'email', customer.email,
      'ordersCount', customer.orders_count,
      'leadsCount', customer.leads_count
    ),
    'activity', public._crm_activity_json(null, target.internal_id, null, 100),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', profile.user_id, 'name', profile.name) order by profile.name)
      from public.admin_profiles profile
      where profile.active and profile.role in ('owner', 'admin', 'manager')), '[]'::jsonb)
  );
end;
$$;

-- patch: { status?, managerComment?, assignedTo? }
create or replace function public.admin_crm_update_lead(lead_number bigint, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.crm_leads%rowtype;
  next_status public.crm_lead_status;
  changes jsonb := '{}'::jsonb;
begin
  perform public._crm_require_staff();
  if jsonb_typeof(patch) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні зміни.'; end if;

  select * into target from public.crm_leads where number = lead_number for update;
  if not found then raise exception using errcode = 'P0002', message = 'Звернення не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Звернення вже змінив інший працівник. Оновіть сторінку.';
  end if;

  if patch ? 'status' then
    begin
      next_status := (patch ->> 'status')::public.crm_lead_status;
    exception when others then
      raise exception using errcode = '22023', message = 'Невідомий статус.';
    end;
    if next_status <> target.status then
      changes := changes || jsonb_build_object('status', jsonb_build_object('from', target.status, 'to', next_status));
      target.status := next_status;
    end if;
  end if;
  if patch ? 'managerComment' then
    target.manager_comment := coalesce(public._crm_clean_text(patch ->> 'managerComment', 8000), '');
  end if;
  if patch ? 'assignedTo' then
    if nullif(patch ->> 'assignedTo', '') is null then
      target.assigned_to := null;
    elsif exists (select 1 from public.admin_profiles profile
        where profile.user_id = (patch ->> 'assignedTo')::uuid and profile.active
          and profile.role in ('owner', 'admin', 'manager')) then
      target.assigned_to := (patch ->> 'assignedTo')::uuid;
    else
      raise exception using errcode = '22023', message = 'Відповідального не знайдено.';
    end if;
  end if;

  update public.crm_leads set
    status = target.status,
    manager_comment = target.manager_comment,
    assigned_to = target.assigned_to
  where internal_id = target.internal_id;

  insert into public.crm_activity (customer_id, lead_id, actor_id, kind, body, data)
  values (target.customer_id, target.internal_id, auth.uid(),
    case when changes ? 'status' then 'status' else 'update' end,
    case when changes ? 'status' then 'Статус змінено' else 'Звернення оновлено' end,
    changes);

  perform public._crm_refresh_customer_stats(target.customer_id);
  return public.admin_crm_get_lead(lead_number);
end;
$$;

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
      'lastActivityAt', page_rows.last_activity_at
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
      'updatedAt', target.updated_at
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

-- patch: { name?, email?, company?, city?, notes? }
create or replace function public.admin_crm_update_customer(customer_id uuid, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.crm_customers%rowtype;
begin
  perform public._crm_require_staff();
  if jsonb_typeof(patch) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні зміни.'; end if;

  select * into target from public.crm_customers where internal_id = customer_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Клієнта не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Картку вже змінив інший працівник. Оновіть сторінку.';
  end if;

  if patch ? 'name' then target.name := coalesce(public._crm_clean_text(patch ->> 'name', 160), ''); end if;
  if patch ? 'email' then target.email := public._crm_clean_email(patch ->> 'email'); end if;
  if patch ? 'company' then target.company := public._crm_clean_text(patch ->> 'company', 200); end if;
  if patch ? 'city' then target.city := public._crm_clean_text(patch ->> 'city', 120); end if;
  if patch ? 'notes' then target.notes := coalesce(public._crm_clean_text(patch ->> 'notes', 8000), ''); end if;

  update public.crm_customers set
    name = target.name, email = target.email, company = target.company,
    city = target.city, notes = target.notes
  where internal_id = target.internal_id;

  insert into public.crm_activity (customer_id, actor_id, kind, body)
  values (target.internal_id, auth.uid(), 'update', 'Картку клієнта оновлено');

  return public.admin_crm_get_customer(customer_id);
end;
$$;

-- Free-form note on an order, a lead or a customer card.
create or replace function public.admin_crm_add_note(entity_type text, entity_key text, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  body text := public._crm_clean_text(note, 4000);
  target_order public.crm_orders%rowtype;
  target_lead public.crm_leads%rowtype;
  target_customer uuid;
begin
  perform public._crm_require_staff();
  if body is null then raise exception using errcode = '22023', message = 'Нотатка порожня.'; end if;

  if entity_type = 'order' then
    select * into target_order from public.crm_orders where number = entity_key::bigint;
    if not found then raise exception using errcode = 'P0002', message = 'Замовлення не знайдено.'; end if;
    insert into public.crm_activity (customer_id, order_id, actor_id, kind, body)
    values (target_order.customer_id, target_order.internal_id, auth.uid(), 'note', body);
    return public._crm_activity_json(target_order.internal_id, null, null, 100);
  elsif entity_type = 'lead' then
    select * into target_lead from public.crm_leads where number = entity_key::bigint;
    if not found then raise exception using errcode = 'P0002', message = 'Звернення не знайдено.'; end if;
    insert into public.crm_activity (customer_id, lead_id, actor_id, kind, body)
    values (target_lead.customer_id, target_lead.internal_id, auth.uid(), 'note', body);
    return public._crm_activity_json(null, target_lead.internal_id, null, 100);
  elsif entity_type = 'customer' then
    select internal_id into target_customer from public.crm_customers where internal_id = entity_key::uuid;
    if target_customer is null then raise exception using errcode = 'P0002', message = 'Клієнта не знайдено.'; end if;
    insert into public.crm_activity (customer_id, actor_id, kind, body)
    values (target_customer, auth.uid(), 'note', body);
    return public._crm_activity_json(null, null, target_customer, 100);
  end if;
  raise exception using errcode = '22023', message = 'Невідомий тип запису.';
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.admin_crm_overview()',
    'public.admin_crm_list_orders(text, public.crm_order_status, integer, integer)',
    'public.admin_crm_get_order(bigint)',
    'public.admin_crm_update_order(bigint, jsonb, timestamptz)',
    'public.admin_crm_list_leads(text, public.crm_lead_status, public.crm_lead_type, integer, integer)',
    'public.admin_crm_get_lead(bigint)',
    'public.admin_crm_update_lead(bigint, jsonb, timestamptz)',
    'public.admin_crm_list_customers(text, integer, integer)',
    'public.admin_crm_get_customer(uuid)',
    'public.admin_crm_update_customer(uuid, jsonb, timestamptz)',
    'public.admin_crm_add_note(text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;
