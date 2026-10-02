-- Blog and cases v1: articles («Корисно знати», /blog) and completed projects («Інженерні задачі»,
-- /portfolio) in one table, edited in /admin/blog and read by site-posts.js through the public RPCs
-- get_site_posts / get_site_post. blog.html and portfolio.html keep their built-in cards as first
-- paint and fallback; the seed below is exactly those cards (with full texts), so nothing disappears.
--
-- Body format: a JSON array of blocks, never HTML:
--   {"type": "heading", "text": "…"} | {"type": "paragraph", "text": "…"}
--   | {"type": "list", "ordered": false, "items": ["…", "…"]}
--   | {"type": "image", "url": "https://…", "alt": "…", "caption": "…"}
--   | {"type": "quote", "text": "…", "author": "…"}
-- Text may contain links written as [label](url) with the same rule as the information pages
-- (https://, site path, mailto:, tel:). Image addresses: https:// or a site path (/…, assets/…).
-- The storefront escapes everything and builds links and images itself.
--
-- A post is visible on the site when status = 'published' and published_at <= now(); a future
-- published_at schedules it.
--
-- Statements the Supabase MCP connector cannot run (apply through the SQL Editor instead):
--   admin_delete_site_post contains `delete from public.site_posts`.
-- No triggers are created or dropped here; taxonomy_admin_audit is not touched (own audit table).
-- Depends on public._settings_text (20261002000300), public._taxonomy_slugify (20261002000200),
-- public._banner_url (20261002000900), public._site_pages_text / _site_pages_check_links (20261002001400).

create table public.site_posts (
  internal_id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('article', 'case')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check (char_length(title) between 1 and 200),
  excerpt text not null default '',
  category text not null default '',
  tags text[] not null default '{}',
  cover_url text not null default '',
  cover_alt text not null default '',
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  case_object text not null default '',
  case_location text not null default '',
  case_year smallint check (case_year is null or case_year between 1990 and 2100),
  case_equipment text[] not null default '{}',
  case_photos jsonb not null default '[]'::jsonb check (jsonb_typeof(case_photos) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  seo_title text not null default '',
  seo_description text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (kind, slug)
);
create index site_posts_public_idx on public.site_posts (kind, published_at desc) where status = 'published';
alter table public.site_posts enable row level security;
revoke all on table public.site_posts from public, anon, authenticated;

create table public.site_posts_audit (
  internal_id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  kind text not null check (kind in ('article', 'case')),
  title text not null default '',
  action text not null check (action in ('create', 'update', 'delete')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);
create index site_posts_audit_post_idx on public.site_posts_audit (post_id, created_at desc);
alter table public.site_posts_audit enable row level security;
revoke all on table public.site_posts_audit from public, anon, authenticated;

-- Seed: the cards blog.html and portfolio.html render today (tests/db-local/blog-scenarios.mjs
-- checks title, label, excerpt and image against page-shell.js), with their full texts.
insert into public.site_posts (kind, slug, title, excerpt, category, tags, cover_url, cover_alt, body, status, published_at, seo_title, seo_description) values
('article', 'pidbir-tsyrkuliatsiinoho-nasosa', 'Що підготувати для підбору циркуляційного насоса',
  'Робоча точка, монтажна довжина та режим керування.', 'Підбір', '{Підбір}', '/assets/images/product-pump.webp', '',
  $json$[
    {"type":"paragraph","text":"Циркуляційний насос підбирають під конкретну систему, а не за потужністю котла чи діаметром труби. Для змістовної консультації достатньо кількох параметрів."},
    {"type":"heading","text":"Що потрібно знати"},
    {"type":"list","ordered":false,"items":["Тип системи: опалення, тепла підлога, гаряче водопостачання або контур котла.","Робочу точку: потрібну витрату й напір.","Монтажну довжину та діаметр приєднання.","Тип теплоносія: вода чи незамерзаюча рідина.","Бажаний режим керування: постійна швидкість, автоматична адаптація або зовнішній сигнал."]},
    {"type":"heading","text":"Якщо насос замінюється"},
    {"type":"paragraph","text":"Сфотографуйте шильдик старого насоса й місце монтажу. Це допоможе перевірити аналог за розмірами, приєднанням і характеристиками без переробки трубопроводу."},
    {"type":"paragraph","text":"Надішліть ці дані [через сторінку контактів](/contact.html) — ми звіримо параметри з документацією конкретних моделей."}
  ]$json$::jsonb,
  'published', '2026-09-30 10:00:00+03', '', ''),
('article', 'potuzhnist-kotla-lyshe-pochatok', 'Чому потужність котла — лише початок',
  'Димохід, гідравліка, гаряча вода й автоматика.', 'Опалення', '{Опалення}', '/assets/images/hero-heating.webp', '',
  $json$[
    {"type":"paragraph","text":"Потужність — перший фільтр у виборі котла, але не останній. Два котли однакової потужності можуть по-різному підійти до одного будинку."},
    {"type":"heading","text":"Що ще впливає на вибір"},
    {"type":"list","ordered":false,"items":["Тепловтрати будинку й кількість зон опалення.","Потреба в гарячій воді: кількість точок і одночасне користування.","Тип димоходу або можливість коаксіального виведення.","Гідравліка системи: насоси, гідрострілка, бойлер непрямого нагріву.","Електроживлення та автоматика, з якою працюватиме котел.","Умови сервісу й доступ для обслуговування."]},
    {"type":"heading","text":"Чому важливий розрахунок"},
    {"type":"paragraph","text":"Завелика потужність не робить систему надійнішою: котел частіше вмикається й вимикається, а комплект дорожчає. Якщо тепловтрати невідомі, почніть із розрахунку або огляду об'єкта."}
  ]$json$::jsonb,
  'published', '2026-09-29 10:00:00+03', '', ''),
('article', 'yak-pryiniaty-tekhnichne-obladnannia', 'Як прийняти технічне обладнання',
  'Упаковка, модель, комплектність і фіксація пошкоджень.', 'Доставка', '{Доставка}', '/assets/images/article-technician.webp', '',
  $json$[
    {"type":"paragraph","text":"Пошкодження під час перевезення простіше підтвердити, якщо його зафіксовано до завершення отримання. Кілька хвилин перевірки заощаджують тижні листування."},
    {"type":"heading","text":"Що перевірити при отриманні"},
    {"type":"list","ordered":false,"items":["Кількість місць, цілісність упаковки й відсутність слідів удару або намокання.","Назву та модель на коробці, якщо вона доступна без пошкодження упаковки.","Комплектність за супровідними документами."]},
    {"type":"heading","text":"Якщо є пошкодження"},
    {"type":"paragraph","text":"Зафіксуйте пошкодження до завершення отримання та оформіть документи за процедурою перевізника. Сфотографуйте упаковку, маркування й місце пошкодження, а потім повідомте нам номер замовлення."},
    {"type":"paragraph","text":"Строки й способи отримання описані на сторінці [Доставка](/delivery.html)."}
  ]$json$::jsonb,
  'published', '2026-09-28 10:00:00+03', '', ''),
('article', 'dani-dlia-systemy-zi-sverdlovyny', 'Які дані потрібні для системи зі свердловини',
  'Дебіт, рівні води, витрата, тиск і якість води.', 'Вода', '{Вода}', '/assets/images/hero-water.webp', '',
  $json$[
    {"type":"paragraph","text":"Насос і автоматику для свердловини підбирають за даними самої свердловини та потребами будинку. Без них можна лише орієнтовно назвати клас обладнання."},
    {"type":"heading","text":"Дані про свердловину"},
    {"type":"list","ordered":false,"items":["Глибина свердловини та діаметр обсадної труби.","Статичний і динамічний рівень води.","Дебіт: скільки води свердловина віддає без падіння рівня.","Відстань від свердловини до будинку та перепад висот."]},
    {"type":"heading","text":"Дані про споживання"},
    {"type":"list","ordered":false,"items":["Кількість точок водорозбору, що працюють одночасно.","Потрібний тиск у системі.","Полив, басейн або інші періодичні споживачі."]},
    {"type":"heading","text":"Якість води"},
    {"type":"paragraph","text":"Для підбору водоочищення потрібен аналіз води: залізо, марганець, жорсткість і механічні домішки впливають і на фільтри, і на ресурс обладнання."}
  ]$json$::jsonb,
  'published', '2026-09-27 10:00:00+03', '', ''),
('article', 'de-zakinchuietsia-onlain-pidbir-kondytsionera', 'Де закінчується онлайн-підбір кондиціонера',
  'Теплоприпливи, траса, дренаж і місця блоків.', 'Клімат', '{Клімат}', '/assets/images/hero-climate.webp', '',
  $json$[
    {"type":"paragraph","text":"Каталог допомагає зорієнтуватися в класах і функціях кондиціонерів, але остаточний вибір залежить від приміщення та умов монтажу."},
    {"type":"heading","text":"Що визначається лише на об'єкті"},
    {"type":"list","ordered":false,"items":["Теплоприпливи: площа скління, сторона світу, кількість людей і техніки.","Довжина й маршрут траси між блоками.","Відведення дренажу.","Місця для внутрішнього й зовнішнього блоків з доступом для обслуговування.","Електроживлення та окрема лінія."]},
    {"type":"paragraph","text":"Надішліть план приміщення й фото місць монтажу — так ми підготуємо попередній підбір і перелік монтажних матеріалів."}
  ]$json$::jsonb,
  'published', '2026-09-26 10:00:00+03', '', ''),
('article', 'shcho-sfotohrafuvaty-pered-zvernenniam', 'Що сфотографувати перед зверненням',
  'Шильдик, підключення, індикацію та умови появи помилки.', 'Сервіс', '{Сервіс}', '/assets/images/showroom.webp', '',
  $json$[
    {"type":"paragraph","text":"Правильні фото пришвидшують діагностику: часто за ними вдається визначити наступний крок ще до виїзду фахівця."},
    {"type":"heading","text":"Що сфотографувати"},
    {"type":"list","ordered":true,"items":["Шильдик із моделлю та серійним номером.","Загальне підключення без демонтажу корпусу.","Код помилки або індикацію на дисплеї."]},
    {"type":"heading","text":"Що описати"},
    {"type":"paragraph","text":"Коли й за яких умов виникає проблема, що змінювалося перед цим і чи є документ про покупку та запуск, якщо звернення гарантійне."},
    {"type":"paragraph","text":"Не порушуйте пломби й не змінюйте налаштування без фіксації. Детальніше — на сторінці [Сервісний центр](/service-center.html)."}
  ]$json$::jsonb,
  'published', '2026-09-25 10:00:00+03', '', ''),
('case', 'kotelnia-pryvatnoho-budynku', 'Котельня приватного будинку',
  'Тепловтрати, гаряча вода, зони опалення, автоматика, склад обладнання та межі монтажних робіт розглядаються як одна система.',
  'Комплексна задача', '{Опалення}', '/assets/images/solution-boiler-room.webp', 'Обладнання котельні',
  $json$[
    {"type":"paragraph","text":"Тепловтрати, гаряча вода, зони опалення, автоматика, склад обладнання та межі монтажних робіт розглядаються як одна система."},
    {"type":"heading","text":"Вихідні дані"},
    {"type":"paragraph","text":"Тип об'єкта, режими роботи, наявні мережі та технічні обмеження."},
    {"type":"heading","text":"Специфікація"},
    {"type":"paragraph","text":"Основне обладнання, автоматика, арматура й монтажні компоненти."},
    {"type":"heading","text":"Реалізація"},
    {"type":"paragraph","text":"Поставка, монтаж, запуск і розподіл відповідальності між учасниками."},
    {"type":"heading","text":"Супровід"},
    {"type":"paragraph","text":"Документація, планове обслуговування та зрозумілий сервісний маршрут."},
    {"type":"paragraph","text":"Детальніше про підхід — на сторінці [Комплексні рішення](/solutions.html)."}
  ]$json$::jsonb,
  'published', '2026-09-30 10:00:00+03', '', '');
update public.site_posts set case_object = 'Приватний будинок' where kind = 'case' and slug = 'kotelnia-pryvatnoho-budynku';

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create or replace function public._site_posts_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Редагувати блог і кейси можуть власник, адміністратор і контент-менеджер.';
  end if;
end;
$$;

-- A list of short labels (tags, equipment): trimmed, whitespace collapsed, empty and repeated
-- (case-insensitive) entries dropped.
create or replace function public._site_posts_text_list(raw jsonb, label text, max_items integer, max_length integer)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text[] := '{}';
  item jsonb;
  cleaned text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return result; end if;
  if jsonb_typeof(raw) <> 'array' then
    raise exception using errcode = '22023', message = format('%s: очікується список.', label);
  end if;
  for item in select value from jsonb_array_elements(raw) loop
    cleaned := public._site_pages_text(item, label, max_length);
    if cleaned <> '' and not exists (select 1 from unnest(result) existing where lower(existing) = lower(cleaned)) then
      result := result || cleaned;
    end if;
  end loop;
  if cardinality(result) > max_items then
    raise exception using errcode = '22023', message = format('%s: не більше %s значень.', label, max_items);
  end if;
  return result;
end;
$$;

-- Validates the block list of a post body and returns it with only the known keys.
create or replace function public._site_posts_clean_body(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  block jsonb;
  block_index integer := 0;
  block_type text;
  label text;
  items jsonb;
  item jsonb;
  cleaned text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return result; end if;
  if jsonb_typeof(raw) <> 'array' then
    raise exception using errcode = '22023', message = 'Текст матеріалу: очікується список блоків.';
  end if;
  if jsonb_array_length(raw) > 120 then
    raise exception using errcode = '22023', message = 'Текст матеріалу: не більше 120 блоків.';
  end if;
  for block in select value from jsonb_array_elements(raw) loop
    block_index := block_index + 1;
    if jsonb_typeof(block) <> 'object' then
      raise exception using errcode = '22023', message = format('Блок %s: некоректні дані.', block_index);
    end if;
    block_type := block ->> 'type';
    if block_type = 'heading' then
      label := format('Блок %s (підзаголовок)', block_index);
      result := result || jsonb_build_array(jsonb_build_object('type', 'heading',
        'text', public._site_pages_text(block -> 'text', label, 200, true)));
    elsif block_type = 'paragraph' then
      label := format('Блок %s (абзац)', block_index);
      cleaned := public._site_pages_check_links(public._site_pages_text(block -> 'text', label, 4000, true), label);
      result := result || jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', cleaned));
    elsif block_type = 'list' then
      label := format('Блок %s (список)', block_index);
      if jsonb_typeof(block -> 'items') is distinct from 'array' then
        raise exception using errcode = '22023', message = format('%s: очікується перелік пунктів.', label);
      end if;
      if block ? 'ordered' and jsonb_typeof(block -> 'ordered') not in ('boolean', 'null') then
        raise exception using errcode = '22023', message = format('%s: «нумерований» має бути так або ні.', label);
      end if;
      items := '[]'::jsonb;
      for item in select value from jsonb_array_elements(block -> 'items') loop
        cleaned := public._site_pages_check_links(public._site_pages_text(item, label, 1000, false), label);
        if cleaned <> '' then items := items || to_jsonb(cleaned); end if;
      end loop;
      if jsonb_array_length(items) = 0 then
        raise exception using errcode = '22023', message = format('%s: додайте хоча б один пункт.', label);
      end if;
      if jsonb_array_length(items) > 40 then
        raise exception using errcode = '22023', message = format('%s: не більше 40 пунктів.', label);
      end if;
      result := result || jsonb_build_array(jsonb_build_object('type', 'list',
        'ordered', coalesce((block ->> 'ordered')::boolean, false), 'items', items));
    elsif block_type = 'image' then
      label := format('Блок %s (зображення)', block_index);
      result := result || jsonb_build_array(jsonb_build_object('type', 'image',
        'url', public._banner_url(block -> 'url', label, true),
        'alt', public._site_pages_text(block -> 'alt', label || ': опис', 200),
        'caption', public._site_pages_text(block -> 'caption', label || ': підпис', 300)));
    elsif block_type = 'quote' then
      label := format('Блок %s (цитата)', block_index);
      result := result || jsonb_build_array(jsonb_build_object('type', 'quote',
        'text', public._site_pages_text(block -> 'text', label, 1000, true),
        'author', public._site_pages_text(block -> 'author', label || ': автор', 120)));
    else
      raise exception using errcode = '22023', message = format('Блок %s: невідомий тип блоку.', block_index);
    end if;
  end loop;
  return result;
end;
$$;

-- Photos of a case: [{url, alt}], up to 24.
create or replace function public._site_posts_clean_photos(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  entry record;
  label text;
begin
  if raw is null or jsonb_typeof(raw) = 'null' then return result; end if;
  if jsonb_typeof(raw) <> 'array' then
    raise exception using errcode = '22023', message = 'Фото об''єкта: очікується список.';
  end if;
  if jsonb_array_length(raw) > 24 then
    raise exception using errcode = '22023', message = 'Фото об''єкта: не більше 24.';
  end if;
  for entry in select value, ordinality from jsonb_array_elements(raw) with ordinality loop
    label := format('Фото %s', entry.ordinality);
    if jsonb_typeof(entry.value) <> 'object' then
      raise exception using errcode = '22023', message = format('%s: некоректні дані.', label);
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'url', public._banner_url(entry.value -> 'url', label, true),
      'alt', public._site_pages_text(entry.value -> 'alt', label || ': опис', 200)));
  end loop;
  return result;
end;
$$;

create or replace function public._site_posts_time(raw jsonb, label text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if raw is null or jsonb_typeof(raw) = 'null' or btrim(raw #>> '{}') = '' then return null; end if;
  if jsonb_typeof(raw) <> 'string' then
    raise exception using errcode = '22023', message = format('Некоректна дата «%s».', label);
  end if;
  begin
    return (raw #>> '{}')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = format('Некоректна дата «%s».', label);
  end;
end;
$$;

-- Applies the keys present in the payload to a post (keys left out keep their value) and checks
-- the result as a whole. Case-only fields are cleared on articles. kind never changes here.
create or replace function public._site_posts_apply(target public.site_posts, payload jsonb)
returns public.site_posts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  year_raw jsonb;
  slug_value text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані матеріалу.';
  end if;
  if payload ? 'title' then target.title := public._site_pages_text(payload -> 'title', 'Заголовок', 200, true); end if;
  if payload ? 'slug' then
    slug_value := lower(public._site_pages_text(payload -> 'slug', 'Адреса', 120));
    if slug_value = '' then slug_value := coalesce(public._taxonomy_slugify(target.title), ''); end if;
    if slug_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception using errcode = '22023', message = 'Адреса: лише латиниця, цифри й дефіси, наприклад pidbir-nasosa.';
    end if;
    target.slug := slug_value;
  end if;
  if payload ? 'excerpt' then target.excerpt := public._site_pages_text(payload -> 'excerpt', 'Короткий опис', 400); end if;
  if payload ? 'category' then target.category := public._site_pages_text(payload -> 'category', 'Рубрика', 60); end if;
  if payload ? 'tags' then target.tags := public._site_posts_text_list(payload -> 'tags', 'Теги', 12, 40); end if;
  if payload ? 'coverUrl' then target.cover_url := public._banner_url(payload -> 'coverUrl', 'Обкладинка'); end if;
  if payload ? 'coverAlt' then target.cover_alt := public._site_pages_text(payload -> 'coverAlt', 'Опис обкладинки', 200); end if;
  if payload ? 'body' then target.body := public._site_posts_clean_body(payload -> 'body'); end if;
  if payload ? 'seoTitle' then target.seo_title := public._site_pages_text(payload -> 'seoTitle', 'SEO-заголовок', 160); end if;
  if payload ? 'seoDescription' then target.seo_description := public._site_pages_text(payload -> 'seoDescription', 'SEO-опис', 320); end if;
  if payload ? 'caseObject' then target.case_object := public._site_pages_text(payload -> 'caseObject', 'Об''єкт', 160); end if;
  if payload ? 'caseLocation' then target.case_location := public._site_pages_text(payload -> 'caseLocation', 'Місце', 120); end if;
  if payload ? 'caseYear' then
    year_raw := payload -> 'caseYear';
    if year_raw is null or jsonb_typeof(year_raw) = 'null' or btrim(year_raw #>> '{}') = '' then
      target.case_year := null;
    elsif (year_raw #>> '{}') ~ '^\d{4}$' and (year_raw #>> '{}')::integer between 1990 and 2100 then
      target.case_year := (year_raw #>> '{}')::smallint;
    else
      raise exception using errcode = '22023', message = 'Рік: чотири цифри, від 1990 до 2100.';
    end if;
  end if;
  if payload ? 'equipment' then target.case_equipment := public._site_posts_text_list(payload -> 'equipment', 'Обладнання', 30, 160); end if;
  if payload ? 'photos' then target.case_photos := public._site_posts_clean_photos(payload -> 'photos'); end if;
  if payload ? 'publishedAt' then target.published_at := public._site_posts_time(payload -> 'publishedAt', 'Дата публікації'); end if;
  if payload ? 'status' then
    if coalesce(payload ->> 'status', '') not in ('draft', 'published') then
      raise exception using errcode = '22023', message = 'Статус: чернетка або опубліковано.';
    end if;
    target.status := payload ->> 'status';
  end if;

  if target.kind = 'article' then
    target.case_object := '';
    target.case_location := '';
    target.case_year := null;
    target.case_equipment := '{}';
    target.case_photos := '[]'::jsonb;
  end if;
  if target.status = 'published' then
    if jsonb_array_length(target.body) = 0 then
      raise exception using errcode = '22023', message = 'Щоб опублікувати, додайте текст матеріалу.';
    end if;
    target.published_at := coalesce(target.published_at, now());
  end if;
  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- JSON shapes
-- ---------------------------------------------------------------------------

create or replace function public._site_post_card_json(target public.site_posts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', target.kind,
    'slug', target.slug,
    'title', target.title,
    'excerpt', target.excerpt,
    'category', target.category,
    'tags', to_jsonb(target.tags),
    'cover', jsonb_build_object('url', target.cover_url, 'alt', target.cover_alt),
    'publishedAt', target.published_at,
    'case', case when target.kind = 'case' then jsonb_build_object(
      'object', target.case_object, 'location', target.case_location, 'year', target.case_year) end
  )
$$;

create or replace function public._site_post_public_json(target public.site_posts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public._site_post_card_json(target) || jsonb_build_object(
    'body', target.body,
    'case', case when target.kind = 'case' then jsonb_build_object(
      'object', target.case_object, 'location', target.case_location, 'year', target.case_year,
      'equipment', to_jsonb(target.case_equipment), 'photos', target.case_photos) end,
    'seo', jsonb_build_object('title', target.seo_title, 'description', target.seo_description),
    'updatedAt', target.updated_at
  )
$$;

create or replace function public._site_post_state(target public.site_posts)
returns text
language sql
stable
set search_path = ''
as $$
  select case when target.status = 'draft' then 'draft'
    when target.published_at > now() then 'scheduled'
    else 'published' end
$$;

create or replace function public._site_post_admin_json(target public.site_posts)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._site_post_public_json(target) || jsonb_build_object(
    'id', target.internal_id,
    'status', target.status,
    'state', public._site_post_state(target),
    'blockCount', jsonb_array_length(target.body),
    'createdAt', target.created_at,
    'updatedBy', (select profile.name from public.admin_profiles profile where profile.user_id = target.updated_by)
  )
$$;

create or replace function public._site_posts_audit_json(target_post uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'createdAt', entry.created_at,
    'action', entry.action,
    'actor', coalesce(profile.name, 'Невідомий працівник'),
    'fields', (select coalesce(jsonb_agg(field order by field), '[]'::jsonb) from jsonb_object_keys(entry.changes) field)
  ) order by entry.created_at desc), '[]'::jsonb)
  from (
    select * from public.site_posts_audit audit
    where audit.post_id = target_post
    order by audit.created_at desc
    limit 20
  ) entry
  left join public.admin_profiles profile on profile.user_id = entry.actor_id
$$;

-- Tags and categories already in use, for the editor's suggestions.
create or replace function public._site_posts_vocabulary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tags', coalesce((select jsonb_agg(distinct tag order by tag) from public.site_posts post, unnest(post.tags) tag), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(distinct post.category order by post.category) from public.site_posts post where post.category <> ''), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Public reads (storefront)
-- ---------------------------------------------------------------------------

-- One page of published posts of a kind, newest first, optionally of one tag (case-insensitive).
-- Null for an unknown kind. tags lists every tag of the visible posts of that kind with counts.
create or replace function public.get_site_posts(post_kind text, page_number integer default 1, filter_tag text default null, page_size integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  size integer := least(48, greatest(1, coalesce(page_size, 12)));
  page integer := least(1000, greatest(1, coalesce(page_number, 1)));
  tag_value text := nullif(btrim(coalesce(filter_tag, '')), '');
  total integer;
begin
  if post_kind is null or post_kind not in ('article', 'case') then return null; end if;
  select count(*) into total
  from public.site_posts post
  where post.kind = post_kind and post.status = 'published' and post.published_at <= now()
    and (tag_value is null or exists (select 1 from unnest(post.tags) tag where lower(tag) = lower(tag_value)));
  return jsonb_build_object(
    'kind', post_kind,
    'page', page,
    'pageSize', size,
    'total', total,
    'hasMore', page * size < total,
    'tag', tag_value,
    'posts', coalesce((
      select jsonb_agg(public._site_post_card_json(post) order by post.published_at desc, post.title)
      from (
        select * from public.site_posts post
        where post.kind = post_kind and post.status = 'published' and post.published_at <= now()
          and (tag_value is null or exists (select 1 from unnest(post.tags) tag where lower(tag) = lower(tag_value)))
        order by post.published_at desc, post.title
        offset (page - 1) * size
        limit size
      ) post
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('name', counted.tag, 'count', counted.uses) order by counted.uses desc, counted.tag)
      from (
        select min(tag) as tag, count(*)::integer as uses
        from public.site_posts post, unnest(post.tags) tag
        where post.kind = post_kind and post.status = 'published' and post.published_at <= now()
        group by lower(tag)
      ) counted
    ), '[]'::jsonb)
  );
end;
$$;

-- One published post with its body, plus up to three other recent posts of the same kind.
-- Null when the post is unknown, a draft or scheduled for later.
create or replace function public.get_site_post(post_kind text, post_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._site_post_public_json(post) || jsonb_build_object('more', coalesce((
    select jsonb_agg(public._site_post_card_json(other) order by other.published_at desc, other.title)
    from (
      select * from public.site_posts other
      where other.kind = post.kind and other.internal_id <> post.internal_id
        and other.status = 'published' and other.published_at <= now()
      order by other.published_at desc, other.title
      limit 3
    ) other
  ), '[]'::jsonb))
  from public.site_posts post
  where post.kind = post_kind and post.slug = lower(post_slug)
    and post.status = 'published' and post.published_at <= now()
$$;

-- ---------------------------------------------------------------------------
-- Staff reads
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_site_posts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  return jsonb_build_object(
    'canEdit', public.can_manage_content(),
    'posts', coalesce((
      select jsonb_agg(public._site_post_admin_json(post) - 'body' - 'seo' - 'case'
        order by post.kind, (post.status = 'draft') desc, post.published_at desc nulls first, post.updated_at desc)
      from public.site_posts post
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_site_post(post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.site_posts%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.site_posts post where post.internal_id = post_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'canEdit', public.can_manage_content(),
    'post', public._site_post_admin_json(target),
    'history', public._site_posts_audit_json(target.internal_id),
    'vocabulary', public._site_posts_vocabulary()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff writes
-- ---------------------------------------------------------------------------

-- Creates a post (a draft unless the payload says otherwise). Without a slug one is made from
-- the title, with -2, -3… when that address is taken; an explicit slug must be free.
create or replace function public.admin_create_site_post(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.site_posts%rowtype;
  base_slug text;
  suffix integer := 1;
begin
  perform public._site_posts_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані матеріалу.';
  end if;
  if coalesce(payload ->> 'kind', '') not in ('article', 'case') then
    raise exception using errcode = '22023', message = 'Оберіть тип: стаття або кейс.';
  end if;
  target.kind := payload ->> 'kind';
  target.status := 'draft';
  target.body := '[]'::jsonb;
  target.tags := '{}';
  target.case_equipment := '{}';
  target.case_photos := '[]'::jsonb;
  target.excerpt := ''; target.category := ''; target.cover_url := ''; target.cover_alt := '';
  target.case_object := ''; target.case_location := ''; target.seo_title := ''; target.seo_description := '';
  target.title := public._site_pages_text(payload -> 'title', 'Заголовок', 200, true);
  target := public._site_posts_apply(target, payload - 'kind' || jsonb_build_object('slug', coalesce(payload -> 'slug', '""'::jsonb)));
  if target.slug is null or target.slug = '' then
    raise exception using errcode = '22023', message = 'Адреса: вкажіть латиницею, наприклад pidbir-nasosa.';
  end if;

  if coalesce(btrim(payload ->> 'slug'), '') = '' then
    base_slug := left(target.slug, 110);
    while exists (select 1 from public.site_posts post where post.kind = target.kind and post.slug = target.slug) loop
      suffix := suffix + 1;
      target.slug := format('%s-%s', base_slug, suffix);
    end loop;
  elsif exists (select 1 from public.site_posts post where post.kind = target.kind and post.slug = target.slug) then
    raise exception using errcode = '23505', message = format('Адреса «%s» вже зайнята іншим матеріалом.', target.slug);
  end if;

  insert into public.site_posts (kind, slug, title, excerpt, category, tags, cover_url, cover_alt, body,
    case_object, case_location, case_year, case_equipment, case_photos, status, published_at,
    seo_title, seo_description, created_by, updated_by)
  values (target.kind, target.slug, target.title, target.excerpt, target.category, target.tags, target.cover_url, target.cover_alt, target.body,
    target.case_object, target.case_location, target.case_year, target.case_equipment, target.case_photos, target.status, target.published_at,
    target.seo_title, target.seo_description, auth.uid(), auth.uid())
  returning * into target;
  insert into public.site_posts_audit (post_id, kind, title, action, actor_id, changes)
  values (target.internal_id, target.kind, target.title, 'create', auth.uid(),
    jsonb_build_object('title', jsonb_build_object('from', null, 'to', target.title), 'status', jsonb_build_object('from', null, 'to', target.status)));
  return public.admin_get_site_post(target.internal_id);
end;
$$;

-- Saves the editable fields of one post. Keys left out of the payload keep their value.
create or replace function public.admin_update_site_post(post_id uuid, payload jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.site_posts%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
begin
  perform public._site_posts_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані матеріалу.';
  end if;
  select * into target from public.site_posts post where post.internal_id = post_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Матеріал не знайдено: його вже видалили. Оновіть сторінку.'; end if;
  if expected_updated_at is null or target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Матеріал уже змінив інший працівник. Оновіть сторінку.';
  end if;
  if payload ? 'kind' and payload ->> 'kind' is distinct from target.kind then
    raise exception using errcode = '22023', message = 'Тип матеріалу змінити не можна. Створіть новий матеріал.';
  end if;
  before_row := to_jsonb(target);
  target := public._site_posts_apply(target, payload - 'kind');
  if target.slug <> before_row ->> 'slug'
     and exists (select 1 from public.site_posts post where post.kind = target.kind and post.slug = target.slug and post.internal_id <> target.internal_id) then
    raise exception using errcode = '23505', message = format('Адреса «%s» вже зайнята іншим матеріалом.', target.slug);
  end if;
  after_row := to_jsonb(target);

  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['title', 'slug', 'excerpt', 'category', 'tags', 'cover_url', 'cover_alt', 'body', 'case_object', 'case_location',
    'case_year', 'case_equipment', 'case_photos', 'status', 'published_at', 'seo_title', 'seo_description']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    update public.site_posts set
      title = target.title, slug = target.slug, excerpt = target.excerpt, category = target.category, tags = target.tags,
      cover_url = target.cover_url, cover_alt = target.cover_alt, body = target.body,
      case_object = target.case_object, case_location = target.case_location, case_year = target.case_year,
      case_equipment = target.case_equipment, case_photos = target.case_photos,
      status = target.status, published_at = target.published_at,
      seo_title = target.seo_title, seo_description = target.seo_description,
      updated_at = clock_timestamp(), updated_by = auth.uid()
    where internal_id = target.internal_id;
    insert into public.site_posts_audit (post_id, kind, title, action, actor_id, changes)
    values (target.internal_id, target.kind, target.title, 'update', auth.uid(), changes);
  end if;
  return public.admin_get_site_post(target.internal_id);
end;
$$;

create or replace function public.admin_delete_site_post(post_id uuid, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.site_posts%rowtype;
begin
  perform public._site_posts_require_editor();
  select * into target from public.site_posts post where post.internal_id = post_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Матеріал не знайдено: його вже видалили. Оновіть сторінку.'; end if;
  if expected_updated_at is null or target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Матеріал уже змінив інший працівник. Оновіть сторінку.';
  end if;
  delete from public.site_posts where internal_id = target.internal_id;
  insert into public.site_posts_audit (post_id, kind, title, action, actor_id, changes)
  values (target.internal_id, target.kind, target.title, 'delete', auth.uid(),
    jsonb_build_object('title', jsonb_build_object('from', target.title, 'to', null), 'slug', target.slug, 'status', target.status));
  return jsonb_build_object('deleted', target.internal_id, 'kind', target.kind);
end;
$$;

revoke all on function public._site_posts_require_editor() from public, anon, authenticated;
revoke all on function public._site_posts_text_list(jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function public._site_posts_clean_body(jsonb) from public, anon, authenticated;
revoke all on function public._site_posts_clean_photos(jsonb) from public, anon, authenticated;
revoke all on function public._site_posts_time(jsonb, text) from public, anon, authenticated;
revoke all on function public._site_posts_apply(public.site_posts, jsonb) from public, anon, authenticated;
revoke all on function public._site_post_card_json(public.site_posts) from public, anon, authenticated;
revoke all on function public._site_post_public_json(public.site_posts) from public, anon, authenticated;
revoke all on function public._site_post_state(public.site_posts) from public, anon, authenticated;
revoke all on function public._site_post_admin_json(public.site_posts) from public, anon, authenticated;
revoke all on function public._site_posts_audit_json(uuid) from public, anon, authenticated;
revoke all on function public._site_posts_vocabulary() from public, anon, authenticated;

revoke all on function public.get_site_posts(text, integer, text, integer) from public;
revoke all on function public.get_site_post(text, text) from public;
grant execute on function public.get_site_posts(text, integer, text, integer) to anon, authenticated;
grant execute on function public.get_site_post(text, text) to anon, authenticated;

revoke all on function public.admin_list_site_posts() from public, anon;
revoke all on function public.admin_get_site_post(uuid) from public, anon;
revoke all on function public.admin_create_site_post(jsonb) from public, anon;
revoke all on function public.admin_update_site_post(uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_delete_site_post(uuid, timestamptz) from public, anon;
grant execute on function public.admin_list_site_posts() to authenticated;
grant execute on function public.admin_get_site_post(uuid) to authenticated;
grant execute on function public.admin_create_site_post(jsonb) to authenticated;
grant execute on function public.admin_update_site_post(uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_delete_site_post(uuid, timestamptz) to authenticated;
