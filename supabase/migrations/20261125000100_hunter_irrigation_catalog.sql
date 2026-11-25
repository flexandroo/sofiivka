-- Add the Hunter irrigation business section and its catalog registry entries.
-- Product rows remain managed by the deterministic catalog importer.

begin;

insert into public.brands (
  stable_id, slug, name, aliases, logo_url, description, country, visibility,
  featured, featured_order, seo_title, seo_description, status
) values (
  'hunter',
  'hunter',
  'Hunter',
  '{}'::text[],
  null,
  'Дощувачі, форсунки, контролери, датчики та компоненти професійних систем автоматичного поливу.',
  null,
  'catalog'::public.brand_visibility,
  true,
  11,
  'Hunter — товари та категорії | ТД «Софіївка»',
  'Дощувачі, форсунки, контролери, датчики та компоненти професійних систем автоматичного поливу.',
  'active'::public.record_status
)
on conflict (stable_id) do update set
  slug = excluded.slug,
  name = excluded.name,
  aliases = excluded.aliases,
  logo_url = excluded.logo_url,
  description = excluded.description,
  country = excluded.country,
  visibility = excluded.visibility,
  featured = excluded.featured,
  featured_order = excluded.featured_order,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  status = excluded.status;

insert into public.attribute_definitions (
  stable_id, label, value_type, unit, filterable, sortable, sort_order,
  aliases, normalization_config, status
) values (
  'radiusM',
  'Радіус поливу, м',
  'number'::public.attribute_value_type,
  'м',
  true,
  false,
  8.05,
  '[{"pattern":"^радіус(?: поливу)?$","flags":"i"},{"pattern":"^radius$","flags":"i"}]'::jsonb,
  '{"booleanValues":{"true":[],"false":[]},"legacyValues":{}}'::jsonb,
  'active'::public.record_status
)
on conflict (stable_id) do update set
  label = excluded.label,
  value_type = excluded.value_type,
  unit = excluded.unit,
  filterable = excluded.filterable,
  sortable = excluded.sortable,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases,
  normalization_config = excluded.normalization_config,
  status = excluded.status;

create temporary table _hunter_categories on commit drop as
select *
from jsonb_to_recordset($seed$[
  {
    "stable_id": "irrigation",
    "slug": "irrigation",
    "parent_stable_id": null,
    "level": 1,
    "title": "Полив і зрошення",
    "short_title": "Полив",
    "description": "Дощувачі, форсунки, контролери, датчики та компоненти автоматичного поливу для приватних, комерційних і спортивних об’єктів.",
    "menu_description": "Дощувачі, форсунки, автоматика та датчики",
    "sort_order": 25,
    "seo_title": "Полив і зрошення | ТД «Софіївка»",
    "seo_description": "Обладнання Hunter для автоматичного поливу: ротори, форсунки, контролери, датчики та пульти."
  },
  {
    "stable_id": "irrigation-sprinklers",
    "slug": "sprinklers",
    "parent_stable_id": "irrigation",
    "level": 2,
    "title": "Дощування",
    "short_title": "Дощування",
    "description": "Ротори, ротаційні та віялові форсунки, висувні корпуси й системи для спортивних полів.",
    "menu_description": "",
    "sort_order": 251,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-rotors",
    "slug": "rotors",
    "parent_stable_id": "irrigation-sprinklers",
    "level": 3,
    "title": "Роторні дощувачі",
    "short_title": "Ротори",
    "description": "Роторні дощувачі Hunter для газонів, великих ділянок і професійних об’єктів.",
    "menu_description": "",
    "sort_order": 2511,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-mp-nozzles",
    "slug": "mp-rotator",
    "parent_stable_id": "irrigation-sprinklers",
    "level": 3,
    "title": "Ротаційні форсунки MP Rotator",
    "short_title": "MP Rotator",
    "description": "Водозберігальні багатоструменеві форсунки для точного поливу ділянок різної геометрії.",
    "menu_description": "",
    "sort_order": 2512,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-spray-nozzles",
    "slug": "spray-nozzles",
    "parent_stable_id": "irrigation-sprinklers",
    "level": 3,
    "title": "Віялові форсунки",
    "short_title": "Форсунки",
    "description": "Регульовані, фіксовані, смугові й мікроспрей-форсунки Hunter.",
    "menu_description": "",
    "sort_order": 2513,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-spray-bodies",
    "slug": "spray-bodies",
    "parent_stable_id": "irrigation-sprinklers",
    "level": 3,
    "title": "Висувні корпуси дощувачів",
    "short_title": "Корпуси",
    "description": "Підземні висувні корпуси для встановлення форсунок у системах автоматичного поливу.",
    "menu_description": "",
    "sort_order": 2514,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-sports",
    "slug": "sports-fields",
    "parent_stable_id": "irrigation-sprinklers",
    "level": 3,
    "title": "Полив спортивних полів",
    "short_title": "Спортивні поля",
    "description": "Професійні дощувачі та вузли Hunter ST System для стадіонів і великих майданчиків.",
    "menu_description": "",
    "sort_order": 2515,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-control",
    "slug": "control",
    "parent_stable_id": "irrigation",
    "level": 2,
    "title": "Керування поливом",
    "short_title": "Керування",
    "description": "Контролери, датчики, пульти та компоненти автоматизації систем поливу.",
    "menu_description": "",
    "sort_order": 252,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-controllers",
    "slug": "controllers",
    "parent_stable_id": "irrigation-control",
    "level": 3,
    "title": "Контролери поливу",
    "short_title": "Контролери",
    "description": "Контролери Hunter для побутових, комерційних і професійних систем поливу.",
    "menu_description": "",
    "sort_order": 2521,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-sensors",
    "slug": "sensors",
    "parent_stable_id": "irrigation-control",
    "level": 3,
    "title": "Датчики поливу",
    "short_title": "Датчики",
    "description": "Датчики дощу, вологості, витрати, вітру й температури для автоматичного коригування поливу.",
    "menu_description": "",
    "sort_order": 2522,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-remotes",
    "slug": "remotes",
    "parent_stable_id": "irrigation-control",
    "level": 3,
    "title": "Пульти дистанційного керування",
    "short_title": "Пульти",
    "description": "Пульти Hunter для дистанційного запуску та сервісної перевірки зон поливу.",
    "menu_description": "",
    "sort_order": 2523,
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "irrigation-control-accessories",
    "slug": "components",
    "parent_stable_id": "irrigation-control",
    "level": 3,
    "title": "Компоненти автоматики",
    "short_title": "Компоненти",
    "description": "Декодери, реле, бездротові модулі та сервісні компоненти керування поливом.",
    "menu_description": "",
    "sort_order": 2524,
    "seo_title": null,
    "seo_description": null
  }
]$seed$::jsonb) as seed(
  stable_id text,
  slug text,
  parent_stable_id text,
  level smallint,
  title text,
  short_title text,
  description text,
  menu_description text,
  sort_order integer,
  seo_title text,
  seo_description text
);

do $seed_categories$
declare
  current_level smallint;
begin
  for current_level in 1..3 loop
    insert into public.categories (
      stable_id, slug, parent_id, level, title, short_title, description,
      menu_description, sort_order, status, visibility, seo_title, seo_description
    )
    select
      seed.stable_id,
      seed.slug,
      parent.internal_id,
      seed.level,
      seed.title,
      seed.short_title,
      seed.description,
      seed.menu_description,
      seed.sort_order,
      'active'::public.category_status,
      'catalog'::public.category_visibility,
      seed.seo_title,
      seed.seo_description
    from _hunter_categories seed
    left join public.categories parent on parent.stable_id = seed.parent_stable_id
    where seed.level = current_level
    on conflict (stable_id) do update set
      slug = excluded.slug,
      parent_id = excluded.parent_id,
      level = excluded.level,
      title = excluded.title,
      short_title = excluded.short_title,
      description = excluded.description,
      menu_description = excluded.menu_description,
      sort_order = excluded.sort_order,
      status = excluded.status,
      visibility = excluded.visibility,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description;
  end loop;
end
$seed_categories$;

insert into public.category_attributes (
  category_id, attribute_id, facet_enabled, required, sort_order, display_group
)
select
  category.internal_id,
  attribute.internal_id,
  true,
  false,
  array_position(array[
    'productType', 'type', 'radiusM', 'flowM3h', 'pressureBar', 'connection',
    'control', 'communication', 'zones', 'voltage', 'protectionClass'
  ]::text[], attribute.stable_id) - 1,
  null
from public.categories category
cross join public.attribute_definitions attribute
where category.stable_id in (select stable_id from _hunter_categories)
  and attribute.stable_id = any(array[
    'productType', 'type', 'radiusM', 'flowM3h', 'pressureBar', 'connection',
    'control', 'communication', 'zones', 'voltage', 'protectionClass'
  ]::text[])
on conflict (category_id, attribute_id) do update set
  facet_enabled = excluded.facet_enabled,
  required = excluded.required,
  sort_order = excluded.sort_order,
  display_group = excluded.display_group;

commit;
