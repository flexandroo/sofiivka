-- /about builds «Чому з нами просто», «Бренди» and the shop block itself now (page-shell.js), so the article edited
-- in /admin/pages keeps only its first part, «Хто ми»: every block before the second heading. Edits made there
-- stay; a re-run changes nothing.
with about as (
  select body from public.site_pages where slug = 'about'
), cut as (
  select min(item.position) as at
  from about, jsonb_array_elements(about.body) with ordinality as item(block, position)
  where item.position > 1 and item.block->>'type' = 'heading'
), trimmed as (
  select coalesce(jsonb_agg(item.block order by item.position), '[]'::jsonb) as body
  from about, cut, jsonb_array_elements(about.body) with ordinality as item(block, position)
  where cut.at is null or item.position < cut.at
)
update public.site_pages page
set body = trimmed.body, updated_at = now()
from trimmed
where page.slug = 'about' and page.body is distinct from trimmed.body;
