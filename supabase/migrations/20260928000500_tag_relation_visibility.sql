-- Prevent public product/tag joins from revealing supplier tags that are still under review.

begin;

drop policy if exists product_tags_public_read on public.product_tags;

create policy product_tags_public_read on public.product_tags
for select using (
  public.is_public_product(product_id)
  and exists (
    select 1 from public.tags tag
    where tag.internal_id = product_tags.tag_id
      and tag.status = 'active'
  )
);

commit;
