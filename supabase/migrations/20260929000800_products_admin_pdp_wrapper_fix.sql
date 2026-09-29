-- Fix the self-qualified legacy_id reference after the scoped PDP function was
-- renamed behind the Products Admin cache-version wrapper.
begin;

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
  ), related as (
    select candidate.card,
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

revoke all on function public._catalog_product_v2(text) from public, anon, authenticated;

commit;
