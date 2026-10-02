-- Site pages v1: texts of the information pages (about, services, delivery, payment, warranty,
-- returns, legal pages…) and the FAQ, edited in /admin/pages and read by page-shell.js through the
-- public RPCs get_site_page / get_site_faq. The storefront keeps its built-in texts as first paint
-- and fallback; the seed below is exactly those texts, so applying this changes nothing visible.
--
-- Body format: a JSON array of blocks, never HTML:
--   {"type": "heading", "text": "…"} | {"type": "paragraph", "text": "…"}
--   | {"type": "list", "ordered": false, "items": ["…", "…"]}
-- Text may contain links written as [label](url); url must start with https://, /, mailto: or tel:.
-- The storefront escapes everything and builds the links itself.
-- Pages whose content is page layout (cards, grids, forms) have has_body = false: only the first
-- screen (kicker, title, lead) and SEO fields are editable there.
--
-- Statements the Supabase MCP connector cannot run (apply through the SQL Editor instead):
--   admin_save_site_faq contains `delete from public.site_faq_items`.
-- No triggers are created or dropped here.
-- Depends on public._settings_text (20261002000300_site_settings_v1).

create table public.site_pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nav_title text not null,
  sort_order integer not null default 0,
  has_body boolean not null default true,
  kicker text not null default '',
  title text not null,
  lead text not null default '',
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  seo_title text not null default '',
  seo_description text not null default '',
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_pages enable row level security;
revoke all on table public.site_pages from public, anon, authenticated;

create table public.site_faq_items (
  internal_id uuid primary key default gen_random_uuid(),
  group_title text not null,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index site_faq_items_order_idx on public.site_faq_items (sort_order);
alter table public.site_faq_items enable row level security;
revoke all on table public.site_faq_items from public, anon, authenticated;

-- One version stamp for the whole FAQ list (optimistic lock of admin_save_site_faq).
create table public.site_faq_state (
  singleton boolean primary key default true check (singleton),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_faq_state enable row level security;
revoke all on table public.site_faq_state from public, anon, authenticated;
insert into public.site_faq_state (singleton) values (true);

create table public.site_pages_audit (
  internal_id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('page', 'faq')),
  entity_key text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);
create index site_pages_audit_entity_idx on public.site_pages_audit (entity, entity_key, created_at desc);
alter table public.site_pages_audit enable row level security;
revoke all on table public.site_pages_audit from public, anon, authenticated;

-- Seed: the texts page-shell.js renders today (tests/db-local/pages-scenarios.mjs checks they match).
insert into public.site_pages (slug, nav_title, sort_order, has_body, kicker, title, lead, body, seo_title, seo_description) values
('about', 'Про компанію', 10, true, 'Про компанію', 'Технічний магазин із відповідальністю за контекст',
  'Ми продаємо обладнання для опалення, водопостачання, сантехніки та клімату й допомагаємо перевірити, як окремі компоненти працюватимуть разом.',
  $json$[
    {"type":"heading","text":"Чим займається «Софіївка»"},
    {"type":"paragraph","text":"Ми комплектуємо приватні будинки, квартири, комерційні приміщення та об'єкти монтажних організацій. У каталозі поєднуємо основне обладнання, автоматику, запірну арматуру, трубопровідні системи та витратні матеріали."},
    {"type":"paragraph","text":"Наше завдання — зробити шлях від запиту до запуску зрозумілим. Якщо для рішення потрібен теплотехнічний розрахунок, аналіз води або огляд місця монтажу, ми не підміняємо це онлайн-обіцянкою."},
    {"type":"heading","text":"Як ми працюємо з інформацією"},
    {"type":"list","ordered":false,"items":["Характеристики товарів звіряються з документами конкретної моделі.","Ціна й наявність підтверджуються перед оплатою.","Аналоги пропонуються лише після порівняння технічних параметрів.","Обсяг монтажу та сервісу погоджується до початку робіт."]},
    {"type":"heading","text":"Для приватних і професійних клієнтів"},
    {"type":"paragraph","text":"Приватним покупцям допомагаємо сформувати комплект і зрозуміти, що потрібно підготувати до монтажу. Монтажникам, проєктантам та бізнесу пропонуємо роботу зі специфікаціями, кодами, рахунками й поетапними поставками."}
  ]$json$::jsonb,
  'Про компанію | ТД «Софіївка»', 'Підхід ТД Софіївка до професійного підбору, комплектації та підтримки інженерних систем.'),
('services', 'Послуги', 20, false, 'Послуги', 'Один маршрут від підбору до сервісу',
  'Консультація, комплектація, монтаж, запуск і подальша підтримка працюють у спільному контексті.',
  '[]'::jsonb,
  'Монтаж і сервіс | ТД «Софіївка»', 'Підбір, доставка, монтаж, запуск і сервіс інженерного обладнання.'),
('installation', 'Монтаж', 30, false, 'Монтаж', 'Від огляду до контрольованого запуску',
  'Обсяг робіт визначається після вихідних даних або огляду. Обладнання, монтажні матеріали й відповідальність сторін фіксуються до початку.',
  '[]'::jsonb,
  'Монтаж обладнання | ТД «Софіївка»', 'Оцінка об''єкта, монтаж систем опалення, водопостачання та клімату, запуск і передача робіт.'),
('service-center', 'Сервісний центр', 40, true, 'Сервісний центр', 'Діагностика починається з правильної інформації',
  'Підготуйте модель, серійний номер, умови монтажу й точний опис симптомів — так простіше визначити наступний крок.',
  $json$[
    {"type":"heading","text":"Що надіслати"},
    {"type":"list","ordered":true,"items":["Фото шильдика й серійного номера.","Фото загального підключення без демонтажу корпусу.","Код помилки або точний опис індикації.","Коли й за яких умов виникає проблема.","Документ про покупку та запуск, якщо звернення гарантійне."]},
    {"type":"heading","text":"Чого не робити до консультації"},
    {"type":"paragraph","text":"Не порушуйте пломби, не змінюйте налаштування без фіксації та не демонтуйте обладнання, якщо це може ускладнити діагностику або гарантійний розгляд."}
  ]$json$::jsonb,
  'Сервісний центр | ТД «Софіївка»', 'Діагностика, гарантійні звернення та планове обслуговування технічного обладнання.'),
('solutions', 'Комплексні рішення', 50, false, 'Комплексні рішення', 'Система важливіша за окрему коробку',
  'Ми розглядаємо джерело, розподіл, автоматику, безпеку та монтажні матеріали як один комплект.',
  '[]'::jsonb,
  'Готові рішення | ТД «Софіївка»', 'Комплектація систем опалення, водопостачання та клімату як узгодженого інженерного рішення.'),
('partnership', 'Для професіоналів', 60, true, 'Для професіоналів', 'Закупівлі й комплектація за специфікацією',
  'Монтажникам, проєктантам і бізнесу — робота за кодами, перевірка аналогів, документи та узгоджені поставки.',
  $json$[
    {"type":"heading","text":"Що надіслати для першого прорахунку"},
    {"type":"list","ordered":false,"items":["Назву або внутрішнє позначення об'єкта.","Коди, моделі, кількість і допустимі аналоги.","Бажаний строк та адресу або спосіб отримання.","Реквізити для рахунку після технічного погодження."]},
    {"type":"heading","text":"Як працюємо з аналогами"},
    {"type":"paragraph","text":"Альтернатива не повинна змінювати проєкт непомітно. Ми позначаємо відмінності у приєднаннях, потужності, керуванні, монтажних розмірах та гарантійному маршруті."},
    {"type":"heading","text":"Комерційні умови"},
    {"type":"paragraph","text":"Ціна залежить від бренду, обсягу, регулярності, способу оплати та логістики. Конкретні умови фіксуються у пропозиції, а не декларуються універсально на сторінці."}
  ]$json$::jsonb,
  'Для партнерів | ТД «Софіївка»', 'Комплектація об''єктів, специфікації та документи для монтажників, проєктантів і бізнесу.'),
('buyers', 'Покупцям', 70, false, 'Покупцям', 'Усе важливе до замовлення',
  'Умови отримання, оплати, гарантії та повернення зібрані в одному розділі.',
  '[]'::jsonb,
  'Покупцям | ТД «Софіївка»', 'Доставка, оплата, гарантія, повернення та відповіді на часті запитання покупців ТД Софіївка.'),
('delivery', 'Доставка', 80, true, 'Покупцям', 'Доставка замовлень',
  'Спосіб, строк і вартість отримання залежать від складу відвантаження, габаритів, ваги та адреси.',
  $json$[
    {"type":"heading","text":"Як формується строк"},
    {"type":"list","ordered":true,"items":["Перевіряємо фактичний склад відвантаження кожної позиції.","Уточнюємо, чи можна відправити комплект одним місцем або однією партією.","Звіряємо обмеження перевізника для довгомірних, важких і крихких товарів.","Підтверджуємо орієнтовну дату відправлення та спосіб отримання."]},
    {"type":"heading","text":"Що перевірити при отриманні"},
    {"type":"list","ordered":false,"items":["Кількість місць, цілісність упаковки й відсутність слідів удару або намокання.","Назву та модель на коробці, якщо вона доступна без пошкодження упаковки.","Комплектність за супровідними документами.","Пошкодження потрібно зафіксувати до завершення отримання за правилами перевізника."]},
    {"type":"heading","text":"Великогабаритні товари"},
    {"type":"paragraph","text":"Радіатори, баки, котли, довгомірні труби та інше об'ємне обладнання можуть потребувати окремого тарифу, дерев'яного каркаса або адресної доставки. Такі умови погоджуємо до оплати."}
  ]$json$::jsonb,
  'Доставка | ТД «Софіївка»', 'Способи отримання, підтвердження строків і перевірка технічного обладнання при доставці.'),
('payment', 'Оплата', 90, true, 'Покупцям', 'Оплата без неузгоджених переказів',
  'Оплачуйте замовлення лише після підтвердження моделі, ціни, комплектності, способу доставки та актуальних реквізитів.',
  $json$[
    {"type":"heading","text":"Безпечний порядок оплати"},
    {"type":"list","ordered":true,"items":["Менеджер перевіряє артикул, ціну, залишок і комплектність.","Ви отримуєте підсумок замовлення та погоджений спосіб доставки.","Для безготівкової оплати надсилається рахунок з актуальними реквізитами.","Після зарахування коштів замовлення переходить до комплектування або відправлення."]},
    {"type":"heading","text":"Для підприємств і монтажних організацій"},
    {"type":"paragraph","text":"Документи формуються за підтвердженими реквізитами та номенклатурою. Якщо об'єкт постачається частинами, порядок рахунків і відвантажень узгоджується до першої оплати."},
    {"type":"heading","text":"Поточний порядок оформлення"},
    {"type":"paragraph","text":"Онлайн-еквайринг і автоматичне створення замовлення на сайті наразі недоступні. Менеджер погоджує спосіб оплати та надає актуальні реквізити після перевірки товарів. Не здійснюйте переказ до отримання підтвердження."}
  ]$json$::jsonb,
  'Оплата | ТД «Софіївка»', 'Порядок підтвердження замовлення, безготівкова оплата, оплата при отриманні та документи для бізнесу.'),
('warranty', 'Гарантія', 100, true, 'Після покупки', 'Гарантія та сервісний маршрут',
  'Умови гарантії залежать від виробника, моделі, правильності монтажу та документів, що супроводжують конкретний товар.',
  $json$[
    {"type":"heading","text":"Що підготувати"},
    {"type":"list","ordered":false,"items":["Фото шильдика з моделлю та серійним номером.","Документ про покупку й гарантійний документ, якщо він передбачений.","Фото загального підключення та повідомлення на дисплеї.","Короткий опис: коли з'явився симптом і за яких умов."]},
    {"type":"heading","text":"Монтаж і гарантія"},
    {"type":"paragraph","text":"Для частини технічно складного обладнання виробник може встановлювати вимоги до монтажу, першого запуску та обслуговування. Їх потрібно звірити з інструкцією та гарантійними умовами конкретної моделі до встановлення."},
    {"type":"heading","text":"Планове обслуговування"},
    {"type":"paragraph","text":"Гарантія не замінює регламентне обслуговування. Фільтри, теплообмінники, рухомі вузли та системи відведення продуктів згоряння перевіряються за документацією виробника й умовами експлуатації."}
  ]$json$::jsonb,
  'Гарантія та сервіс | ТД «Софіївка»', 'Порядок гарантійного та сервісного звернення щодо інженерного обладнання.'),
('returns', 'Обмін і повернення', 110, true, 'Після покупки', 'Обмін і повернення',
  'Порядок дій залежить від стану товару, його категорії, комплектності, документів і характеру звернення.',
  $json$[
    {"type":"heading","text":"Строк для обміну товару належної якості"},
    {"type":"paragraph","text":"Закон України «Про захист прав споживачів» передбачає право на обмін непродовольчого товару належної якості протягом 14 днів, не рахуючи дня купівлі, якщо продавець не оголосив триваліший строк і виконані встановлені законом умови."},
    {"type":"paragraph","text":"Окремі товари та товари, виготовлені, нарізані або розкроєні під визначений покупцем розмір, можуть належати до переліку винятків. Перед прийманням рішення потрібно перевірити актуальну категорію конкретного товару."},
    {"type":"heading","text":"Як подати звернення"},
    {"type":"list","ordered":true,"items":["Повідомте номер документа про покупку та код товару.","Опишіть причину звернення й стан упаковки.","Додайте фото товару, комплекту, пломб і маркування.","Дочекайтеся погодження способу та адреси передачі товару."]},
    {"type":"heading","text":"Офіційні джерела"},
    {"type":"list","ordered":false,"items":["[Закон України «Про захист прав споживачів»](https://zakon.rada.gov.ua/go/1023-12).","[Актуальний перелік товарів, що не підлягають обміну або поверненню](https://zakon.rada.gov.ua/laws/show/1243-2024-%D0%BF)."]}
  ]$json$::jsonb,
  'Обмін і повернення | ТД «Софіївка»', 'Практичний порядок звернення для обміну або повернення технічного обладнання.'),
('faq', 'Часті запитання', 120, false, 'Допомога', 'Часті запитання',
  'Відповіді про підбір, замовлення, доставку, монтаж і сервіс.',
  '[]'::jsonb,
  'Часті запитання | ТД «Софіївка»', 'Відповіді про підбір, сумісність, доставку, монтаж, гарантію та партнерські закупівлі.'),
('privacy', 'Політика конфіденційності', 130, true, 'Правова інформація', 'Політика конфіденційності',
  'Базова редакція для структури сайту. Перед комерційним запуском текст має пройти юридичну перевірку та отримати підтверджені реквізити.',
  $json$[
    {"type":"heading","text":"Які дані можуть оброблятися"},
    {"type":"paragraph","text":"Контактні дані, зміст звернення, склад замовлення, адреса доставки, технічна інформація про пристрій та службові дані, необхідні для безпеки й роботи сайту."},
    {"type":"heading","text":"Для чого використовуються дані"},
    {"type":"list","ordered":false,"items":["Опрацювання замовлень і консультацій.","Організація доставки, оплати, гарантії та сервісу.","Виконання законних обов'язків і захист від зловживань.","Аналітика роботи сайту — лише після належного налаштування згоди."]},
    {"type":"heading","text":"Передача третім сторонам"},
    {"type":"paragraph","text":"Дані можуть передаватися перевізникам, платіжним і сервісним партнерам лише в обсязі, потрібному для відповідної послуги та за наявності правової підстави."},
    {"type":"heading","text":"Ваші права"},
    {"type":"paragraph","text":"Ви можете звернутися щодо доступу, уточнення або видалення даних у межах, дозволених законодавством та обов'язками продавця."}
  ]$json$::jsonb,
  'Політика конфіденційності | ТД «Софіївка»', 'Базова інформація про обробку персональних даних на сайті ТД Софіївка.'),
('terms', 'Умови користування', 140, true, 'Правова інформація', 'Умови користування',
  'Базова редакція для структури сайту. Перед комерційним запуском текст має пройти юридичну перевірку та отримати підтверджені реквізити.',
  $json$[
    {"type":"heading","text":"Призначення сайту"},
    {"type":"paragraph","text":"Сайт надає інформацію про асортимент, послуги та способи зв'язку. Замовлення підтверджується менеджером після перевірки товарних даних."},
    {"type":"heading","text":"Технічна інформація"},
    {"type":"paragraph","text":"Характеристики мають звірятися з офіційною документацією конкретної моделі. Онлайн-опис не замінює проєкт, розрахунок або інструкцію з монтажу."},
    {"type":"heading","text":"Оформлення замовлення"},
    {"type":"paragraph","text":"Замовлення вважається погодженим після перевірки наявності, ціни, комплектації, способу оплати й доставки та підтвердження менеджером."},
    {"type":"heading","text":"Інтелектуальна власність"},
    {"type":"paragraph","text":"Назви брендів і товарні знаки належать їхнім правовласникам. Матеріали сайту не можна відтворювати поза межами, дозволеними законом або окремою згодою."}
  ]$json$::jsonb,
  'Умови користування | ТД «Софіївка»', 'Умови користування сайтом та важливі уточнення щодо технічної інформації й замовлень.');

insert into public.site_faq_items (group_title, question, answer, sort_order) values
('Підбір', 'Що потрібно для підбору котла?',
  'Площа й тепловтрати, кількість точок гарячої води, тип димоходу, електроживлення, схема системи та бажана автоматика.', 10),
('Підбір', 'Як підібрати насос?',
  'Потрібні витрата, напір, монтажна довжина, діаметр приєднання, тип теплоносія й режим керування.', 20),
('Підбір', 'Можна замінити товар аналогом?',
  'Так, але лише після порівняння робочих параметрів, розмірів, підключень, керування та гарантійних умов.', 30),
('Замовлення', 'Як підтверджуються ціни та наявність?',
  'Перед оплатою менеджер додатково перевіряє актуальну ціну, залишок і комплектність замовлення.', 40),
('Замовлення', 'Коли замовлення вважається погодженим?',
  'Після підтвердження моделі, кількості, ціни, комплектності, способу оплати й доставки.', 50),
('Замовлення', 'Чи можна замовити весь комплект?',
  'Так. Надішліть специфікацію або опис системи, щоб перевірити основне обладнання та монтажні компоненти.', 60),
('Доставка і сервіс', 'Як дізнатися строк доставки?',
  'Менеджер перевіряє склад відвантаження, габарити й спосіб перевезення, після чого підтверджує орієнтовний строк.', 70),
('Доставка і сервіс', 'Що робити при пошкодженні упаковки?',
  'Зафіксуйте пошкодження до завершення отримання та оформіть документи за процедурою перевізника.', 80),
('Доставка і сервіс', 'Що потрібно для сервісного звернення?',
  'Модель, серійний номер, документ про покупку, опис симптомів і фото підключення або повідомлення на дисплеї.', 90);

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create or replace function public._site_pages_require_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_content() then
    raise exception using errcode = '42501', message = 'Редагувати сторінки можуть власник, адміністратор і контент-менеджер.';
  end if;
end;
$$;

-- One line of text: control characters dropped, whitespace runs collapsed, length checked.
create or replace function public._site_pages_text(raw jsonb, label text, maximum integer, required boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value text;
begin
  value := btrim(regexp_replace(public._settings_text(raw, label, maximum * 2, false), '[[:space:]]+', ' ', 'g'));
  if value = '' and required then
    raise exception using errcode = '22023', message = format('%s: поле обов’язкове.', label);
  end if;
  if char_length(value) > maximum then
    raise exception using errcode = '22023', message = format('%s: не довше %s символів.', label, maximum);
  end if;
  return value;
end;
$$;

-- Links inside text are written as [label](url). Only site paths, https, mailto and tel are allowed
-- (no javascript:, no protocol-relative //host); the storefront applies the same rule.
create or replace function public._site_pages_check_links(value text, label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  link text[];
begin
  for link in select match from regexp_matches(coalesce(value, ''), '\[([^]]+)\]\(([^)[:space:]]*)\)', 'g') as match loop
    if link[2] !~ '^(https://[^[:space:]<>"\\]+|/([^/[:space:]<>"\\][^[:space:]<>"\\]*)?|mailto:[^[:space:]<>"\\]+|tel:\+?[0-9-]+)$' then
      raise exception using errcode = '22023',
        message = format('%s: посилання «%s» має починатися з https://, / (сторінка сайту), mailto: або tel:.', label, link[2]);
    end if;
  end loop;
  return value;
end;
$$;

-- Validates the block list of a page body and returns it with only the known keys.
create or replace function public._site_pages_clean_body(raw jsonb)
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
    raise exception using errcode = '22023', message = 'Текст сторінки: очікується список блоків.';
  end if;
  if jsonb_array_length(raw) > 80 then
    raise exception using errcode = '22023', message = 'Текст сторінки: не більше 80 блоків.';
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
    else
      raise exception using errcode = '22023', message = format('Блок %s: невідомий тип блоку.', block_index);
    end if;
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- JSON shapes
-- ---------------------------------------------------------------------------

create or replace function public._site_page_public_json(target public.site_pages)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', target.slug,
    'kicker', target.kicker,
    'title', target.title,
    'lead', target.lead,
    'body', case when target.has_body then target.body end,
    'seo', jsonb_build_object('title', target.seo_title, 'description', target.seo_description),
    'updatedAt', target.updated_at
  )
$$;

create or replace function public._site_page_admin_json(target public.site_pages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._site_page_public_json(target) || jsonb_build_object(
    'body', target.body,
    'navTitle', target.nav_title,
    'hasBody', target.has_body,
    'published', target.published,
    'sortOrder', target.sort_order,
    'blockCount', jsonb_array_length(target.body),
    'updatedBy', (select profile.name from public.admin_profiles profile where profile.user_id = target.updated_by)
  )
$$;

create or replace function public._site_pages_audit_json(target_entity text, target_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'createdAt', entry.created_at,
    'actor', coalesce(profile.name, 'Невідомий працівник'),
    'fields', (select coalesce(jsonb_agg(field order by field), '[]'::jsonb) from jsonb_object_keys(entry.changes) field)
  ) order by entry.created_at desc), '[]'::jsonb)
  from (
    select * from public.site_pages_audit audit
    where audit.entity = target_entity and audit.entity_key = target_key
    order by audit.created_at desc
    limit 20
  ) entry
  left join public.admin_profiles profile on profile.user_id = entry.actor_id
$$;

create or replace function public._site_faq_list_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.internal_id,
    'group', item.group_title,
    'question', item.question,
    'answer', item.answer,
    'active', item.active
  ) order by item.sort_order, item.internal_id), '[]'::jsonb)
  from public.site_faq_items item
$$;

create or replace function public._site_faq_admin_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items', public._site_faq_list_json(),
    'updatedAt', (select state.updated_at from public.site_faq_state state where state.singleton),
    'history', public._site_pages_audit_json('faq', 'faq')
  )
$$;

-- ---------------------------------------------------------------------------
-- Public reads (storefront)
-- ---------------------------------------------------------------------------

-- Null when the page is unknown or switched to its built-in text (published = false).
create or replace function public.get_site_page(page_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public._site_page_public_json(page)
  from public.site_pages page
  where page.slug = page_slug and page.published
$$;

-- Active questions in order; null while the FAQ page is switched to its built-in text.
create or replace function public.get_site_faq()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from public.site_pages page where page.slug = 'faq' and not page.published) then null
  else coalesce((
    select jsonb_agg(jsonb_build_object('group', item.group_title, 'question', item.question, 'answer', item.answer)
      order by item.sort_order, item.internal_id)
    from public.site_faq_items item where item.active
  ), '[]'::jsonb) end
$$;

-- ---------------------------------------------------------------------------
-- Staff reads
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_site_pages()
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
    'pages', coalesce((
      select jsonb_agg(public._site_page_admin_json(page) - 'body' - 'lead' - 'seo' order by page.sort_order, page.slug)
      from public.site_pages page
    ), '[]'::jsonb),
    'faq', jsonb_build_object(
      'total', (select count(*) from public.site_faq_items),
      'active', (select count(*) from public.site_faq_items item where item.active),
      'updatedAt', (select state.updated_at from public.site_faq_state state where state.singleton)
    )
  );
end;
$$;

create or replace function public.admin_get_site_page(page_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.site_pages%rowtype;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select * into target from public.site_pages page where page.slug = page_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'canEdit', public.can_manage_content(),
    'page', public._site_page_admin_json(target),
    'history', public._site_pages_audit_json('page', target.slug),
    'faq', case when target.slug = 'faq' then public._site_faq_admin_json() end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff writes
-- ---------------------------------------------------------------------------

-- Saves the editable fields of one page. Keys left out of the payload keep their value.
create or replace function public.admin_save_site_page(page_slug text, payload jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.site_pages%rowtype;
  before_row jsonb;
  after_row jsonb;
  changes jsonb;
  cleaned_body jsonb;
begin
  perform public._site_pages_require_editor();
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Некоректні дані сторінки.';
  end if;
  select * into target from public.site_pages page where page.slug = page_slug for update;
  if not found then raise exception using errcode = 'P0002', message = 'Сторінку не знайдено.'; end if;
  if expected_updated_at is not null and target.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Сторінку вже змінив інший працівник. Оновіть сторінку.';
  end if;
  before_row := to_jsonb(target);

  if payload ? 'kicker' then target.kicker := public._site_pages_text(payload -> 'kicker', 'Надзаголовок', 80); end if;
  if payload ? 'title' then target.title := public._site_pages_text(payload -> 'title', 'Заголовок', 200, true); end if;
  if payload ? 'lead' then target.lead := public._site_pages_text(payload -> 'lead', 'Вступ', 600); end if;
  if payload ? 'seoTitle' then target.seo_title := public._site_pages_text(payload -> 'seoTitle', 'SEO-заголовок', 160); end if;
  if payload ? 'seoDescription' then
    target.seo_description := public._site_pages_text(payload -> 'seoDescription', 'SEO-опис', 320);
  end if;
  if payload ? 'published' then
    if jsonb_typeof(payload -> 'published') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Показ на сайті: очікується так або ні.';
    end if;
    target.published := (payload ->> 'published')::boolean;
  end if;
  if payload ? 'body' then
    cleaned_body := public._site_pages_clean_body(payload -> 'body');
    if target.has_body then
      target.body := cleaned_body;
    elsif jsonb_array_length(cleaned_body) > 0 then
      raise exception using errcode = '22023',
        message = 'Основний вміст цієї сторінки — блоки макета, вони не редагуються. Змініть перший екран або SEO.';
    end if;
  end if;

  after_row := to_jsonb(target);
  select coalesce(jsonb_object_agg(field, jsonb_build_object('from', before_row -> field, 'to', after_row -> field)), '{}'::jsonb)
  into changes
  from unnest(array['kicker', 'title', 'lead', 'body', 'seo_title', 'seo_description', 'published']) field
  where before_row -> field is distinct from after_row -> field;

  if changes <> '{}'::jsonb then
    update public.site_pages set
      kicker = target.kicker,
      title = target.title,
      lead = target.lead,
      body = target.body,
      seo_title = target.seo_title,
      seo_description = target.seo_description,
      published = target.published,
      updated_at = now(),
      updated_by = auth.uid()
    where slug = target.slug;
    insert into public.site_pages_audit (entity, entity_key, actor_id, changes)
    values ('page', target.slug, auth.uid(), changes);
  end if;
  return public.admin_get_site_page(target.slug);
end;
$$;

-- Replaces the FAQ list with the given ordered items: [{id?, group, question, answer, active}].
-- Items with an id update that question, items without one are added, missing ones are deleted.
create or replace function public.admin_save_site_faq(items jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.site_faq_state%rowtype;
  entry record;
  label text;
  item_id uuid;
  seen uuid[] := '{}';
  cleaned jsonb := '[]'::jsonb;
  before_list jsonb;
  after_list jsonb;
begin
  perform public._site_pages_require_editor();
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception using errcode = '22023', message = 'Некоректний список запитань.';
  end if;
  if jsonb_array_length(items) > 100 then
    raise exception using errcode = '22023', message = 'Не більше 100 запитань.';
  end if;
  select * into state from public.site_faq_state faq_state where faq_state.singleton for update;
  if expected_updated_at is not null and state.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'Запитання вже змінив інший працівник. Оновіть сторінку.';
  end if;

  for entry in select value, ordinality from jsonb_array_elements(items) with ordinality loop
    label := format('Запитання %s', entry.ordinality);
    if jsonb_typeof(entry.value) <> 'object' then
      raise exception using errcode = '22023', message = format('%s: некоректні дані.', label);
    end if;
    item_id := null;
    if coalesce(entry.value ->> 'id', '') <> '' then
      if entry.value ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.site_faq_items item where item.internal_id = (entry.value ->> 'id')::uuid) then
        raise exception using errcode = 'P0002', message = format('%s не знайдено: його вже видалили. Оновіть сторінку.', label);
      end if;
      item_id := (entry.value ->> 'id')::uuid;
      if item_id = any(seen) then
        raise exception using errcode = '22023', message = format('%s повторюється у списку.', label);
      end if;
      seen := seen || item_id;
    end if;
    if entry.value ? 'active' and jsonb_typeof(entry.value -> 'active') not in ('boolean', 'null') then
      raise exception using errcode = '22023', message = format('%s: «показувати» має бути так або ні.', label);
    end if;
    cleaned := cleaned || jsonb_build_array(jsonb_build_object(
      'id', item_id,
      'group', public._site_pages_text(entry.value -> 'group', label || ': розділ', 80, true),
      'question', public._site_pages_text(entry.value -> 'question', label || ': питання', 300, true),
      'answer', public._site_pages_check_links(public._site_pages_text(entry.value -> 'answer', label || ': відповідь', 2000, true), label),
      'active', coalesce((entry.value ->> 'active')::boolean, true),
      'sortOrder', entry.ordinality * 10
    ));
  end loop;

  before_list := public._site_faq_list_json();

  delete from public.site_faq_items item where not (item.internal_id = any(seen));

  update public.site_faq_items item set
    group_title = picked.value ->> 'group',
    question = picked.value ->> 'question',
    answer = picked.value ->> 'answer',
    active = (picked.value ->> 'active')::boolean,
    sort_order = (picked.value ->> 'sortOrder')::integer,
    updated_at = now(),
    updated_by = auth.uid()
  from jsonb_array_elements(cleaned) picked(value)
  where picked.value ->> 'id' is not null
    and item.internal_id = (picked.value ->> 'id')::uuid
    and (item.group_title, item.question, item.answer, item.active, item.sort_order)
      is distinct from (picked.value ->> 'group', picked.value ->> 'question', picked.value ->> 'answer',
        (picked.value ->> 'active')::boolean, (picked.value ->> 'sortOrder')::integer);

  insert into public.site_faq_items (group_title, question, answer, active, sort_order, updated_by)
  select picked.value ->> 'group', picked.value ->> 'question', picked.value ->> 'answer',
    (picked.value ->> 'active')::boolean, (picked.value ->> 'sortOrder')::integer, auth.uid()
  from jsonb_array_elements(cleaned) picked(value)
  where picked.value ->> 'id' is null;

  after_list := public._site_faq_list_json();
  if before_list is distinct from after_list then
    update public.site_faq_state set updated_at = now(), updated_by = auth.uid() where singleton;
    insert into public.site_pages_audit (entity, entity_key, actor_id, changes)
    values ('faq', 'faq', auth.uid(), jsonb_build_object('items', jsonb_build_object('from', before_list, 'to', after_list)));
  end if;
  return public._site_faq_admin_json();
end;
$$;

revoke all on function public._site_pages_require_editor() from public, anon, authenticated;
revoke all on function public._site_pages_text(jsonb, text, integer, boolean) from public, anon, authenticated;
revoke all on function public._site_pages_check_links(text, text) from public, anon, authenticated;
revoke all on function public._site_pages_clean_body(jsonb) from public, anon, authenticated;
revoke all on function public._site_page_public_json(public.site_pages) from public, anon, authenticated;
revoke all on function public._site_page_admin_json(public.site_pages) from public, anon, authenticated;
revoke all on function public._site_pages_audit_json(text, text) from public, anon, authenticated;
revoke all on function public._site_faq_list_json() from public, anon, authenticated;
revoke all on function public._site_faq_admin_json() from public, anon, authenticated;

revoke all on function public.get_site_page(text) from public;
revoke all on function public.get_site_faq() from public;
grant execute on function public.get_site_page(text) to anon, authenticated;
grant execute on function public.get_site_faq() to anon, authenticated;

revoke all on function public.admin_list_site_pages() from public, anon;
revoke all on function public.admin_get_site_page(text) from public, anon;
revoke all on function public.admin_save_site_page(text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_save_site_faq(jsonb, timestamptz) from public, anon;
grant execute on function public.admin_list_site_pages() to authenticated;
grant execute on function public.admin_get_site_page(text) to authenticated;
grant execute on function public.admin_save_site_page(text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_save_site_faq(jsonb, timestamptz) to authenticated;
