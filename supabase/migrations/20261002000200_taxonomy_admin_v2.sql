-- Taxonomy Admin v2: create and delete brands and categories, homepage category selection.
-- New records get a full entry in the active release JSON so the storefront sees them without
-- a catalogue republish; deleted records leave it. Deletion is refused while anything still
-- references the record (products, series, subcategories, mapping reviews).

alter table public.categories
  add column homepage_order integer check (homepage_order is null or homepage_order >= 0);

-- Today's homepage shows every active top-level section in catalogue order; keep that as the
-- starting selection.
update public.categories category
set homepage_order = ranked.position
from (
  select internal_id, (row_number() over (order by sort_order, stable_id))::integer * 10 position
  from public.categories
  where parent_id is null and status = 'active' and visibility = 'catalog'
) ranked
where category.internal_id = ranked.internal_id;

alter table public.taxonomy_admin_audit drop constraint if exists taxonomy_admin_audit_entity_type_check;
alter table public.taxonomy_admin_audit
  add constraint taxonomy_admin_audit_entity_type_check check (entity_type in ('brand', 'category', 'homepage'));

-- Lowercase Latin slug from Ukrainian or Latin text (KMU 2010 transliteration, simplified).
create or replace function public._taxonomy_slugify(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(raw, '')),
        'щ', 'shch'), 'ж', 'zh'), 'х', 'kh'), 'ц', 'ts'), 'ч', 'ch'), 'ш', 'sh'), 'ю', 'iu'), 'я', 'ia'),
        'є', 'ie'), 'ї', 'i'), 'й', 'i'), 'ь', ''), '''', ''),
      'абвгґдезиіклмнопрстуфыэё’ʼ', 'abvhgdezyiklmnoprstufyee'),
    '[^a-z0-9]+', '-', 'g'), '-'), 80), '')
$$;

create or replace function public._taxonomy_valid_slug(raw text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(raw ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(raw) <= 80, false)
$$;

-- Active release version, locked for the caller's transaction; null when there is none.
create or replace function public._taxonomy_lock_release()
returns text
language sql
security definer
set search_path = ''
as $$
  select pointer.snapshot_version
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release
    on release.snapshot_version = pointer.snapshot_version and release.ready
  where pointer.singleton
  for update of pointer, release
$$;

create or replace function public._taxonomy_bump_revision(active_version text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.catalog_admin_cache_revision
  set base_snapshot_version = active_version,
      revision = case when base_snapshot_version = active_version then revision + 1 else 1 end,
      updated_at = now()
  where singleton
$$;

-- Replace (or append) one entry of the release, or drop it when entry is null.
create or replace function public._taxonomy_put_release_entry(kind text, target_stable_id text, entry jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_version text;
begin
  if kind not in ('categories', 'brands') then
    raise exception 'Unsupported release section %', kind;
  end if;
  active_version := public._taxonomy_lock_release();
  if active_version is null then return; end if;

  if kind = 'categories' then
    update public.catalog_snapshot_releases release
    set categories = coalesce((
          select jsonb_agg(item.value order by item.ordinal)
          from jsonb_array_elements(release.categories) with ordinality as item(value, ordinal)
          where item.value ->> 'id' <> target_stable_id
        ), '[]'::jsonb) || case when entry is null then '[]'::jsonb else jsonb_build_array(entry) end,
        updated_at = now()
    where release.snapshot_version = active_version;
  else
    update public.catalog_snapshot_releases release
    set brands = coalesce((
          select jsonb_agg(item.value order by item.ordinal)
          from jsonb_array_elements(release.brands) with ordinality as item(value, ordinal)
          where item.value ->> 'id' <> target_stable_id
        ), '[]'::jsonb) || case when entry is null then '[]'::jsonb else jsonb_build_array(entry) end,
        updated_at = now()
    where release.snapshot_version = active_version;
  end if;
  perform public._taxonomy_bump_revision(active_version);
end;
$$;

-- Release entries in the shape the storefront bootstrap already uses.
create or replace function public._taxonomy_category_release_entry(target public.categories)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors as (
    select category.internal_id, category.parent_id, category.stable_id from public.categories category
    where category.internal_id = target.internal_id
    union all
    select parent.internal_id, parent.parent_id, parent.stable_id
    from public.categories parent join ancestors on parent.internal_id = ancestors.parent_id
  )
  select jsonb_build_object(
    'id', target.stable_id,
    'slug', target.slug,
    'level', target.level,
    'parentId', (select parent.stable_id from public.categories parent where parent.internal_id = target.parent_id),
    'sectionId', (select ancestors.stable_id from ancestors where ancestors.parent_id is null limit 1),
    'title', target.title,
    'name', target.title,
    'shortTitle', coalesce(target.short_title, target.title),
    'description', target.description,
    'menuDescription', target.menu_description,
    'order', target.sort_order,
    'status', target.status,
    'visibility', target.visibility,
    'facetIds', '[]'::jsonb,
    'allowedFacetIds', '[]'::jsonb,
    'seo', jsonb_strip_nulls(jsonb_build_object('title', target.seo_title, 'description', target.seo_description)),
    'metaTitle', coalesce(target.seo_title, target.title || ' | ТД «Софіївка»'),
    'homepageOrder', target.homepage_order
  )
$$;

create or replace function public._taxonomy_brand_release_entry(target public.brands)
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
    'type', case when target.visibility = 'service' then 'service' else 'catalog' end,
    'logo', target.logo_url,
    'country', coalesce(target.country, ''),
    'description', target.description,
    'visibility', target.visibility,
    'featured', target.featured,
    'featuredOrder', target.featured_order,
    'futurePath', '/brands/' || target.slug || '/',
    'seo', jsonb_strip_nulls(jsonb_build_object('title', target.seo_title, 'description', target.seo_description))
  )
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_brand(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  brand_name text;
  brand_slug text;
  created public.brands%rowtype;
begin
  perform public._taxonomy_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані бренду.';
  end if;

  brand_name := public._taxonomy_clean_text(payload ->> 'name', 120);
  if brand_name is null then raise exception using errcode = '22023', message = 'Назва бренду обов’язкова.'; end if;
  if exists (select 1 from public.brands brand where lower(brand.name) = lower(brand_name)) then
    raise exception using errcode = '23505', message = 'Бренд із такою назвою вже є.';
  end if;

  brand_slug := coalesce(public._taxonomy_clean_text(payload ->> 'slug', 80), public._taxonomy_slugify(brand_name));
  if not public._taxonomy_valid_slug(brand_slug) then
    raise exception using errcode = '22023', message = 'Адреса: лише латинські літери, цифри й дефіси.';
  end if;
  if exists (select 1 from public.brands brand where brand.slug = brand_slug or brand.stable_id = brand_slug) then
    raise exception using errcode = '23505', message = format('Адреса «%s» уже зайнята іншим брендом.', brand_slug);
  end if;

  insert into public.brands (stable_id, slug, name, country, website_url, description, visibility, created_by, updated_by)
  values (brand_slug, brand_slug, brand_name, null, null, '', 'catalog', auth.uid(), auth.uid())
  returning * into created;

  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('brand', created.internal_id, created.stable_id, auth.uid(),
    jsonb_build_object('created', jsonb_build_object('from', null, 'to', created.name)));

  perform public._taxonomy_put_release_entry('brands', created.stable_id, public._taxonomy_brand_release_entry(created));

  -- Optional content fields go through the regular editor so they share its validation.
  if payload - 'name' - 'slug' <> '{}'::jsonb then
    perform public.admin_update_brand(created.stable_id, payload - 'name' - 'slug', null);
  end if;
  return public.admin_get_brand(created.stable_id);
end;
$$;

create or replace function public.admin_delete_brand(brand_id text, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.brands%rowtype;
  product_total integer;
  series_total integer;
begin
  perform public._taxonomy_require_editor();
  select * into target from public.brands brand where brand.stable_id = brand_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Бренд не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Бренд уже змінив інший працівник. Оновіть сторінку.';
  end if;

  select count(*)::integer into product_total from public.products product where product.brand_id = target.internal_id;
  if product_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити бренд: до нього прив’язані товари (%s). Перенесіть їх на інший бренд або приховайте бренд.', product_total);
  end if;
  select count(*)::integer into series_total from public.product_series series where series.brand_id = target.internal_id;
  if series_total > 0 then
    raise exception using errcode = '23503', message = format('Не можна видалити бренд: у нього є серії товарів (%s).', series_total);
  end if;

  delete from public.brands where internal_id = target.internal_id;
  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('brand', target.internal_id, target.stable_id, auth.uid(),
    jsonb_build_object('deleted', jsonb_build_object('from', target.name, 'to', null)));
  perform public._taxonomy_put_release_entry('brands', target.stable_id, null);
  return jsonb_build_object('deleted', target.stable_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_category(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.categories%rowtype;
  category_title text;
  category_slug text;
  category_stable_id text;
  next_order integer;
  created public.categories%rowtype;
  suffix integer := 2;
begin
  perform public._taxonomy_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані категорії.';
  end if;

  if coalesce(payload ->> 'parentId', '') <> '' then
    select * into parent from public.categories category where category.stable_id = payload ->> 'parentId';
    if not found then raise exception using errcode = 'P0002', message = 'Батьківську категорію не знайдено.'; end if;
    if parent.level >= 3 then
      raise exception using errcode = '22023', message = 'Каталог має три рівні: у категорію третього рівня не можна вкласти підкатегорію.';
    end if;
  end if;

  category_title := public._taxonomy_clean_text(payload ->> 'title', 160);
  if category_title is null then raise exception using errcode = '22023', message = 'Назва категорії обов’язкова.'; end if;

  category_slug := coalesce(public._taxonomy_clean_text(payload ->> 'slug', 80), public._taxonomy_slugify(category_title));
  if not public._taxonomy_valid_slug(category_slug) then
    raise exception using errcode = '22023', message = 'Адреса: лише латинські літери, цифри й дефіси.';
  end if;
  if exists (select 1 from public.categories category
             where category.slug = category_slug and category.parent_id is not distinct from parent.internal_id) then
    raise exception using errcode = '23505', message = format('Адреса «%s» уже є на цьому рівні.', category_slug);
  end if;

  -- Stable ids are global; prefix with the parent and number the rest when the slug is taken.
  category_stable_id := category_slug;
  if exists (select 1 from public.categories category where category.stable_id = category_stable_id) and parent.stable_id is not null then
    category_stable_id := left(parent.stable_id || '-' || category_slug, 120);
  end if;
  while exists (select 1 from public.categories category where category.stable_id = category_stable_id) loop
    category_stable_id := left(category_slug, 110) || '-' || suffix;
    suffix := suffix + 1;
  end loop;

  select coalesce(max(category.sort_order), 0) + 10 into next_order
  from public.categories category where category.parent_id is not distinct from parent.internal_id;

  insert into public.categories (stable_id, slug, parent_id, level, title, sort_order, status, visibility, created_by, updated_by)
  values (category_stable_id, category_slug, parent.internal_id, coalesce(parent.level, 0) + 1, category_title, next_order,
    'active', 'catalog', auth.uid(), auth.uid())
  returning * into created;

  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('category', created.internal_id, created.stable_id, auth.uid(),
    jsonb_build_object('created', jsonb_build_object('from', null, 'to', created.title)));

  perform public._taxonomy_put_release_entry('categories', created.stable_id, public._taxonomy_category_release_entry(created));

  if payload - 'title' - 'slug' - 'parentId' <> '{}'::jsonb then
    perform public.admin_update_category(created.stable_id, payload - 'title' - 'slug' - 'parentId', null);
  end if;
  return public.admin_get_category(created.stable_id);
end;
$$;

create or replace function public.admin_delete_category(category_id text, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
  child_total integer;
  product_total integer;
  review_total integer;
begin
  perform public._taxonomy_require_editor();
  select * into target from public.categories category where category.stable_id = category_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Категорію не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Категорію вже змінив інший працівник. Оновіть сторінку.';
  end if;

  select count(*)::integer into child_total from public.categories child where child.parent_id = target.internal_id;
  if child_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити категорію: у ній є підкатегорії (%s). Спершу видаліть або перенесіть їх.', child_total);
  end if;
  select count(distinct product.internal_id)::integer into product_total
  from public.products product
  left join public.product_categories link on link.product_id = product.internal_id
  where product.primary_category_id = target.internal_id or link.category_id = target.internal_id;
  if product_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити категорію: до неї прив’язані товари (%s). Перенесіть їх в іншу категорію.', product_total);
  end if;
  select count(*)::integer into review_total from public.category_mapping_reviews review
  where review.current_category_id = target.internal_id or review.suggested_category_id = target.internal_id;
  if review_total > 0 then
    raise exception using errcode = '23503', message = format(
      'Не можна видалити категорію: на неї посилаються записи перевірки категорій (%s).', review_total);
  end if;

  delete from public.categories where internal_id = target.internal_id;
  insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
  values ('category', target.internal_id, target.stable_id, auth.uid(),
    jsonb_build_object('deleted', jsonb_build_object('from', target.title, 'to', null)));
  perform public._taxonomy_put_release_entry('categories', target.stable_id, null);
  return jsonb_build_object('deleted', target.stable_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Homepage categories
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_homepage_categories()
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
    'categoryIds', coalesce((
      select jsonb_agg(category.stable_id order by category.homepage_order, category.stable_id)
      from public.categories category where category.homepage_order is not null
    ), '[]'::jsonb)
  );
end;
$$;

-- Replace the homepage selection with the given ordered list of category ids (1 to 8).
create or replace function public.admin_set_homepage_categories(category_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_ids jsonb;
  after_ids jsonb;
  missing text;
  active_version text;
begin
  perform public._taxonomy_require_editor();
  category_ids := coalesce(category_ids, '{}');
  if cardinality(category_ids) < 1 or cardinality(category_ids) > 8 then
    raise exception using errcode = '22023', message = 'На головній можна показати від 1 до 8 категорій.';
  end if;
  if cardinality(category_ids) <> (select count(distinct value) from unnest(category_ids) value) then
    raise exception using errcode = '22023', message = 'Категорія повторюється у списку.';
  end if;
  select value into missing from unnest(category_ids) value
  where not exists (select 1 from public.categories category where category.stable_id = value) limit 1;
  if missing is not null then
    raise exception using errcode = 'P0002', message = format('Категорію «%s» не знайдено.', missing);
  end if;

  before_ids := (public.admin_get_homepage_categories()) -> 'categoryIds';

  update public.categories category
  set homepage_order = picked.position, updated_by = auth.uid()
  from (select value, (ordinal * 10)::integer position from unnest(category_ids) with ordinality as item(value, ordinal)) picked
  where category.stable_id = picked.value and category.homepage_order is distinct from picked.position;
  update public.categories category
  set homepage_order = null, updated_by = auth.uid()
  where category.homepage_order is not null and not (category.stable_id = any(category_ids));

  after_ids := (public.admin_get_homepage_categories()) -> 'categoryIds';
  if before_ids is distinct from after_ids then
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('homepage', '00000000-0000-0000-0000-000000000000', 'homepage', auth.uid(),
      jsonb_build_object('homepage_categories', jsonb_build_object('from', before_ids, 'to', after_ids)));

    active_version := public._taxonomy_lock_release();
    if active_version is not null then
      update public.catalog_snapshot_releases release
      set categories = (
            select coalesce(jsonb_agg(item.value || jsonb_build_object('homepageOrder', category.homepage_order) order by item.ordinal), '[]'::jsonb)
            from jsonb_array_elements(release.categories) with ordinality as item(value, ordinal)
            left join public.categories category on category.stable_id = item.value ->> 'id'
          ),
          updated_at = now()
      where release.snapshot_version = active_version;
      perform public._taxonomy_bump_revision(active_version);
    end if;
  end if;
  return public.admin_get_homepage_categories();
end;
$$;

-- Carry the starting selection into the active release.
update public.catalog_snapshot_releases release
set categories = (
      select coalesce(jsonb_agg(item.value || jsonb_build_object('homepageOrder', category.homepage_order) order by item.ordinal), '[]'::jsonb)
      from jsonb_array_elements(release.categories) with ordinality as item(value, ordinal)
      left join public.categories category on category.stable_id = item.value ->> 'id'
    )
where release.snapshot_version = (select pointer.snapshot_version from public.catalog_snapshot_pointer pointer where pointer.singleton);
select public._taxonomy_bump_revision(pointer.snapshot_version) from public.catalog_snapshot_pointer pointer where pointer.singleton;

-- The category list shows the homepage position next to each category.
create or replace function public.admin_list_categories()
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
    'categories', coalesce((
      with recursive tree as (
        select category.internal_id ancestor_id, category.internal_id descendant_id from public.categories category
        union all
        select tree.ancestor_id, child.internal_id
        from tree join public.categories child on child.parent_id = tree.descendant_id
      ), direct as (
        select product.primary_category_id category_id,
          count(*)::integer total,
          count(*) filter (where product.publication_status = 'published')::integer published
        from public.products product
        group by product.primary_category_id
      ), rolled as (
        select tree.ancestor_id, coalesce(sum(direct.total), 0)::integer total, coalesce(sum(direct.published), 0)::integer published
        from tree left join direct on direct.category_id = tree.descendant_id
        group by tree.ancestor_id
      )
      select jsonb_agg(jsonb_build_object(
        'id', category.stable_id,
        'parentId', parent.stable_id,
        'slug', category.slug,
        'level', category.level,
        'title', category.title,
        'shortTitle', category.short_title,
        'sortOrder', category.sort_order,
        'status', category.status,
        'visibility', category.visibility,
        'homepageOrder', category.homepage_order,
        'productCount', coalesce(rolled.total, 0),
        'publishedCount', coalesce(rolled.published, 0),
        'directCount', coalesce(direct.total, 0),
        'childCount', (select count(*) from public.categories child where child.parent_id = category.internal_id),
        'updatedAt', category.updated_at
      ) order by category.level, category.sort_order, category.stable_id)
      from public.categories category
      left join public.categories parent on parent.internal_id = category.parent_id
      left join rolled on rolled.ancestor_id = category.internal_id
      left join direct on direct.category_id = category.internal_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public._taxonomy_slugify(text) from public, anon, authenticated;
revoke all on function public._taxonomy_valid_slug(text) from public, anon, authenticated;
revoke all on function public._taxonomy_lock_release() from public, anon, authenticated;
revoke all on function public._taxonomy_bump_revision(text) from public, anon, authenticated;
revoke all on function public._taxonomy_put_release_entry(text, text, jsonb) from public, anon, authenticated;
revoke all on function public._taxonomy_category_release_entry(public.categories) from public, anon, authenticated;
revoke all on function public._taxonomy_brand_release_entry(public.brands) from public, anon, authenticated;

revoke all on function public.admin_create_brand(jsonb) from public, anon;
revoke all on function public.admin_delete_brand(text, timestamptz) from public, anon;
revoke all on function public.admin_create_category(jsonb) from public, anon;
revoke all on function public.admin_delete_category(text, timestamptz) from public, anon;
revoke all on function public.admin_get_homepage_categories() from public, anon;
revoke all on function public.admin_set_homepage_categories(text[]) from public, anon;
grant execute on function public.admin_create_brand(jsonb) to authenticated;
grant execute on function public.admin_delete_brand(text, timestamptz) to authenticated;
grant execute on function public.admin_create_category(jsonb) to authenticated;
grant execute on function public.admin_delete_category(text, timestamptz) to authenticated;
grant execute on function public.admin_get_homepage_categories() to authenticated;
grant execute on function public.admin_set_homepage_categories(text[]) to authenticated;
