-- Shop settings v1: stores and contacts, checkout options, social links, company name and order
-- notification recipients, edited in /admin/settings (owner/admin) and read by every storefront
-- page through get_site_settings (public keys only). Pickup orders now record the chosen shop.

create table public.site_settings (
  key text primary key check (key in ('stores', 'checkout', 'social', 'company', 'notifications')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_settings enable row level security;
revoke all on table public.site_settings from public, anon, authenticated;

create table public.site_settings_audit (
  internal_id uuid primary key default gen_random_uuid(),
  key text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.site_settings_audit enable row level security;
revoke all on table public.site_settings_audit from public, anon, authenticated;

insert into public.site_settings (key, value) values
('company', '{"name": "Торговий дім «Софіївка»"}'),
('stores', $json$[
  {"id": "kyiv", "city": "Київ", "title": "Магазин у Києві", "address": "с. Софіївська Борщагівка, вул. Київська, 3",
   "mapQuery": "с. Софіївська Борщагівка, вул. Київська, 3", "phones": ["+38 (050) 358-22-84"], "email": "sofievkakyiv@ukr.net",
   "hours": ["Пн–Пт 9:00–18:00", "Сб 9:00–14:00"], "pickup": true},
  {"id": "zhytomyr", "city": "Житомир", "title": "Магазин у Житомирі", "address": "м. Житомир, проспект Незалежності, 79",
   "mapQuery": "Житомир, проспект Незалежності, 79", "phones": ["+38 (067) 726-00-00"], "email": "sofievka.zt.ua@gmail.com",
   "hours": ["Пн–Пт 8:30–17:00", "Сб 8:30–14:00"], "pickup": true}
]$json$),
('checkout', $json${
  "deliveryMethods": [
    {"id": "carrier", "enabled": true, "title": "Доставка перевізником по Україні", "description": "Нова пошта або інший перевізник — погодимо під час підтвердження."},
    {"id": "pickup", "enabled": true, "title": "Самовивіз з магазину", "description": "Після підтвердження готовності замовлення."}
  ],
  "paymentTitle": "Після підтвердження менеджером",
  "paymentDescription": "Рахунок, оплата на картку або при отриманні — залежно від товару та доставки."
}$json$),
('social', '{"instagram": "", "facebook": "", "youtube": "", "telegram": "", "viber": ""}'),
('notifications', '{"emails": [], "telegramChatIds": [], "notifyOrders": true, "notifyLeads": true}');

create or replace function public._settings_text(raw jsonb, label text, maximum integer, required boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text;
begin
  if raw is not null and jsonb_typeof(raw) not in ('string', 'null') then
    raise exception using errcode = '22023', message = format('%s: очікується текст.', label);
  end if;
  value := nullif(btrim(regexp_replace(coalesce(raw #>> '{}', ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  if value is null and required then
    raise exception using errcode = '22023', message = format('%s: поле обов’язкове.', label);
  end if;
  if char_length(coalesce(value, '')) > maximum then
    raise exception using errcode = '22023', message = format('%s: не довше %s символів.', label, maximum);
  end if;
  return coalesce(value, '');
end;
$$;

create or replace function public._settings_text_list(raw jsonb, label text, max_items integer, max_length integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  item jsonb;
  cleaned text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return result; end if;
  if jsonb_typeof(raw) <> 'array' then
    raise exception using errcode = '22023', message = format('%s: очікується список.', label);
  end if;
  for item in select value from jsonb_array_elements(raw) loop
    cleaned := public._settings_text(item, label, max_length);
    if cleaned <> '' then result := result || to_jsonb(cleaned); end if;
  end loop;
  if jsonb_array_length(result) > max_items then
    raise exception using errcode = '22023', message = format('%s: не більше %s значень.', label, max_items);
  end if;
  return result;
end;
$$;

-- Validates one settings section and returns it with only the known keys, trimmed.
create or replace function public._settings_clean(target_key text, raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  result jsonb;
  ids text[] := '{}';
  store_id text;
  phone text;
  email text;
  method_id text;
  enabled_count integer := 0;
  social_key text;
  url text;
begin
  if target_key = 'company' then
    if jsonb_typeof(raw) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні дані компанії.'; end if;
    return jsonb_build_object('name', public._settings_text(raw -> 'name', 'Назва компанії', 120, true));
  elsif target_key = 'stores' then
    if jsonb_typeof(raw) <> 'array' or jsonb_array_length(raw) < 1 or jsonb_array_length(raw) > 10 then
      raise exception using errcode = '22023', message = 'Потрібен від 1 до 10 магазинів.';
    end if;
    result := '[]'::jsonb;
    for item in select value from jsonb_array_elements(raw) loop
      if jsonb_typeof(item) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні дані магазину.'; end if;
      store_id := public._settings_text(item -> 'id', 'Код магазину', 40, true);
      if store_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception using errcode = '22023', message = 'Код магазину: латиниця, цифри й дефіси.';
      end if;
      if store_id = any(ids) then raise exception using errcode = '22023', message = format('Код магазину «%s» повторюється.', store_id); end if;
      ids := ids || store_id;
      for phone in select value #>> '{}' from jsonb_array_elements(public._settings_text_list(item -> 'phones', 'Телефон', 5, 40)) loop
        if char_length(regexp_replace(phone, '\D', '', 'g')) not between 9 and 15 then
          raise exception using errcode = '22023', message = format('Телефон «%s» виглядає некоректно.', phone);
        end if;
      end loop;
      email := public._settings_text(item -> 'email', 'Email магазину', 254);
      if email <> '' and email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception using errcode = '22023', message = format('Email «%s» виглядає некоректно.', email);
      end if;
      if item ? 'pickup' and jsonb_typeof(item -> 'pickup') <> 'boolean' then
        raise exception using errcode = '22023', message = 'Самовивіз: очікується так або ні.';
      end if;
      result := result || jsonb_build_array(jsonb_build_object(
        'id', store_id,
        'city', public._settings_text(item -> 'city', 'Місто', 80, true),
        'title', public._settings_text(item -> 'title', 'Назва магазину', 120, true),
        'address', public._settings_text(item -> 'address', 'Адреса', 240, true),
        'mapQuery', public._settings_text(item -> 'mapQuery', 'Точка на мапі', 240),
        'phones', public._settings_text_list(item -> 'phones', 'Телефон', 5, 40),
        'email', email,
        'hours', public._settings_text_list(item -> 'hours', 'Графік', 7, 80),
        'pickup', coalesce((item ->> 'pickup')::boolean, true)
      ));
    end loop;
    return result;
  elsif target_key = 'checkout' then
    if jsonb_typeof(raw) <> 'object' or jsonb_typeof(raw -> 'deliveryMethods') <> 'array' then
      raise exception using errcode = '22023', message = 'Некоректні налаштування оформлення.';
    end if;
    result := '[]'::jsonb;
    for item in select value from jsonb_array_elements(raw -> 'deliveryMethods') loop
      method_id := item ->> 'id';
      if method_id not in ('carrier', 'pickup') or method_id = any(ids) then
        raise exception using errcode = '22023', message = 'Невідомий або повторений спосіб доставки.';
      end if;
      ids := ids || method_id;
      if item ? 'enabled' and jsonb_typeof(item -> 'enabled') <> 'boolean' then
        raise exception using errcode = '22023', message = 'Доставка: «увімкнено» має бути так або ні.';
      end if;
      if coalesce((item ->> 'enabled')::boolean, true) then enabled_count := enabled_count + 1; end if;
      result := result || jsonb_build_array(jsonb_build_object(
        'id', method_id,
        'enabled', coalesce((item ->> 'enabled')::boolean, true),
        'title', public._settings_text(item -> 'title', 'Назва способу доставки', 120, true),
        'description', public._settings_text(item -> 'description', 'Опис доставки', 300)
      ));
    end loop;
    if enabled_count = 0 then raise exception using errcode = '22023', message = 'Увімкніть хоча б один спосіб отримання.'; end if;
    return jsonb_build_object(
      'deliveryMethods', result,
      'paymentTitle', public._settings_text(raw -> 'paymentTitle', 'Назва способу оплати', 120, true),
      'paymentDescription', public._settings_text(raw -> 'paymentDescription', 'Опис оплати', 500)
    );
  elsif target_key = 'social' then
    if jsonb_typeof(raw) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні соцмережі.'; end if;
    result := '{}'::jsonb;
    foreach social_key in array array['instagram', 'facebook', 'youtube', 'telegram', 'viber'] loop
      url := public._settings_text(raw -> social_key, social_key, 300);
      if url <> '' and url !~* '^https://[^\s]+$' then
        raise exception using errcode = '22023', message = format('Посилання %s має починатися з https://.', social_key);
      end if;
      result := result || jsonb_build_object(social_key, url);
    end loop;
    return result;
  elsif target_key = 'notifications' then
    if jsonb_typeof(raw) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні сповіщення.'; end if;
    for email in select value #>> '{}' from jsonb_array_elements(public._settings_text_list(raw -> 'emails', 'Email для сповіщень', 10, 254)) loop
      if email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception using errcode = '22023', message = format('Email «%s» виглядає некоректно.', email);
      end if;
    end loop;
    for phone in select value #>> '{}' from jsonb_array_elements(public._settings_text_list(raw -> 'telegramChatIds', 'Telegram chat id', 10, 24)) loop
      if phone !~ '^-?\d{3,20}$' then
        raise exception using errcode = '22023', message = format('Telegram chat id «%s»: лише цифри (можна з мінусом).', phone);
      end if;
    end loop;
    return jsonb_build_object(
      'emails', public._settings_text_list(raw -> 'emails', 'Email для сповіщень', 10, 254),
      'telegramChatIds', public._settings_text_list(raw -> 'telegramChatIds', 'Telegram chat id', 10, 24),
      'notifyOrders', coalesce((raw ->> 'notifyOrders')::boolean, true),
      'notifyLeads', coalesce((raw ->> 'notifyLeads')::boolean, true)
    );
  end if;
  raise exception using errcode = '22023', message = 'Невідомий розділ налаштувань.';
end;
$$;

create or replace function public.get_site_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(setting.key, setting.value), '{}'::jsonb)
  from public.site_settings setting
  where setting.key in ('stores', 'checkout', 'social', 'company')
$$;

create or replace function public.admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  return jsonb_build_object(
    'canEdit', public.can_admin_catalog(),
    'sections', coalesce((
      select jsonb_object_agg(setting.key, jsonb_build_object('value', setting.value, 'updatedAt', setting.updated_at))
      from public.site_settings setting
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.admin_update_settings(section text, value jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.site_settings%rowtype;
  cleaned jsonb;
begin
  if not public.can_admin_catalog() then
    raise exception using errcode = '42501', message = 'Змінювати налаштування можуть власник і адміністратор.';
  end if;
  select * into target from public.site_settings setting where setting.key = section for update;
  if not found then raise exception using errcode = 'P0002', message = 'Розділ налаштувань не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Налаштування вже змінив інший працівник. Оновіть сторінку.';
  end if;
  cleaned := public._settings_clean(section, value);
  if cleaned is distinct from target.value then
    update public.site_settings set value = cleaned, updated_at = now(), updated_by = auth.uid() where key = section;
    insert into public.site_settings_audit (key, actor_id, before_value, after_value)
    values (section, auth.uid(), target.value, cleaned);
  end if;
  return public.admin_get_settings();
end;
$$;

-- Pickup orders keep the shop the customer picked (delivery_point); carrier orders are unchanged.
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
    case when delivery = 'carrier' then delivery_point else public._crm_clean_text(payload ->> 'pickupStore', 240) end,
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


revoke all on function public._settings_text(jsonb, text, integer, boolean) from public, anon, authenticated;
revoke all on function public._settings_text_list(jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function public._settings_clean(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_site_settings() from public;
grant execute on function public.get_site_settings() to anon, authenticated;
revoke all on function public.admin_get_settings() from public, anon;
revoke all on function public.admin_update_settings(text, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_get_settings() to authenticated;
grant execute on function public.admin_update_settings(text, jsonb, timestamptz) to authenticated;
revoke all on function public.crm_submit_order(jsonb) from public;
grant execute on function public.crm_submit_order(jsonb) to anon, authenticated;
