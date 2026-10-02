-- Homepage banners v1: the hero slider and the two promo tiles next to it, edited in
-- /admin/banners and read by the storefront through get_homepage_banners (index.html keeps the
-- static markup as first paint and fallback). Reads are open to every active staff member,
-- writes to owner/admin/content_manager (can_manage_content). Changes are audited in
-- homepage_banners_audit; every write is guarded by the row's updated_at.
--
-- Statements the Supabase MCP connector cannot run (apply this file through the SQL Editor):
--   admin_delete_banner contains `delete from public.homepage_banners`.
-- No triggers are created or dropped here; everything else would also run through the connector.

create table public.homepage_banners (
  internal_id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('hero', 'promo')),
  -- cover: the image fills the block behind the text; product: a cut-out product shot beside
  -- the text (promo tiles only).
  layout text not null default 'cover' check (layout in ('cover', 'product')),
  image_url text not null check (char_length(image_url) between 1 and 1000),
  mobile_image_url text not null default '' check (char_length(mobile_image_url) <= 1000),
  image_alt text not null default '' check (char_length(image_alt) <= 200),
  -- Horizontal focus point of a cover image, in percent (CSS object-position).
  image_focus smallint not null default 50 check (image_focus between 0 and 100),
  logo_url text not null default '' check (char_length(logo_url) <= 1000),
  logo_alt text not null default '' check (char_length(logo_alt) <= 80),
  kicker text not null default '' check (char_length(kicker) <= 120),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 300),
  button_label text not null default '' check (char_length(button_label) <= 40),
  link_url text not null check (char_length(link_url) between 1 and 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  date_from timestamptz,
  date_to timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint homepage_banners_hero_cover_check check (placement = 'promo' or layout = 'cover'),
  constraint homepage_banners_period_check check (date_from is null or date_to is null or date_to >= date_from)
);

create index homepage_banners_placement_idx on public.homepage_banners (placement, sort_order);

alter table public.homepage_banners enable row level security;
revoke all on table public.homepage_banners from public, anon, authenticated;

create table public.homepage_banners_audit (
  internal_id uuid primary key default gen_random_uuid(),
  banner_id uuid,
  placement text not null,
  action text not null check (action in ('create', 'update', 'delete', 'reorder')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);

create index homepage_banners_audit_created_idx on public.homepage_banners_audit (created_at desc);

alter table public.homepage_banners_audit enable row level security;
revoke all on table public.homepage_banners_audit from public, anon, authenticated;

-- The banners that index.html shows today, with the same texts, images and links.
insert into public.homepage_banners
  (placement, layout, image_url, image_alt, image_focus, logo_url, logo_alt, kicker, title, body, button_label, link_url, sort_order)
values
  ('hero', 'cover', 'assets/images/home-hero-termojet-pumps-v1.jpg', 'Циркуляційні насоси Termojet для систем опалення', 58,
   'assets/brands/termojet.png', 'Termojet', E'Насосне обладнання\nдля систем опалення',
   'Насоси для стабільної роботи системи', 'Підбір Termojet за напором, витратою та умовами експлуатації.',
   'Переглянути Termojet', '/search.html?q=Termojet%20насос', 10),
  ('hero', 'cover', 'assets/images/home-hero-ecosoft-water-v1.jpg', 'Системи очищення води Ecosoft для дому та бізнесу', 61,
   'assets/brands/ecosoft.png', 'Ecosoft', E'Очищення води\nдля дому та бізнесу',
   'Чиста вода для щоденного використання', 'Зворотний осмос і професійні системи — з підбором під якість води.',
   'Переглянути Ecosoft', '/search.html?q=Ecosoft', 20),
  ('hero', 'cover', 'assets/images/home-hero-termojet-automation-v1.jpg', 'Автоматика Termojet для керування домашніми інженерними системами', 64,
   'assets/brands/termojet.png', 'Termojet', E'Керування опаленням\nв одній системі',
   'Автоматика, що керує комфортом', 'Контролери та модулі для точного керування системою будинку.',
   'Переглянути автоматику', '/search.html?q=Termojet%20автоматика', 30),
  ('promo', 'product', 'assets/products/ecosoft/mo650mecostd/01.webp', 'Фільтр зворотного осмосу Ecosoft', 50,
   '', '', 'ECOSOFT', 'Чиста вода у вашому домі', 'Система з мінералізацією для питної води',
   'До товару', '/product.html?id=MO650MECOSTD', 10),
  ('promo', 'cover', 'assets/images/hero-climate.webp', '', 73,
   '', '', 'КЛІМАТ', 'Комфорт у будь-який сезон', 'Підбір за площею та режимом роботи',
   'Переглянути', '/climate.html', 20);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Cleaned text (control characters stripped, trimmed, length-checked through _settings_text).
-- Single-line fields fold line breaks into spaces; multi-line fields keep at most 3 lines.
create or replace function public._banner_text(raw jsonb, label text, maximum integer, required boolean default false, multiline boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text := public._settings_text(raw, label, maximum, required);
begin
  if multiline then
    value := regexp_replace(regexp_replace(value, '\r\n?', E'\n', 'g'), '[ \t]*\n[ \t\n]*', E'\n', 'g');
    if array_length(string_to_array(value, E'\n'), 1) > 3 then
      raise exception using errcode = '22023', message = format('%s: не більше 3 рядків.', label);
    end if;
  else
    value := regexp_replace(value, '\s*[\r\n\t]+\s*', ' ', 'g');
  end if;
  return value;
end;
$$;

-- Image and link addresses: https:// URLs or site paths (/page, assets/...). Anything else
-- (http:, javascript:, data:, //host, spaces, quotes or angle brackets) is refused.
create or replace function public._banner_url(raw jsonb, label text, required boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text := public._banner_text(raw, label, 1000, required);
begin
  if value = '' then return value; end if;
  if value !~ '^(https://[^/\s<>"''\\]+(/[^\s<>"''\\]*)?|/([^/\\\s<>"''][^\s<>"''\\]*)?|assets/[^\s<>"''\\]+)$' then
    raise exception using errcode = '22023',
      message = format('%s: потрібна адреса https://… або шлях сайту, що починається з / чи assets/.', label);
  end if;
  return value;
end;
$$;

create or replace function public._banner_time(raw jsonb, label text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) = 'null' or btrim(raw #>> '{}') = '' then return null; end if;
  if jsonb_typeof(raw) <> 'string' then
    raise exception using errcode = '22023', message = format('Некоректна дата «%s».', label);
  end if;
  begin
    return (raw #>> '{}')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = format('Некоректна дата «%s».', label);
  end;
end;
$$;

create or replace function public._banner_live(target public.homepage_banners)
returns boolean
language sql
stable
set search_path = ''
as $$
  select target.active
    and (target.date_from is null or target.date_from <= now())
    and (target.date_to is null or target.date_to >= now())
$$;

-- Public shape: only what the storefront renders.
create or replace function public._banner_public_json(target public.homepage_banners)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', target.internal_id,
    'layout', target.layout,
    'imageUrl', target.image_url,
    'mobileImageUrl', target.mobile_image_url,
    'imageAlt', target.image_alt,
    'imageFocus', target.image_focus,
    'logoUrl', target.logo_url,
    'logoAlt', target.logo_alt,
    'kicker', target.kicker,
    'title', target.title,
    'text', target.body,
    'buttonLabel', target.button_label,
    'linkUrl', target.link_url
  )
$$;

create or replace function public._banner_admin_json(target public.homepage_banners)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._banner_public_json(target) || jsonb_build_object(
    'placement', target.placement,
    'sortOrder', target.sort_order,
    'active', target.active,
    'dateFrom', target.date_from,
    'dateTo', target.date_to,
    'live', public._banner_live(target),
    'createdAt', target.created_at,
    'updatedAt', target.updated_at,
    'updatedBy', (select profile.name from public.admin_profiles profile where profile.user_id = target.updated_by)
  )
$$;

create or replace function public._banners_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Змінювати банери можуть власник, адміністратор і контент-менеджер.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public read
-- ---------------------------------------------------------------------------

-- Banners on the homepage now: active, inside their dates, in order. At most 8 slides and the
-- first 2 promo tiles (the layout has room for two).
create or replace function public.get_homepage_banners()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hero', coalesce((
      select jsonb_agg(public._banner_public_json(picked.banner) order by picked.position)
      from (
        select candidate as banner, row_number() over (order by candidate.sort_order, candidate.created_at) as position
        from public.homepage_banners candidate
        where candidate.placement = 'hero' and public._banner_live(candidate)
        order by candidate.sort_order, candidate.created_at limit 8
      ) picked
    ), '[]'::jsonb),
    'promo', coalesce((
      select jsonb_agg(public._banner_public_json(picked.banner) order by picked.position)
      from (
        select candidate as banner, row_number() over (order by candidate.sort_order, candidate.created_at) as position
        from public.homepage_banners candidate
        where candidate.placement = 'promo' and public._banner_live(candidate)
        order by candidate.sort_order, candidate.created_at limit 2
      ) picked
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Staff reads
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_banners()
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
    'canEdit', public.can_manage_content(),
    'limits', jsonb_build_object('hero', 8, 'promo', 2),
    'banners', coalesce((
      select jsonb_agg(public._banner_admin_json(banner) order by banner.placement, banner.sort_order, banner.created_at)
      from public.homepage_banners banner
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt', entry.created_at,
        'actor', coalesce(profile.name, 'Невідомий працівник'),
        'action', entry.action,
        'placement', entry.placement,
        'title', coalesce(entry.changes #>> '{title,to}', entry.changes #>> '{title,from}', entry.changes ->> 'label'),
        'fields', (select coalesce(jsonb_agg(key order by key), '[]'::jsonb) from jsonb_object_keys(entry.changes) key where key <> 'label')
      ) order by entry.created_at desc)
      from (select * from public.homepage_banners_audit audit order by audit.created_at desc limit 20) entry
      left join public.admin_profiles profile on profile.user_id = entry.actor_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- Create (banner_id null) or replace every editable field of one banner. New banners go to the
-- end of their placement; moving a banner to the other placement also puts it last there.
create or replace function public.admin_save_banner(banner_id uuid, payload jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.homepage_banners%rowtype;
  cleaned public.homepage_banners%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
  focus_raw jsonb;
begin
  perform public._banners_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані банера.';
  end if;

  if banner_id is not null then
    select * into target from public.homepage_banners banner where banner.internal_id = banner_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Банер не знайдено. Оновіть сторінку.'; end if;
    if expected_updated_at is null or target.updated_at <> expected_updated_at then
      raise exception using errcode = '40001', message = 'Банер уже змінив інший працівник. Оновіть сторінку.';
    end if;
  end if;

  cleaned.placement := coalesce(nullif(payload ->> 'placement', ''), target.placement);
  if cleaned.placement is null or cleaned.placement not in ('hero', 'promo') then
    raise exception using errcode = '22023', message = 'Оберіть місце показу: слайдер або плитка.';
  end if;
  cleaned.layout := coalesce(nullif(payload ->> 'layout', ''), 'cover');
  if cleaned.layout not in ('cover', 'product') then
    raise exception using errcode = '22023', message = 'Невідомий вигляд банера.';
  end if;
  if cleaned.placement = 'hero' and cleaned.layout <> 'cover' then
    raise exception using errcode = '22023', message = 'Слайд головного банера має фонове зображення на всю площу.';
  end if;

  cleaned.image_url := public._banner_url(payload -> 'imageUrl', 'Зображення', true);
  cleaned.mobile_image_url := public._banner_url(payload -> 'mobileImageUrl', 'Зображення для телефона');
  cleaned.image_alt := public._banner_text(payload -> 'imageAlt', 'Опис зображення', 200);
  focus_raw := payload -> 'imageFocus';
  if focus_raw is null or jsonb_typeof(focus_raw) = 'null' or btrim(focus_raw #>> '{}') = '' then
    cleaned.image_focus := 50;
  elsif (focus_raw #>> '{}') ~ '^\d{1,3}$' and (focus_raw #>> '{}')::integer between 0 and 100 then
    cleaned.image_focus := (focus_raw #>> '{}')::smallint;
  else
    raise exception using errcode = '22023', message = 'Фокус зображення: ціле число від 0 до 100.';
  end if;
  cleaned.logo_url := public._banner_url(payload -> 'logoUrl', 'Логотип');
  cleaned.logo_alt := public._banner_text(payload -> 'logoAlt', 'Назва бренду на логотипі', 80);
  if cleaned.placement = 'promo' then
    cleaned.logo_url := '';
    cleaned.logo_alt := '';
  end if;
  cleaned.kicker := public._banner_text(payload -> 'kicker', 'Надзаголовок', 120, false, cleaned.placement = 'hero');
  cleaned.title := public._banner_text(payload -> 'title', 'Заголовок', 160, true);
  cleaned.body := public._banner_text(payload -> 'text', 'Текст', 300);
  cleaned.button_label := public._banner_text(payload -> 'buttonLabel', 'Текст кнопки', 40);
  cleaned.link_url := public._banner_url(payload -> 'linkUrl', 'Посилання', true);

  if payload ? 'active' and jsonb_typeof(payload -> 'active') not in ('boolean', 'null') then
    raise exception using errcode = '22023', message = 'Некоректне значення «Показувати на сайті».';
  end if;
  cleaned.active := coalesce((payload ->> 'active')::boolean, true);
  cleaned.date_from := public._banner_time(payload -> 'dateFrom', 'Показувати з');
  cleaned.date_to := public._banner_time(payload -> 'dateTo', 'Показувати до');
  if cleaned.date_from is not null and cleaned.date_to is not null and cleaned.date_to < cleaned.date_from then
    raise exception using errcode = '22023', message = 'Дата завершення показу раніша за дату початку.';
  end if;

  if banner_id is null or cleaned.placement <> target.placement then
    if (select count(*) from public.homepage_banners banner where banner.placement = cleaned.placement) >= 12 then
      raise exception using errcode = '22023', message = 'Забагато банерів у цьому місці (максимум 12). Видаліть зайві.';
    end if;
    cleaned.sort_order := (select coalesce(max(banner.sort_order), 0) + 10 from public.homepage_banners banner where banner.placement = cleaned.placement);
  else
    cleaned.sort_order := target.sort_order;
  end if;

  if banner_id is null then
    insert into public.homepage_banners (placement, layout, image_url, mobile_image_url, image_alt, image_focus, logo_url, logo_alt,
      kicker, title, body, button_label, link_url, sort_order, active, date_from, date_to, created_by, updated_by)
    values (cleaned.placement, cleaned.layout, cleaned.image_url, cleaned.mobile_image_url, cleaned.image_alt, cleaned.image_focus,
      cleaned.logo_url, cleaned.logo_alt, cleaned.kicker, cleaned.title, cleaned.body, cleaned.button_label, cleaned.link_url,
      cleaned.sort_order, cleaned.active, cleaned.date_from, cleaned.date_to, auth.uid(), auth.uid())
    returning * into target;
    insert into public.homepage_banners_audit (banner_id, placement, action, actor_id, changes)
    values (target.internal_id, target.placement, 'create', auth.uid(),
      jsonb_build_object('title', jsonb_build_object('from', null, 'to', target.title)));
    return jsonb_build_object('banner', public._banner_admin_json(target));
  end if;

  before_row := to_jsonb(target);
  update public.homepage_banners set
    placement = cleaned.placement, layout = cleaned.layout, image_url = cleaned.image_url,
    mobile_image_url = cleaned.mobile_image_url, image_alt = cleaned.image_alt, image_focus = cleaned.image_focus,
    logo_url = cleaned.logo_url, logo_alt = cleaned.logo_alt, kicker = cleaned.kicker, title = cleaned.title,
    body = cleaned.body, button_label = cleaned.button_label, link_url = cleaned.link_url, sort_order = cleaned.sort_order,
    active = cleaned.active, date_from = cleaned.date_from, date_to = cleaned.date_to
  where internal_id = target.internal_id
  returning * into target;
  after_row := to_jsonb(target);

  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['placement', 'layout', 'image_url', 'mobile_image_url', 'image_alt', 'image_focus', 'logo_url', 'logo_alt',
    'kicker', 'title', 'body', 'button_label', 'link_url', 'active', 'date_from', 'date_to']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    update public.homepage_banners set updated_at = clock_timestamp(), updated_by = auth.uid()
    where internal_id = target.internal_id
    returning * into target;
    insert into public.homepage_banners_audit (banner_id, placement, action, actor_id, changes)
    values (target.internal_id, target.placement, 'update', auth.uid(),
      changes || case when changes ? 'title' then '{}'::jsonb else jsonb_build_object('label', target.title) end);
  end if;
  return jsonb_build_object('banner', public._banner_admin_json(target));
end;
$$;

create or replace function public.admin_delete_banner(banner_id uuid, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.homepage_banners%rowtype;
begin
  perform public._banners_require_editor();
  select * into target from public.homepage_banners banner where banner.internal_id = banner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Банер не знайдено. Оновіть сторінку.'; end if;
  if expected_updated_at is null or target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Банер уже змінив інший працівник. Оновіть сторінку.';
  end if;
  delete from public.homepage_banners where internal_id = target.internal_id;
  insert into public.homepage_banners_audit (banner_id, placement, action, actor_id, changes)
  values (target.internal_id, target.placement, 'delete', auth.uid(),
    jsonb_build_object('title', jsonb_build_object('from', target.title, 'to', null), 'imageUrl', target.image_url, 'linkUrl', target.link_url));
  return jsonb_build_object('deleted', target.internal_id);
end;
$$;

-- Set the order of every banner in one placement. The list must name exactly the banners there,
-- so a reorder based on a stale page (someone added or deleted a banner) is refused.
create or replace function public.admin_reorder_banners(target_placement text, banner_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_ids jsonb;
  after_ids jsonb;
begin
  perform public._banners_require_editor();
  if target_placement is null or target_placement not in ('hero', 'promo') then
    raise exception using errcode = '22023', message = 'Невідоме місце показу.';
  end if;
  banner_ids := coalesce(banner_ids, '{}');
  if cardinality(banner_ids) <> (select count(distinct value) from unnest(banner_ids) value) then
    raise exception using errcode = '22023', message = 'Банер повторюється у списку.';
  end if;

  perform 1 from public.homepage_banners banner where banner.placement = target_placement for update;
  if (select count(*) from public.homepage_banners banner where banner.placement = target_placement) <> cardinality(banner_ids)
    or exists (select 1 from unnest(banner_ids) value
               where not exists (select 1 from public.homepage_banners banner
                                 where banner.internal_id = value and banner.placement = target_placement)) then
    raise exception using errcode = '40001', message = 'Список банерів змінився. Оновіть сторінку.';
  end if;

  select coalesce(jsonb_agg(banner.internal_id order by banner.sort_order, banner.created_at), '[]'::jsonb) into before_ids
  from public.homepage_banners banner where banner.placement = target_placement;

  update public.homepage_banners banner set sort_order = (picked.ordinal * 10)::integer
  from unnest(banner_ids) with ordinality as picked(value, ordinal)
  where banner.internal_id = picked.value and banner.sort_order is distinct from (picked.ordinal * 10)::integer;

  select coalesce(jsonb_agg(banner.internal_id order by banner.sort_order, banner.created_at), '[]'::jsonb) into after_ids
  from public.homepage_banners banner where banner.placement = target_placement;

  if before_ids is distinct from after_ids then
    insert into public.homepage_banners_audit (banner_id, placement, action, actor_id, changes)
    values (null, target_placement, 'reorder', auth.uid(), jsonb_build_object('order', jsonb_build_object('from', before_ids, 'to', after_ids)));
  end if;
  return public.admin_list_banners();
end;
$$;

revoke all on function public._banner_text(jsonb, text, integer, boolean, boolean) from public, anon, authenticated;
revoke all on function public._banner_url(jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public._banner_time(jsonb, text) from public, anon, authenticated;
revoke all on function public._banner_live(public.homepage_banners) from public, anon, authenticated;
revoke all on function public._banner_public_json(public.homepage_banners) from public, anon, authenticated;
revoke all on function public._banner_admin_json(public.homepage_banners) from public, anon, authenticated;
revoke all on function public._banners_require_editor() from public, anon, authenticated;

revoke all on function public.get_homepage_banners() from public;
grant execute on function public.get_homepage_banners() to anon, authenticated;

revoke all on function public.admin_list_banners() from public, anon;
revoke all on function public.admin_save_banner(uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_delete_banner(uuid, timestamptz) from public, anon;
revoke all on function public.admin_reorder_banners(text, uuid[]) from public, anon;
grant execute on function public.admin_list_banners() to authenticated;
grant execute on function public.admin_save_banner(uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_delete_banner(uuid, timestamptz) to authenticated;
grant execute on function public.admin_reorder_banners(text, uuid[]) to authenticated;
