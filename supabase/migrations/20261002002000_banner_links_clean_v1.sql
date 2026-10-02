-- Homepage banners link to clean addresses: /search?q=… instead of /search.html?q=…, /catalog/climate
-- instead of /climate.html, and a product's /product/<slug> instead of /product.html?id=<legacy id>
-- (left as /product?id=… when the product is not published, so the link still resolves).
begin;

update public.homepage_banners banner
set link_url = case
    when banner.link_url ~ '^/product\.html\?id=' then coalesce(
      (select '/product/' || product.slug from public.products product
       where product.legacy_id = substring(banner.link_url from '^/product\.html\?id=([^&#]+)') and product.publication_status = 'published'),
      regexp_replace(banner.link_url, '^/product\.html', '/product'))
    when banner.link_url ~ '^/(climate|heating|water-supply)\.html([?#]|$)' then regexp_replace(banner.link_url, '^/([a-z-]+)\.html', '/catalog/\1')
    when banner.link_url ~ '^/plumbing\.html([?#]|$)' then regexp_replace(banner.link_url, '^/plumbing\.html', '/catalog')
    when banner.link_url ~ '^/index\.html([?#]|$)' then regexp_replace(banner.link_url, '^/index\.html', '/')
    else regexp_replace(banner.link_url, '^(/[a-z-]+)\.html', '\1')
  end,
  updated_at = clock_timestamp()
where banner.link_url ~ '^/[a-z-]+\.html([?#]|$)';

commit;
