-- Search: Cyrillic spellings of model series (audit 2026-11-07).
--
-- «грундфос альфа» found nothing: the brand was expanded («grundfos альфа»), but the series is
-- written in Latin in every title (ALPHA1, ALPHA2). catalog_search_synonyms already supports a
-- plain word replacement (column `replacement`), so this only adds rows; _catalog_search_expand
-- and _catalog_search_v4 are unchanged. v4 matches the query as typed OR the expanded one, so a
-- replacement never removes results the original query had.
--
-- Only series that appear in product titles, and only spellings that are not everyday words.

insert into public.catalog_search_synonyms (term, replacement)
values
  -- Grundfos
  ('альфа', 'alpha'), ('альфа1', 'alpha1'), ('альфа2', 'alpha2'),
  ('сололіфт', 'sololift'), ('сололифт', 'sololift'), ('соло ліфт', 'sololift'), ('соло лифт', 'sololift'),
  ('юніліфт', 'unilift'), ('юнилифт', 'unilift'), ('юні ліфт', 'unilift'), ('юни лифт', 'unilift'),
  ('скала1', 'scala1'), ('скала2', 'scala2'),
  -- Wilo
  ('стратос', 'stratos'), ('йонос', 'yonos'), ('ёнос', 'yonos'), ('єнос', 'yonos'),
  ('атмос', 'atmos'), ('піко', 'pico'), ('пико', 'pico'), ('актун', 'actun'),
  -- Ecosoft
  ('кросс', 'cross'), ('абсолют', 'absolute'), ('аквакальцій', 'aquacalcium'), ('аквакальций', 'aquacalcium'),
  -- TECH, Buderus, BAXI
  ('сінум', 'sinum'), ('синум', 'sinum'), ('логамакс', 'logamax'), ('луна', 'luna'), ('астра', 'astra')
on conflict (term) do nothing;
