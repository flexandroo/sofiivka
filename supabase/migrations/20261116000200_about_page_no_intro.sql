-- /about (owner's request): no intro under the headline and no «Хто ми» heading, so the showroom photo and the text
-- stand right under «Про компанію». The intro is cleared and the article loses its first block when that is the
-- «Хто ми» heading; any other article stays as it is. A re-run changes nothing.
update public.site_pages
set lead = '',
    body = case when body->0->>'type' = 'heading' and body->0->>'text' = 'Хто ми' then body - 0 else body end,
    updated_at = now()
where slug = 'about'
  and (lead <> '' or (body->0->>'type' = 'heading' and body->0->>'text' = 'Хто ми'));
