-- Facet counts in one pass over the scope (audit 2026-11-07).
--
-- get_catalog_facets answered in ~0.8 s without filters and 2–5 s once a technical filter was set
-- (PROD, /catalog/water-supply, 767 products). _catalog_facets_v2 scans the scope once per group —
-- total, brands, availability, categories, price and then every facet of the scope (up to ~40
-- scans) — and expands technical_filters again on every row of every scan.
--
-- _catalog_facets_v3 reads the scope once. For every card it lists the filter groups the card fails:
-- 'category', 'brand', 'availability', 'price' or a technical key. The search text is not a facet, so
-- a card that does not match it is left out. A card counts for group F when it fails nothing or only
-- F, which is exactly _catalog_filter_match(..., omit_facet => F). The response is the same JSON as
-- v2 (tests/db-local/facets-v3-scenarios.mjs compares them over many filter combinations); v2 stays
-- for comparison and rollback. get_catalog_facets keeps its signature, grants and technicalRanges.

create or replace function public._catalog_facets_v3(
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
language sql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
  with recursive active_release as (
    select release.snapshot_version, release.attribute_definitions, release.categories
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), descendants as (
    select category.internal_id, category.stable_id
    from public.categories category
    where scope_category is not null and scope_category not in ('', 'all') and category.stable_id = scope_category
    union all
    select child.internal_id, child.stable_id
    from public.categories child
    join descendants parent on child.parent_id = parent.internal_id
  ), scope as (
    -- null = no category restriction (also for an unknown category, as in v2)
    select array_agg(descendants.stable_id) ids from descendants
  ), selected_filters as materialized (
    select filter.key, array(select jsonb_array_elements_text(filter.value)) selected_values
    from jsonb_each(coalesce(technical_filters, '{}'::jsonb)) filter
    where jsonb_typeof(filter.value) = 'array' and jsonb_array_length(filter.value) > 0
  ), price_filter as (
    select minimum_price is not null or maximum_price is not null active
  ), cards as materialized (
    select card.brand_id, card.category_id, card.inventory_status::text availability, card.amount,
      card.price_status::text price_status, card.normalized_attributes,
      array(
        select distinct failure.name from unnest(array[
          case when coalesce(cardinality(category_ids), 0) > 0
            and not coalesce(card.category_id = any(category_ids), false) then 'category' end,
          case when coalesce(cardinality(brand_ids), 0) > 0
            and not coalesce(card.brand_id = any(brand_ids), false) then 'brand' end,
          case when coalesce(cardinality(availability_ids), 0) > 0
            and not coalesce(card.inventory_status::text = any(availability_ids), false) then 'availability' end,
          case when price_filter.active and not coalesce(card.price_status::text = 'known'
            and card.amount is not null
            and (minimum_price is null or card.amount >= minimum_price)
            and (maximum_price is null or card.amount <= maximum_price), false) then 'price' end
        ] || array(
          select selected_filters.key from selected_filters
          where not coalesce(public._catalog_filter_value(card.normalized_attributes, selected_filters.key)
            = any(selected_filters.selected_values), false)
        )) failure(name)
        where failure.name is not null
      ) failed
    from active_release release
    cross join scope
    cross join price_filter
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
    where (scope.ids is null or card.category_id = any(scope.ids))
      and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
      and (coalesce(btrim(query_text), '') = '' or card.search_text ilike '%' || btrim(query_text) || '%')
  ), allowed as (
    select array_agg(distinct facet.value) keys
    from active_release release
    cross join scope
    cross join lateral jsonb_array_elements(release.categories) category
    cross join lateral jsonb_array_elements_text(coalesce(category -> 'facetIds', '[]'::jsonb)) facet(value)
    where scope.ids is null or category ->> 'id' = any(scope.ids)
  ), facet_keys as (
    select definition.key, coalesce((definition.value ->> 'rank')::numeric, 999) facet_rank
    from active_release release
    cross join allowed
    cross join lateral jsonb_each(release.attribute_definitions) definition
    where coalesce((definition.value ->> 'filterable')::boolean, false)
      and definition.key = any(coalesce(allowed.keys, array[]::text[]))
  ), option_rows as (
    select facet_keys.key, public._catalog_filter_value(cards.normalized_attributes, facet_keys.key) value_key,
      count(*)::integer value_count
    from facet_keys
    join cards on cards.failed = array[]::text[] or cards.failed = array[facet_keys.key]
    where public._catalog_filter_value(cards.normalized_attributes, facet_keys.key) is not null
    group by 1, 2
  ), option_objects as (
    select facet_keys.key, facet_keys.facet_rank,
      coalesce(jsonb_object_agg(option_rows.value_key, option_rows.value_count)
        filter (where option_rows.value_key is not null), '{}'::jsonb) counts
    from facet_keys
    left join option_rows on option_rows.key = facet_keys.key
    group by facet_keys.key, facet_keys.facet_rank
  ), kept as (
    -- v2 walked the facets by rank and stopped after nine kept ones
    select option_objects.key, option_objects.counts,
      row_number() over (order by option_objects.facet_rank, option_objects.key) position
    from option_objects
    where (select count(*) from jsonb_object_keys(option_objects.counts)) >= 2
      or coalesce(technical_filters ? option_objects.key, false)
  )
  select jsonb_build_object(
    'version', release.snapshot_version,
    'total', (select count(*)::integer from cards where cards.failed = array[]::text[]),
    'brandCounts', (select coalesce(jsonb_object_agg(counts.value_key, counts.value_count), '{}'::jsonb)
      from (select cards.brand_id value_key, count(*)::integer value_count from cards
        where cards.failed = array[]::text[] or cards.failed = array['brand'] group by cards.brand_id) counts),
    'availabilityCounts', (select coalesce(jsonb_object_agg(counts.value_key, counts.value_count), '{}'::jsonb)
      from (select cards.availability value_key, count(*)::integer value_count from cards
        where cards.failed = array[]::text[] or cards.failed = array['availability'] group by cards.availability) counts),
    'categoryCounts', (select coalesce(jsonb_object_agg(counts.value_key, counts.value_count), '{}'::jsonb)
      from (select cards.category_id value_key, count(*)::integer value_count from cards
        where cards.failed = array[]::text[] or cards.failed = array['category'] group by cards.category_id) counts),
    'technicalCounts', (select coalesce(jsonb_object_agg(kept.key, kept.counts), '{}'::jsonb) from kept where kept.position <= 9),
    'priceBounds', (select jsonb_build_object('min', min(cards.amount), 'max', max(cards.amount)) from cards
      where cards.price_status = 'known' and (cards.failed = array[]::text[] or cards.failed = array['price']))
  )
  from active_release release
$$;

revoke all on function public._catalog_facets_v3(text, text, text[], text[], text[], jsonb, numeric, numeric, text) from public, anon, authenticated;

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
language sql stable security definer set search_path = '' set statement_timeout = '8s'
as $$
  select case when value is null then null else
    jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version()))
      || jsonb_build_object('technicalRanges', public._catalog_facet_ranges(value -> 'technicalCounts'))
  end
  from (select public._catalog_facets_v3(scope_category, scope_brand, category_ids, brand_ids, availability_ids,
    technical_filters, minimum_price, maximum_price, query_text) value) response
$$;

revoke all on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) from public;
grant execute on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) to anon, authenticated;
