-- Numeric facets as ranges (final audit AUD-030, fix plan W2-8, DB part).
--
-- get_catalog_facets returned every numeric value as its own checkbox (up to 230 for one group).
-- The response now also carries `technicalRanges`: for each facet in `technicalCounts` whose
-- attribute is numeric (release attribute type 'number') and has more than 12 distinct values,
-- { min, max, values (distinct count), products, unit }. Purely additive: `technicalCounts` and
-- every other key are unchanged, so current clients behave exactly as before. A client that
-- renders «від/до» can filter with the existing technical_filters array by sending the values from
-- technicalCounts that fall inside the chosen range — no new filter syntax is needed.
-- The ranges are computed from the already aggregated counts (no extra pass over the products).

create or replace function public._catalog_facet_ranges(technical_counts jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with definitions as (
    select release.attribute_definitions defs
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), facet_values as (
    select facet.key facet_key, opt.key option_key, opt.value option_count
    from definitions
    cross join lateral jsonb_each(coalesce(technical_counts, '{}'::jsonb)) facet
    cross join lateral jsonb_each_text(case when jsonb_typeof(facet.value) = 'object' then facet.value else '{}'::jsonb end) opt
    where definitions.defs -> facet.key ->> 'type' = 'number'
  ), ranges as (
    select facet_key,
      min(case when option_key ~ '^-?[0-9]+(\.[0-9]+)?$' then option_key::numeric end) minimum,
      max(case when option_key ~ '^-?[0-9]+(\.[0-9]+)?$' then option_key::numeric end) maximum,
      count(*)::integer value_count,
      sum(case when option_count ~ '^[0-9]+$' then option_count::integer else 0 end)::integer product_count
    from facet_values
    group by facet_key
    -- every option must be a plain number, otherwise a range would hide some of them
    having bool_and(option_key ~ '^-?[0-9]+(\.[0-9]+)?$') and count(*) > 12
  )
  select coalesce(jsonb_object_agg(ranges.facet_key, jsonb_build_object(
      'min', ranges.minimum, 'max', ranges.maximum, 'values', ranges.value_count,
      'products', ranges.product_count, 'unit', coalesce(definitions.defs -> ranges.facet_key ->> 'unit', ''))),
    '{}'::jsonb)
  from ranges cross join definitions
$$;

revoke all on function public._catalog_facet_ranges(jsonb) from public, anon, authenticated;

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
  from (select public._catalog_facets_v2(scope_category, scope_brand, category_ids, brand_ids, availability_ids,
    technical_filters, minimum_price, maximum_price, query_text) value) response
$$;

revoke all on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) from public;
grant execute on function public.get_catalog_facets(text, text, text[], text[], text[], jsonb, numeric, numeric, text) to anon, authenticated;
