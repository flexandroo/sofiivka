insert into public.catalog_search_synonyms (term, replacement)
values
  ('альфа', 'alpha'), ('альфа1', 'alpha1'), ('альфа2', 'alpha2'),
  ('сололіфт', 'sololift'), ('сололифт', 'sololift'), ('соло ліфт', 'sololift'), ('соло лифт', 'sololift'),
  ('юніліфт', 'unilift'), ('юнилифт', 'unilift'), ('юні ліфт', 'unilift'), ('юни лифт', 'unilift'),
  ('скала1', 'scala1'), ('скала2', 'scala2'),
  ('стратос', 'stratos'), ('йонос', 'yonos'), ('ёнос', 'yonos'), ('єнос', 'yonos'),
  ('атмос', 'atmos'), ('піко', 'pico'), ('пико', 'pico'), ('актун', 'actun'),
  ('кросс', 'cross'), ('абсолют', 'absolute'), ('аквакальцій', 'aquacalcium'), ('аквакальций', 'aquacalcium'),
  ('сінум', 'sinum'), ('синум', 'sinum'), ('логамакс', 'logamax'), ('луна', 'luna'), ('астра', 'astra')
on conflict (term) do nothing;;
