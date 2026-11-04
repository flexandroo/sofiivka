-- Default catalogue order for retail buyers: products with a price and in stock, then the rest with a price, then
-- products on request. Within each group the existing order stays. Price sorting and lists asked for by product id
-- (cart, compare, collections) are not affected.
create or replace function public._catalog_products_v2(
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
      case when sort_mode not in ('price-asc', 'price-desc') and coalesce(cardinality(product_ids), 0) = 0 then
        case
          when filtered.price_status = 'known' and filtered.amount is not null and filtered.inventory_status = 'in_stock' then 0
          when filtered.price_status = 'known' and filtered.amount is not null then 1
          else 2
        end
      end asc,
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
