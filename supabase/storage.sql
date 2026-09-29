-- TD Sofiivka storage architecture v1
-- Apply after schema.sql and rls.sql in a Supabase project where the storage schema exists.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'product-media',
    'product-media',
    true,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
  ),
  (
    'brand-media',
    'brand-media',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
  ),
  (
    'site-media',
    'site-media',
    true,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'video/mp4', 'video/webm']
  ),
  (
    'documents',
    'documents',
    true,
    26214400,
    array['application/pdf']
  ),
  (
    'import-private',
    'import-private',
    false,
    52428800,
    array['text/csv', 'application/json', 'application/zip', 'application/xml', 'text/xml']
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_allowed_storage_path(target_bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case target_bucket
    when 'product-media' then exists (
      select 1
      from public.products
      where internal_id::text = (storage.foldername(object_name))[1]
    )
    when 'documents' then exists (
      select 1
      from public.products
      where internal_id::text = (storage.foldername(object_name))[1]
    )
    when 'brand-media' then exists (
      select 1
      from public.brands
      where internal_id::text = (storage.foldername(object_name))[1]
    )
    when 'site-media' then
      coalesce((storage.foldername(object_name))[1], '') ~ '^[a-z0-9][a-z0-9-]{0,63}$'
    when 'import-private' then exists (
      select 1
      from public.suppliers
      where stable_id = (storage.foldername(object_name))[1]
    )
    else false
  end
$$;

revoke all on function public.is_allowed_storage_path(text, text) from public;
grant execute on function public.is_allowed_storage_path(text, text) to authenticated;

drop policy if exists sofievka_public_assets_read on storage.objects;
create policy sofievka_public_assets_read on storage.objects
for select to anon, authenticated
using (bucket_id in ('product-media', 'brand-media', 'site-media', 'documents'));

drop policy if exists sofievka_content_assets_insert on storage.objects;
create policy sofievka_content_assets_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('product-media', 'brand-media', 'site-media', 'documents')
  and public.can_manage_content()
  and public.is_allowed_storage_path(bucket_id, name)
);

drop policy if exists sofievka_content_assets_update on storage.objects;
create policy sofievka_content_assets_update on storage.objects
for update to authenticated
using (
  bucket_id in ('product-media', 'brand-media', 'site-media', 'documents')
  and public.can_manage_content()
  and public.is_allowed_storage_path(bucket_id, name)
)
with check (
  bucket_id in ('product-media', 'brand-media', 'site-media', 'documents')
  and public.can_manage_content()
  and public.is_allowed_storage_path(bucket_id, name)
);

drop policy if exists sofievka_content_assets_delete on storage.objects;
create policy sofievka_content_assets_delete on storage.objects
for delete to authenticated
using (
  bucket_id in ('product-media', 'brand-media', 'site-media', 'documents')
  and public.can_manage_content()
  and public.is_allowed_storage_path(bucket_id, name)
);

drop policy if exists sofievka_private_import_read on storage.objects;
create policy sofievka_private_import_read on storage.objects
for select to authenticated
using (
  bucket_id = 'import-private'
  and public.can_admin_catalog()
  and public.is_allowed_storage_path(bucket_id, name)
);

drop policy if exists sofievka_private_import_insert on storage.objects;
create policy sofievka_private_import_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'import-private'
  and public.can_admin_catalog()
  and public.is_allowed_storage_path(bucket_id, name)
);

drop policy if exists sofievka_private_import_update on storage.objects;
create policy sofievka_private_import_update on storage.objects
for update to authenticated
using (
  bucket_id = 'import-private'
  and public.can_admin_catalog()
  and public.is_allowed_storage_path(bucket_id, name)
)
with check (
  bucket_id = 'import-private'
  and public.can_admin_catalog()
  and public.is_allowed_storage_path(bucket_id, name)
);

drop policy if exists sofievka_private_import_delete on storage.objects;
create policy sofievka_private_import_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'import-private'
  and public.can_admin_catalog()
  and public.is_allowed_storage_path(bucket_id, name)
);

commit;
