-- Search relevance (final audit AUD-025, fix plan W2-6, DB part).
--
-- 1. Brand synonyms: shoppers type brands in Cyrillic («грундфос», «екософт», «баксі») and got
--    nothing. catalog_search_synonyms maps such words to the brand; the query is expanded ONCE per
--    search (not per row) and v4 matches the original query OR the expanded one, keeping the best
--    score. Synonyms point at the brand by stable_id, so the replacement follows a brand rename.
--    A last word of 5+ letters that is the start of exactly one synonym («грундф») is expanded too,
--    for the live dropdown.
-- 2. The «SKU starts with the query» bonus (18000) applies only when the query contains a digit.
--    BAXI SKUs are slugs («baxi-…»), so «baxi» ranked solar collectors above boilers.
--
-- Everything else is _catalog_search_v3 unchanged: a query without a synonym and without the SKU
-- prefix case returns the same products in the same order. v3 stays for comparison/rollback.

create table if not exists public.catalog_search_synonyms (
  term text primary key check (term = lower(btrim(term)) and char_length(term) between 2 and 60),
  brand_id text,
  replacement text check (replacement is null or replacement = lower(btrim(replacement))),
  created_at timestamptz not null default now(),
  check (num_nonnulls(brand_id, replacement) = 1)
);

alter table public.catalog_search_synonyms enable row level security;
revoke all on table public.catalog_search_synonyms from public, anon, authenticated;

-- Cyrillic and common misspellings of the brands seeded in 20260928000300_core_seed.sql.
-- Only brands that exist are linked (insert … select), so the seed is safe on any database.
insert into public.catalog_search_synonyms (term, brand_id)
select synonym.term, brand.stable_id
from (values
  ('альтеп', 'altep'),
  ('аквасистем', 'aquasystem'), ('аквасістем', 'aquasystem'),
  ('бакси', 'baxi'), ('баксі', 'baxi'), ('бакс', 'baxi'),
  ('біодом', 'biodom'), ('биодом', 'biodom'),
  ('бош', 'bosch'),
  ('будерус', 'buderus'),
  ('деві', 'devi'), ('деви', 'devi'),
  ('екософт', 'ecosoft'), ('экософт', 'ecosoft'), ('екософ', 'ecosoft'), ('eco soft', 'ecosoft'),
  ('фенікс', 'feniks'), ('феникс', 'feniks'),
  ('фокус', 'focus'),
  ('дженерал фітінгс', 'general-fittings'), ('дженерал фітингс', 'general-fittings'),
  ('дженерал фиттингс', 'general-fittings'), ('дженерал', 'general-fittings'),
  ('джакоміні', 'giacomini'), ('джакомини', 'giacomini'),
  ('горене', 'gorenje'), ('горенє', 'gorenje'), ('горенье', 'gorenje'),
  ('грундфос', 'grundfos'), ('грюндфос', 'grundfos'), ('грундфорс', 'grundfos'), ('grundfoss', 'grundfos'),
  ('крафтер', 'krafter'),
  ('кронас', 'kronas'),
  ('лафат', 'lafat'),
  ('маріо', 'mario'), ('марио', 'mario'),
  ('майконд', 'mycond'), ('міконд', 'mycond'), ('миконд', 'mycond'),
  ('протерм', 'protherm'), ('proterm', 'protherm'),
  ('рехау', 'rehau'),
  ('ріфенг', 'rifeng'), ('рифенг', 'rifeng'),
  ('руві', 'ruvi'), ('руви', 'ruvi'),
  ('салус', 'salus'),
  ('stalar', 'stalar'),
  ('татрамет', 'tatramet'),
  ('тех', 'tech'),
  ('текхаус', 'tekk'), ('текк хаус', 'tekk'), ('тек хаус', 'tekk'), ('текхауз', 'tekk'),
  ('tekkhaus', 'tekk'), ('tekhaus', 'tekk'), ('tek haus', 'tekk'),
  ('тенко', 'tenko'),
  ('термоджет', 'termojet'), ('термоджед', 'termojet'), ('термоджэт', 'termojet'),
  ('тесі', 'tesy'), ('теси', 'tesy'),
  ('валром', 'valrom'),
  ('віло', 'wilo'), ('вило', 'wilo'), ('вілло', 'wilo'),
  ('вестен', 'westen'),
  ('віссман', 'viessmann'), ('виссман', 'viessmann'), ('вісман', 'viessmann'), ('висман', 'viessmann'),
  ('viesman', 'viessmann'),
  ('сваг', 'swag')
) as synonym(term, brand_stable_id)
join public.brands brand on brand.stable_id = synonym.brand_stable_id
  -- a synonym equal to the brand's own name adds nothing
  and lower(brand.name) <> synonym.term
on conflict (term) do nothing;

-- The query rewritten with synonyms, or null when nothing applies. Runs once per search.
create or replace function public._catalog_search_expand(query_text text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  original text := btrim(regexp_replace(lower(coalesce(query_text, '')), '\s+', ' ', 'g'));
  padded text;
  last_word text;
  candidate text;
  entry record;
begin
  if char_length(original) < 2 or char_length(original) > 120 then return null; end if;
  padded := ' ' || original || ' ';

  -- Whole-word (and multi-word) synonyms, longest first.
  for entry in
    select synonym.term, coalesce(lower(brand.name), synonym.replacement) replacement
    from public.catalog_search_synonyms synonym
    left join public.brands brand on brand.stable_id = synonym.brand_id and brand.status = 'active'
    where strpos(padded, ' ' || synonym.term || ' ') > 0
      and coalesce(lower(brand.name), synonym.replacement) is not null
    order by char_length(synonym.term) desc, synonym.term
  loop
    padded := replace(padded, ' ' || entry.term || ' ', ' ' || entry.replacement || ' ');
  end loop;

  -- A half-typed last word that starts exactly one synonym (live dropdown: «грундф»).
  if padded = ' ' || original || ' ' then
    last_word := substring(original from '([^ ]+)$');
    if char_length(last_word) >= 5 then
      select min(coalesce(lower(brand.name), synonym.replacement)) into candidate
      from public.catalog_search_synonyms synonym
      left join public.brands brand on brand.stable_id = synonym.brand_id and brand.status = 'active'
      where synonym.term like replace(replace(last_word, '%', ''), '_', '') || '%'
        and position(' ' in synonym.term) = 0
        and char_length(last_word) * 10 >= char_length(synonym.term) * 6
        and coalesce(lower(brand.name), synonym.replacement) is not null
      having count(distinct coalesce(lower(brand.name), synonym.replacement)) = 1;
      if candidate is not null then
        padded := ' ' || left(original, char_length(original) - char_length(last_word)) || candidate || ' ';
      end if;
    end if;
  end if;

  padded := btrim(regexp_replace(padded, '\s+', ' ', 'g'));
  if padded = original then return null; end if;
  return padded;
end;
$$;

revoke all on function public._catalog_search_expand(text) from public, anon, authenticated;

create or replace function public._catalog_search_v4(
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
      public._catalog_search_expand(query_text) qx
  ), terms as materialized (
    -- The query as typed, plus its synonym expansion when there is one.
    select input.q, input.qn,
      translate(lower(regexp_replace(btrim(query_text), '\s+', '', 'g')), 'oо', '00') compact,
      input.q ~ '[0-9]' has_digit
    from input
    union all
    select input.qx, translate(input.qx, '''’ʼ`', ''),
      translate(replace(input.qx, ' ', ''), 'oо', '00'), input.qx ~ '[0-9]'
    from input where input.qx is not null
  ), fields as materialized (
    select card.legacy_id, card.sort_order, card.search_text, card.search_document,
      translate(lower(card.card ->> 'sku'), 'oо', '00') sku,
      lower(card.card ->> 'model') model,
      lower(card.card ->> 'title') title
    from active_release release
    join public.catalog_product_cards card on card.snapshot_version = release.snapshot_version
  ), direct_rows as (
    select fields.legacy_id, fields.sort_order,
      case
        when fields.sku = terms.compact then 100000
        when fields.model = terms.q then 90000
        when fields.title = terms.q then 85000
        when terms.has_digit and fields.sku like terms.compact || '%' then 18000
        when fields.title like terms.q || '%' then 8000
        when fields.model like terms.q || '%' then 7200
        when fields.search_document @@ plainto_tsquery('simple', terms.q) then 4200
        else 2600
      end as score
    from fields cross join terms
    where length(terms.q) >= 2 and (
      fields.sku = terms.compact
      or fields.model = terms.q
      or fields.title = terms.q
      or fields.sku like terms.compact || '%'
      or fields.title like terms.q || '%'
      or fields.search_document @@ plainto_tsquery('simple', terms.q)
      or fields.search_text ilike '%' || terms.q || '%'
      or (terms.qn <> terms.q and length(terms.qn) >= 2
        and translate(fields.search_text, '''’ʼ`', '') ilike '%' || terms.qn || '%')
    )
  ), direct as materialized (
    select legacy_id, sort_order, max(score) score from direct_rows group by legacy_id, sort_order
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
  ), brand_matches as (
    select brand, max(case when lower(brand ->> 'name') = terms.q then 10000
        when lower(brand ->> 'name') like terms.q || '%' then 4800 else 2600 end) score
    from active_release release cross join terms
    cross join lateral jsonb_array_elements(release.brands) brand
    where length(terms.q) >= 2 and concat_ws(' ', brand ->> 'name', brand ->> 'id') ilike '%' || terms.q || '%'
    group by brand
  ), brand_hits as (
    select brand_matches.brand, count(card.legacy_id)::integer count, brand_matches.score
    from brand_matches cross join active_release release
    left join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.brand_id = brand_matches.brand ->> 'id'
    group by brand_matches.brand, brand_matches.score
    order by score desc, count desc limit least(greatest(brand_limit, 1), 12)
  ), series_matches as (
    select series.stable_id, series.name, brand.name brand_name,
      max(case when lower(series.name) = terms.q then 10000 when lower(series.name) like terms.q || '%' then 4800 else 2600 end) score
    from terms
    join public.product_series series on series.status = 'active'
    join public.brands brand on brand.internal_id = series.brand_id
    where length(terms.q) >= 2 and concat_ws(' ', series.name, series.stable_id, brand.name) ilike '%' || terms.q || '%'
    group by series.stable_id, series.name, brand.name
  ), series_hits as (
    select jsonb_build_object('id', series_matches.stable_id, 'name', series_matches.name, 'label', series_matches.name,
        'brand', series_matches.brand_name) entity,
      count(card.legacy_id)::integer count, series_matches.score
    from series_matches cross join active_release release
    left join public.catalog_product_cards card
      on card.snapshot_version = release.snapshot_version and card.series_id = series_matches.stable_id
    group by series_matches.stable_id, series_matches.name, series_matches.brand_name, series_matches.score
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

revoke all on function public._catalog_search_v4(text, integer, integer, integer, integer) from public, anon, authenticated;

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
  from (select public._catalog_search_v4(query_text, product_limit, category_limit, brand_limit, series_limit) value) response
$$;

revoke all on function public.search_catalog(text, integer, integer, integer, integer) from public;
grant execute on function public.search_catalog(text, integer, integer, integer, integer) to anon, authenticated;
