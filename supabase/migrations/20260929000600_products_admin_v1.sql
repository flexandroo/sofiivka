-- TD Sofiivka products admin v1.
-- Server-side list/editor reads, role-scoped transactional mutations, audit trail,
-- and atomic refresh of the active public catalogue read model.
begin;
set local search_path = public, extensions;

create sequence public.catalog_admin_revision_seq as bigint;
revoke all on sequence public.catalog_admin_revision_seq from public, anon, authenticated;

create table public.product_admin_audit (
  internal_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(internal_id) on delete restrict,
  legacy_id text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('create', 'update', 'bulk_publish', 'bulk_hide', 'bulk_archive', 'bulk_category', 'bulk_brand')),
  changed_sections text[] not null default '{}',
  request_id uuid not null default gen_random_uuid(),
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state) = 'object'),
  created_at timestamptz not null default now()
);

create index product_admin_audit_product_idx
  on public.product_admin_audit (product_id, created_at desc);

alter table public.product_admin_audit enable row level security;
create policy product_admin_audit_admin_read on public.product_admin_audit
for select using (public.is_active_admin());

revoke all on table public.product_admin_audit from public, anon, authenticated;
grant select on public.product_admin_audit to authenticated;

-- Allow the cache version (the release primary key) to move atomically. The
-- underlying product payloads stay on the same active release; only its public
-- revision changes after a committed admin mutation.
alter table public.catalog_product_cards
  drop constraint if exists catalog_product_cards_snapshot_version_legacy_id_fkey;
alter table public.catalog_product_cards
  add constraint catalog_product_cards_snapshot_version_legacy_id_fkey
  foreign key (snapshot_version, legacy_id)
  references public.catalog_product_snapshots(snapshot_version, legacy_id)
  on update cascade on delete cascade;

alter table public.catalog_product_snapshots
  drop constraint if exists catalog_product_snapshots_snapshot_version_fkey;
alter table public.catalog_product_snapshots
  add constraint catalog_product_snapshots_snapshot_version_fkey
  foreign key (snapshot_version)
  references public.catalog_snapshot_releases(snapshot_version)
  on update cascade on delete cascade;

alter table public.catalog_snapshot_pointer
  drop constraint if exists catalog_snapshot_pointer_snapshot_version_fkey;
alter table public.catalog_snapshot_pointer
  add constraint catalog_snapshot_pointer_snapshot_version_fkey
  foreign key (snapshot_version)
  references public.catalog_snapshot_releases(snapshot_version)
  on update cascade on delete restrict;

create or replace function public._admin_product_payload(
  target_product_id uuid,
  existing_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select product.*, brand.stable_id brand_stable_id, category.stable_id category_stable_id,
      series.stable_id series_stable_id
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id
    join public.categories category on category.internal_id = product.primary_category_id
    left join public.product_series series on series.internal_id = product.series_id
    where product.internal_id = target_product_id
  ), typed as (
    select definition.stable_id, definition.label, definition.unit, definition.sort_order,
      value.provenance, value.normalization_rule, value.source_label, value.source_value,
      value.unit_status,
      case definition.value_type
        when 'number' then to_jsonb(value.value_number)
        when 'boolean' then to_jsonb(value.value_boolean)
        when 'select' then coalesce(to_jsonb(option.value), to_jsonb(value.value_text))
        else to_jsonb(value.value_text)
      end value_json
    from public.product_attribute_values value
    join public.attribute_definitions definition on definition.internal_id = value.attribute_id
    left join public.attribute_options option on option.internal_id = value.option_id
    where value.product_id = target_product_id and definition.status = 'active'
  )
  select coalesce(existing_payload, '{}'::jsonb) || jsonb_build_object(
    'id', target.legacy_id,
    'slug', target.slug,
    'sku', target.sku,
    'title', target.title,
    'shortTitle', target.short_title,
    'model', target.model,
    'brandId', target.brand_stable_id,
    'primaryCategoryId', target.category_stable_id,
    'secondaryCategoryIds', coalesce((
      select jsonb_agg(category.stable_id order by relation.sort_order, category.stable_id)
      from public.product_categories relation
      join public.categories category on category.internal_id = relation.category_id
      where relation.product_id = target.internal_id
    ), '[]'::jsonb),
    'seriesId', target.series_stable_id,
    'pricing', jsonb_build_object(
      'amount', target.amount,
      'oldAmount', target.old_amount,
      'currency', target.currency,
      'priceStatus', target.price_status
    ),
    'inventory', jsonb_build_object('status', target.inventory_status),
    'publicationStatus', target.publication_status,
    'images', coalesce((
      select jsonb_agg(media.url order by (media.role = 'primary') desc, media.sort_order, media.internal_id)
      from public.product_media media
      where media.product_id = target.internal_id and media.active and media.media_type = 'image'
    ), '[]'::jsonb),
    'description', target.description,
    'shortDescription', target.short_description,
    'fullDescription', target.full_description,
    'descriptionSections', target.description_sections,
    'catalogAttributes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', typed.stable_id,
        'label', typed.label,
        'value', typed.value_json,
        'unit', coalesce(typed.unit, ''),
        'provenance', coalesce(typed.provenance, 'editorial'),
        'rule', coalesce(typed.normalization_rule, 'admin-v1'),
        'sourceLabel', coalesce(typed.source_label, ''),
        'sourceValue', coalesce(typed.source_value, 'null'::jsonb),
        'unitStatus', coalesce(typed.unit_status, 'not-applicable')
      ) order by typed.sort_order, typed.stable_id)
      from typed
    ), '[]'::jsonb),
    'normalizedAttributes', coalesce((
      select jsonb_object_agg(typed.stable_id, typed.value_json)
      from typed
    ), '{}'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('type', 'PDF', 'title', document.title, 'url', document.url)
        order by document.sort_order, document.internal_id)
      from public.product_documents document
      where document.product_id = target.internal_id and document.active
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(tag.stable_id order by tag.stable_id)
      from public.product_tags relation
      join public.tags tag on tag.internal_id = relation.tag_id and tag.status = 'active'
      where relation.product_id = target.internal_id
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(collection.stable_id order by item.sort_order, collection.stable_id)
      from public.product_collection_items item
      join public.product_collections collection on collection.internal_id = item.collection_id and collection.active
      where item.product_id = target.internal_id
    ), '[]'::jsonb),
    'badges', to_jsonb(target.badges),
    'source', coalesce(existing_payload -> 'source', jsonb_build_object(
      'supplier', 'manual', 'sourceId', target.legacy_id,
      'sourceCategory', target.category_stable_id, 'mappingStatus', 'mapped'
    )),
    'sourceAttributes', coalesce(existing_payload -> 'sourceAttributes', '[]'::jsonb),
    'unmappedAttributes', coalesce(existing_payload -> 'unmappedAttributes', '[]'::jsonb),
    'seo', case when target.seo_title is null and target.seo_description is null then 'null'::jsonb
      else jsonb_build_object('title', target.seo_title, 'description', target.seo_description) end
  )
  from target
$$;

revoke all on function public._admin_product_payload(uuid, jsonb) from public, anon, authenticated;

create or replace function public._admin_refresh_catalog(target_product_ids uuid[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_version text;
  new_version text;
  base_version text;
  target_id uuid;
  current_payload jsonb;
  next_order integer;
  product_payload jsonb;
  materialized_products jsonb;
  materialized_count integer;
  all_count integer;
  id_hash text;
begin
  select pointer.snapshot_version into active_version
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release on release.snapshot_version = pointer.snapshot_version and release.ready
  where pointer.singleton
  for update of pointer, release;

  if active_version is null then raise exception 'Active catalogue release not found'; end if;

  foreach target_id in array target_product_ids loop
    select snapshot.payload, snapshot.sort_order into current_payload, next_order
    from public.catalog_product_snapshots snapshot
    where snapshot.snapshot_version = active_version and snapshot.legacy_id = (
      select product.legacy_id from public.products product where product.internal_id = target_id
    );

    if next_order is null then
      select coalesce(max(snapshot.sort_order), -1) + 1 into next_order
      from public.catalog_product_snapshots snapshot where snapshot.snapshot_version = active_version;
    end if;

    product_payload := public._admin_product_payload(target_id, coalesce(current_payload, '{}'::jsonb));
    if product_payload is null then raise exception 'Product not found while refreshing catalogue'; end if;

    insert into public.catalog_product_snapshots (snapshot_version, legacy_id, sort_order, payload, updated_at)
    select active_version, product.legacy_id, next_order, product_payload, now()
    from public.products product where product.internal_id = target_id
    on conflict (snapshot_version, legacy_id) do update
      set payload = excluded.payload, updated_at = excluded.updated_at;

    delete from public.catalog_product_cards card
    where card.snapshot_version = active_version and card.legacy_id = product_payload ->> 'id';

    insert into public.catalog_product_cards (
      snapshot_version, legacy_id, sort_order, brand_id, category_id, series_id,
      amount, price_status, inventory_status, normalized_attributes, search_text, card
    )
    select active_version, product.legacy_id, next_order, brand.stable_id, category.stable_id,
      series.stable_id, product.amount, product.price_status, product.inventory_status,
      coalesce(product_payload -> 'normalizedAttributes', '{}'::jsonb),
      concat_ws(' ', product.sku, product.title, product.short_title, product.model,
        brand.name, brand.stable_id, category.title, category.stable_id,
        series.name, series.stable_id, product_payload ->> 'normalizedAttributes'),
      public._catalog_card(product_payload, brand.name)
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id and brand.status = 'active'
    join public.categories category on category.internal_id = product.primary_category_id and category.status = 'active'
    left join public.product_series series on series.internal_id = product.series_id
    where product.internal_id = target_id and product.publication_status = 'published';
  end loop;

  select coalesce(jsonb_agg(snapshot.payload order by snapshot.sort_order), '[]'::jsonb), count(*)::integer
  into materialized_products, materialized_count
  from public.catalog_product_snapshots snapshot
  join public.products product on product.legacy_id = snapshot.legacy_id and product.publication_status = 'published'
  join public.brands brand on brand.internal_id = product.brand_id and brand.status = 'active'
  join public.categories category on category.internal_id = product.primary_category_id and category.status = 'active'
  where snapshot.snapshot_version = active_version;

  select count(*)::integer,
    encode(extensions.digest(coalesce(string_agg(product.legacy_id, E'\n' order by product.legacy_id), ''), 'sha256'), 'hex')
  into all_count, id_hash from public.products product;

  base_version := regexp_replace(active_version, ':admin:[0-9]+$', '');
  new_version := base_version || ':admin:' || nextval('public.catalog_admin_revision_seq');

  update public.catalog_snapshot_releases
  set snapshot_version = new_version,
      products = materialized_products,
      product_count = all_count,
      public_product_count = materialized_count,
      product_id_hash = id_hash,
      updated_at = now()
  where snapshot_version = active_version;

  return new_version;
end;
$$;

revoke all on function public._admin_refresh_catalog(uuid[]) from public, anon, authenticated;

create or replace function public.admin_product_reference_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_active_admin() then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  with recursive category_paths as (
    select category.internal_id, category.stable_id, category.parent_id, category.level,
      category.title, category.title::text path, category.status, category.visibility, category.sort_order
    from public.categories category where category.parent_id is null
    union all
    select child.internal_id, child.stable_id, child.parent_id, child.level,
      child.title, parent.path || ' / ' || child.title, child.status, child.visibility, child.sort_order
    from public.categories child join category_paths parent on parent.internal_id = child.parent_id
  )
  select jsonb_build_object(
    'role', public.current_admin_role(),
    'capabilities', jsonb_build_object(
      'manageCore', public.can_manage_products(),
      'manageContent', public.can_manage_content(),
      'manageEverything', public.can_admin_catalog()
    ),
    'brands', coalesce((select jsonb_agg(jsonb_build_object(
      'id', brand.internal_id, 'stableId', brand.stable_id, 'name', brand.name, 'status', brand.status
    ) order by brand.name) from public.brands brand where brand.status <> 'archived'), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', category.internal_id, 'stableId', category.stable_id, 'parentId', category.parent_id,
      'level', category.level, 'title', category.title, 'path', category.path,
      'status', category.status, 'visibility', category.visibility
    ) order by category.path) from category_paths category where category.status <> 'archived'), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
      'id', series.internal_id, 'stableId', series.stable_id, 'brandId', series.brand_id, 'name', series.name
    ) order by series.name) from public.product_series series where series.status = 'active'), '[]'::jsonb),
    'attributes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', definition.internal_id, 'stableId', definition.stable_id, 'label', definition.label,
      'valueType', definition.value_type, 'unit', definition.unit, 'sortOrder', definition.sort_order,
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', option.internal_id, 'value', option.value, 'label', option.label)
        order by option.sort_order, option.label) from public.attribute_options option
        where option.attribute_id = definition.internal_id and option.active), '[]'::jsonb)
    ) order by definition.sort_order, definition.label) from public.attribute_definitions definition
      where definition.status = 'active'), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list_products(
  query_text text default null,
  filter_category_id uuid default null,
  filter_brand_id uuid default null,
  filter_publication public.product_publication_status default null,
  filter_inventory public.product_inventory_status default null,
  filter_price public.product_price_status default null,
  sort_mode text default 'updated-desc',
  page_number integer default 1,
  page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare result jsonb;
begin
  if not public.is_active_admin() then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if sort_mode not in ('updated-desc', 'updated-asc', 'title-asc', 'title-desc', 'price-asc', 'price-desc', 'sku-asc') then
    raise exception 'Unsupported sort mode';
  end if;
  with recursive descendants as (
    select category.internal_id from public.categories category where category.internal_id = filter_category_id
    union all select child.internal_id from public.categories child join descendants parent on child.parent_id = parent.internal_id
  ), filtered as materialized (
    select product.*, brand.name brand_name, brand.stable_id brand_stable_id,
      category.title category_title, category.stable_id category_stable_id,
      media.url image_url
    from public.products product
    join public.brands brand on brand.internal_id = product.brand_id
    join public.categories category on category.internal_id = product.primary_category_id
    left join lateral (
      select item.url from public.product_media item
      where item.product_id = product.internal_id and item.active and item.media_type = 'image'
      order by (item.role = 'primary') desc, item.sort_order, item.internal_id limit 1
    ) media on true
    where (filter_category_id is null or product.primary_category_id in (select internal_id from descendants))
      and (filter_brand_id is null or product.brand_id = filter_brand_id)
      and (filter_publication is null or product.publication_status = filter_publication)
      and (filter_inventory is null or product.inventory_status = filter_inventory)
      and (filter_price is null or product.price_status = filter_price)
      and (coalesce(btrim(query_text), '') = '' or concat_ws(' ', product.title, product.sku, product.model, brand.name) ilike '%' || btrim(query_text) || '%')
  ), numbered as (
    select filtered.*, row_number() over (order by
      case when sort_mode = 'updated-desc' then filtered.updated_at end desc,
      case when sort_mode = 'updated-asc' then filtered.updated_at end asc,
      case when sort_mode = 'title-asc' then lower(filtered.title) end asc,
      case when sort_mode = 'title-desc' then lower(filtered.title) end desc,
      case when sort_mode = 'price-asc' then (filtered.price_status <> 'known' or filtered.amount is null)::integer end asc,
      case when sort_mode = 'price-asc' then filtered.amount end asc nulls last,
      case when sort_mode = 'price-desc' then (filtered.price_status <> 'known' or filtered.amount is null)::integer end asc,
      case when sort_mode = 'price-desc' then filtered.amount end desc nulls last,
      case when sort_mode = 'sku-asc' then lower(filtered.sku) end asc,
      filtered.legacy_id asc
    ) ordinal from filtered
  ), page as (
    select * from numbered
    where ordinal > (greatest(page_number, 1) - 1) * least(greatest(page_size, 1), 100)
      and ordinal <= greatest(page_number, 1) * least(greatest(page_size, 1), 100)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', greatest(page_number, 1),
    'pageSize', least(greatest(page_size, 1), 100),
    'hasMore', (select count(*) from filtered) > greatest(page_number, 1) * least(greatest(page_size, 1), 100),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'internalId', page.internal_id, 'legacyId', page.legacy_id, 'sku', page.sku,
      'title', page.title, 'model', page.model, 'imageUrl', page.image_url,
      'brand', jsonb_build_object('id', page.brand_id, 'stableId', page.brand_stable_id, 'name', page.brand_name),
      'category', jsonb_build_object('id', page.primary_category_id, 'stableId', page.category_stable_id, 'title', page.category_title),
      'amount', page.amount, 'oldAmount', page.old_amount, 'currency', page.currency,
      'priceStatus', page.price_status, 'inventoryStatus', page.inventory_status,
      'publicationStatus', page.publication_status, 'updatedAt', page.updated_at
    ) order by page.ordinal) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_get_product(target_legacy_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare result jsonb;
begin
  if not public.is_active_admin() then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  select jsonb_build_object(
    'product', jsonb_build_object(
      'internalId', product.internal_id, 'legacyId', product.legacy_id, 'sku', product.sku,
      'slug', product.slug, 'title', product.title, 'shortTitle', product.short_title,
      'model', product.model, 'brandId', product.brand_id, 'categoryId', product.primary_category_id,
      'seriesId', product.series_id, 'amount', product.amount, 'oldAmount', product.old_amount,
      'currency', product.currency, 'priceStatus', product.price_status,
      'inventoryStatus', product.inventory_status, 'publicationStatus', product.publication_status,
      'description', product.description, 'shortDescription', product.short_description,
      'fullDescription', product.full_description, 'descriptionSections', product.description_sections,
      'badges', to_jsonb(product.badges), 'seoTitle', product.seo_title,
      'seoDescription', product.seo_description, 'createdAt', product.created_at,
      'updatedAt', product.updated_at, 'lastImportedAt', product.last_imported_at,
      'lastVerifiedAt', product.last_verified_at
    ),
    'attributes', coalesce((select jsonb_agg(jsonb_build_object(
      'attributeId', value.attribute_id, 'stableId', definition.stable_id, 'label', definition.label,
      'valueType', definition.value_type, 'unit', definition.unit,
      'value', case definition.value_type when 'number' then to_jsonb(value.value_number)
        when 'boolean' then to_jsonb(value.value_boolean)
        when 'select' then coalesce(to_jsonb(option.value), to_jsonb(value.value_text))
        else to_jsonb(value.value_text) end,
      'provenance', value.provenance, 'sourceLabel', value.source_label,
      'sourceValue', value.source_value, 'normalizationRule', value.normalization_rule,
      'unitStatus', value.unit_status
    ) order by definition.sort_order, definition.label)
      from public.product_attribute_values value
      join public.attribute_definitions definition on definition.internal_id = value.attribute_id
      left join public.attribute_options option on option.internal_id = value.option_id
      where value.product_id = product.internal_id), '[]'::jsonb),
    'sourceAttributes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', source.internal_id, 'ordinal', source.ordinal, 'label', source.label,
      'value', source.source_value, 'normalizedAttributeId', source.normalized_attribute_id,
      'mappingStatus', source.mapping_status, 'mappingNotes', source.mapping_notes,
      'canonicalLayer', source.source_metadata ->> 'canonicalLayer'
    ) order by source.ordinal, source.internal_id)
      from public.product_source_attributes source where source.product_id = product.internal_id), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object(
      'id', media.internal_id, 'mediaType', media.media_type, 'role', media.role,
      'url', media.url, 'storagePath', media.storage_path, 'sourceUrl', media.source_url,
      'altText', media.alt_text, 'sortOrder', media.sort_order, 'active', media.active
    ) order by (media.role = 'primary') desc, media.sort_order, media.internal_id)
      from public.product_media media where media.product_id = product.internal_id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', document.internal_id, 'title', document.title, 'documentType', document.document_type,
      'url', document.url, 'storagePath', document.storage_path, 'sourceUrl', document.source_url,
      'sortOrder', document.sort_order, 'active', document.active
    ) order by document.sort_order, document.internal_id)
      from public.product_documents document where document.product_id = product.internal_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
      'action', audit.action, 'sections', to_jsonb(audit.changed_sections),
      'actorId', audit.actor_id, 'createdAt', audit.created_at, 'requestId', audit.request_id
    ) order by audit.created_at desc)
      from (select * from public.product_admin_audit item where item.product_id = product.internal_id order by item.created_at desc limit 20) audit), '[]'::jsonb)
  ) into result
  from public.products product where product.legacy_id = target_legacy_id;
  return result;
end;
$$;

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
  if role_value not in ('owner', 'admin', 'manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
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

create or replace function public.admin_save_product(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_value public.admin_role := public.current_admin_role();
  target public.products%rowtype;
  before_value jsonb;
  changed text[] := '{}';
  entry jsonb;
  definition public.attribute_definitions%rowtype;
  version_value text;
  expected_updated_at timestamptz;
  target_legacy text := btrim(payload ->> 'legacyId');
begin
  if role_value is null then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if coalesce(target_legacy, '') = '' then raise exception 'legacyId is required'; end if;
  select * into target from public.products where legacy_id = target_legacy for update;
  if not found then raise exception 'Product not found'; end if;
  if payload ? 'newLegacyId' and payload ->> 'newLegacyId' is distinct from target.legacy_id then
    raise exception using errcode = '23514', message = 'legacy_id is immutable';
  end if;
  if payload ? 'expectedUpdatedAt' then
    expected_updated_at := (payload ->> 'expectedUpdatedAt')::timestamptz;
    if target.updated_at is distinct from expected_updated_at then
      raise exception using errcode = '40001', message = 'Product changed since it was opened';
    end if;
  end if;
  if role_value = 'content_manager' and (payload ? 'core' or payload ? 'commercial' or payload ? 'attributes') then
    raise exception using errcode = '42501', message = 'Content manager cannot change product commercial or classification fields';
  end if;
  if role_value = 'manager' and (payload ? 'content' or payload ? 'media' or payload ? 'documents') then
    raise exception using errcode = '42501', message = 'Manager cannot change editorial content';
  end if;
  before_value := to_jsonb(target) - 'search_document';

  if payload ? 'core' then
    if role_value not in ('owner', 'admin', 'manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
    if not exists (select 1 from public.brands where internal_id = (payload #>> '{core,brandId}')::uuid and status <> 'archived') then raise exception 'Brand not found'; end if;
    if not exists (select 1 from public.categories where internal_id = (payload #>> '{core,categoryId}')::uuid and status <> 'archived') then raise exception 'Category not found'; end if;
    if nullif(payload #>> '{core,seriesId}', '') is not null and not exists (
      select 1 from public.product_series series
      where series.internal_id = (payload #>> '{core,seriesId}')::uuid
        and series.brand_id = (payload #>> '{core,brandId}')::uuid and series.status = 'active'
    ) then raise exception 'Series does not belong to the selected brand'; end if;
    update public.products set
      sku = btrim(payload #>> '{core,sku}'), slug = btrim(payload #>> '{core,slug}'),
      title = btrim(payload #>> '{core,title}'), short_title = btrim(payload #>> '{core,shortTitle}'),
      model = btrim(payload #>> '{core,model}'), brand_id = (payload #>> '{core,brandId}')::uuid,
      primary_category_id = (payload #>> '{core,categoryId}')::uuid,
      series_id = nullif(payload #>> '{core,seriesId}', '')::uuid,
      publication_status = (payload #>> '{core,publicationStatus}')::public.product_publication_status,
      archived_at = case when payload #>> '{core,publicationStatus}' = 'archived' then coalesce(archived_at, now()) else null end,
      updated_by = auth.uid()
    where internal_id = target.internal_id;
    changed := array_append(changed, 'core');
  end if;

  if payload ? 'commercial' then
    if role_value not in ('owner', 'admin', 'manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
    update public.products set
      amount = nullif(payload #>> '{commercial,amount}', '')::numeric,
      old_amount = nullif(payload #>> '{commercial,oldAmount}', '')::numeric,
      currency = upper(coalesce(nullif(payload #>> '{commercial,currency}', ''), 'UAH')),
      price_status = (payload #>> '{commercial,priceStatus}')::public.product_price_status,
      inventory_status = (payload #>> '{commercial,inventoryStatus}')::public.product_inventory_status,
      updated_by = auth.uid()
    where internal_id = target.internal_id;
    changed := array_append(changed, 'commercial');
  end if;

  if payload ? 'content' then
    if role_value not in ('owner', 'admin', 'content_manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
    if jsonb_typeof(coalesce(payload #> '{content,descriptionSections}', '[]'::jsonb)) <> 'array' then raise exception 'descriptionSections must be an array'; end if;
    update public.products set
      description = coalesce(payload #>> '{content,description}', ''),
      short_description = coalesce(payload #>> '{content,shortDescription}', ''),
      full_description = coalesce(payload #>> '{content,fullDescription}', ''),
      description_sections = coalesce(payload #> '{content,descriptionSections}', '[]'::jsonb),
      badges = coalesce(array(select jsonb_array_elements_text(coalesce(payload #> '{content,badges}', '[]'::jsonb))), array[]::text[]),
      seo_title = nullif(payload #>> '{content,seoTitle}', ''),
      seo_description = nullif(payload #>> '{content,seoDescription}', ''),
      updated_by = auth.uid()
    where internal_id = target.internal_id;
    changed := array_append(changed, 'content');
  end if;

  if payload ? 'attributes' then
    if role_value not in ('owner', 'admin', 'manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
    if jsonb_typeof(payload -> 'attributes') <> 'array' then raise exception 'attributes must be an array'; end if;
    if exists (select 1 from jsonb_array_elements(payload -> 'attributes') item group by item ->> 'attributeId' having count(*) > 1) then raise exception 'Duplicate attribute'; end if;
    delete from public.product_attribute_values where product_id = target.internal_id;
    for entry in select value from jsonb_array_elements(payload -> 'attributes') loop
      select * into definition from public.attribute_definitions
      where internal_id = (entry ->> 'attributeId')::uuid and status = 'active';
      if not found then raise exception 'Attribute not found'; end if;
      insert into public.product_attribute_values (
        product_id, attribute_id, value_number, value_text, value_boolean,
        provenance, normalization_rule, source_label, source_value, unit_status,
        created_by, updated_by
      ) values (
        target.internal_id, definition.internal_id,
        case when definition.value_type = 'number' then (entry ->> 'value')::numeric end,
        case when definition.value_type in ('string', 'select') then entry ->> 'value' end,
        case when definition.value_type = 'boolean' then (entry ->> 'value')::boolean end,
        'editorial', 'admin-v1', null, to_jsonb(entry ->> 'value'),
        case when definition.unit is null then 'not-applicable' else 'normalized' end,
        auth.uid(), auth.uid()
      );
    end loop;
    update public.products set updated_by = auth.uid(), updated_at = now() where internal_id = target.internal_id;
    changed := array_append(changed, 'attributes');
  end if;

  if payload ? 'media' then
    if role_value not in ('owner', 'admin', 'content_manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
    if jsonb_typeof(payload -> 'media') <> 'array' then raise exception 'media must be an array'; end if;
    delete from public.product_media where product_id = target.internal_id;
    for entry in select value from jsonb_array_elements(payload -> 'media') loop
      insert into public.product_media (
        product_id, media_type, role, url, storage_path, source_url, alt_text,
        sort_order, active, created_by, updated_by
      ) values (
        target.internal_id, coalesce(entry ->> 'mediaType', 'image')::public.media_type,
        coalesce(entry ->> 'role', 'gallery')::public.media_role, btrim(entry ->> 'url'),
        nullif(entry ->> 'storagePath', ''), nullif(entry ->> 'sourceUrl', ''),
        nullif(entry ->> 'altText', ''), coalesce((entry ->> 'sortOrder')::integer, 0),
        coalesce((entry ->> 'active')::boolean, true), auth.uid(), auth.uid()
      );
    end loop;
    update public.products set updated_by = auth.uid(), updated_at = now() where internal_id = target.internal_id;
    changed := array_append(changed, 'media');
  end if;

  if payload ? 'documents' then
    if role_value not in ('owner', 'admin', 'content_manager') then raise exception using errcode = '42501', message = 'Not authorized'; end if;
    if jsonb_typeof(payload -> 'documents') <> 'array' then raise exception 'documents must be an array'; end if;
    delete from public.product_documents where product_id = target.internal_id;
    for entry in select value from jsonb_array_elements(payload -> 'documents') loop
      insert into public.product_documents (
        product_id, title, document_type, url, storage_path, source_url,
        sort_order, active, created_by, updated_by
      ) values (
        target.internal_id, btrim(entry ->> 'title'),
        coalesce(entry ->> 'documentType', 'other')::public.document_type,
        btrim(entry ->> 'url'), nullif(entry ->> 'storagePath', ''),
        nullif(entry ->> 'sourceUrl', ''), coalesce((entry ->> 'sortOrder')::integer, 0),
        coalesce((entry ->> 'active')::boolean, true), auth.uid(), auth.uid()
      );
    end loop;
    update public.products set updated_by = auth.uid(), updated_at = now() where internal_id = target.internal_id;
    changed := array_append(changed, 'documents');
  end if;

  if cardinality(changed) = 0 then raise exception 'No product changes supplied'; end if;
  select * into target from public.products where internal_id = target.internal_id;
  insert into public.product_admin_audit (
    product_id, legacy_id, actor_id, action, changed_sections, before_state, after_state
  ) values (
    target.internal_id, target.legacy_id, auth.uid(), 'update', changed,
    before_value, to_jsonb(target) - 'search_document'
  );
  version_value := public._admin_refresh_catalog(array[target.internal_id]);
  return jsonb_build_object('legacyId', target.legacy_id, 'updatedAt', target.updated_at, 'catalogVersion', version_value, 'sections', to_jsonb(changed));
end;
$$;

create or replace function public.admin_bulk_products(
  target_legacy_ids text[],
  action_name text,
  action_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  affected integer;
  version_value text;
  audit_action text;
  changed text[];
begin
  if not public.can_manage_products() then raise exception using errcode = '42501', message = 'Not authorized'; end if;
  if coalesce(cardinality(target_legacy_ids), 0) = 0 or cardinality(target_legacy_ids) > 100 then raise exception 'Select 1 to 100 products'; end if;
  if action_name not in ('publish', 'hide', 'archive', 'category', 'brand') then raise exception 'Unsupported bulk action'; end if;
  perform 1 from public.products product
  where product.legacy_id = any(target_legacy_ids)
  order by product.legacy_id for update;
  select array_agg(product.internal_id order by product.legacy_id) into ids
  from public.products product where product.legacy_id = any(target_legacy_ids);
  if coalesce(cardinality(ids), 0) <> cardinality(target_legacy_ids) then raise exception 'One or more products were not found'; end if;

  if action_name in ('publish', 'hide', 'archive') then
    update public.products set
      publication_status = case action_name when 'publish' then 'published'::public.product_publication_status
        when 'hide' then 'hidden'::public.product_publication_status else 'archived'::public.product_publication_status end,
      archived_at = case when action_name = 'archive' then coalesce(archived_at, now()) else null end,
      updated_by = auth.uid(), updated_at = now()
    where internal_id = any(ids);
    audit_action := 'bulk_' || action_name;
    changed := array['publication'];
  elsif action_name = 'category' then
    if not exists (select 1 from public.categories where internal_id = action_value::uuid and status <> 'archived') then raise exception 'Category not found'; end if;
    update public.products set primary_category_id = action_value::uuid, series_id = null,
      updated_by = auth.uid(), updated_at = now() where internal_id = any(ids);
    audit_action := 'bulk_category'; changed := array['classification'];
  else
    if not exists (select 1 from public.brands where internal_id = action_value::uuid and status <> 'archived') then raise exception 'Brand not found'; end if;
    update public.products set brand_id = action_value::uuid, series_id = null,
      updated_by = auth.uid(), updated_at = now() where internal_id = any(ids);
    audit_action := 'bulk_brand'; changed := array['classification'];
  end if;
  get diagnostics affected = row_count;

  insert into public.product_admin_audit (product_id, legacy_id, actor_id, action, changed_sections, after_state)
  select product.internal_id, product.legacy_id, auth.uid(), audit_action, changed,
    jsonb_build_object('publicationStatus', product.publication_status, 'brandId', product.brand_id, 'categoryId', product.primary_category_id)
  from public.products product where product.internal_id = any(ids);

  version_value := public._admin_refresh_catalog(ids);
  return jsonb_build_object('affected', affected, 'catalogVersion', version_value);
end;
$$;

revoke all on function public.admin_product_reference_data() from public, anon, authenticated;
revoke all on function public.admin_list_products(text, uuid, uuid, public.product_publication_status, public.product_inventory_status, public.product_price_status, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_product(text) from public, anon, authenticated;
revoke all on function public.admin_create_product(jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_product(jsonb) from public, anon, authenticated;
revoke all on function public.admin_bulk_products(text[], text, text) from public, anon, authenticated;

grant execute on function public.admin_product_reference_data() to authenticated;
grant execute on function public.admin_list_products(text, uuid, uuid, public.product_publication_status, public.product_inventory_status, public.product_price_status, text, integer, integer) to authenticated;
grant execute on function public.admin_get_product(text) to authenticated;
grant execute on function public.admin_create_product(jsonb) to authenticated;
grant execute on function public.admin_save_product(jsonb) to authenticated;
grant execute on function public.admin_bulk_products(text[], text, text) to authenticated;

commit;
