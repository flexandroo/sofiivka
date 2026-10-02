-- Taxonomy Admin v1: brands and categories.
-- Staff edit brand and category content through role-checked RPCs. Identity fields that drive
-- URLs and product cards (stable_id, slug, parent, level, brand name) stay read-only here.
-- Every save patches the matching entry of the active release JSON, which the storefront reads
-- through get_catalog_bootstrap, and bumps the admin cache revision so clients refetch.

create table public.taxonomy_admin_audit (
  internal_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('brand', 'category')),
  entity_id uuid not null,
  stable_id text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);

create index taxonomy_admin_audit_entity_idx
  on public.taxonomy_admin_audit (entity_type, entity_id, created_at desc);

alter table public.taxonomy_admin_audit enable row level security;
revoke all on table public.taxonomy_admin_audit from public, anon, authenticated;

-- Text input cleanup shared by both editors: strips control characters, trims, caps length,
-- turns empty strings into null.
create or replace function public._taxonomy_clean_text(raw text, maximum integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(raw, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), maximum), '')
$$;

create or replace function public._taxonomy_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Недостатньо прав для редагування довідників.';
  end if;
end;
$$;

-- Published products whose primary category is the given category or any of its descendants.
create or replace function public._taxonomy_category_published_count(target_category_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with recursive subtree as (
    select category.internal_id from public.categories category where category.internal_id = target_category_id
    union all
    select child.internal_id from public.categories child join subtree on child.parent_id = subtree.internal_id
  )
  select count(*)::integer
  from public.products product
  where product.publication_status = 'published'
    and product.primary_category_id in (select internal_id from subtree)
$$;

-- Merge fields into one entry ("categories" or "brands") of the active release and bump the
-- cache revision. Databases without an active release (fresh installs, tests) skip silently.
create or replace function public._taxonomy_patch_release(kind text, target_stable_id text, fields jsonb)
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

  select pointer.snapshot_version into active_version
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release
    on release.snapshot_version = pointer.snapshot_version and release.ready
  where pointer.singleton
  for update of pointer, release;
  if active_version is null then return; end if;

  if kind = 'categories' then
    update public.catalog_snapshot_releases release
    set categories = (
          select coalesce(jsonb_agg(case when entry ->> 'id' = target_stable_id then entry || fields else entry end order by ordinal), '[]'::jsonb)
          from jsonb_array_elements(release.categories) with ordinality as item(entry, ordinal)
        ),
        updated_at = now()
    where release.snapshot_version = active_version;
  else
    update public.catalog_snapshot_releases release
    set brands = (
          select coalesce(jsonb_agg(case when entry ->> 'id' = target_stable_id then entry || fields else entry end order by ordinal), '[]'::jsonb)
          from jsonb_array_elements(release.brands) with ordinality as item(entry, ordinal)
        ),
        updated_at = now()
    where release.snapshot_version = active_version;
  end if;

  update public.catalog_admin_cache_revision
  set base_snapshot_version = active_version,
      revision = case when base_snapshot_version = active_version then revision + 1 else 1 end,
      updated_at = now()
  where singleton;
end;
$$;

create or replace function public._taxonomy_audit_json(target_type text, target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'createdAt', entry.created_at,
    'actor', coalesce(profile.name, 'Невідомий працівник'),
    'changes', entry.changes
  ) order by entry.created_at desc), '[]'::jsonb)
  from (
    select * from public.taxonomy_admin_audit audit
    where audit.entity_type = target_type and audit.entity_id = target_id
    order by audit.created_at desc
    limit 20
  ) entry
  left join public.admin_profiles profile on profile.user_id = entry.actor_id
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------

create or replace function public._taxonomy_brand_json(target public.brands)
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
    'name', target.name,
    'aliases', to_jsonb(target.aliases),
    'logoUrl', target.logo_url,
    'websiteUrl', target.website_url,
    'description', target.description,
    'country', target.country,
    'visibility', target.visibility,
    'featured', target.featured,
    'featuredOrder', target.featured_order,
    'seoTitle', target.seo_title,
    'seoDescription', target.seo_description,
    'status', target.status,
    'updatedAt', target.updated_at,
    'productCount', (select count(*) from public.products product where product.brand_id = target.internal_id),
    'publishedCount', (select count(*) from public.products product
      where product.brand_id = target.internal_id and product.publication_status = 'published'),
    'seriesCount', (select count(*) from public.product_series series where series.brand_id = target.internal_id)
  )
$$;

create or replace function public.admin_list_brands()
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
    'brands', coalesce((
      select jsonb_agg(public._taxonomy_brand_json(brand) order by brand.featured desc, brand.featured_order nulls last, lower(brand.name))
      from public.brands brand
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_brand(brand_id text)
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
    'brand', public._taxonomy_brand_json(target),
    'canEdit', public.can_manage_content(),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('id', series.stable_id, 'name', series.name,
        'productCount', (select count(*) from public.products product where product.series_id = series.internal_id))
        order by lower(series.name))
      from public.product_series series where series.brand_id = target.internal_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', grouped.stable_id, 'title', grouped.title, 'productCount', grouped.product_count)
        order by grouped.product_count desc, grouped.title)
      from (
        select category.stable_id, category.title, count(*)::integer product_count
        from public.products product
        join public.categories category on category.internal_id = product.primary_category_id
        where product.brand_id = target.internal_id
        group by category.stable_id, category.title
      ) grouped
    ), '[]'::jsonb),
    'history', public._taxonomy_audit_json('brand', target.internal_id)
  );
end;
$$;

create or replace function public.admin_update_brand(brand_id text, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.brands%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
  published integer;
begin
  perform public._taxonomy_require_editor();
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні зміни.';
  end if;

  select * into target from public.brands brand where brand.stable_id = brand_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Бренд не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Бренд уже змінив інший працівник. Оновіть сторінку.';
  end if;
  before_row := to_jsonb(target);

  if patch ? 'description' then target.description := coalesce(public._taxonomy_clean_text(patch ->> 'description', 4000), ''); end if;
  if patch ? 'country' then target.country := public._taxonomy_clean_text(patch ->> 'country', 80); end if;
  if patch ? 'websiteUrl' then
    target.website_url := public._taxonomy_clean_text(patch ->> 'websiteUrl', 500);
    if target.website_url is not null and target.website_url !~* '^https?://[^\s]+$' then
      raise exception using errcode = '22023', message = 'Сайт бренду має починатися з http:// або https://.';
    end if;
  end if;
  if patch ? 'logoUrl' then
    target.logo_url := public._taxonomy_clean_text(patch ->> 'logoUrl', 500);
    if target.logo_url is not null and target.logo_url !~* '^(https://|/?assets/)[^\s]+$' then
      raise exception using errcode = '22023', message = 'Логотип: вкажіть шлях assets/… або https:// адресу.';
    end if;
  end if;
  if patch ? 'visibility' then
    if coalesce(patch ->> 'visibility', '') not in ('catalog', 'service', 'hidden') then
      raise exception using errcode = '22023', message = 'Невідома видимість бренду.';
    end if;
    target.visibility := (patch ->> 'visibility')::public.brand_visibility;
  end if;
  if patch ? 'featured' then
    if jsonb_typeof(patch -> 'featured') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Некоректне значення «Рекомендований».';
    end if;
    target.featured := (patch ->> 'featured')::boolean;
  end if;
  if patch ? 'featuredOrder' then
    if patch -> 'featuredOrder' is null or jsonb_typeof(patch -> 'featuredOrder') = 'null' or patch ->> 'featuredOrder' = '' then
      target.featured_order := null;
    elsif (patch ->> 'featuredOrder') ~ '^\d{1,6}$' then
      target.featured_order := (patch ->> 'featuredOrder')::integer;
    else
      raise exception using errcode = '22023', message = 'Порядок має бути цілим числом від 0.';
    end if;
  end if;
  if not target.featured then target.featured_order := null; end if;
  if patch ? 'seoTitle' then target.seo_title := public._taxonomy_clean_text(patch ->> 'seoTitle', 160); end if;
  if patch ? 'seoDescription' then target.seo_description := public._taxonomy_clean_text(patch ->> 'seoDescription', 320); end if;

  if target.visibility = 'hidden' and (before_row ->> 'visibility') <> 'hidden' then
    select count(*)::integer into published from public.products product
    where product.brand_id = target.internal_id and product.publication_status = 'published';
    if published > 0 then
      raise exception using errcode = '23514',
        message = format('Не можна приховати бренд: на сайті є його опубліковані товари (%s).', published);
    end if;
  end if;

  update public.brands set
    description = target.description,
    country = target.country,
    website_url = target.website_url,
    logo_url = target.logo_url,
    visibility = target.visibility,
    featured = target.featured,
    featured_order = target.featured_order,
    seo_title = target.seo_title,
    seo_description = target.seo_description,
    updated_by = auth.uid()
  where internal_id = target.internal_id
  returning * into target;

  after_row := to_jsonb(target);
  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['description', 'country', 'website_url', 'logo_url', 'visibility', 'featured', 'featured_order', 'seo_title', 'seo_description']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('brand', target.internal_id, target.stable_id, auth.uid(), changes);

    perform public._taxonomy_patch_release('brands', target.stable_id, jsonb_build_object(
      'description', target.description,
      'country', coalesce(target.country, ''),
      'logo', target.logo_url,
      'visibility', target.visibility,
      'featured', target.featured,
      'featuredOrder', target.featured_order,
      'seo', jsonb_strip_nulls(jsonb_build_object('title', target.seo_title, 'description', target.seo_description))
    ));
  end if;

  return public.admin_get_brand(brand_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

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

create or replace function public.admin_get_category(category_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.categories category where category.stable_id = category_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'category', jsonb_build_object(
      'id', target.stable_id,
      'internalId', target.internal_id,
      'slug', target.slug,
      'level', target.level,
      'title', target.title,
      'shortTitle', target.short_title,
      'description', target.description,
      'menuDescription', target.menu_description,
      'sortOrder', target.sort_order,
      'status', target.status,
      'visibility', target.visibility,
      'seoTitle', target.seo_title,
      'seoDescription', target.seo_description,
      'updatedAt', target.updated_at,
      'publishedCount', public._taxonomy_category_published_count(target.internal_id),
      'directCount', (select count(*) from public.products product where product.primary_category_id = target.internal_id)
    ),
    'canEdit', public.can_manage_content(),
    'path', coalesce((
      with recursive ancestors as (
        select category.internal_id, category.parent_id, category.stable_id, category.title, category.level
        from public.categories category where category.internal_id = target.parent_id
        union all
        select parent.internal_id, parent.parent_id, parent.stable_id, parent.title, parent.level
        from public.categories parent join ancestors on parent.internal_id = ancestors.parent_id
      )
      select jsonb_agg(jsonb_build_object('id', ancestors.stable_id, 'title', ancestors.title) order by ancestors.level)
      from ancestors
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('id', child.stable_id, 'title', child.title, 'status', child.status,
        'visibility', child.visibility, 'sortOrder', child.sort_order) order by child.sort_order, child.stable_id)
      from public.categories child where child.parent_id = target.internal_id
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', grouped.stable_id, 'name', grouped.name, 'productCount', grouped.product_count)
        order by grouped.product_count desc, grouped.name)
      from (
        select brand.stable_id, brand.name, count(*)::integer product_count
        from public.products product
        join public.brands brand on brand.internal_id = product.brand_id
        where product.primary_category_id = target.internal_id
        group by brand.stable_id, brand.name
      ) grouped
    ), '[]'::jsonb),
    'history', public._taxonomy_audit_json('category', target.internal_id)
  );
end;
$$;

create or replace function public.admin_update_category(category_id text, patch jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.categories%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
  published integer;
begin
  perform public._taxonomy_require_editor();
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні зміни.';
  end if;

  select * into target from public.categories category where category.stable_id = category_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Категорію не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Категорію вже змінив інший працівник. Оновіть сторінку.';
  end if;
  before_row := to_jsonb(target);

  if patch ? 'title' then
    target.title := public._taxonomy_clean_text(patch ->> 'title', 160);
    if target.title is null then raise exception using errcode = '22023', message = 'Назва категорії обов’язкова.'; end if;
  end if;
  if patch ? 'shortTitle' then target.short_title := public._taxonomy_clean_text(patch ->> 'shortTitle', 80); end if;
  if patch ? 'description' then target.description := coalesce(public._taxonomy_clean_text(patch ->> 'description', 4000), ''); end if;
  if patch ? 'menuDescription' then target.menu_description := coalesce(public._taxonomy_clean_text(patch ->> 'menuDescription', 240), ''); end if;
  if patch ? 'sortOrder' then
    if coalesce(patch ->> 'sortOrder', '') !~ '^\d{1,6}$' then
      raise exception using errcode = '22023', message = 'Порядок має бути цілим числом від 0.';
    end if;
    target.sort_order := (patch ->> 'sortOrder')::integer;
  end if;
  if patch ? 'status' then
    if coalesce(patch ->> 'status', '') not in ('active', 'future', 'internal', 'archived') then
      raise exception using errcode = '22023', message = 'Невідомий статус категорії.';
    end if;
    target.status := (patch ->> 'status')::public.category_status;
  end if;
  if patch ? 'visibility' then
    if coalesce(patch ->> 'visibility', '') not in ('catalog', 'landing', 'service', 'hidden') then
      raise exception using errcode = '22023', message = 'Невідома видимість категорії.';
    end if;
    target.visibility := (patch ->> 'visibility')::public.category_visibility;
  end if;
  if patch ? 'seoTitle' then target.seo_title := public._taxonomy_clean_text(patch ->> 'seoTitle', 160); end if;
  if patch ? 'seoDescription' then target.seo_description := public._taxonomy_clean_text(patch ->> 'seoDescription', 320); end if;

  -- Product cards exist only for active categories, and the storefront lists only catalog-visible
  -- ones, so taking a category with published products out of the catalogue would hide them.
  if (target.status <> 'active' and (before_row ->> 'status') = 'active')
     or (target.visibility <> 'catalog' and (before_row ->> 'visibility') = 'catalog') then
    published := public._taxonomy_category_published_count(target.internal_id);
    if published > 0 then
      raise exception using errcode = '23514', message = format(
        'Не можна вивести категорію з каталогу: у ній і підкатегоріях є опубліковані товари (%s). Спершу перенесіть або сховайте їх.',
        published);
    end if;
  end if;

  update public.categories set
    title = target.title,
    short_title = target.short_title,
    description = target.description,
    menu_description = target.menu_description,
    sort_order = target.sort_order,
    status = target.status,
    visibility = target.visibility,
    seo_title = target.seo_title,
    seo_description = target.seo_description,
    updated_by = auth.uid()
  where internal_id = target.internal_id
  returning * into target;

  after_row := to_jsonb(target);
  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['title', 'short_title', 'description', 'menu_description', 'sort_order', 'status', 'visibility', 'seo_title', 'seo_description']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    insert into public.taxonomy_admin_audit (entity_type, entity_id, stable_id, actor_id, changes)
    values ('category', target.internal_id, target.stable_id, auth.uid(), changes);

    perform public._taxonomy_patch_release('categories', target.stable_id, jsonb_build_object(
      'title', target.title,
      'name', target.title,
      'shortTitle', coalesce(target.short_title, target.title),
      'description', target.description,
      'menuDescription', target.menu_description,
      'order', target.sort_order,
      'status', target.status,
      'visibility', target.visibility,
      'seo', jsonb_strip_nulls(jsonb_build_object('title', target.seo_title, 'description', target.seo_description)),
      'metaTitle', coalesce(target.seo_title, target.title || ' | ТД «Софіївка»')
    ));
  end if;

  return public.admin_get_category(category_id);
end;
$$;

revoke all on function public._taxonomy_clean_text(text, integer) from public, anon, authenticated;
revoke all on function public._taxonomy_require_editor() from public, anon, authenticated;
revoke all on function public._taxonomy_category_published_count(uuid) from public, anon, authenticated;
revoke all on function public._taxonomy_patch_release(text, text, jsonb) from public, anon, authenticated;
revoke all on function public._taxonomy_audit_json(text, uuid) from public, anon, authenticated;
revoke all on function public._taxonomy_brand_json(public.brands) from public, anon, authenticated;

revoke all on function public.admin_list_brands() from public, anon;
revoke all on function public.admin_get_brand(text) from public, anon;
revoke all on function public.admin_update_brand(text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_list_categories() from public, anon;
revoke all on function public.admin_get_category(text) from public, anon;
revoke all on function public.admin_update_category(text, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_list_brands() to authenticated;
grant execute on function public.admin_get_brand(text) to authenticated;
grant execute on function public.admin_update_brand(text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_list_categories() to authenticated;
grant execute on function public.admin_get_category(text) to authenticated;
grant execute on function public.admin_update_category(text, jsonb, timestamptz) to authenticated;
