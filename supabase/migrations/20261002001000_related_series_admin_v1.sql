-- Related products and series admin v1.
--
-- 1. Manual related products. The product editor keeps three ordered lists per product
--    (accessory, compatible, similar; up to 24 each) in public.product_relations. They reach the
--    storefront like every other product field: the product payload in the active release gets
--    `relatedProductIds` ({accessory: [...], compatible: [...], similar: [...]}, legacy ids), and
--    get_catalog_product returns the cards of those products in `relatedProducts`, before the
--    automatic similar products (which now skip anything chosen manually). The PDP fills
--    «Сумісні товари», «Аксесуари» and «Схожі товари» from them; manual similar items go first.
-- 2. Series. Staff create, rename and delete product series (`product_series`) from the brand page.
--    A rename refreshes the cards of the series' products (search text carries the series name);
--    deleting a series that products use is refused unless the caller asks to unlink them, which
--    clears their series and refreshes their cards. Every storefront-visible change bumps the admin
--    cache revision through _collection_publish (_admin_refresh_catalog / _taxonomy_bump_revision).
--
-- Statements the Supabase MCP connector cannot run (apply through the SQL Editor instead):
--   admin_set_product_relations contains `delete from public.product_relations`;
--   admin_delete_series contains `delete from public.product_series`.
-- No triggers are created or dropped here. admin_delete_series (unlink) updates public.products,
-- which fires the existing statement triggers products_external_update and products_updated_at;
-- the first returns early for SECURITY DEFINER callers.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.product_relations (
  product_id uuid not null references public.products(internal_id) on delete cascade,
  relation_kind text not null check (relation_kind in ('accessory', 'compatible', 'similar')),
  related_product_id uuid not null references public.products(internal_id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint product_relations_pkey primary key (product_id, relation_kind, related_product_id),
  constraint product_relations_not_self check (product_id <> related_product_id)
);

create index if not exists product_relations_related_idx on public.product_relations (related_product_id);

-- Reads and writes go through the RPCs below only.
alter table public.product_relations enable row level security;
revoke all on table public.product_relations from public, anon, authenticated;

alter table public.taxonomy_admin_audit drop constraint if exists taxonomy_admin_audit_entity_type_check;
alter table public.taxonomy_admin_audit
  add constraint taxonomy_admin_audit_entity_type_check
  check (entity_type in ('brand', 'category', 'homepage', 'collection', 'attribute', 'series'));

-- ---------------------------------------------------------------------------
-- Related products: helpers
-- ---------------------------------------------------------------------------

create or replace function public._related_kind_label(kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case kind
    when 'accessory' then 'Аксесуари'
    when 'compatible' then 'Сумісні товари'
    when 'similar' then 'Схожі товари'
  end
$$;

-- {accessory: [legacy ids], compatible: [...], similar: [...]} in the saved order.
create or replace function public._product_relation_legacy_ids(target_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(kind.name, coalesce((
    select jsonb_agg(related.legacy_id order by relation.sort_order, related.legacy_id)
    from public.product_relations relation
    join public.products related on related.internal_id = relation.related_product_id
    where relation.product_id = target_product_id and relation.relation_kind = kind.name
  ), '[]'::jsonb))
  from unnest(array['accessory', 'compatible', 'similar']) as kind(name)
$$;

-- The release payload gains relatedProductIds. The previous builder stays as the base, so later
-- changes to it keep working; this wrapper only adds the key.
do $$
begin
  if to_regprocedure('public._admin_product_payload_base(uuid, jsonb)') is null then
    alter function public._admin_product_payload(uuid, jsonb) rename to _admin_product_payload_base;
  end if;
end;
$$;

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
  select payload.base || jsonb_build_object('relatedProductIds', public._product_relation_legacy_ids(target_product_id))
  from (select public._admin_product_payload_base(target_product_id, existing_payload) base) payload
  where payload.base is not null
$$;

create or replace function public._related_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Недостатньо прав для редагування пов’язаних товарів.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Related products: RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_product_relations(target_legacy_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.products%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.products product where product.legacy_id = target_legacy_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'legacyId', target.legacy_id,
    'canEdit', public.can_manage_content(),
    'limit', 24,
    -- Concurrency token: send it back unchanged with the next save.
    'state', public._product_relation_legacy_ids(target.internal_id),
    'relations', (
      select jsonb_object_agg(kind.name, coalesce((
        select jsonb_agg(public._collection_product_json(relation.related_product_id) order by relation.sort_order, relation.related_product_id)
        from public.product_relations relation
        where relation.product_id = target.internal_id and relation.relation_kind = kind.name
      ), '[]'::jsonb))
      from unnest(array['accessory', 'compatible', 'similar']) as kind(name)
    )
  );
end;
$$;

-- Replace the lists named in `relations` ({kind: [legacy ids in order]}); kinds left out stay as
-- they are. expected_state is the `state` the editor loaded; null skips the check.
create or replace function public.admin_set_product_relations(target_legacy_id text, relations jsonb, expected_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.products%rowtype;
  kind_name text;
  picked text[];
  missing text;
  before_state jsonb;
  after_state jsonb;
begin
  perform public._related_require_editor();
  if relations is null or jsonb_typeof(relations) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректний список пов’язаних товарів.';
  end if;

  select * into target from public.products product where product.legacy_id = target_legacy_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Товар не знайдено.'; end if;

  before_state := public._product_relation_legacy_ids(target.internal_id);
  if expected_state is not null and expected_state <> before_state then
    raise exception using errcode = '40001', message = 'Пов’язані товари вже змінив інший працівник. Оновіть сторінку.';
  end if;

  -- Validate everything before writing anything.
  for kind_name in select jsonb_object_keys(relations) loop
    if public._related_kind_label(kind_name) is null then
      raise exception using errcode = '22023', message = format('Невідомий тип зв’язку «%s».', kind_name);
    end if;
    if jsonb_typeof(relations -> kind_name) <> 'array'
       or exists (select 1 from jsonb_array_elements(relations -> kind_name) item where jsonb_typeof(item) <> 'string') then
      raise exception using errcode = '22023', message = 'Некоректний список пов’язаних товарів.';
    end if;
    select coalesce(array_agg(btrim(item.value) order by item.ordinal), '{}') into picked
    from jsonb_array_elements_text(relations -> kind_name) with ordinality as item(value, ordinal);
    if cardinality(picked) > 24 then
      raise exception using errcode = '22023',
        message = format('У блоці «%s» може бути до 24 товарів.', public._related_kind_label(kind_name));
    end if;
    if cardinality(picked) <> (select count(distinct value) from unnest(picked) value) then
      raise exception using errcode = '22023',
        message = format('Товар повторюється у блоці «%s».', public._related_kind_label(kind_name));
    end if;
    if target.legacy_id = any(picked) then
      raise exception using errcode = '22023', message = 'Товар не можна пов’язати із самим собою.';
    end if;
    select value into missing from unnest(picked) value
    where not exists (select 1 from public.products product where product.legacy_id = value) limit 1;
    if missing is not null then
      raise exception using errcode = 'P0002', message = format('Товар «%s» не знайдено.', missing);
    end if;
  end loop;

  for kind_name in select jsonb_object_keys(relations) loop
    select coalesce(array_agg(btrim(item.value) order by item.ordinal), '{}') into picked
    from jsonb_array_elements_text(relations -> kind_name) with ordinality as item(value, ordinal);

    delete from public.product_relations relation
    where relation.product_id = target.internal_id
      and relation.relation_kind = kind_name
      and relation.related_product_id not in (
        select product.internal_id from public.products product where product.legacy_id = any(picked));

    insert into public.product_relations (product_id, relation_kind, related_product_id, sort_order, created_by)
    select target.internal_id, kind_name, product.internal_id, (chosen.ordinal - 1)::integer, auth.uid()
    from unnest(picked) with ordinality as chosen(value, ordinal)
    join public.products product on product.legacy_id = chosen.value
    on conflict on constraint product_relations_pkey do update
      set sort_order = excluded.sort_order
      where public.product_relations.sort_order is distinct from excluded.sort_order;
  end loop;

  after_state := public._product_relation_legacy_ids(target.internal_id);
  if after_state is distinct from before_state then
    insert into public.product_admin_audit (product_id, legacy_id, actor_id, action, changed_sections, before_state, after_state)
    values (target.internal_id, target.legacy_id, auth.uid(), 'update', array['relations'],
      jsonb_build_object('relatedProductIds', before_state), jsonb_build_object('relatedProductIds', after_state));
    -- Only this product's payload lists the relations.
    perform public._collection_publish(array[target.internal_id]);
  end if;

  return public.admin_get_product_relations(target.legacy_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Storefront: product page with manual related products
-- ---------------------------------------------------------------------------

-- Same response as before; relatedProducts now starts with the cards of the manually chosen
-- products (published ones, up to 12 per kind, in kind and list order) and continues with up to
-- four automatic similar products that were not chosen manually.
create or replace function public._catalog_product_v2(legacy_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  with active_release as (
    select release.snapshot_version
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), target as (
    select snapshot.payload, card.*
    from active_release release
    join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version
     and card.legacy_id = $1
    join public.catalog_product_snapshots snapshot
      on snapshot.snapshot_version = card.snapshot_version and snapshot.legacy_id = card.legacy_id
  ), manual_ids as (
    select kind.ordinal kind_ordinal, item.ordinal item_ordinal, item.value related_legacy_id
    from target
    cross join unnest(array['accessory', 'compatible', 'similar']) with ordinality as kind(name, ordinal)
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(target.payload #> array['relatedProductIds', kind.name]) = 'array'
        then target.payload #> array['relatedProductIds', kind.name] else '[]'::jsonb end
    ) with ordinality as item(value, ordinal)
  ), manual as (
    select candidate.card, candidate.legacy_id related_legacy_id, manual_ids.kind_ordinal, manual_ids.item_ordinal,
      row_number() over (partition by manual_ids.kind_ordinal order by manual_ids.item_ordinal) kind_rank
    from target
    join manual_ids on true
    join public.catalog_product_cards candidate
      on candidate.snapshot_version = target.snapshot_version
     and candidate.legacy_id = manual_ids.related_legacy_id
     and candidate.legacy_id <> target.legacy_id
  ), manual_cards as (
    select distinct on (manual.related_legacy_id) manual.card, manual.kind_ordinal, manual.item_ordinal
    from manual
    where manual.kind_rank <= 12
    order by manual.related_legacy_id, manual.kind_ordinal, manual.item_ordinal
  ), related as (
    select candidate.card, candidate.sort_order, candidate.legacy_id candidate_legacy_id,
      (case when candidate.series_id is not null and candidate.series_id = target.series_id then 40 else 0 end)
      + (case when candidate.brand_id = target.brand_id then 12 else 0 end)
      + 5 * (select count(*) from jsonb_each_text(candidate.normalized_attributes) attribute
        where target.normalized_attributes ->> attribute.key = attribute.value) as relevance,
      case when candidate.amount is not null and target.amount is not null
        then abs(candidate.amount - target.amount) else null end as price_distance
    from target
    join public.catalog_product_cards candidate
      on candidate.snapshot_version = target.snapshot_version
     and candidate.category_id = target.category_id
     and candidate.legacy_id <> target.legacy_id
    where not exists (select 1 from manual_ids where manual_ids.related_legacy_id = candidate.legacy_id)
    order by relevance desc, price_distance asc nulls last, candidate.sort_order, candidate.legacy_id
    limit 4
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'product', (select payload from target),
    'relatedProducts',
      coalesce((select jsonb_agg(manual_cards.card order by manual_cards.kind_ordinal, manual_cards.item_ordinal) from manual_cards), '[]'::jsonb)
      || coalesce((select jsonb_agg(related.card order by related.relevance desc, related.price_distance asc nulls last,
        related.sort_order, related.candidate_legacy_id) from related), '[]'::jsonb)
  )
  from active_release release
  where exists (select 1 from target)
$$;

-- ---------------------------------------------------------------------------
-- Series
-- ---------------------------------------------------------------------------

create or replace function public._series_json(target public.product_series)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', target.stable_id,
    'slug', target.slug,
    'name', target.name,
    'description', target.description,
    'status', target.status,
    'updatedAt', target.updated_at,
    'productCount', (select count(*) from public.products product where product.series_id = target.internal_id),
    'publishedCount', (select count(*) from public.products product
      where product.series_id = target.internal_id and product.publication_status = 'published')
  )
$$;

create or replace function public._series_member_ids(target_series_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(product.internal_id order by product.legacy_id), '{}')
  from public.products product where product.series_id = target_series_id
$$;

create or replace function public.admin_list_brand_series(brand_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.brands%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.brands brand where brand.stable_id = brand_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'brandId', target.stable_id,
    'canEdit', public.can_manage_content(),
    'series', coalesce((
      select jsonb_agg(public._series_json(series) order by lower(series.name), series.stable_id)
      from public.product_series series where series.brand_id = target.internal_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_create_series(brand_id text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.brands%rowtype;
  series_name text;
  series_slug text;
  series_stable_id text;
  created public.product_series%rowtype;
begin
  perform public._taxonomy_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані серії.';
  end if;
  select * into target from public.brands brand where brand.stable_id = brand_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Бренд не знайдено.'; end if;

  series_name := public._taxonomy_clean_text(payload ->> 'name', 120);
  if series_name is null then raise exception using errcode = '22023', message = 'Назва серії обов’язкова.'; end if;
  if exists (select 1 from public.product_series series
             where series.brand_id = target.internal_id and lower(series.name) = lower(series_name)) then
    raise exception using errcode = '23505', message = format('У бренду вже є серія «%s».', series_name);
  end if;

  series_slug := coalesce(public._taxonomy_clean_text(payload ->> 'slug', 80), public._taxonomy_slugify(series_name));
  if not public._taxonomy_valid_slug(series_slug) then
    raise exception using errcode = '22023', message = 'Код: лише латинські літери, цифри й дефіси.';
  end if;
  series_stable_id := left(target.stable_id || '-' || series_slug, 120);
  if exists (select 1 from public.product_series series
             where series.stable_id = series_stable_id or (series.brand_id = target.internal_id and series.slug = series_slug)) then
    raise exception using errcode = '23505', message = format('Код «%s» уже зайнятий іншою серією.', series_slug);
  end if;

  insert into public.product_series (stable_id, brand_id, slug, name, description, created_by, updated_by)
  values (series_stable_id, target.internal_id, series_slug, series_name,
    coalesce(public._taxonomy_clean_text(payload ->> 'description', 2000), ''), auth.uid(), auth.uid())
  returning * into created;

  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('series', created.internal_id, created.stable_id, auth.uid(),
    jsonb_build_object('created', jsonb_build_object('from', null, 'to', created.name), 'brand', jsonb_build_object('from', null, 'to', target.stable_id)));
  -- A new series has no products yet: nothing on the storefront changes.
  return public.admin_list_brand_series(target.stable_id);
end;
$$;

create or replace function public.admin_update_series(series_id text, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.product_series%rowtype;
  brand_stable_id text;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
begin
  perform public._taxonomy_require_editor();
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні зміни.';
  end if;
  select * into target from public.product_series series where series.stable_id = series_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Серію не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Серію вже змінив інший працівник. Оновіть сторінку.';
  end if;
  before_row := to_jsonb(target);

  if patch ? 'name' then
    target.name := public._taxonomy_clean_text(patch ->> 'name', 120);
    if target.name is null then raise exception using errcode = '22023', message = 'Назва серії обов’язкова.'; end if;
    if exists (select 1 from public.product_series series
               where series.brand_id = target.brand_id and series.internal_id <> target.internal_id
                 and lower(series.name) = lower(target.name)) then
      raise exception using errcode = '23505', message = format('У бренду вже є серія «%s».', target.name);
    end if;
  end if;
  if patch ? 'description' then target.description := coalesce(public._taxonomy_clean_text(patch ->> 'description', 2000), ''); end if;

  update public.product_series set
    name = target.name,
    description = target.description,
    updated_by = auth.uid()
  where internal_id = target.internal_id
  returning * into target;

  after_row := to_jsonb(target);
  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['name', 'description']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('series', target.internal_id, target.stable_id, auth.uid(), changes);
    -- Product cards carry the series name in their search text.
    if changes ? 'name' then
      perform public._collection_publish(public._series_member_ids(target.internal_id));
    end if;
  end if;

  select brand.stable_id into brand_stable_id from public.brands brand where brand.internal_id = target.brand_id;
  return public.admin_list_brand_series(brand_stable_id);
end;
$$;

-- Refused while products use the series, unless unlink_products: then their series is cleared
-- (each product gets an audit row) and their cards are refreshed.
create or replace function public.admin_delete_series(series_id text, expected_updated_at timestamptz, unlink_products boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.product_series%rowtype;
  brand_stable_id text;
  members uuid[];
begin
  perform public._taxonomy_require_editor();
  select * into target from public.product_series series where series.stable_id = series_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Серію не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Серію вже змінив інший працівник. Оновіть сторінку.';
  end if;

  members := public._series_member_ids(target.internal_id);
  if cardinality(members) > 0 and not coalesce(unlink_products, false) then
    raise exception using errcode = '23503', message = format(
      'Серію використовують товари (%s). Відв’яжіть їх від серії або видаліть серію разом із відв’язуванням.', cardinality(members));
  end if;

  if cardinality(members) > 0 then
    update public.products set series_id = null, updated_by = auth.uid()
    where internal_id = any(members);
    insert into public.product_admin_audit (product_id, legacy_id, actor_id, action, changed_sections, before_state, after_state)
    select product.internal_id, product.legacy_id, auth.uid(), 'update', array['series'],
      jsonb_build_object('seriesId', target.stable_id), jsonb_build_object('seriesId', null)
    from public.products product where product.internal_id = any(members);
  end if;

  delete from public.product_series where internal_id = target.internal_id;
  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('series', target.internal_id, target.stable_id, auth.uid(),
    jsonb_build_object('deleted', jsonb_build_object('from', target.name, 'to', null),
      'unlinkedProducts', jsonb_build_object('from', cardinality(members), 'to', 0)));
  if cardinality(members) > 0 then
    perform public._collection_publish(members);
  end if;

  select brand.stable_id into brand_stable_id from public.brands brand where brand.internal_id = target.brand_id;
  return public.admin_list_brand_series(brand_stable_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public._related_kind_label(text) from public, anon, authenticated;
revoke all on function public._product_relation_legacy_ids(uuid) from public, anon, authenticated;
revoke all on function public._admin_product_payload_base(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._admin_product_payload(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._related_require_editor() from public, anon, authenticated;
revoke all on function public._catalog_product_v2(text) from public, anon, authenticated;
revoke all on function public._series_json(public.product_series) from public, anon, authenticated;
revoke all on function public._series_member_ids(uuid) from public, anon, authenticated;

revoke all on function public.admin_get_product_relations(text) from public, anon;
revoke all on function public.admin_set_product_relations(text, jsonb, jsonb) from public, anon;
revoke all on function public.admin_list_brand_series(text) from public, anon;
revoke all on function public.admin_create_series(text, jsonb) from public, anon;
revoke all on function public.admin_update_series(text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_delete_series(text, timestamptz, boolean) from public, anon;
grant execute on function public.admin_get_product_relations(text) to authenticated;
grant execute on function public.admin_set_product_relations(text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_list_brand_series(text) to authenticated;
grant execute on function public.admin_create_series(text, jsonb) to authenticated;
grant execute on function public.admin_update_series(text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_delete_series(text, timestamptz, boolean) to authenticated;
