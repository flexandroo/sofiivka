-- Product addresses by slug: /product/<slug> instead of /product?id=<legacy id>.
-- 1. _catalog_slugify: Ukrainian title → Latin slug (KMU 2010 transliteration, ASCII only, at most 80 characters).
-- 2. get_catalog_product_by_slug: the storefront product page resolves the slug in the published release.
-- 3. Every product slug is rebuilt from its title; duplicates get the SKU appended. Run _admin_refresh_catalog
--    for all products afterwards so the published cards carry the new slugs.
begin;

-- translate() maps by position; «ь» and «ъ» sit past the end of the target list, so they are dropped.
create or replace function public._catalog_slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(slug, ''), 'product')
  from (
    select case
      when length(raw) <= 80 then raw
      else regexp_replace(left(raw, 81), '-[^-]*$', '')
    end slug
    from (
      select trim(both '-' from regexp_replace(
        translate(
          replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
          regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
            regexp_replace(replace(replace(replace(lower(replace(replace(replace(coalesce(value, ''), '’', ''), '''', ''), 'ʼ', '')),
              '½', ' 1-2'), '¾', ' 3-4'), '¼', ' 1-4'), '([0-9 ])кг', '\1kg', 'g'),
            '(^|[^а-яіїєґ])є', '\1ye', 'g'), '(^|[^а-яіїєґ])ї', '\1yi', 'g'), '(^|[^а-яіїєґ])й', '\1y', 'g'),
            '(^|[^а-яіїєґ])ю', '\1yu', 'g'), '(^|[^а-яіїєґ])я', '\1ya', 'g'),
          'зг', 'zgh'), 'ж', 'zh'), 'х', 'kh'), 'ц', 'ts'), 'ч', 'ch'), 'щ', 'shch'), 'ш', 'sh'), 'є', 'ie'), 'ю', 'iu'), 'я', 'ia'),
          'абвгґдезиіїйклмнопрстуфыэёäöüéèàçñьъ', 'abvhgdezyiiiklmnoprstufyeeaoueeacn'),
        '[^a-z0-9]+', '-', 'g')) raw
    ) source
  ) cut
$$;

revoke all on function public._catalog_slugify(text) from public, anon, authenticated;

create or replace function public.get_catalog_product_by_slug(product_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select public.get_catalog_product(card.legacy_id)
  from public.catalog_snapshot_pointer pointer
  join public.catalog_snapshot_releases release
    on release.snapshot_version = pointer.snapshot_version and release.ready
  join public.catalog_product_cards card
    on card.snapshot_version = release.snapshot_version
   and card.card ->> 'slug' = lower(btrim(product_slug))
  where pointer.singleton
  limit 1
$$;

revoke all on function public.get_catalog_product_by_slug(text) from public;
grant execute on function public.get_catalog_product_by_slug(text) to anon, authenticated;

-- Rebuild every slug from the title. Products whose titles give the same slug get their SKU appended.
with base as (
  select internal_id, public._catalog_slugify(title) slug, public._catalog_slugify(coalesce(nullif(sku, ''), legacy_id)) sku_slug
  from public.products
), ranked as (
  select internal_id, case when count(*) over (partition by slug) > 1 then slug || '-' || sku_slug else slug end slug
  from base
)
update public.products product set slug = ranked.slug
from ranked
where product.internal_id = ranked.internal_id and product.slug is distinct from ranked.slug;

-- Menus and the cookie banner link to clean addresses (/delivery) instead of /delivery.html, which only redirects.
update public.site_settings
set value = regexp_replace(value::text, '"(/[a-z-]+)\.html"', '"\1"', 'g')::jsonb, updated_at = now()
where key in ('menus', 'cookies') and value::text ~ '"/[a-z-]+\.html"';

commit;
