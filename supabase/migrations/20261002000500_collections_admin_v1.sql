-- Collections Admin v1: product collections ("Підбірки") managed from /admin/collections.
-- The homepage blocks «Хіти продажів» (homepage-products) and «Акційні пропозиції»
-- (homepage-sale-products) read their products through get_catalog_collection, which already
-- honours active/date_from/date_to and the item order. Every save here bumps the admin cache
-- revision, and membership changes refresh the product cards of the affected products (their
-- payload lists the collections they belong to).
--
-- Statements the Supabase MCP connector cannot run (apply through the SQL Editor instead):
--   admin_set_collection_products contains `delete from public.product_collection_items`;
--   admin_delete_collection contains `delete from public.product_collections`.
-- No triggers are created or dropped here.

-- Audit rows share the taxonomy audit table.
alter table public.taxonomy_admin_audit drop constraint if exists taxonomy_admin_audit_entity_type_check;
alter table public.taxonomy_admin_audit
  add constraint taxonomy_admin_audit_entity_type_check check (entity_type in ('brand', 'category', 'homepage', 'collection'));

-- The two homepage blocks must exist; the catalogue import created them with placeholder titles.
insert into public.product_collections (stable_id, slug, title, collection_type, sort_order)
values ('homepage-products', 'homepage-products', 'Хіти продажів', 'featured', 10),
       ('homepage-sale-products', 'homepage-sale-products', 'Акційні пропозиції', 'promotion', 20)
on conflict (stable_id) do nothing;
update public.product_collections set title = 'Хіти продажів'
where stable_id = 'homepage-products' and title = 'homepageProductIds';
update public.product_collections set title = 'Акційні пропозиції'
where stable_id = 'homepage-sale-products' and title = 'homepageSaleProductIds';
select public._taxonomy_bump_revision(pointer.snapshot_version) from public.catalog_snapshot_pointer pointer where pointer.singleton;

create or replace function public._collections_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Недостатньо прав для редагування підбірок.';
  end if;
end;
$$;

-- Which homepage block a collection feeds, if any. These two cannot be deleted.
create or replace function public._collection_homepage_block(target_stable_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case target_stable_id
    when 'homepage-products' then 'popular'
    when 'homepage-sale-products' then 'sale'
  end
$$;

-- Refresh the public read model after a collection change: product cards of the given products
-- (their payload lists active collections), or just the cache revision when there are none.
-- Databases without an active release (fresh installs, tests) skip silently.
create or replace function public._collection_publish(target_product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_version text;
begin
  active_version := public._taxonomy_lock_release();
  if active_version is null then return; end if;
  if cardinality(coalesce(target_product_ids, '{}')) > 0 then
    perform public._admin_refresh_catalog(target_product_ids);
  else
    perform public._taxonomy_bump_revision(active_version);
  end if;
end;
$$;

create or replace function public._collection_json(target public.product_collections)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', target.stable_id,
    'internalId', target.internal_id,
    'slug', target.slug,
    'title', target.title,
    'description', target.description,
    'type', target.collection_type,
    'active', target.active,
    'dateFrom', target.date_from,
    'dateTo', target.date_to,
    'sortOrder', target.sort_order,
    'live', target.active
      and (target.date_from is null or target.date_from <= now())
      and (target.date_to is null or target.date_to >= now()),
    'homepageBlock', public._collection_homepage_block(target.stable_id),
    'updatedAt', target.updated_at,
    'itemCount', (select count(*) from public.product_collection_items item where item.collection_id = target.internal_id),
    'publishedCount', (select count(*) from public.product_collection_items item
      join public.products product on product.internal_id = item.product_id and product.publication_status = 'published'
      where item.collection_id = target.internal_id)
  )
$$;

-- One product in the shape the collection editor uses (items and search results alike).
create or replace function public._collection_product_json(target_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'legacyId', product.legacy_id,
    'sku', product.sku,
    'title', product.title,
    'model', product.model,
    'brand', brand.name,
    'imageUrl', (
      select media.url from public.product_media media
      where media.product_id = product.internal_id and media.active and media.media_type = 'image'
      order by (media.role = 'primary') desc, media.sort_order, media.internal_id limit 1
    ),
    'amount', product.amount,
    'oldAmount', product.old_amount,
    'currency', product.currency,
    'priceStatus', product.price_status,
    'inventoryStatus', product.inventory_status,
    'publicationStatus', product.publication_status,
    'inCatalog', product.publication_status = 'published' and brand.status = 'active' and category.status = 'active',
    'tags', coalesce((
      select jsonb_agg(tag.stable_id order by tag.stable_id)
      from public.product_tags relation
      join public.tags tag on tag.internal_id = relation.tag_id and tag.status = 'active'
      where relation.product_id = product.internal_id
    ), '[]'::jsonb)
  )
  from public.products product
  join public.brands brand on brand.internal_id = product.brand_id
  join public.categories category on category.internal_id = product.primary_category_id
  where product.internal_id = target_product_id
$$;

create or replace function public._collection_member_ids(target_collection_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(item.product_id order by item.sort_order, item.product_id), '{}')
  from public.product_collection_items item where item.collection_id = target_collection_id
$$;

create or replace function public._collection_member_legacy_ids(target_collection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(product.legacy_id order by item.sort_order, product.legacy_id), '[]'::jsonb)
  from public.product_collection_items item
  join public.products product on product.internal_id = item.product_id
  where item.collection_id = target_collection_id
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_collections()
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
    'collections', coalesce((
      select jsonb_agg(public._collection_json(collection)
        order by public._collection_homepage_block(collection.stable_id) is null, collection.sort_order, collection.stable_id)
      from public.product_collections collection
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_collection(collection_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.product_collections%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.product_collections collection where collection.stable_id = collection_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'collection', public._collection_json(target),
    'canEdit', public.can_manage_content(),
    'items', coalesce((
      select jsonb_agg(public._collection_product_json(item.product_id) order by item.sort_order, item.product_id)
      from public.product_collection_items item where item.collection_id = target.internal_id
    ), '[]'::jsonb),
    'history', public._taxonomy_audit_json('collection', target.internal_id)
  );
end;
$$;

-- Product picker for the editor: title, SKU, model or brand; published products first.
create or replace function public.admin_search_collection_products(query_text text, result_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  needle text := btrim(coalesce(query_text, ''));
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if length(needle) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public._collection_product_json(hit.internal_id) order by hit.rank, hit.title)
    from (
      select product.internal_id, product.title,
        case when product.publication_status = 'published' then 0 else 1 end
          + case when lower(product.sku) = lower(needle) or lower(product.legacy_id) = lower(needle) then -2 else 0 end rank
      from public.products product
      join public.brands brand on brand.internal_id = product.brand_id
      where concat_ws(' ', product.title, product.sku, product.model, product.legacy_id, brand.name) ilike '%' || needle || '%'
      order by rank, product.title
      limit least(greatest(coalesce(result_limit, 20), 1), 50)
    ) hit
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

create or replace function public._collection_parse_time(raw jsonb, label text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) = 'null' or btrim(raw #>> '{}') = '' then return null; end if;
  begin
    return (raw #>> '{}')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = format('Некоректна дата «%s».', label);
  end;
end;
$$;

create or replace function public.admin_update_collection(collection_id text, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.product_collections%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
begin
  perform public._collections_require_editor();
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні зміни.';
  end if;

  select * into target from public.product_collections collection where collection.stable_id = collection_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Підбірку не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Підбірку вже змінив інший працівник. Оновіть сторінку.';
  end if;
  before_row := to_jsonb(target);

  if patch ? 'title' then
    target.title := public._taxonomy_clean_text(patch ->> 'title', 160);
    if target.title is null then raise exception using errcode = '22023', message = 'Назва підбірки обов’язкова.'; end if;
  end if;
  if patch ? 'description' then target.description := coalesce(public._taxonomy_clean_text(patch ->> 'description', 2000), ''); end if;
  if patch ? 'type' then
    if coalesce(patch ->> 'type', '') not in ('manual', 'promotion', 'featured') then
      raise exception using errcode = '22023', message = 'Невідомий тип підбірки.';
    end if;
    target.collection_type := (patch ->> 'type')::public.collection_type;
  end if;
  if patch ? 'active' then
    if jsonb_typeof(patch -> 'active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Некоректне значення «Показувати на сайті».';
    end if;
    target.active := (patch ->> 'active')::boolean;
  end if;
  if patch ? 'dateFrom' then target.date_from := public._collection_parse_time(patch -> 'dateFrom', 'Показувати з'); end if;
  if patch ? 'dateTo' then target.date_to := public._collection_parse_time(patch -> 'dateTo', 'Показувати до'); end if;
  if target.date_from is not null and target.date_to is not null and target.date_to < target.date_from then
    raise exception using errcode = '22023', message = 'Дата завершення показу раніша за дату початку.';
  end if;
  if patch ? 'sortOrder' then
    if coalesce(patch ->> 'sortOrder', '') !~ '^\d{1,6}$' then
      raise exception using errcode = '22023', message = 'Порядок має бути цілим числом від 0.';
    end if;
    target.sort_order := (patch ->> 'sortOrder')::integer;
  end if;

  update public.product_collections set
    title = target.title,
    description = target.description,
    collection_type = target.collection_type,
    active = target.active,
    date_from = target.date_from,
    date_to = target.date_to,
    sort_order = target.sort_order,
    updated_by = auth.uid()
  where internal_id = target.internal_id
  returning * into target;

  after_row := to_jsonb(target);
  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['title', 'description', 'collection_type', 'active', 'date_from', 'date_to', 'sort_order']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('collection', target.internal_id, target.stable_id, auth.uid(), changes);
    -- Product cards list only active collections, so switching it on or off touches every member.
    perform public._collection_publish(case when changes ? 'active' then public._collection_member_ids(target.internal_id) else '{}'::uuid[] end);
  end if;

  return public.admin_get_collection(collection_id);
end;
$$;

-- Replace the collection's products with the given ordered list of product ids (legacy ids).
create or replace function public.admin_set_collection_products(collection_id text, product_ids text[], expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.product_collections%rowtype;
  missing text;
  before_ids jsonb;
  after_ids jsonb;
  before_members uuid[];
  after_members uuid[];
  touched uuid[];
begin
  perform public._collections_require_editor();
  product_ids := coalesce(product_ids, '{}');
  if cardinality(product_ids) > 100 then
    raise exception using errcode = '22023', message = 'У підбірці може бути до 100 товарів.';
  end if;
  if cardinality(product_ids) <> (select count(distinct value) from unnest(product_ids) value) then
    raise exception using errcode = '22023', message = 'Товар повторюється у списку.';
  end if;

  select * into target from public.product_collections collection where collection.stable_id = collection_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Підбірку не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Підбірку вже змінив інший працівник. Оновіть сторінку.';
  end if;

  select value into missing from unnest(product_ids) value
  where not exists (select 1 from public.products product where product.legacy_id = value) limit 1;
  if missing is not null then
    raise exception using errcode = 'P0002', message = format('Товар «%s» не знайдено.', missing);
  end if;

  before_ids := public._collection_member_legacy_ids(target.internal_id);
  before_members := public._collection_member_ids(target.internal_id);

  delete from public.product_collection_items item
  where item.collection_id = target.internal_id
    and item.product_id not in (select product.internal_id from public.products product where product.legacy_id = any(product_ids));

  insert into public.product_collection_items (collection_id, product_id, sort_order, created_by)
  select target.internal_id, product.internal_id, (picked.ordinal - 1)::integer, auth.uid()
  from unnest(product_ids) with ordinality as picked(value, ordinal)
  join public.products product on product.legacy_id = picked.value
  on conflict on constraint product_collection_items_pkey do update
    set sort_order = excluded.sort_order
    where public.product_collection_items.sort_order is distinct from excluded.sort_order;

  after_ids := public._collection_member_legacy_ids(target.internal_id);
  if before_ids is not distinct from after_ids then
    return public.admin_get_collection(collection_id);
  end if;

  update public.product_collections set updated_by = auth.uid() where internal_id = target.internal_id;
  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('collection', target.internal_id, target.stable_id, auth.uid(),
    jsonb_build_object('products', jsonb_build_object('from', before_ids, 'to', after_ids)));

  -- Added and removed products change their card's collection list; a pure reorder does not.
  after_members := public._collection_member_ids(target.internal_id);
  select coalesce(array_agg(id), '{}') into touched from (
    (select unnest(before_members) except select unnest(after_members))
    union
    (select unnest(after_members) except select unnest(before_members))
  ) changed(id);
  perform public._collection_publish(case when target.active then touched else '{}'::uuid[] end);

  return public.admin_get_collection(collection_id);
end;
$$;

create or replace function public.admin_create_collection(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_title text;
  collection_slug text;
  created public.product_collections%rowtype;
begin
  perform public._collections_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані підбірки.';
  end if;

  collection_title := public._taxonomy_clean_text(payload ->> 'title', 160);
  if collection_title is null then raise exception using errcode = '22023', message = 'Назва підбірки обов’язкова.'; end if;

  collection_slug := coalesce(public._taxonomy_clean_text(payload ->> 'slug', 80), public._taxonomy_slugify(collection_title));
  if not public._taxonomy_valid_slug(collection_slug) then
    raise exception using errcode = '22023', message = 'Код: лише латинські літери, цифри й дефіси.';
  end if;
  if exists (select 1 from public.product_collections collection
             where collection.stable_id = collection_slug or collection.slug = collection_slug) then
    raise exception using errcode = '23505', message = format('Код «%s» уже зайнятий іншою підбіркою.', collection_slug);
  end if;

  insert into public.product_collections (stable_id, slug, title, collection_type, active, sort_order, created_by, updated_by)
  values (collection_slug, collection_slug, collection_title, 'manual', true,
    (select coalesce(max(collection.sort_order), 0) + 10 from public.product_collections collection),
    auth.uid(), auth.uid())
  returning * into created;

  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('collection', created.internal_id, created.stable_id, auth.uid(),
    jsonb_build_object('created', jsonb_build_object('from', null, 'to', created.title)));
  perform public._collection_publish('{}');

  if payload - 'title' - 'slug' <> '{}'::jsonb then
    perform public.admin_update_collection(created.stable_id, payload - 'title' - 'slug', null);
  end if;
  return public.admin_get_collection(created.stable_id);
end;
$$;

create or replace function public.admin_delete_collection(collection_id text, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.product_collections%rowtype;
  members uuid[];
begin
  perform public._collections_require_editor();
  select * into target from public.product_collections collection where collection.stable_id = collection_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Підбірку не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Підбірку вже змінив інший працівник. Оновіть сторінку.';
  end if;
  if public._collection_homepage_block(target.stable_id) is not null then
    raise exception using errcode = '23503',
      message = 'Цю підбірку показує головна сторінка, її не можна видалити. Приберіть товари або вимкніть показ.';
  end if;

  members := public._collection_member_ids(target.internal_id);
  -- Items go with the collection (on delete cascade).
  delete from public.product_collections where internal_id = target.internal_id;
  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('collection', target.internal_id, target.stable_id, auth.uid(),
    jsonb_build_object('deleted', jsonb_build_object('from', target.title, 'to', null)));
  perform public._collection_publish(case when target.active then members else '{}'::uuid[] end);
  return jsonb_build_object('deleted', target.stable_id);
end;
$$;

revoke all on function public._collections_require_editor() from public, anon, authenticated;
revoke all on function public._collection_homepage_block(text) from public, anon, authenticated;
revoke all on function public._collection_publish(uuid[]) from public, anon, authenticated;
revoke all on function public._collection_json(public.product_collections) from public, anon, authenticated;
revoke all on function public._collection_product_json(uuid) from public, anon, authenticated;
revoke all on function public._collection_member_ids(uuid) from public, anon, authenticated;
revoke all on function public._collection_member_legacy_ids(uuid) from public, anon, authenticated;
revoke all on function public._collection_parse_time(jsonb, text) from public, anon, authenticated;

revoke all on function public.admin_list_collections() from public, anon;
revoke all on function public.admin_get_collection(text) from public, anon;
revoke all on function public.admin_search_collection_products(text, integer) from public, anon;
revoke all on function public.admin_update_collection(text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_set_collection_products(text, text[], timestamptz) from public, anon;
revoke all on function public.admin_create_collection(jsonb) from public, anon;
revoke all on function public.admin_delete_collection(text, timestamptz) from public, anon;
grant execute on function public.admin_list_collections() to authenticated;
grant execute on function public.admin_get_collection(text) to authenticated;
grant execute on function public.admin_search_collection_products(text, integer) to authenticated;
grant execute on function public.admin_update_collection(text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_set_collection_products(text, text[], timestamptz) to authenticated;
grant execute on function public.admin_create_collection(jsonb) to authenticated;
grant execute on function public.admin_delete_collection(text, timestamptz) to authenticated;
