-- «Про нас» (final audit AUD-039, AUD-017): the text saved in /admin/pages promised «Гарантія на всі товари»,
-- which /warranty contradicts (terms depend on the manufacturer and the model), and spelled the store address
-- differently from /contact. Only these two list items are replaced, and only while they still read exactly
-- as before, so any other edit made in /admin/pages stays as it is. Re-running it changes nothing.
update public.site_pages
set body = (
  select jsonb_agg(case when block ->> 'type' = 'list' then jsonb_set(block, '{items}', coalesce((
      select jsonb_agg(case item #>> '{}'
          when 'Гарантія на всі товари, гарантійне й післягарантійне обслуговування.'
            then to_jsonb('Гарантія виробника, допомога з гарантійним зверненням, гарантійне й післягарантійне обслуговування.'::text)
          when 'Київська обл., с. Софіївська Борщагівка, вул. Київська, 3. Пн–Пт 9:00–18:00, Сб 9:00–14:00.'
            then to_jsonb('с. Софіївська Борщагівка, вул. Київська, 3. Пн–Пт 9:00–18:00, Сб 9:00–14:00.'::text)
          else item end order by item_position)
      from jsonb_array_elements(block -> 'items') with ordinality as list_item(item, item_position)
    ), '[]'::jsonb)) else block end order by position)
  from jsonb_array_elements(body) with ordinality as page_block(block, position)
),
updated_at = now()
where slug = 'about'
  and jsonb_typeof(body) = 'array'
  and exists (
    select 1 from jsonb_array_elements(body) as page_block(block)
    where block ->> 'type' = 'list'
      and jsonb_typeof(block -> 'items') = 'array'
      and (block -> 'items' ? 'Гарантія на всі товари, гарантійне й післягарантійне обслуговування.'
        or block -> 'items' ? 'Київська обл., с. Софіївська Борщагівка, вул. Київська, 3. Пн–Пт 9:00–18:00, Сб 9:00–14:00.')
  );
