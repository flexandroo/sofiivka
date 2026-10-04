-- Faster catalogue search (final audit AUD-012).
-- _catalog_search_v2 carried every matching card (large jsonb) through two sorts and evaluated trigram
-- similarity for every row twice, so common words such as «насос» took 1.5–2 s and sometimes hit the
-- 5 s timeout. v3 ranks on ids only, joins the cards for the top hits, runs the fuzzy (typo) match only
-- when nothing matches directly, ignores apostrophes, and counts category hits over the whole subtree
-- so parent sections no longer show 0 products (empty ones are left out).

create or replace function public._catalog_search_v3(
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
  with recursive active_release as (
    select release.snapshot_version, release.categories, release.brands
    from public.catalog_snapshot_pointer pointer
    join public.catalog_snapshot_releases release
      on release.snapshot_version = pointer.snapshot_version and release.ready
    where pointer.singleton
  ), input as (
    select lower(btrim(query_text)) q,
      translate(lower(btrim(query_text)), '''’ʼ`', '') qn,
      translate(lower(regexp_replace(btrim(query_text), '\s+', '', 'g')), 'oо', '00') compact
  ), fields as materialized (
    select card.legacy_id, card.sort_order, card.search_text, card.search_document,
      translate(lower(card.card ->> 'sku'), 'oо', '00') sku,
      lower(card.card ->> 'model') model,
      lower(card.card ->> 'title') title
    from active_release release
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
  ), direct as materialized (
    select fields.legacy_id, fields.sort_order,
      case
        when fields.sku = input.compact then 100000
        when fields.model = input.q then 90000
        when fields.title = input.q then 85000
        when fields.sku like input.compact || '%' then 18000
        when fields.title like input.q || '%' then 8000
        when fields.model like input.q || '%' then 7200
        when fields.search_document @@ plainto_tsquery('simple', input.q) then 4200
        else 2600
      end as score
    from fields cross join input
    where length(input.q) >= 2 and (
      fields.sku = input.compact
      or fields.model = input.q
      or fields.title = input.q
      or fields.sku like input.compact || '%'
      or fields.title like input.q || '%'
      or fields.search_document @@ plainto_tsquery('simple', input.q)
      or fields.search_text ilike '%' || input.q || '%'
      or (input.qn <> input.q and length(input.qn) >= 2
        and translate(fields.search_text, '''’ʼ`', '') ilike '%' || input.qn || '%')
    )
  ), fuzzy as (
    -- Typos and near misses: only when the direct match found nothing.
    select fields.legacy_id, fields.sort_order,
      round(extensions.word_similarity(input.qn, lower(fields.search_text)) * 1000)::integer score
    from fields cross join input
    where length(input.qn) >= 3
      and not exists (select 1 from direct)
      and extensions.word_similarity(input.qn, lower(fields.search_text)) >= 0.45
  ), ranked as (
    select legacy_id, sort_order, score from direct
    union all
    select legacy_id, sort_order, score from fuzzy
  ), top_hits as (
    select legacy_id, sort_order, score from ranked
    order by score desc, sort_order, legacy_id
    limit least(greatest(product_limit, 1), 48)
  ), product_hits as (
    select card.card, top_hits.score, top_hits.sort_order, top_hits.legacy_id
    from top_hits
    join active_release release on true
    join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.legacy_id = top_hits.legacy_id
  ), category_list as (
    select category, category ->> 'id' id, category ->> 'parentId' parent_id
    from active_release release cross join lateral jsonb_array_elements(release.categories) category
  ), category_matches as (
    select category_list.category, category_list.id,
      case when lower(category ->> 'title') = input.q then 10000
        when lower(category ->> 'title') like input.q || '%' then 4800 else 2600 end score
    from category_list cross join input
    where length(input.q) >= 2
      and concat_ws(' ', category ->> 'title', category ->> 'shortTitle', category ->> 'id') ilike '%' || input.q || '%'
  ), category_tree as (
    select category_matches.id root_id, category_matches.id id from category_matches
    union all
    select category_tree.root_id, child.id
    from category_tree join category_list child on child.parent_id = category_tree.id
  ), category_counts as (
    select category_tree.root_id, count(card.legacy_id)::integer count
    from category_tree
    join active_release release on true
    join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.category_id = category_tree.id
    group by category_tree.root_id
  ), category_hits as (
    select category_matches.category, category_counts.count, category_matches.score
    from category_matches join category_counts on category_counts.root_id = category_matches.id
    where category_counts.count > 0
    order by category_matches.score desc, category_counts.count desc
    limit least(greatest(category_limit, 1), 12)
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
    'products', coalesce((select jsonb_agg(card order by score desc, sort_order, legacy_id) from product_hits), '[]'::jsonb),
    'productHits', coalesce((select jsonb_agg(jsonb_build_object('product', card, 'score', score)
      order by score desc, sort_order, legacy_id) from product_hits), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('entity', category, 'count', count, 'score', score)
      order by score desc, count desc) from category_hits), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('entity', brand, 'count', count, 'score', score) order by score desc) from brand_hits), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('entity', entity, 'count', count, 'score', score) order by score desc) from series_hits), '[]'::jsonb)
  )
  from active_release release
$$;

revoke all on function public._catalog_search_v3(text, integer, integer, integer, integer) from public, anon, authenticated;

create or replace function public.search_catalog(
  query_text text,
  product_limit integer default 12,
  category_limit integer default 6,
  brand_limit integer default 6,
  series_limit integer default 6
)
returns jsonb
language sql stable security definer set search_path = '' set statement_timeout = '5s'
as $$
  select case when value is null then null else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from (select public._catalog_search_v3(query_text, product_limit, category_limit, brand_limit, series_limit) value) response
$$;

revoke all on function public.search_catalog(text, integer, integer, integer, integer) from public;
grant execute on function public.search_catalog(text, integer, integer, integer, integer) to anon, authenticated;
