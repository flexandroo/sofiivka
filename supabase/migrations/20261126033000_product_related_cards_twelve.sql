-- Increase automatic same-category PDP suggestions from four to twelve cards.
-- The existing ordered manual prefix, publication filtering through active cards,
-- relevance/price ordering, private helper grants and both public wrappers stay unchanged.
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
    limit 12
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
