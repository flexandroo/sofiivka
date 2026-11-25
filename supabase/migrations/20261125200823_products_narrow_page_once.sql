-- Filter and sort narrow rows; fetch card JSON only after selecting the requested page.
-- Keep filter semantics, retail/source ordering, the public contract, ACLs and the 8s timeout.
CREATE OR REPLACE FUNCTION public._catalog_products_v2(scope_category text DEFAULT NULL::text, scope_brand text DEFAULT NULL::text, category_ids text[] DEFAULT NULL::text[], brand_ids text[] DEFAULT NULL::text[], availability_ids text[] DEFAULT NULL::text[], technical_filters jsonb DEFAULT '{}'::jsonb, minimum_price numeric DEFAULT NULL::numeric, maximum_price numeric DEFAULT NULL::numeric, sort_mode text DEFAULT 'default'::text, page_number integer DEFAULT 1, page_size integer DEFAULT 24, product_ids text[] DEFAULT NULL::text[], query_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
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
  ), selected_filters as materialized (
    select filter.key, array(select jsonb_array_elements_text(filter.value)) selected_values
    from jsonb_each(coalesce(technical_filters, '{}'::jsonb)) filter
    where jsonb_typeof(filter.value) = 'array' and jsonb_array_length(filter.value) > 0
  ), filtered as materialized (
    select card.snapshot_version, card.legacy_id, card.sort_order, card.price_status, card.amount, card.inventory_status
    from active_release release
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
    where (scope_category is null or scope_category in ('', 'all') or card.category_id in (select stable_id from descendants))
      and (scope_brand is null or scope_brand = '' or card.brand_id = scope_brand)
      and (coalesce(cardinality(product_ids), 0) = 0 or card.legacy_id = any(product_ids))
      and (coalesce(cardinality(category_ids), 0) = 0 or card.category_id = any(category_ids))
      and (coalesce(cardinality(brand_ids), 0) = 0 or card.brand_id = any(brand_ids))
      and (coalesce(cardinality(availability_ids), 0) = 0 or card.inventory_status::text = any(availability_ids))
      and ((minimum_price is null and maximum_price is null)
        or (card.price_status = 'known' and card.amount is not null
          and (minimum_price is null or card.amount >= minimum_price)
          and (maximum_price is null or card.amount <= maximum_price)))
      and (coalesce(btrim(query_text), '') = '' or card.search_text ilike '%' || btrim(query_text) || '%')
      and not exists (
        select 1 from selected_filters
        where not coalesce(public._catalog_filter_value(card.normalized_attributes, selected_filters.key)
          = any(selected_filters.selected_values), false)
      )
  ), numbered as (
    select filtered.snapshot_version, filtered.legacy_id, row_number() over (order by
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
    'products', coalesce((select jsonb_agg(card.card order by page.ordinal)
      from page join public.catalog_product_cards card
        on card.snapshot_version = page.snapshot_version and card.legacy_id = page.legacy_id), '[]'::jsonb)
  )
  from active_release release
$function$;

-- Evaluate the expensive core once before overwriting its public revision.
CREATE OR REPLACE FUNCTION public.get_catalog_products(scope_category text DEFAULT NULL::text, scope_brand text DEFAULT NULL::text, category_ids text[] DEFAULT NULL::text[], brand_ids text[] DEFAULT NULL::text[], availability_ids text[] DEFAULT NULL::text[], technical_filters jsonb DEFAULT '{}'::jsonb, minimum_price numeric DEFAULT NULL::numeric, maximum_price numeric DEFAULT NULL::numeric, sort_mode text DEFAULT 'default'::text, page_number integer DEFAULT 1, page_size integer DEFAULT 24, product_ids text[] DEFAULT NULL::text[], query_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
  with response as materialized (
    select public._catalog_products_v2(scope_category, scope_brand, category_ids, brand_ids, availability_ids,
      technical_filters, minimum_price, maximum_price, sort_mode, page_number, page_size, product_ids, query_text) value
  )
  select case when value is null then null
    else jsonb_set(value, '{version}', to_jsonb(public._admin_catalog_version())) end
  from response
$function$;

-- CREATE OR REPLACE retains the existing private-helper and public-RPC grants.
