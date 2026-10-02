-- Header/footer menus and cookie consent: two new site_settings sections.
--   'menus'   header navigation (items with optional one-level children) and footer link columns,
--             edited in /admin/menus; the storefront (page-shell.js, homepage footer) renders them
--             with the built-in menus as first paint. Order is the array order.
--   'cookies' the consent banner (enabled, text, privacy link), edited in /admin/settings; when it
--             is on, site-settings.js loads GA4/GTM only after consent (Google Consent Mode
--             defaults denied -> granted) and never loads Meta Pixel before "accept".
-- Both are public through get_site_settings. _settings_clean is redefined in full: the body is
-- copied from 20261002001300_seo_integrations_v1 (the latest definition, every existing key keeps
-- working) plus the two new branches. Links must be site paths (/...) or https:// URLs.
-- No triggers, deletes or loops over tables: safe for the Supabase connector.

alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
  check (key in ('stores', 'checkout', 'social', 'company', 'notifications', 'integrations', 'seo', 'menus', 'cookies'));

-- Seeds = the menus the storefront showed before this migration (page-shell.js). The footer
-- column «Каталог» is not stored: it is built from the live catalogue sections.
insert into public.site_settings (key, value) values
('menus', $json${
  "header": [
    {"label": "Про нас", "href": "/about.html", "children": []},
    {"label": "Рішення", "href": "/solutions.html", "children": []},
    {"label": "Монтаж", "href": "/installation.html", "children": []},
    {"label": "Сервіс", "href": "/service-center.html", "children": []},
    {"label": "Доставка й оплата", "href": "/delivery.html", "children": []},
    {"label": "Контакти", "href": "/contact.html", "children": []}
  ],
  "footer": [
    {"title": "Послуги", "links": [
      {"label": "Монтаж", "href": "/installation.html"},
      {"label": "Сервісний центр", "href": "/service-center.html"},
      {"label": "Комплексні рішення", "href": "/solutions.html"},
      {"label": "Для монтажників", "href": "/partnership.html"}
    ]},
    {"title": "Покупцям", "links": [
      {"label": "Доставка", "href": "/delivery.html"},
      {"label": "Оплата", "href": "/payment.html"},
      {"label": "Гарантія", "href": "/warranty.html"},
      {"label": "Обмін і повернення", "href": "/returns.html"}
    ]},
    {"title": "Компанія", "links": [
      {"label": "Про нас", "href": "/about.html"},
      {"label": "Бренди", "href": "/brands"},
      {"label": "Контакти та графік", "href": "/contact.html"},
      {"label": "Надіслати специфікацію", "href": "/partnership.html"},
      {"label": "Часті запитання", "href": "/faq.html"}
    ]}
  ]
}$json$),
('cookies', $json${
  "enabled": false,
  "text": "Ми використовуємо cookie, щоб сайт працював, а з вашої згоди — ще й для аналітики та реклами.",
  "privacyHref": "/privacy.html"
}$json$)
on conflict (key) do nothing;

-- A menu or privacy link: a site path (/page, /catalog/heating, /product.html?id=...) or an https://
-- URL. Protocol-relative (//host), backslashes, quotes, angle brackets and other schemes are refused.
create or replace function public._settings_href(raw jsonb, label text, required boolean default true)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text := public._settings_text(raw, label, 300, required);
begin
  if value <> '' and value !~* '^(https://[^/\s<>"''\\]+(/[^\s<>"''\\]*)?|/([^/\s<>"''\\][^\s<>"''\\]*)?)$' then
    raise exception using errcode = '22023',
      message = format('%s: посилання має починатися з / (сторінка сайту) або https://.', label);
  end if;
  return value;
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
  page_path text;
  paths text[] := '{}';
  token text;
  child jsonb;
  children jsonb;
  columns jsonb;
  column_title text;
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
  elsif target_key = 'integrations' then
    if jsonb_typeof(raw) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні дані інтеграцій.'; end if;
    token := upper(public._settings_text(raw -> 'ga4MeasurementId', 'Google Analytics 4', 20));
    if token <> '' and token !~ '^G-[A-Z0-9]{4,16}$' then
      raise exception using errcode = '22023', message = 'Google Analytics 4: ідентифікатор виду G-XXXXXXXXXX.';
    end if;
    result := jsonb_build_object('ga4MeasurementId', token);
    token := upper(public._settings_text(raw -> 'gtmContainerId', 'Google Tag Manager', 20));
    if token <> '' and token !~ '^GTM-[A-Z0-9]{4,12}$' then
      raise exception using errcode = '22023', message = 'Google Tag Manager: ідентифікатор виду GTM-XXXXXXX.';
    end if;
    result := result || jsonb_build_object('gtmContainerId', token);
    token := public._settings_text(raw -> 'metaPixelId', 'Meta Pixel', 20);
    if token <> '' and token !~ '^[0-9]{6,20}$' then
      raise exception using errcode = '22023', message = 'Meta Pixel: лише цифри ідентифікатора пікселя.';
    end if;
    result := result || jsonb_build_object('metaPixelId', token);
    token := public._settings_text(raw -> 'searchConsoleToken', 'Google Search Console', 100);
    if token <> '' and token !~ '^[A-Za-z0-9_-]{10,100}$' then
      raise exception using errcode = '22023', message = 'Google Search Console: вставте лише значення content з мета-тегу.';
    end if;
    return result || jsonb_build_object('searchConsoleToken', token);
  elsif target_key = 'seo' then
    if jsonb_typeof(raw) <> 'object' or (raw ? 'pages' and jsonb_typeof(raw -> 'pages') not in ('array', 'null')) then
      raise exception using errcode = '22023', message = 'Некоректні SEO-налаштування.';
    end if;
    if jsonb_array_length(coalesce(raw -> 'pages', '[]'::jsonb)) > 60 then
      raise exception using errcode = '22023', message = 'SEO: не більше 60 сторінок.';
    end if;
    result := '[]'::jsonb;
    for item in select value from jsonb_array_elements(coalesce(raw -> 'pages', '[]'::jsonb)) loop
      if jsonb_typeof(item) <> 'object' then raise exception using errcode = '22023', message = 'Некоректний рядок SEO.'; end if;
      page_path := lower(public._settings_text(item -> 'path', 'Адреса сторінки', 60, true));
      page_path := regexp_replace(regexp_replace(page_path, '\.html$', ''), '(.)/+$', '\1');
      if page_path = '/index' then page_path := '/'; end if;
      if page_path !~ '^/([a-z0-9]+(-[a-z0-9]+)*)?$' then
        raise exception using errcode = '22023', message = format('Адреса «%s»: лише сторінка першого рівня, наприклад /delivery.', page_path);
      end if;
      if page_path in ('/catalog', '/product', '/brand', '/admin') then
        raise exception using errcode = '22023', message = format('Адреса «%s»: заголовки каталогу, товарів і брендів редагуються в їхніх картках.', page_path);
      end if;
      if page_path = any(paths) then raise exception using errcode = '22023', message = format('Адреса «%s» повторюється.', page_path); end if;
      paths := paths || page_path;
      result := result || jsonb_build_array(jsonb_build_object(
        'path', page_path,
        'title', public._settings_text(item -> 'title', 'SEO-заголовок', 120),
        'description', public._settings_text(item -> 'description', 'SEO-опис', 320)
      ));
    end loop;
    return jsonb_build_object('pages', result);
  elsif target_key = 'menus' then
    if jsonb_typeof(raw) <> 'object'
      or jsonb_typeof(coalesce(raw -> 'header', '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(raw -> 'footer', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'Некоректні дані меню.';
    end if;
    if jsonb_array_length(coalesce(raw -> 'header', '[]'::jsonb)) > 10 then
      raise exception using errcode = '22023', message = 'Меню в шапці: не більше 10 пунктів.';
    end if;
    if jsonb_array_length(coalesce(raw -> 'footer', '[]'::jsonb)) > 3 then
      raise exception using errcode = '22023', message = 'Підвал: не більше 3 колонок (колонка «Каталог» додається автоматично).';
    end if;
    result := '[]'::jsonb;
    for item in select value from jsonb_array_elements(coalesce(raw -> 'header', '[]'::jsonb)) loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(coalesce(item -> 'children', '[]'::jsonb)) <> 'array' then
        raise exception using errcode = '22023', message = 'Некоректний пункт меню.';
      end if;
      if jsonb_array_length(coalesce(item -> 'children', '[]'::jsonb)) > 10 then
        raise exception using errcode = '22023', message = 'Пункт меню: не більше 10 підпунктів.';
      end if;
      children := '[]'::jsonb;
      for child in select value from jsonb_array_elements(coalesce(item -> 'children', '[]'::jsonb)) loop
        if jsonb_typeof(child) <> 'object' then raise exception using errcode = '22023', message = 'Некоректний підпункт меню.'; end if;
        children := children || jsonb_build_array(jsonb_build_object(
          'label', public._settings_text(child -> 'label', 'Назва підпункту', 60, true),
          'href', public._settings_href(child -> 'href', 'Посилання підпункту')
        ));
      end loop;
      result := result || jsonb_build_array(jsonb_build_object(
        'label', public._settings_text(item -> 'label', 'Назва пункту меню', 40, true),
        'href', public._settings_href(item -> 'href', 'Посилання пункту меню'),
        'children', children
      ));
    end loop;
    columns := '[]'::jsonb;
    for item in select value from jsonb_array_elements(coalesce(raw -> 'footer', '[]'::jsonb)) loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(coalesce(item -> 'links', '[]'::jsonb)) <> 'array' then
        raise exception using errcode = '22023', message = 'Некоректна колонка підвалу.';
      end if;
      column_title := public._settings_text(item -> 'title', 'Назва колонки', 40, true);
      if jsonb_array_length(coalesce(item -> 'links', '[]'::jsonb)) not between 1 and 12 then
        raise exception using errcode = '22023', message = format('Колонка «%s»: від 1 до 12 посилань.', column_title);
      end if;
      children := '[]'::jsonb;
      for child in select value from jsonb_array_elements(item -> 'links') loop
        if jsonb_typeof(child) <> 'object' then raise exception using errcode = '22023', message = 'Некоректне посилання в підвалі.'; end if;
        children := children || jsonb_build_array(jsonb_build_object(
          'label', public._settings_text(child -> 'label', 'Назва посилання', 60, true),
          'href', public._settings_href(child -> 'href', 'Посилання в підвалі')
        ));
      end loop;
      columns := columns || jsonb_build_array(jsonb_build_object('title', column_title, 'links', children));
    end loop;
    return jsonb_build_object('header', result, 'footer', columns);
  elsif target_key = 'cookies' then
    if jsonb_typeof(raw) <> 'object' then raise exception using errcode = '22023', message = 'Некоректні налаштування cookie.'; end if;
    if raw ? 'enabled' and jsonb_typeof(raw -> 'enabled') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Банер cookie: «увімкнено» має бути так або ні.';
    end if;
    return jsonb_build_object(
      'enabled', coalesce((raw ->> 'enabled')::boolean, false),
      'text', public._settings_text(raw -> 'text', 'Текст банера cookie', 400, true),
      'privacyHref', public._settings_href(raw -> 'privacyHref', 'Посилання на політику', false)
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
  where setting.key in ('stores', 'checkout', 'social', 'company', 'integrations', 'seo', 'menus', 'cookies')
$$;

revoke all on function public._settings_href(jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public._settings_clean(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_site_settings() from public;
grant execute on function public.get_site_settings() to anon, authenticated;
