-- Scoped public catalogue read model v2. The full snapshot RPC remains available
-- for parity/debug work, while normal storefront reads use compact materialized cards.
begin;
set local search_path = public, extensions;

create or replace function public._catalog_card(payload jsonb, brand_name text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', payload -> 'id',
    'slug', payload -> 'slug',
    'sku', payload -> 'sku',
    'title', payload -> 'title',
    'shortTitle', payload -> 'shortTitle',
    'model', payload -> 'model',
    'brandId', payload -> 'brandId',
    'brand', to_jsonb(brand_name),
    'primaryCategoryId', payload -> 'primaryCategoryId',
    'seriesId', payload -> 'seriesId',
    'pricing', payload -> 'pricing',
    'inventory', payload -> 'inventory',
    'publicationStatus', payload -> 'publicationStatus',
    'images', case
      when jsonb_typeof(payload -> 'images') = 'array' and jsonb_array_length(payload -> 'images') > 0
        then jsonb_build_array(payload #> '{images,0}')
      else '[]'::jsonb
    end,
    'normalizedAttributes', coalesce(payload -> 'normalizedAttributes', '{}'::jsonb),
    'tags', coalesce(payload -> 'tags', '[]'::jsonb),
    'collections', coalesce(payload -> 'collections', '[]'::jsonb),
    'badges', coalesce(payload -> 'badges', '[]'::jsonb),
    'source', jsonb_build_object('sourceCategory', coalesce(payload #>> '{source,sourceCategory}', ''))
  )
$$;

revoke all on function public._catalog_card(jsonb, text) from public, anon, authenticated;

create table public.catalog_product_cards (
  snapshot_version text not null,
  legacy_id text not null,
  sort_order integer not null check (sort_order >= 0),
  brand_id text not null,
  category_id text not null,
  series_id text,
  amount numeric(14, 2),
  price_status public.product_price_status not null,
  inventory_status public.product_inventory_status not null,
  normalized_attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_attributes) = 'object'),
  search_text text not null,
  search_document tsvector generated always as (to_tsvector('simple', search_text)) stored,
  card jsonb not null check (jsonb_typeof(card) = 'object'),
  primary key (snapshot_version, legacy_id),
  unique (snapshot_version, sort_order),
  foreign key (snapshot_version, legacy_id)
    references public.catalog_product_snapshots(snapshot_version, legacy_id) on delete cascade
);

create index catalog_product_cards_category_idx
  on public.catalog_product_cards (snapshot_version, category_id, sort_order);
create index catalog_product_cards_brand_idx
  on public.catalog_product_cards (snapshot_version, brand_id, sort_order);
create index catalog_product_cards_inventory_idx
  on public.catalog_product_cards (snapshot_version, inventory_status, sort_order);
create index catalog_product_cards_price_idx
  on public.catalog_product_cards (snapshot_version, amount, sort_order)
  where price_status = 'known';
create index catalog_product_cards_search_idx
  on public.catalog_product_cards using gin (search_document);
create index catalog_product_cards_search_trgm_idx
  on public.catalog_product_cards using gin (search_text gin_trgm_ops);
create index catalog_product_cards_attributes_idx
  on public.catalog_product_cards using gin (normalized_attributes jsonb_path_ops);
create index catalog_product_cards_sku_idx
  on public.catalog_product_cards (snapshot_version, lower(card ->> 'sku'));

alter table public.catalog_product_cards enable row level security;
revoke all on table public.catalog_product_cards from public, anon, authenticated;

insert into public.catalog_product_cards (
  snapshot_version, legacy_id, sort_order, brand_id, category_id, series_id,
  amount, price_status, inventory_status, normalized_attributes, search_text, card
)
select
  snapshot.snapshot_version,
  snapshot.legacy_id,
  snapshot.sort_order,
  brand.stable_id,
  category.stable_id,
  series.stable_id,
  product.amount,
  product.price_status,
  product.inventory_status,
  coalesce(snapshot.payload -> 'normalizedAttributes', '{}'::jsonb),
  concat_ws(' ', product.sku, product.title, product.short_title, product.model,
    brand.name, brand.stable_id, category.title, category.stable_id,
    series.name, series.stable_id, snapshot.payload ->> 'normalizedAttributes'),
  public._catalog_card(snapshot.payload, brand.name)
from public.catalog_product_snapshots snapshot
join public.catalog_snapshot_releases release
  on release.snapshot_version = snapshot.snapshot_version and release.ready
join public.products product
  on product.legacy_id = snapshot.legacy_id and product.publication_status = 'published'
join public.brands brand
  on brand.internal_id = product.brand_id and brand.status = 'active'
join public.categories category
  on category.internal_id = product.primary_category_id and category.status = 'active'
left join public.product_series series on series.internal_id = product.series_id;

create or replace function public._catalog_filter_value(attributes jsonb, attribute_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(attributes -> attribute_id)
    when 'boolean' then case when (attributes ->> attribute_id)::boolean then 'yes' else 'no' end
    when 'null' then null
    else attributes ->> attribute_id
  end
$$;

create or replace function public._catalog_filter_match(
  row_category text,
  row_brand text,
  row_availability text,
  row_amount numeric,
  row_price_status text,
  row_attributes jsonb,
  row_search_text text,
  category_ids text[],
  brand_ids text[],
  availability_ids text[],
  technical_filters jsonb,
  minimum_price numeric,
  maximum_price numeric,
  query_text text,
  omit_facet text default null
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (omit_facet in ('category', 'subcategory') or coalesce(cardinality(category_ids), 0) = 0 or row_category = any(category_ids))
    and (omit_facet = 'brand' or coalesce(cardinality(brand_ids), 0) = 0 or row_brand = any(brand_ids))
    and (omit_facet = 'availability' or coalesce(cardinality(availability_ids), 0) = 0 or row_availability = any(availability_ids))
    and (
      omit_facet = 'price'
      or (minimum_price is null and maximum_price is null)
      or (row_price_status = 'known'
        and row_amount is not null
        and (minimum_price is null or row_amount >= minimum_price)
        and (maximum_price is null or row_amount <= maximum_price))
    )
    and (coalesce(btrim(query_text), '') = '' or row_search_text ilike '%' || btrim(query_text) || '%')
    and not exists (
      select 1
      from jsonb_each(coalesce(technical_filters, '{}'::jsonb)) filter
      where filter.key is distinct from omit_facet
        and jsonb_typeof(filter.value) = 'array'
        and jsonb_array_length(filter.value) > 0
        and not exists (
          select 1
          from jsonb_array_elements_text(filter.value) selected(value)
          where selected.value = public._catalog_filter_value(row_attributes, filter.key)
        )
    )
$$;

revoke all on function public._catalog_filter_value(jsonb, text) from public, anon, authenticated;
revoke all on function public._catalog_filter_match(text, text, text, numeric, text, jsonb, text, text[], text[], text[], jsonb, numeric, numeric, text, text) from public, anon, authenticated;

create or replace function public.get_catalog_version()
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
  select jsonb_build_object('version', release.snapshot_version, 'updated_at', release.updated_at)
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release
    on release.snapshot_version = pointer.snapshot_version and release.ready
  where pointer.singleton
$$;

create or replace function public.get_catalog_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
  with recursive active_release as (
    select release.*
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), category_tree as (
    select category.internal_id as ancestor_id, category.internal_id as descendant_id
    from public.categories category
    union all
    select tree.ancestor_id, child.internal_id
    from category_tree tree
    join public.categories child on child.parent_id = tree.descendant_id
  ), category_counts as (
    select ancestor.stable_id, count(card.legacy_id)::integer as product_count
    from category_tree tree
    join public.categories ancestor on ancestor.internal_id = tree.ancestor_id
    join public.categories descendant on descendant.internal_id = tree.descendant_id
    left join active_release release on true
    left join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.category_id = descendant.stable_id
    group by ancestor.stable_id
  ), brand_counts as (
    select card.brand_id, count(*)::integer as product_count
    from active_release release
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
    group by card.brand_id
  ), collections as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', collection.stable_id,
      'slug', collection.slug,
      'title', collection.title,
      'description', collection.description,
      'type', collection.collection_type,
      'order', collection.sort_order,
      'count', (select count(*) from public.product_collection_items item
        join public.products product on product.internal_id = item.product_id and product.publication_status = 'published'
        where item.collection_id = collection.internal_id)
    ) order by collection.sort_order, collection.stable_id), '[]'::jsonb) as value
    from public.product_collections collection
    where collection.active
      and (collection.date_from is null or collection.date_from <= now())
      and (collection.date_to is null or collection.date_to >= now())
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'updated_at', release.updated_at,
    'totalProducts', release.public_product_count,
    'categories', release.categories,
    'brands', release.brands,
    'attributeDefinitions', release.attribute_definitions,
    'collections', collections.value,
    'categoryCounts', coalesce((select jsonb_object_agg(stable_id, product_count) from category_counts), '{}'::jsonb),
    'brandCounts', coalesce((select jsonb_object_agg(brand_id, product_count) from brand_counts), '{}'::jsonb)
  )
  from active_release release cross join collections
$$;

create or replace function public.get_catalog_products(
  scope_category text default null,
  scope_brand text default null,
  category_ids text[] default null,
  brand_ids text[] default null,
  availability_ids text[] default null,
  technical_filters jsonb default '{}'::jsonb,
  minimum_price numeric default null,
  maximum_price numeric default null,
  sort_mode text default 'default',
  page_number integer default 1,
  page_size integer default 24,
  product_ids text[] default null,
  query_text text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
  with recursive active_release as (
    select release.snapshot_version
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), descendants as (
    select category.internal_id, category.stable_id
    from public.categories category
    where category.stable_id = scope_category
    union all
    select child.internal_id, child.stable_id
    from public.categories child join descendants parent on child.parent_id = parent.internal_id
  ), filtered as materialized (
    select card.*
    from active_release release
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
    where (scope_category is null or scope_category in ('', 'all') or card.category_id in (select stable_id from descendants))
      and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
      and (coalesce(cardinality(product_ids), 0) = 0 or card.legacy_id = any(product_ids))
      and public._catalog_filter_match(
        card.category_id, card.brand_id, card.inventory_status::text, card.amount, card.price_status::text,
        card.normalized_attributes, card.search_text, category_ids, brand_ids, availability_ids,
        technical_filters, minimum_price, maximum_price, query_text, null
      )
  ), numbered as (
    select filtered.card, row_number() over (order by
      case when sort_mode = 'price-asc' then (filtered.price_status <> 'known' or filtered.amount is null)::integer end asc,
      case when sort_mode = 'price-asc' then filtered.amount end asc nulls last,
      case when sort_mode = 'price-desc' then (filtered.price_status <> 'known' or filtered.amount is null)::integer end asc,
      case when sort_mode = 'price-desc' then filtered.amount end desc nulls last,
      filtered.sort_order asc, filtered.legacy_id asc
    ) as ordinal
    from filtered
  ), page as (
    select * from numbered
    where ordinal > (greatest(page_number, 1) - 1) * least(greatest(page_size, 1), 96)
      and ordinal <= greatest(page_number, 1) * least(greatest(page_size, 1), 96)
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'total', (select count(*) from filtered),
    'page', greatest(page_number, 1),
    'pageSize', least(greatest(page_size, 1), 96),
    'hasMore', (select count(*) from filtered) > greatest(page_number, 1) * least(greatest(page_size, 1), 96),
    'products', coalesce((select jsonb_agg(card order by ordinal) from page), '[]'::jsonb)
  )
  from active_release release
$$;

create or replace function public.get_catalog_facets(
  scope_category text default null,
  scope_brand text default null,
  category_ids text[] default null,
  brand_ids text[] default null,
  availability_ids text[] default null,
  technical_filters jsonb default '{}'::jsonb,
  minimum_price numeric default null,
  maximum_price numeric default null,
  query_text text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  active_version text;
  release_attributes jsonb;
  release_categories jsonb;
  scope_ids text[];
  allowed_facets text[];
  brand_counts jsonb := '{}'::jsonb;
  availability_counts jsonb := '{}'::jsonb;
  category_counts jsonb := '{}'::jsonb;
  technical_counts jsonb := '{}'::jsonb;
  price_bounds jsonb := '{}'::jsonb;
  total_count integer := 0;
  facet_key text;
  option_counts jsonb;
begin
  select release.snapshot_version, release.attribute_definitions, release.categories
  into active_version, release_attributes, release_categories
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release
    on release.snapshot_version = pointer.snapshot_version and release.ready
  where pointer.singleton;

  if active_version is null then return null; end if;

  if scope_category is not null and scope_category not in ('', 'all') then
    with recursive descendants as (
      select category.internal_id, category.stable_id from public.categories category where category.stable_id = scope_category
      union all
      select child.internal_id, child.stable_id from public.categories child join descendants parent on child.parent_id = parent.internal_id
    ) select array_agg(stable_id) into scope_ids from descendants;
  end if;

  select count(*)::integer into total_count
  from public.catalog_product_cards card
  where card.snapshot_version = active_version
    and (scope_ids is null or card.category_id = any(scope_ids))
    and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
    and public._catalog_filter_match(card.category_id, card.brand_id, card.inventory_status::text, card.amount,
      card.price_status::text, card.normalized_attributes, card.search_text, category_ids, brand_ids,
      availability_ids, technical_filters, minimum_price, maximum_price, query_text, null);

  select coalesce(jsonb_object_agg(value_key, value_count), '{}'::jsonb) into brand_counts
  from (
    select card.brand_id value_key, count(*)::integer value_count
    from public.catalog_product_cards card
    where card.snapshot_version = active_version and (scope_ids is null or card.category_id = any(scope_ids))
      and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
      and public._catalog_filter_match(card.category_id, card.brand_id, card.inventory_status::text, card.amount,
        card.price_status::text, card.normalized_attributes, card.search_text, category_ids, brand_ids,
        availability_ids, technical_filters, minimum_price, maximum_price, query_text, 'brand')
    group by card.brand_id
  ) counts;

  select coalesce(jsonb_object_agg(value_key, value_count), '{}'::jsonb) into availability_counts
  from (
    select card.inventory_status::text value_key, count(*)::integer value_count
    from public.catalog_product_cards card
    where card.snapshot_version = active_version and (scope_ids is null or card.category_id = any(scope_ids))
      and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
      and public._catalog_filter_match(card.category_id, card.brand_id, card.inventory_status::text, card.amount,
        card.price_status::text, card.normalized_attributes, card.search_text, category_ids, brand_ids,
        availability_ids, technical_filters, minimum_price, maximum_price, query_text, 'availability')
    group by card.inventory_status
  ) counts;

  select coalesce(jsonb_object_agg(value_key, value_count), '{}'::jsonb) into category_counts
  from (
    select card.category_id value_key, count(*)::integer value_count
    from public.catalog_product_cards card
    where card.snapshot_version = active_version and (scope_ids is null or card.category_id = any(scope_ids))
      and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
      and public._catalog_filter_match(card.category_id, card.brand_id, card.inventory_status::text, card.amount,
        card.price_status::text, card.normalized_attributes, card.search_text, category_ids, brand_ids,
        availability_ids, technical_filters, minimum_price, maximum_price, query_text, 'category')
    group by card.category_id
  ) counts;

  select jsonb_build_object('min', min(card.amount), 'max', max(card.amount)) into price_bounds
  from public.catalog_product_cards card
  where card.snapshot_version = active_version and (scope_ids is null or card.category_id = any(scope_ids))
    and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
    and card.price_status = 'known'
    and public._catalog_filter_match(card.category_id, card.brand_id, card.inventory_status::text, card.amount,
      card.price_status::text, card.normalized_attributes, card.search_text, category_ids, brand_ids,
      availability_ids, technical_filters, minimum_price, maximum_price, query_text, 'price');

  select array_agg(distinct facet.value) into allowed_facets
  from jsonb_array_elements(release_categories) category
  cross join lateral jsonb_array_elements_text(coalesce(category -> 'facetIds', '[]'::jsonb)) facet(value)
  where scope_ids is null or category ->> 'id' = any(scope_ids);

  for facet_key in
    select definition.key
    from jsonb_each(release_attributes) definition
    where coalesce((definition.value ->> 'filterable')::boolean, false)
      and definition.key = any(coalesce(allowed_facets, array[]::text[]))
    order by coalesce((definition.value ->> 'rank')::numeric, 999), definition.key
  loop
    select coalesce(jsonb_object_agg(value_key, value_count), '{}'::jsonb) into option_counts
    from (
      select public._catalog_filter_value(card.normalized_attributes, facet_key) value_key, count(*)::integer value_count
      from public.catalog_product_cards card
      where card.snapshot_version = active_version and (scope_ids is null or card.category_id = any(scope_ids))
        and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
        and public._catalog_filter_value(card.normalized_attributes, facet_key) is not null
        and public._catalog_filter_match(card.category_id, card.brand_id, card.inventory_status::text, card.amount,
          card.price_status::text, card.normalized_attributes, card.search_text, category_ids, brand_ids,
          availability_ids, technical_filters, minimum_price, maximum_price, query_text, facet_key)
      group by public._catalog_filter_value(card.normalized_attributes, facet_key)
    ) counts;
    if jsonb_object_length(option_counts) >= 2 or technical_filters ? facet_key then
      technical_counts := technical_counts || jsonb_build_object(facet_key, option_counts);
    end if;
    exit when jsonb_object_length(technical_counts) >= 9;
  end loop;

  return jsonb_build_object(
    'version', active_version, 'total', total_count,
    'brandCounts', brand_counts, 'availabilityCounts', availability_counts,
    'categoryCounts', category_counts, 'technicalCounts', technical_counts,
    'priceBounds', price_bounds
  );
end;
$$;

create or replace function public.get_catalog_product(legacy_id text)
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
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version and card.legacy_id = get_catalog_product.legacy_id
    join public.catalog_product_snapshots snapshot
      on snapshot.snapshot_version = card.snapshot_version and snapshot.legacy_id = card.legacy_id
  ), related as (
    select candidate.card,
      (case when candidate.series_id is not null and candidate.series_id = target.series_id then 40 else 0 end)
      + (case when candidate.brand_id = target.brand_id then 12 else 0 end)
      + 5 * (select count(*) from jsonb_each_text(candidate.normalized_attributes) attribute
        where target.normalized_attributes ->> attribute.key = attribute.value) as relevance,
      case when candidate.amount is not null and target.amount is not null then abs(candidate.amount - target.amount) else null end as price_distance
    from target
    join public.catalog_product_cards candidate
      on candidate.snapshot_version = target.snapshot_version
     and candidate.category_id = target.category_id
     and candidate.legacy_id <> target.legacy_id
    order by relevance desc, price_distance asc nulls last, candidate.sort_order, candidate.legacy_id
    limit 4
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'product', (select payload from target),
    'relatedProducts', coalesce((select jsonb_agg(card) from related), '[]'::jsonb)
  )
  from active_release release
  where exists (select 1 from target)
$$;

create or replace function public.search_catalog(
  query_text text,
  product_limit integer default 12,
  category_limit integer default 6,
  brand_limit integer default 6,
  series_limit integer default 6
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  with active_release as (
    select release.*
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), input as (
    select lower(btrim(query_text)) q, translate(lower(regexp_replace(btrim(query_text), '\s+', '', 'g')), 'oо', '00') compact
  ), ranked as (
    select card.*,
      case
        when translate(lower(card.card ->> 'sku'), 'oо', '00') = input.compact then 100000
        when lower(card.card ->> 'model') = input.q then 90000
        when lower(card.card ->> 'title') = input.q then 85000
        when translate(lower(card.card ->> 'sku'), 'oо', '00') like input.compact || '%' then 18000
        when lower(card.card ->> 'title') like input.q || '%' then 8000
        when lower(card.card ->> 'model') like input.q || '%' then 7200
        when card.search_document @@ plainto_tsquery('simple', input.q) then 4200
        when card.search_text ilike '%' || input.q || '%' then 2600
        else round(extensions.similarity(card.search_text, input.q) * 1000)::integer
      end as score
    from active_release release
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
    cross join input
    where length(input.q) >= 2 and (
      translate(lower(card.card ->> 'sku'), 'oо', '00') = input.compact
      or lower(card.card ->> 'model') = input.q
      or lower(card.card ->> 'title') = input.q
      or translate(lower(card.card ->> 'sku'), 'oо', '00') like input.compact || '%'
      or card.search_document @@ plainto_tsquery('simple', input.q)
      or card.search_text ilike '%' || input.q || '%'
      or extensions.similarity(card.search_text, input.q) >= 0.2
    )
  ), product_hits as (
    select card, score from ranked order by score desc, sort_order, legacy_id limit least(greatest(product_limit, 1), 48)
  ), category_hits as (
    select category, count(card.legacy_id)::integer count,
      case when lower(category ->> 'title') = input.q then 10000
        when lower(category ->> 'title') like input.q || '%' then 4800 else 2600 end score
    from active_release release cross join input
    cross join lateral jsonb_array_elements(release.categories) category
    left join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.category_id = category ->> 'id'
    where length(input.q) >= 2 and concat_ws(' ', category ->> 'title', category ->> 'shortTitle', category ->> 'id') ilike '%' || input.q || '%'
    group by category, input.q order by score desc, count desc limit least(greatest(category_limit, 1), 12)
  ), brand_hits as (
    select brand, count(card.legacy_id)::integer count,
      case when lower(brand ->> 'name') = input.q then 10000
        when lower(brand ->> 'name') like input.q || '%' then 4800 else 2600 end score
    from active_release release cross join input
    cross join lateral jsonb_array_elements(release.brands) brand
    left join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.brand_id = brand ->> 'id'
    where length(input.q) >= 2 and concat_ws(' ', brand ->> 'name', brand ->> 'id') ilike '%' || input.q || '%'
    group by brand, input.q order by score desc, count desc limit least(greatest(brand_limit, 1), 12)
  ), series_hits as (
    select jsonb_build_object('id', series.stable_id, 'name', series.name, 'label', series.name, 'brand', brand.name) entity,
      count(card.legacy_id)::integer count,
      case when lower(series.name) = input.q then 10000 when lower(series.name) like input.q || '%' then 4800 else 2600 end score
    from active_release release cross join input
    join public.product_series series on series.status = 'active'
    join public.brands brand on brand.internal_id = series.brand_id
    left join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.series_id = series.stable_id
    where length(input.q) >= 2 and concat_ws(' ', series.name, series.stable_id, brand.name) ilike '%' || input.q || '%'
    group by series.stable_id, series.name, brand.name, input.q
    order by score desc, count desc limit least(greatest(series_limit, 1), 12)
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'query', query_text,
    'totalProducts', (select count(*) from ranked),
    'products', coalesce((select jsonb_agg(card order by score desc) from product_hits), '[]'::jsonb),
    'productHits', coalesce((select jsonb_agg(jsonb_build_object('product', card, 'score', score) order by score desc) from product_hits), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('entity', category, 'count', count, 'score', score) order by score desc) from category_hits), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('entity', brand, 'count', count, 'score', score) order by score desc) from brand_hits), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('entity', entity, 'count', count, 'score', score) order by score desc) from series_hits), '[]'::jsonb)
  )
  from active_release release
$$;

create or replace function public.get_catalog_collection(collection_id text)
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
    select collection.* from public.product_collections collection
    where (collection.stable_id = collection_id or collection.slug = collection_id)
      and collection.active
      and (collection.date_from is null or collection.date_from <= now())
      and (collection.date_to is null or collection.date_to >= now())
    order by (collection.stable_id = collection_id) desc limit 1
  ), items as (
    select card.card, item.sort_order
    from active_release release cross join target
    join public.product_collection_items item on item.collection_id = target.internal_id
    join public.products product on product.internal_id = item.product_id and product.publication_status = 'published'
    join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.legacy_id = product.legacy_id
    order by item.sort_order, card.sort_order
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'collection', jsonb_build_object('id', target.stable_id, 'slug', target.slug, 'title', target.title,
      'description', target.description, 'type', target.collection_type),
    'products', coalesce((select jsonb_agg(card order by sort_order) from items), '[]'::jsonb)
  )
  from active_release release cross join target
$$;

-- Keep future publishes in sync with both debug/full and scoped read models.
create or replace function public.finalize_catalog_snapshot(target_snapshot_version text)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  materialized_products jsonb;
  materialized_count integer;
  expected_count integer;
begin
  select release.public_product_count into expected_count
  from public.catalog_snapshot_releases release where release.snapshot_version = target_snapshot_version;
  if expected_count is null then raise exception 'Unknown catalog snapshot version %', target_snapshot_version; end if;

  select coalesce(jsonb_agg(snapshot.payload order by snapshot.sort_order), '[]'::jsonb)
  into materialized_products
  from public.catalog_product_snapshots snapshot
  join public.products product on product.legacy_id = snapshot.legacy_id
  join public.brands brand on brand.internal_id = product.brand_id
  join public.categories category on category.internal_id = product.primary_category_id
  where snapshot.snapshot_version = target_snapshot_version
    and product.publication_status = 'published' and brand.status = 'active' and category.status = 'active';

  materialized_count := jsonb_array_length(materialized_products);
  if materialized_count <> expected_count then
    raise exception 'Catalog snapshot count mismatch: expected %, got %', expected_count, materialized_count;
  end if;

  update public.catalog_snapshot_releases
  set products = materialized_products, ready = true, updated_at = now()
  where snapshot_version = target_snapshot_version;

  delete from public.catalog_product_cards where snapshot_version = target_snapshot_version;
  insert into public.catalog_product_cards (
    snapshot_version, legacy_id, sort_order, brand_id, category_id, series_id,
    amount, price_status, inventory_status, normalized_attributes, search_text, card
  )
  select snapshot.snapshot_version, snapshot.legacy_id, snapshot.sort_order,
    brand.stable_id, category.stable_id, series.stable_id, product.amount,
    product.price_status, product.inventory_status,
    coalesce(snapshot.payload -> 'normalizedAttributes', '{}'::jsonb),
    concat_ws(' ', product.sku, product.title, product.short_title, product.model,
      brand.name, brand.stable_id, category.title, category.stable_id,
      series.name, series.stable_id, snapshot.payload ->> 'normalizedAttributes'),
    public._catalog_card(snapshot.payload, brand.name)
  from public.catalog_product_snapshots snapshot
  join public.products product on product.legacy_id = snapshot.legacy_id and product.publication_status = 'published'
  join public.brands brand on brand.internal_id = product.brand_id and brand.status = 'active'
  join public.categories category on category.internal_id = product.primary_category_id and category.status = 'active'
  left join public.product_series series on series.internal_id = product.series_id
  where snapshot.snapshot_version = target_snapshot_version;

  return materialized_count;
end;
$$;

revoke all on function public.get_catalog_version() from public;
revoke all on function public.get_catalog_bootstrap() from public;
revoke all on function public.get_catalog_products(text, text, text[], text[], text[], jsonb, numeric, numeric, text, integer, integer, text[], text) from public;
revoke all on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) from public;
revoke all on function public.get_catalog_product(text) from public;
revoke all on function public.search_catalog(text, integer, integer, integer, integer) from public;
revoke all on function public.get_catalog_collection(text) from public;
grant execute on function public.get_catalog_version() to anon, authenticated;
grant execute on function public.get_catalog_bootstrap() to anon, authenticated;
grant execute on function public.get_catalog_products(text, text, text[], text[], text[], jsonb, numeric, numeric, text, integer, integer, text[], text) to anon, authenticated;
grant execute on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) to anon, authenticated;
grant execute on function public.get_catalog_product(text) to anon, authenticated;
grant execute on function public.search_catalog(text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_catalog_collection(text) to anon, authenticated;
revoke all on function public.finalize_catalog_snapshot(text) from public, anon, authenticated;
grant execute on function public.finalize_catalog_snapshot(text) to service_role;

commit;
