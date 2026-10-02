-- Media library v1 (/admin/media): images that staff upload once and reuse in banners, products
-- and brands. The browser uploads the file to the public site-media bucket (folder library/)
-- through the Storage REST API with the staff member's JWT; the existing storage policies from
-- 20260928000400_storage.sql already allow that for can_manage_content() roles, so no new bucket
-- or policy is needed. The browser then registers the file here with admin_register_media.
-- Existing product images stay where they are (moving them needs the service key).
--
-- Reads are open to every active staff member, writes to owner/admin/content_manager
-- (can_manage_content). Changes are audited in media_assets_audit; alt-text edits are guarded by
-- the row's updated_at. Deleting refuses a file that a banner, product or brand still uses; the
-- browser removes the Storage object after the row is gone.
--
-- Statements the Supabase MCP connector cannot run (apply this file through the SQL Editor):
--   admin_delete_media contains `delete from public.media_assets`.
-- No triggers are created or dropped here.

-- The bucket is created by 20260928000400_storage.sql; make sure it exists where the storage
-- schema does (the local PGlite harness has no storage schema and skips this block).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('site-media', 'site-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'video/mp4', 'video/webm'])
      on conflict (id) do nothing
    $sql$;
  end if;
end;
$$;

create table public.media_assets (
  internal_id uuid primary key default gen_random_uuid(),
  bucket text not null default 'site-media' check (bucket = 'site-media'),
  storage_path text not null unique check (
    char_length(storage_path) between 9 and 400
    and storage_path ~ '^library/[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$'
    and storage_path !~ '\.\.'
  ),
  url text not null unique check (char_length(url) between 1 and 1000 and url ~ '^https://'),
  original_name text not null default '' check (char_length(original_name) <= 200),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index media_assets_created_idx on public.media_assets (created_at desc);

alter table public.media_assets enable row level security;
revoke all on table public.media_assets from public, anon, authenticated;

create table public.media_assets_audit (
  internal_id uuid primary key default gen_random_uuid(),
  media_id uuid,
  action text not null check (action in ('create', 'update', 'delete')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);

create index media_assets_audit_created_idx on public.media_assets_audit (created_at desc);

alter table public.media_assets_audit enable row level security;
revoke all on table public.media_assets_audit from public, anon, authenticated;

-- Usage lookups compare full URLs; a hash index has no length limit on long external URLs.
create index if not exists product_media_url_hash_idx on public.product_media using hash (url);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Where a file is used: banners (image, phone image, logo), product images, brand logos.
create or replace function public._media_usage(target_url text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'banners', (select count(*)::integer from public.homepage_banners banner
                where target_url in (banner.image_url, banner.mobile_image_url, banner.logo_url)),
    'products', (select count(distinct media.product_id)::integer from public.product_media media where media.url = target_url),
    'brands', (select count(*)::integer from public.brands brand where brand.logo_url = target_url)
  )
$$;

create or replace function public._media_admin_json(target public.media_assets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', target.internal_id,
    'bucket', target.bucket,
    'path', target.storage_path,
    'url', target.url,
    'name', target.original_name,
    'alt', target.alt_text,
    'mimeType', target.mime_type,
    'size', target.size_bytes,
    'width', target.width,
    'height', target.height,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at,
    'uploadedBy', (select profile.name from public.admin_profiles profile where profile.user_id = target.uploaded_by),
    'usage', public._media_usage(target.url)
  )
$$;

create or replace function public._media_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Змінювати медіатеку можуть власник, адміністратор і контент-менеджер.';
  end if;
end;
$$;

create or replace function public._media_dimension(raw jsonb, label text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) = 'null' or btrim(raw #>> '{}') = '' then return null; end if;
  if (raw #>> '{}') !~ '^\d{1,5}$' or (raw #>> '{}')::integer not between 1 and 20000 then
    raise exception using errcode = '22023', message = format('%s: ціле число від 1 до 20000.', label);
  end if;
  return (raw #>> '{}')::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff reads
-- ---------------------------------------------------------------------------

-- One page of the library, newest first. search_text matches the file name, alt text or path.
create or replace function public.admin_list_media(search_text text default null, page_number integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size constant integer := 40;
  needle text := nullif(btrim(left(coalesce(search_text, ''), 100)), '');
  pattern text;
  current_page integer := greatest(1, least(coalesce(page_number, 1), 10000));
  total integer;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  pattern := case when needle is null then null
    else '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  select count(*)::integer into total
  from public.media_assets asset
  where pattern is null or asset.original_name ilike pattern or asset.alt_text ilike pattern or asset.storage_path ilike pattern;

  return jsonb_build_object(
    'canEdit', public.can_manage_content(),
    'limits', jsonb_build_object('maxBytes', 5242880, 'mimeTypes', jsonb_build_array('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
    'page', current_page,
    'pageSize', page_size,
    'total', total,
    'items', coalesce((
      select jsonb_agg(public._media_admin_json(picked) order by picked.created_at desc, picked.internal_id)
      from (
        select asset.* from public.media_assets asset
        where pattern is null or asset.original_name ilike pattern or asset.alt_text ilike pattern or asset.storage_path ilike pattern
        order by asset.created_at desc, asset.internal_id
        limit page_size offset (current_page - 1) * page_size
      ) picked
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- Record a file the browser has just uploaded to site-media/library/... . The URL must be the
-- public URL of exactly that object; where the storage schema exists, the object must exist.
create or replace function public.admin_register_media(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned public.media_assets%rowtype;
  size_raw jsonb;
  object_found boolean;
begin
  perform public._media_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані файлу.';
  end if;

  cleaned.storage_path := public._settings_text(payload -> 'path', 'Шлях файлу', 400, true);
  if cleaned.storage_path !~ '^library/[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$' or cleaned.storage_path ~ '\.\.' then
    raise exception using errcode = '22023', message = 'Файл має лежати в папці library/ сховища site-media.';
  end if;
  cleaned.url := public._settings_text(payload -> 'url', 'Адреса файлу', 1000, true);
  if cleaned.url !~ '^https://[^/\s<>"''\\]+/storage/v1/object/public/site-media/'
    or right(cleaned.url, char_length(cleaned.storage_path) + 1) <> '/' || cleaned.storage_path then
    raise exception using errcode = '22023', message = 'Адреса файлу не відповідає сховищу site-media.';
  end if;
  cleaned.mime_type := lower(public._settings_text(payload -> 'mimeType', 'Тип файлу', 40, true));
  if cleaned.mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml') then
    raise exception using errcode = '22023', message = 'Підходять лише зображення JPG, PNG, WebP або SVG.';
  end if;
  size_raw := payload -> 'size';
  if size_raw is null or (size_raw #>> '{}') !~ '^\d{1,9}$' then
    raise exception using errcode = '22023', message = 'Некоректний розмір файлу.';
  end if;
  cleaned.size_bytes := (size_raw #>> '{}')::integer;
  if cleaned.size_bytes < 1 or cleaned.size_bytes > 5242880 then
    raise exception using errcode = '22023', message = 'Файл більший за 5 МБ. Стисніть зображення.';
  end if;
  cleaned.width := public._media_dimension(payload -> 'width', 'Ширина');
  cleaned.height := public._media_dimension(payload -> 'height', 'Висота');
  cleaned.original_name := public._settings_text(to_jsonb(left(coalesce(payload ->> 'name', ''), 200)), 'Назва файлу', 200);
  cleaned.alt_text := public._settings_text(payload -> 'alt', 'Опис зображення', 300);

  if exists (select 1 from public.media_assets asset where asset.storage_path = cleaned.storage_path or asset.url = cleaned.url) then
    raise exception using errcode = '23505', message = 'Цей файл уже є в медіатеці.';
  end if;

  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = $1 and name = $2)'
      into object_found using 'site-media', cleaned.storage_path;
    if not object_found then
      raise exception using errcode = 'P0002', message = 'Файл не знайдено у сховищі. Завантажте його ще раз.';
    end if;
  end if;

  insert into public.media_assets (bucket, storage_path, url, original_name, alt_text, mime_type, size_bytes, width, height, uploaded_by, updated_by)
  values ('site-media', cleaned.storage_path, cleaned.url, cleaned.original_name, cleaned.alt_text, cleaned.mime_type,
    cleaned.size_bytes, cleaned.width, cleaned.height, auth.uid(), auth.uid())
  returning * into cleaned;
  insert into public.media_assets_audit (media_id, action, actor_id, changes)
  values (cleaned.internal_id, 'create', auth.uid(), jsonb_build_object('path', cleaned.storage_path, 'name', cleaned.original_name));
  return jsonb_build_object('item', public._media_admin_json(cleaned));
end;
$$;

create or replace function public.admin_update_media(media_id uuid, alt_text text, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets%rowtype;
  next_alt text;
  previous_alt text;
begin
  perform public._media_require_editor();
  select * into target from public.media_assets asset where asset.internal_id = media_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Файл не знайдено. Оновіть сторінку.'; end if;
  if expected_updated_at is null or target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Файл уже змінив інший працівник. Оновіть сторінку.';
  end if;
  next_alt := regexp_replace(public._settings_text(to_jsonb(coalesce(alt_text, '')), 'Опис зображення', 300), '\s*[\r\n\t]+\s*', ' ', 'g');
  if next_alt is distinct from target.alt_text then
    previous_alt := target.alt_text;
    update public.media_assets asset set alt_text = next_alt, updated_at = clock_timestamp(), updated_by = auth.uid()
    where asset.internal_id = target.internal_id
    returning * into target;
    insert into public.media_assets_audit (media_id, action, actor_id, changes)
    values (target.internal_id, 'update', auth.uid(),
      jsonb_build_object('alt', jsonb_build_object('from', previous_alt, 'to', next_alt), 'label', target.original_name));
  end if;
  return jsonb_build_object('item', public._media_admin_json(target));
end;
$$;

-- Remove a file from the library. Refused while a banner, product or brand uses its URL.
-- Returns the Storage location so the browser can delete the object itself.
create or replace function public.admin_delete_media(media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets%rowtype;
  usage jsonb;
  places text[];
begin
  perform public._media_require_editor();
  select * into target from public.media_assets asset where asset.internal_id = media_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Файл не знайдено. Оновіть сторінку.'; end if;
  usage := public._media_usage(target.url);
  places := array_remove(array[
    case when (usage ->> 'banners')::integer > 0 then format('банери: %s', usage ->> 'banners') end,
    case when (usage ->> 'products')::integer > 0 then format('товари: %s', usage ->> 'products') end,
    case when (usage ->> 'brands')::integer > 0 then format('бренди: %s', usage ->> 'brands') end
  ], null);
  if cardinality(places) > 0 then
    raise exception using errcode = '23503',
      message = format('Файл використовується (%s). Спершу замініть його там.', array_to_string(places, ', '));
  end if;
  delete from public.media_assets where internal_id = target.internal_id;
  insert into public.media_assets_audit (media_id, action, actor_id, changes)
  values (target.internal_id, 'delete', auth.uid(), jsonb_build_object('path', target.storage_path, 'name', target.original_name));
  return jsonb_build_object('deleted', target.internal_id, 'bucket', target.bucket, 'path', target.storage_path);
end;
$$;

revoke all on function public._media_usage(text) from public, anon, authenticated;
revoke all on function public._media_admin_json(public.media_assets) from public, anon, authenticated;
revoke all on function public._media_require_editor() from public, anon, authenticated;
revoke all on function public._media_dimension(jsonb, text) from public, anon, authenticated;

revoke all on function public.admin_list_media(text, integer) from public, anon;
revoke all on function public.admin_register_media(jsonb) from public, anon;
revoke all on function public.admin_update_media(uuid, text, timestamptz) from public, anon;
revoke all on function public.admin_delete_media(uuid) from public, anon;
grant execute on function public.admin_list_media(text, integer) to authenticated;
grant execute on function public.admin_register_media(jsonb) to authenticated;
grant execute on function public.admin_update_media(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_delete_media(uuid) to authenticated;
