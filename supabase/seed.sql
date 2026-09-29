-- Generated from the stabilized Sofiivka registries. Do not add products here.
-- Source: brands-data.js, catalog/categories.js, catalog/attribute-schema.js

begin;

insert into public.brands (
  stable_id, slug, name, aliases, logo_url, description, country, visibility,
  featured, featured_order, seo_title, seo_description, status
)
select
  stable_id, slug, name, aliases, logo_url, description, nullif(country, ''), visibility::public.brand_visibility,
  featured, featured_order, seo_title, seo_description, status::public.record_status
from jsonb_to_recordset($seed$[
  {
    "stable_id": "altep",
    "slug": "altep",
    "name": "Altep",
    "aliases": [],
    "logo_url": "assets/brands/altep.webp",
    "description": "Твердопаливні та пелетні котли для побутових, комерційних і промислових систем опалення.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Altep — товари та категорії | ТД «Софіївка»",
    "seo_description": "Твердопаливні та пелетні котли для побутових, комерційних і промислових систем опалення.",
    "status": "active"
  },
  {
    "stable_id": "aquasystem",
    "slug": "aquasystem",
    "name": "Aquasystem",
    "aliases": [],
    "logo_url": null,
    "description": "Мембранні розширювальні баки та ємності для систем опалення й водопостачання.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Aquasystem — товари та категорії | ТД «Софіївка»",
    "seo_description": "Мембранні розширювальні баки та ємності для систем опалення й водопостачання.",
    "status": "active"
  },
  {
    "stable_id": "baxi",
    "slug": "baxi",
    "name": "BAXI",
    "aliases": [],
    "logo_url": "assets/brands/baxi.svg",
    "description": "Газові та конденсаційні котли, водонагрівальне обладнання й автоматика для систем опалення.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 3,
    "seo_title": "BAXI — товари та категорії | ТД «Софіївка»",
    "seo_description": "Газові та конденсаційні котли, водонагрівальне обладнання й автоматика для систем опалення.",
    "status": "active"
  },
  {
    "stable_id": "biodom",
    "slug": "biodom",
    "name": "BIODOM",
    "aliases": [],
    "logo_url": null,
    "description": "Пелетні котли для автономного опалення житлових і комерційних об’єктів.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "BIODOM — товари та категорії | ТД «Софіївка»",
    "seo_description": "Пелетні котли для автономного опалення житлових і комерційних об’єктів.",
    "status": "active"
  },
  {
    "stable_id": "bosch",
    "slug": "bosch",
    "name": "Bosch",
    "aliases": [],
    "logo_url": "assets/brands/bosch.svg",
    "description": "Газові й конденсаційні котли, автоматика та інженерне обладнання для опалювальних систем.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 1,
    "seo_title": "Bosch — товари та категорії | ТД «Софіївка»",
    "seo_description": "Газові й конденсаційні котли, автоматика та інженерне обладнання для опалювальних систем.",
    "status": "active"
  },
  {
    "stable_id": "buderus",
    "slug": "buderus",
    "name": "Buderus",
    "aliases": [],
    "logo_url": "assets/brands/buderus.svg",
    "description": "Котли, автоматика та комплексні компоненти для побутових і комерційних котелень.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 2,
    "seo_title": "Buderus — товари та категорії | ТД «Софіївка»",
    "seo_description": "Котли, автоматика та комплексні компоненти для побутових і комерційних котелень.",
    "status": "active"
  },
  {
    "stable_id": "devi",
    "slug": "devi",
    "name": "DEVI",
    "aliases": [],
    "logo_url": null,
    "description": "Нагрівальні кабелі, мати, терморегулятори та комплектуючі для електричної теплої підлоги.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "DEVI — товари та категорії | ТД «Софіївка»",
    "seo_description": "Нагрівальні кабелі, мати, терморегулятори та комплектуючі для електричної теплої підлоги.",
    "status": "active"
  },
  {
    "stable_id": "ecosoft",
    "slug": "ecosoft",
    "name": "Ecosoft",
    "aliases": [],
    "logo_url": "assets/brands/ecosoft.png",
    "description": "Системи комплексного очищення, пом’якшення, фільтрації та підготовки води.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 7,
    "seo_title": "Ecosoft — товари та категорії | ТД «Софіївка»",
    "seo_description": "Системи комплексного очищення, пом’якшення, фільтрації та підготовки води.",
    "status": "active"
  },
  {
    "stable_id": "feniks",
    "slug": "feniks",
    "name": "FENIKS",
    "aliases": [],
    "logo_url": "assets/brands/feniks.png",
    "description": "Твердопаливні котли та обладнання для автономних систем опалення.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "FENIKS — товари та категорії | ТД «Софіївка»",
    "seo_description": "Твердопаливні котли та обладнання для автономних систем опалення.",
    "status": "active"
  },
  {
    "stable_id": "focus",
    "slug": "focus",
    "name": "FOCUS",
    "aliases": [],
    "logo_url": "assets/brands/focus.svg",
    "description": "Пелетні й твердопаливні котли для котелень різної теплової потужності.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "FOCUS — товари та категорії | ТД «Софіївка»",
    "seo_description": "Пелетні й твердопаливні котли для котелень різної теплової потужності.",
    "status": "active"
  },
  {
    "stable_id": "general-fittings",
    "slug": "general-fittings",
    "name": "General Fittings",
    "aliases": [],
    "logo_url": null,
    "description": "Фітинги, колектори та з’єднувальні компоненти для опалення і водопостачання.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "General Fittings — товари та категорії | ТД «Софіївка»",
    "seo_description": "Фітинги, колектори та з’єднувальні компоненти для опалення і водопостачання.",
    "status": "active"
  },
  {
    "stable_id": "giacomini",
    "slug": "giacomini",
    "name": "Giacomini",
    "aliases": [],
    "logo_url": "assets/brands/giacomini.svg",
    "description": "Колектори, арматура та компоненти керування потоками в опалювальних і водяних системах.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Giacomini — товари та категорії | ТД «Софіївка»",
    "seo_description": "Колектори, арматура та компоненти керування потоками в опалювальних і водяних системах.",
    "status": "active"
  },
  {
    "stable_id": "gorenje",
    "slug": "gorenje",
    "name": "Gorenje",
    "aliases": [],
    "logo_url": "assets/brands/gorenje.svg",
    "description": "Електричні водонагрівачі та обладнання для підготовки гарячої води.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 9,
    "seo_title": "Gorenje — товари та категорії | ТД «Софіївка»",
    "seo_description": "Електричні водонагрівачі та обладнання для підготовки гарячої води.",
    "status": "active"
  },
  {
    "stable_id": "grundfos",
    "slug": "grundfos",
    "name": "Grundfos",
    "aliases": [],
    "logo_url": "assets/brands/grundfos.svg",
    "description": "Насосне обладнання для опалення, циркуляції, водопостачання та підвищення тиску.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 4,
    "seo_title": "Grundfos — товари та категорії | ТД «Софіївка»",
    "seo_description": "Насосне обладнання для опалення, циркуляції, водопостачання та підвищення тиску.",
    "status": "active"
  },
  {
    "stable_id": "krafter",
    "slug": "krafter",
    "name": "Krafter",
    "aliases": [],
    "logo_url": null,
    "description": "Опалювальне обладнання та комплектуючі для побудови й обслуговування котелень.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Krafter — товари та категорії | ТД «Софіївка»",
    "seo_description": "Опалювальне обладнання та комплектуючі для побудови й обслуговування котелень.",
    "status": "active"
  },
  {
    "stable_id": "kronas",
    "slug": "kronas",
    "name": "Kronas",
    "aliases": [],
    "logo_url": null,
    "description": "Твердопаливні й пелетні котли для автономного опалення будинків та інших об’єктів.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Kronas — товари та категорії | ТД «Софіївка»",
    "seo_description": "Твердопаливні й пелетні котли для автономного опалення будинків та інших об’єктів.",
    "status": "active"
  },
  {
    "stable_id": "lafat",
    "slug": "lafat",
    "name": "LAFAT",
    "aliases": [],
    "logo_url": "assets/brands/lafat.png",
    "description": "Твердопаливні та пелетні котли для опалювальних систем різної потужності.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "LAFAT — товари та категорії | ТД «Софіївка»",
    "seo_description": "Твердопаливні та пелетні котли для опалювальних систем різної потужності.",
    "status": "active"
  },
  {
    "stable_id": "mario",
    "slug": "mario",
    "name": "Mario",
    "aliases": [],
    "logo_url": "assets/brands/mario.png",
    "description": "Рушникосушарки та опалювальні прилади для ванних кімнат і санітарних зон.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Mario — товари та категорії | ТД «Софіївка»",
    "seo_description": "Рушникосушарки та опалювальні прилади для ванних кімнат і санітарних зон.",
    "status": "active"
  },
  {
    "stable_id": "mycond",
    "slug": "mycond",
    "name": "MYCOND",
    "aliases": [],
    "logo_url": null,
    "description": "Теплові насоси, фанкойли, вентиляційне обладнання та автоматика кліматичних систем.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "MYCOND — товари та категорії | ТД «Софіївка»",
    "seo_description": "Теплові насоси, фанкойли, вентиляційне обладнання та автоматика кліматичних систем.",
    "status": "active"
  },
  {
    "stable_id": "protherm",
    "slug": "protherm",
    "name": "Protherm",
    "aliases": [],
    "logo_url": "assets/brands/protherm.png",
    "description": "Газові й електричні котли та компоненти керування для автономного опалення.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 10,
    "seo_title": "Protherm — товари та категорії | ТД «Софіївка»",
    "seo_description": "Газові й електричні котли та компоненти керування для автономного опалення.",
    "status": "active"
  },
  {
    "stable_id": "rehau",
    "slug": "rehau",
    "name": "Rehau",
    "aliases": [],
    "logo_url": "assets/brands/rehau.svg",
    "description": "Трубні системи, фітинги та рішення для опалення, водопостачання й теплої підлоги.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 6,
    "seo_title": "Rehau — товари та категорії | ТД «Софіївка»",
    "seo_description": "Трубні системи, фітинги та рішення для опалення, водопостачання й теплої підлоги.",
    "status": "active"
  },
  {
    "stable_id": "rifeng",
    "slug": "rifeng",
    "name": "Rifeng",
    "aliases": [],
    "logo_url": "assets/brands/rifeng.png",
    "description": "Труби та з’єднувальні компоненти для водопостачання, опалення й теплої підлоги.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Rifeng — товари та категорії | ТД «Софіївка»",
    "seo_description": "Труби та з’єднувальні компоненти для водопостачання, опалення й теплої підлоги.",
    "status": "active"
  },
  {
    "stable_id": "ruvi",
    "slug": "ruvi",
    "name": "RUVI",
    "aliases": [],
    "logo_url": null,
    "description": "Обладнання та комплектуючі для систем опалення, представлені в каталозі магазину.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "RUVI — товари та категорії | ТД «Софіївка»",
    "seo_description": "Обладнання та комплектуючі для систем опалення, представлені в каталозі магазину.",
    "status": "active"
  },
  {
    "stable_id": "salus",
    "slug": "salus",
    "name": "Salus",
    "aliases": [],
    "logo_url": "assets/brands/salus.png",
    "description": "Термостати, програматори та автоматика керування опаленням і температурними зонами.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Salus — товари та категорії | ТД «Софіївка»",
    "seo_description": "Термостати, програматори та автоматика керування опаленням і температурними зонами.",
    "status": "active"
  },
  {
    "stable_id": "stalar",
    "slug": "stalar",
    "name": "Сталар",
    "aliases": [],
    "logo_url": null,
    "description": "Сталеві опалювальні прилади та комплектуючі для водяних систем опалення.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Сталар — товари та категорії | ТД «Софіївка»",
    "seo_description": "Сталеві опалювальні прилади та комплектуючі для водяних систем опалення.",
    "status": "active"
  },
  {
    "stable_id": "tatramet",
    "slug": "tatramet",
    "name": "Tatramet",
    "aliases": [],
    "logo_url": null,
    "description": "Твердопаливні та пелетні котли для побутових і промислових опалювальних систем.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Tatramet — товари та категорії | ТД «Софіївка»",
    "seo_description": "Твердопаливні та пелетні котли для побутових і промислових опалювальних систем.",
    "status": "active"
  },
  {
    "stable_id": "tech",
    "slug": "tech",
    "name": "TECH",
    "aliases": [
      "TECH Controllers",
      "TECH Sterowniki",
      "Sinum"
    ],
    "logo_url": "assets/brands/tech.webp",
    "description": "Контролери, кімнатні термостати, зональне керування, система автоматизації Sinum, датчики та комплектуючі.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "TECH — товари та категорії | ТД «Софіївка»",
    "seo_description": "Контролери, кімнатні термостати, зональне керування, система автоматизації Sinum, датчики та комплектуючі.",
    "status": "active"
  },
  {
    "stable_id": "tekk",
    "slug": "tekk",
    "name": "TEKK HAUS",
    "aliases": [
      "Tekkhaus",
      "Tekk Haus"
    ],
    "logo_url": "assets/brands/tekkhaus.webp",
    "description": "Побутові насоси, насосні станції, автоматика, комплектуючі, обладнання для басейнів і господарства.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "TEKK HAUS — товари та категорії | ТД «Софіївка»",
    "seo_description": "Побутові насоси, насосні станції, автоматика, комплектуючі, обладнання для басейнів і господарства.",
    "status": "active"
  },
  {
    "stable_id": "tenko",
    "slug": "tenko",
    "name": "Tenko",
    "aliases": [],
    "logo_url": null,
    "description": "Електричні котли для автономного опалення житлових і невеликих комерційних об’єктів.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Tenko — товари та категорії | ТД «Софіївка»",
    "seo_description": "Електричні котли для автономного опалення житлових і невеликих комерційних об’єктів.",
    "status": "active"
  },
  {
    "stable_id": "termojet",
    "slug": "termojet",
    "name": "Termojet",
    "aliases": [],
    "logo_url": "assets/brands/termojet.png",
    "description": "Насосні групи, колектори, гідравлічні розділювачі, модульні рішення та автоматика котелень.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 8,
    "seo_title": "Termojet — товари та категорії | ТД «Софіївка»",
    "seo_description": "Насосні групи, колектори, гідравлічні розділювачі, модульні рішення та автоматика котелень.",
    "status": "active"
  },
  {
    "stable_id": "tesy",
    "slug": "tesy",
    "name": "TESY",
    "aliases": [],
    "logo_url": "assets/brands/tesy.svg",
    "description": "Електричні водонагрівачі та обладнання для накопичення й підготовки гарячої води.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "TESY — товари та категорії | ТД «Софіївка»",
    "seo_description": "Електричні водонагрівачі та обладнання для накопичення й підготовки гарячої води.",
    "status": "active"
  },
  {
    "stable_id": "valrom",
    "slug": "valrom",
    "name": "Valrom",
    "aliases": [],
    "logo_url": "assets/brands/valrom.png",
    "description": "Труби та фасонні елементи для внутрішньої й зовнішньої каналізації та водяних систем.",
    "country": null,
    "visibility": "catalog",
    "featured": false,
    "featured_order": null,
    "seo_title": "Valrom — товари та категорії | ТД «Софіївка»",
    "seo_description": "Труби та фасонні елементи для внутрішньої й зовнішньої каналізації та водяних систем.",
    "status": "active"
  },
  {
    "stable_id": "wilo",
    "slug": "wilo",
    "name": "Wilo",
    "aliases": [],
    "logo_url": "assets/brands/wilo.svg",
    "description": "Циркуляційні та системні насоси для опалення, водопостачання й інженерних систем.",
    "country": null,
    "visibility": "catalog",
    "featured": true,
    "featured_order": 5,
    "seo_title": "Wilo — товари та категорії | ТД «Софіївка»",
    "seo_description": "Циркуляційні та системні насоси для опалення, водопостачання й інженерних систем.",
    "status": "active"
  },
  {
    "stable_id": "westen",
    "slug": "westen",
    "name": "Westen",
    "aliases": [],
    "logo_url": null,
    "description": "",
    "country": null,
    "visibility": "service",
    "featured": false,
    "featured_order": null,
    "seo_title": "Westen — товари та категорії | ТД «Софіївка»",
    "seo_description": "Westen: обладнання, сервіс і підтримка ТД «Софіївка».",
    "status": "active"
  },
  {
    "stable_id": "viessmann",
    "slug": "viessmann",
    "name": "Viessmann",
    "aliases": [],
    "logo_url": "assets/brands/viessmann.svg",
    "description": "",
    "country": null,
    "visibility": "service",
    "featured": false,
    "featured_order": null,
    "seo_title": "Viessmann — товари та категорії | ТД «Софіївка»",
    "seo_description": "Viessmann: обладнання, сервіс і підтримка ТД «Софіївка».",
    "status": "active"
  },
  {
    "stable_id": "swag",
    "slug": "swag",
    "name": "SWAG",
    "aliases": [],
    "logo_url": null,
    "description": "",
    "country": null,
    "visibility": "service",
    "featured": false,
    "featured_order": null,
    "seo_title": "SWAG — товари та категорії | ТД «Софіївка»",
    "seo_description": "SWAG: обладнання, сервіс і підтримка ТД «Софіївка».",
    "status": "active"
  }
]$seed$::jsonb) as seed(
  stable_id text, slug text, name text, aliases text[], logo_url text, description text,
  country text, visibility text, featured boolean, featured_order integer,
  seo_title text, seo_description text, status text
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

create temporary table _seed_categories on commit drop as
select *
from jsonb_to_recordset($seed$[
  {
    "stable_id": "heating",
    "slug": "heating",
    "parent_stable_id": null,
    "level": 1,
    "title": "Опалення",
    "short_title": "Опалення",
    "description": "Обладнання для генерації, розподілу й керування теплом у житлових, комерційних та промислових системах.",
    "menu_description": "Котли, теплові насоси, гідравліка та автоматика",
    "sort_order": 10,
    "status": "active",
    "visibility": "catalog",
    "seo_title": "Опалення | ТД «Софіївка»",
    "seo_description": "Котли, теплові насоси, гідравліка, автоматика та комплектуючі для систем опалення."
  },
  {
    "stable_id": "water-supply",
    "slug": "water-supply",
    "parent_stable_id": null,
    "level": 1,
    "title": "Водопостачання та каналізація",
    "short_title": "Вода й каналізація",
    "description": "Насоси, установки, баки, автоматика та комплектуючі для подачі й відведення води.",
    "menu_description": "Насоси, каналізаційні установки, баки й автоматика",
    "sort_order": 20,
    "status": "active",
    "visibility": "catalog",
    "seo_title": "Водопостачання та каналізація | ТД «Софіївка»",
    "seo_description": "Насоси та обладнання для водопостачання, підвищення тиску й каналізації."
  },
  {
    "stable_id": "water-treatment",
    "slug": "water-treatment",
    "parent_stable_id": null,
    "level": 1,
    "title": "Водоочищення",
    "short_title": "Водоочищення",
    "description": "Питні фільтри, системи очищення всього будинку, картриджі, матеріали та UV-C знезараження.",
    "menu_description": "Фільтри, осмос, пом’якшення, картриджі та UV-C",
    "sort_order": 30,
    "status": "active",
    "visibility": "catalog",
    "seo_title": "Водоочищення | ТД «Софіївка»",
    "seo_description": "Системи водоочищення, питні фільтри, картриджі, матеріали й UV-C знезараження."
  },
  {
    "stable_id": "smart-home",
    "slug": "smart-home",
    "parent_stable_id": null,
    "level": 1,
    "title": "Розумний будинок і автоматизація",
    "short_title": "Розумний будинок",
    "description": "Центральні блоки, освітлення, реле, датчики, захист від протікання та керування кліматом.",
    "menu_description": "Sinum, освітлення, реле, датчики та клімат",
    "sort_order": 40,
    "status": "active",
    "visibility": "catalog",
    "seo_title": "Розумний будинок і автоматизація | ТД «Софіївка»",
    "seo_description": "Компоненти TECH Sinum для автоматизації будинку, освітлення, клімату та безпеки."
  },
  {
    "stable_id": "climate",
    "slug": "climate",
    "parent_stable_id": null,
    "level": 1,
    "title": "Клімат",
    "short_title": "Клімат",
    "description": "Кондиціонери та системи туманоутворення для охолодження й зволоження повітря.",
    "menu_description": "Кондиціонери та туманоутворення",
    "sort_order": 50,
    "status": "active",
    "visibility": "catalog",
    "seo_title": "Кліматичне обладнання | ТД «Софіївка»",
    "seo_description": "Кондиціонери та системи туманоутворення для житлових і комерційних об’єктів."
  },
  {
    "stable_id": "household-equipment",
    "slug": "household-equipment",
    "parent_stable_id": null,
    "level": 1,
    "title": "Обладнання для господарства",
    "short_title": "Для господарства",
    "description": "Електричне обладнання для підготовки кормів та повсякденних господарських задач.",
    "menu_description": "Подрібнення та підготовка кормів",
    "sort_order": 60,
    "status": "active",
    "visibility": "catalog",
    "seo_title": "Обладнання для господарства | ТД «Софіївка»",
    "seo_description": "Електричне обладнання для приватного та фермерського господарства."
  },
  {
    "stable_id": "plumbing",
    "slug": "plumbing",
    "parent_stable_id": null,
    "level": 1,
    "title": "Сантехніка",
    "short_title": "Сантехніка",
    "description": "Напрям готується до наповнення перевіреним асортиментом.",
    "menu_description": "Рішення під замовлення",
    "sort_order": 70,
    "status": "future",
    "visibility": "landing",
    "seo_title": "Сантехніка | ТД «Софіївка»",
    "seo_description": "Сантехнічні рішення під замовлення з підбором і комплектацією."
  },
  {
    "stable_id": "heat-generation",
    "slug": "heat-generation",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Теплогенерація",
    "short_title": "Теплогенерація",
    "description": "Котли, пальники, теплогенератори та парогенератори за типом палива й призначенням.",
    "menu_description": "",
    "sort_order": 110,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "gas-boilers",
    "slug": "gas-boilers",
    "parent_stable_id": "heat-generation",
    "level": 3,
    "title": "Газові котли",
    "short_title": "Газові котли",
    "description": "Побутові, комерційні та промислові газові котли.",
    "menu_description": "",
    "sort_order": 111,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "solid-fuel-boilers",
    "slug": "solid-fuel-boilers",
    "parent_stable_id": "heat-generation",
    "level": 3,
    "title": "Твердопаливні котли",
    "short_title": "Твердопаливні котли",
    "description": "Котли з ручним завантаженням дров, вугілля та брикетів.",
    "menu_description": "",
    "sort_order": 112,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pellet-boilers",
    "slug": "pellet-boilers",
    "parent_stable_id": "heat-generation",
    "level": 3,
    "title": "Пелетні котли й мінікотельні",
    "short_title": "Пелетні котли",
    "description": "Автоматизовані пелетні котли та готові мінікотельні.",
    "menu_description": "",
    "sort_order": 113,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pellet-burners",
    "slug": "pellet-burners",
    "parent_stable_id": "heat-generation",
    "level": 3,
    "title": "Пелетні пальники",
    "short_title": "Пелетні пальники",
    "description": "Пелетні пальники для модернізації сумісного котельного обладнання.",
    "menu_description": "",
    "sort_order": 114,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heat-generators",
    "slug": "heat-generators",
    "parent_stable_id": "heat-generation",
    "level": 3,
    "title": "Теплогенератори",
    "short_title": "Теплогенератори",
    "description": "Промислові повітряні теплогенератори для обігріву великих приміщень.",
    "menu_description": "",
    "sort_order": 115,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "steam-generators",
    "slug": "steam-generators",
    "parent_stable_id": "heat-generation",
    "level": 3,
    "title": "Парогенератори",
    "short_title": "Парогенератори",
    "description": "Пелетні парогенератори для технологічних і промислових задач.",
    "menu_description": "",
    "sort_order": 116,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heat-pumps",
    "slug": "heat-pumps",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Теплові насоси",
    "short_title": "Теплові насоси",
    "description": "Повітряні та геотермальні теплові насоси для опалення, охолодження й ГВП.",
    "menu_description": "",
    "sort_order": 120,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "hot-water-storage",
    "slug": "hot-water-storage",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Гаряча вода й акумулювання",
    "short_title": "ГВП і акумулювання",
    "description": "Бойлери непрямого нагріву та буферні ємності.",
    "menu_description": "",
    "sort_order": 130,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "hot-water-tanks",
    "slug": "hot-water-tanks",
    "parent_stable_id": "hot-water-storage",
    "level": 3,
    "title": "Бойлери непрямого нагріву",
    "short_title": "Бойлери",
    "description": "Баки й бойлери для накопичення та приготування гарячої води.",
    "menu_description": "",
    "sort_order": 131,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heat-accumulators",
    "slug": "heat-accumulators",
    "parent_stable_id": "hot-water-storage",
    "level": 3,
    "title": "Буферні ємності й теплоакумулятори",
    "short_title": "Теплоакумулятори",
    "description": "Буферні ємності для акумулювання тепла та стабілізації системи.",
    "menu_description": "",
    "sort_order": 132,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "circulation-pumps",
    "slug": "circulation-pumps",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Насоси опалення",
    "short_title": "Насоси опалення",
    "description": "Циркуляційні насоси для опалення та рециркуляції гарячої води.",
    "menu_description": "",
    "sort_order": 140,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "system-circulation-pumps",
    "slug": "system-circulation",
    "parent_stable_id": "circulation-pumps",
    "level": 3,
    "title": "Системні циркуляційні насоси",
    "short_title": "Системна циркуляція",
    "description": "Насоси для котлових, радіаторних, змішувальних та інших опалювальних контурів.",
    "menu_description": "",
    "sort_order": 141,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "dhw-circulation-pumps",
    "slug": "dhw-recirculation",
    "parent_stable_id": "circulation-pumps",
    "level": 3,
    "title": "Насоси рециркуляції ГВП",
    "short_title": "Рециркуляція ГВП",
    "description": "Компактні насоси для контурів рециркуляції гарячої води.",
    "menu_description": "",
    "sort_order": 142,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "distribution-hydraulics",
    "slug": "distribution-hydraulics",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Гідравліка та розподіл",
    "short_title": "Гідравліка",
    "description": "Насосні групи, колектори, гідравлічні роздільники, сепаратори й арматура.",
    "menu_description": "",
    "sort_order": 150,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pump-groups",
    "slug": "pump-groups",
    "parent_stable_id": "distribution-hydraulics",
    "level": 3,
    "title": "Насосні групи",
    "short_title": "Насосні групи",
    "description": "Готові модулі циркуляції та змішування для котельних контурів.",
    "menu_description": "",
    "sort_order": 151,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "distribution-manifolds",
    "slug": "distribution-manifolds",
    "parent_stable_id": "distribution-hydraulics",
    "level": 3,
    "title": "Розподільчі колектори",
    "short_title": "Колектори",
    "description": "Колектори для розподілу теплоносія між контурами.",
    "menu_description": "",
    "sort_order": 152,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "manifolds-with-hydraulic-separator",
    "slug": "manifolds-with-separator",
    "parent_stable_id": "distribution-hydraulics",
    "level": 3,
    "title": "Колектори з гідророздільником",
    "short_title": "Колектори з гідрострілкою",
    "description": "Комбіновані колектори з вбудованим гідравлічним розділенням.",
    "menu_description": "",
    "sort_order": 153,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "hydraulic-separators",
    "slug": "hydraulic-separators",
    "parent_stable_id": "distribution-hydraulics",
    "level": 3,
    "title": "Гідравлічні роздільники",
    "short_title": "Гідророздільники",
    "description": "Гідрострілки та вузли гідравлічного розділення контурів.",
    "menu_description": "",
    "sort_order": 154,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "air-dirt-separators",
    "slug": "air-dirt-separators",
    "parent_stable_id": "distribution-hydraulics",
    "level": 3,
    "title": "Сепаратори повітря та бруду",
    "short_title": "Сепаратори",
    "description": "Сепаратори для видалення повітря, шламу та магнітних домішок.",
    "menu_description": "",
    "sort_order": 155,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heating-valves",
    "slug": "valves",
    "parent_stable_id": "distribution-hydraulics",
    "level": 3,
    "title": "Змішувальна й балансувальна арматура",
    "short_title": "Арматура",
    "description": "Клапани, приводи та балансувальна арматура для гідравлічних контурів.",
    "menu_description": "",
    "sort_order": 156,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "underfloor-heating",
    "slug": "underfloor-heating",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Тепла підлога",
    "short_title": "Тепла підлога",
    "description": "Колектори та вузли розподілу контурів водяної теплої підлоги.",
    "menu_description": "",
    "sort_order": 160,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "automation",
    "slug": "automation",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Автоматика опалення",
    "short_title": "Автоматика опалення",
    "description": "Термостати, контролери, зональне керування, датчики та комунікаційні модулі для систем опалення.",
    "menu_description": "",
    "sort_order": 170,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "room-thermostats",
    "slug": "room-thermostats",
    "parent_stable_id": "automation",
    "level": 3,
    "title": "Кімнатні термостати й програматори",
    "short_title": "Термостати",
    "description": "Кімнатне керування температурою, розкладом і режимами опалення.",
    "menu_description": "",
    "sort_order": 171,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heating-controllers",
    "slug": "system-controllers",
    "parent_stable_id": "automation",
    "level": 3,
    "title": "Контролери котлів і систем",
    "short_title": "Контролери",
    "description": "Контролери котлів, насосів, клапанів і комплексних систем опалення.",
    "menu_description": "",
    "sort_order": 172,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "zone-control",
    "slug": "zone-control",
    "parent_stable_id": "automation",
    "level": 3,
    "title": "Зональне керування й приводи",
    "short_title": "Зональне керування",
    "description": "Контролери зон, термостатичні приводи та модулі теплої підлоги.",
    "menu_description": "",
    "sort_order": 173,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heating-sensors-modules",
    "slug": "sensors-modules",
    "parent_stable_id": "automation",
    "level": 3,
    "title": "Датчики та комунікаційні модулі",
    "short_title": "Датчики й модулі",
    "description": "Датчики, ретранслятори, мережеві модулі та допоміжні компоненти автоматики.",
    "menu_description": "",
    "sort_order": 174,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "solar-thermal",
    "slug": "solar-thermal",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Сонячна теплова енергія",
    "short_title": "Геліосистеми",
    "description": "Сонячні колектори, баки та компоненти геліосистем.",
    "menu_description": "",
    "sort_order": 180,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "flue-systems",
    "slug": "flue-systems",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Димоходи для котлів",
    "short_title": "Димоходи",
    "description": "Коаксіальні, роздільні та каскадні системи димовидалення.",
    "menu_description": "",
    "sort_order": 190,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heating-components",
    "slug": "heating-components",
    "parent_stable_id": "heating",
    "level": 2,
    "title": "Комплектуючі для котлів і опалення",
    "short_title": "Комплектуючі",
    "description": "Монтажні, сервісні та фірмові компоненти котельного обладнання.",
    "menu_description": "",
    "sort_order": 200,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "boiler-doors-grates",
    "slug": "doors-grates",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Двері, рами та колосники",
    "short_title": "Двері й колосники",
    "description": "Двері, лутки, рами, колосники та зачепи для котлів.",
    "menu_description": "",
    "sort_order": 201,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pellet-hoppers-augers",
    "slug": "hoppers-augers",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Бункери та шнекова подача",
    "short_title": "Бункери й шнеки",
    "description": "Пелетні бункери, шнеки та компоненти систем подачі палива.",
    "menu_description": "",
    "sort_order": 202,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "boiler-fans",
    "slug": "boiler-fans",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Вентилятори для котлів",
    "short_title": "Вентилятори",
    "description": "Наддувні та витяжні вентилятори котельного обладнання.",
    "menu_description": "",
    "sort_order": 203,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "boiler-cleaning-systems",
    "slug": "cleaning-systems",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Системи очищення котлів",
    "short_title": "Очищення котлів",
    "description": "Пневматичні та інші системи автоматичного очищення.",
    "menu_description": "",
    "sort_order": 204,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "boiler-hydraulic-nodes",
    "slug": "boiler-hydraulic-nodes",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Гідравлічні вузли котелень",
    "short_title": "Гідровузли",
    "description": "Гідравлічні модулі та вузли обв’язки котельного обладнання.",
    "menu_description": "",
    "sort_order": 205,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "heating-fittings",
    "slug": "fittings-adapters",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Муфти, переходи й адаптери",
    "short_title": "Муфти й адаптери",
    "description": "З’єднувальні елементи для колекторів, насосних груп і гідророздільників.",
    "menu_description": "",
    "sort_order": 206,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "branded-heating-accessories",
    "slug": "brand-accessories",
    "parent_stable_id": "heating-components",
    "level": 3,
    "title": "Інші фірмові комплектуючі",
    "short_title": "Інші комплектуючі",
    "description": "Інші підтверджені виробниками компоненти для монтажу, модернізації та сервісу.",
    "menu_description": "",
    "sort_order": 207,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "water-pumps",
    "slug": "water-pumps",
    "parent_stable_id": "water-supply",
    "level": 2,
    "title": "Насоси",
    "short_title": "Насоси",
    "description": "Насоси й комплектні установки за джерелом води та задачею.",
    "menu_description": "",
    "sort_order": 210,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "borehole-pumps",
    "slug": "borehole-pumps",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Свердловинні насоси",
    "short_title": "Свердловинні",
    "description": "Занурювальні насоси й системи для свердловин та колодязів.",
    "menu_description": "",
    "sort_order": 211,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "surface-pumps",
    "slug": "surface-pumps",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Поверхневі насоси",
    "short_title": "Поверхневі",
    "description": "Поверхневі насоси для водопостачання, поливу й дощової води.",
    "menu_description": "",
    "sort_order": 212,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "multistage-pumps",
    "slug": "multistage-pumps",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Багатоступеневі насоси",
    "short_title": "Багатоступеневі",
    "description": "Горизонтальні багатоступеневі насоси для водопостачання та поливу.",
    "menu_description": "",
    "sort_order": 213,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pressure-boosting",
    "slug": "pressure-boosting",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Підвищення тиску й насосні станції",
    "short_title": "Підвищення тиску",
    "description": "Насоси та установки для стабілізації тиску у водопостачанні.",
    "menu_description": "",
    "sort_order": 214,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "drainage-pumps",
    "slug": "drainage-pumps",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Дренажні насоси",
    "short_title": "Дренажні",
    "description": "Насоси для відведення дренажної та забрудненої води без фекалій.",
    "menu_description": "",
    "sort_order": 215,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "sewage-pumps",
    "slug": "sewage-pumps",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Каналізаційні та фекальні насоси",
    "short_title": "Каналізаційні насоси",
    "description": "Насоси для перекачування стічних і фекальних вод.",
    "menu_description": "",
    "sort_order": 216,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "sewage-lifting-units",
    "slug": "sewage-lifting-units",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Каналізаційні установки",
    "short_title": "Каналізаційні установки",
    "description": "Готові напірні установки для відведення стоків із санвузлів і будівель.",
    "menu_description": "",
    "sort_order": 217,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pool-pumps-filtration",
    "slug": "pool-pumps-filtration",
    "parent_stable_id": "water-pumps",
    "level": 3,
    "title": "Насоси та фільтрація для басейнів",
    "short_title": "Для басейнів",
    "description": "Насоси й фільтрувальні станції для приватних басейнів.",
    "menu_description": "",
    "sort_order": 218,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "water-supply-components",
    "slug": "components",
    "parent_stable_id": "water-supply",
    "level": 2,
    "title": "Баки, автоматика й комплектуючі",
    "short_title": "Комплектуючі",
    "description": "Баки, контролери та монтажні компоненти насосного обладнання.",
    "menu_description": "",
    "sort_order": 220,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pressure-tanks",
    "slug": "pressure-tanks",
    "parent_stable_id": "water-supply-components",
    "level": 3,
    "title": "Мембранні баки",
    "short_title": "Мембранні баки",
    "description": "Напірні мембранні баки для запасу води й стабілізації тиску.",
    "menu_description": "",
    "sort_order": 221,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pump-automation",
    "slug": "pump-automation",
    "parent_stable_id": "water-supply-components",
    "level": 3,
    "title": "Автоматика насосів",
    "short_title": "Автоматика насосів",
    "description": "Контролери запуску, зупинки й захисту насосів.",
    "menu_description": "",
    "sort_order": 222,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pump-accessories",
    "slug": "pump-accessories",
    "parent_stable_id": "water-supply-components",
    "level": 3,
    "title": "Монтажні комплектуючі для насосів",
    "short_title": "Комплектуючі",
    "description": "Клапани, колектори, кабелі, монтажні комплекти та інші компоненти.",
    "menu_description": "",
    "sort_order": 223,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "pump-services",
    "slug": "pump-services",
    "parent_stable_id": "water-supply-components",
    "level": 3,
    "title": "Пусконалагодження насосного обладнання",
    "short_title": "Пусконалагодження",
    "description": "Сервісна позиція, доступна через сервісний центр, а не товарну видачу.",
    "menu_description": "",
    "sort_order": 229,
    "status": "internal",
    "visibility": "service",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "drinking-water-systems",
    "slug": "drinking-water",
    "parent_stable_id": "water-treatment",
    "level": 2,
    "title": "Питна вода",
    "short_title": "Питна вода",
    "description": "Системи під мийку для приготування питної води.",
    "menu_description": "",
    "sort_order": 310,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "reverse-osmosis",
    "slug": "reverse-osmosis",
    "parent_stable_id": "drinking-water-systems",
    "level": 3,
    "title": "Зворотний осмос",
    "short_title": "Зворотний осмос",
    "description": "Побутові та професійні системи зворотного осмосу.",
    "menu_description": "",
    "sort_order": 311,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "flow-filters",
    "slug": "flow-filters",
    "parent_stable_id": "drinking-water-systems",
    "level": 3,
    "title": "Проточні фільтри",
    "short_title": "Проточні фільтри",
    "description": "Проточні системи доочищення питної води.",
    "menu_description": "",
    "sort_order": 312,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "whole-house-treatment",
    "slug": "whole-house",
    "parent_stable_id": "water-treatment",
    "level": 2,
    "title": "Очищення води для будинку",
    "short_title": "Для всього будинку",
    "description": "Системи підготовки води на вході до будинку або комерційного об’єкта.",
    "menu_description": "",
    "sort_order": 320,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "complex-treatment",
    "slug": "complex-treatment",
    "parent_stable_id": "whole-house-treatment",
    "level": 3,
    "title": "Комплексне очищення",
    "short_title": "Комплексне очищення",
    "description": "Системи одночасного видалення кількох типів домішок.",
    "menu_description": "",
    "sort_order": 321,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "water-softening",
    "slug": "water-softening",
    "parent_stable_id": "whole-house-treatment",
    "level": 3,
    "title": "Пом’якшення води",
    "short_title": "Пом’якшення",
    "description": "Системи зниження жорсткості води.",
    "menu_description": "",
    "sort_order": 322,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "chlorine-odor-removal",
    "slug": "chlorine-odor-removal",
    "parent_stable_id": "whole-house-treatment",
    "level": 3,
    "title": "Видалення хлору та запаху",
    "short_title": "Хлор і запах",
    "description": "Системи видалення хлору, запахів і органічних домішок.",
    "menu_description": "",
    "sort_order": 323,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "mechanical-treatment",
    "slug": "mechanical-treatment",
    "parent_stable_id": "whole-house-treatment",
    "level": 3,
    "title": "Механічне очищення",
    "short_title": "Механічне очищення",
    "description": "Системи попереднього очищення від піску, мулу та іржі.",
    "menu_description": "",
    "sort_order": 324,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "mainline-filtration",
    "slug": "mainline-filtration",
    "parent_stable_id": "water-treatment",
    "level": 2,
    "title": "Магістральна фільтрація",
    "short_title": "Магістральні фільтри",
    "description": "Корпуси та картриджі для очищення води на вході.",
    "menu_description": "",
    "sort_order": 330,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "mainline-filters-housings",
    "slug": "filter-housings",
    "parent_stable_id": "mainline-filtration",
    "level": 3,
    "title": "Корпуси магістральних фільтрів",
    "short_title": "Корпуси фільтрів",
    "description": "Корпуси та готові магістральні фільтри.",
    "menu_description": "",
    "sort_order": 331,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "mainline-cartridges",
    "slug": "mainline-cartridges",
    "parent_stable_id": "mainline-filtration",
    "level": 3,
    "title": "Картриджі магістральних фільтрів",
    "short_title": "Магістральні картриджі",
    "description": "Змінні картриджі для магістрального очищення води.",
    "menu_description": "",
    "sort_order": 332,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "replacement-elements",
    "slug": "replacement-elements",
    "parent_stable_id": "water-treatment",
    "level": 2,
    "title": "Змінні елементи питних систем",
    "short_title": "Змінні елементи",
    "description": "Комплекти та окремі картриджі для питних систем.",
    "menu_description": "",
    "sort_order": 340,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "drinking-system-cartridges",
    "slug": "drinking-system-cartridges",
    "parent_stable_id": "replacement-elements",
    "level": 3,
    "title": "Картриджі питних систем",
    "short_title": "Картриджі питних систем",
    "description": "Змінні елементи для проточних фільтрів і систем зворотного осмосу.",
    "menu_description": "",
    "sort_order": 341,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "materials-reagents",
    "slug": "materials-reagents",
    "parent_stable_id": "water-treatment",
    "level": 2,
    "title": "Завантаження та реагенти",
    "short_title": "Матеріали",
    "description": "Фільтрувальні завантаження й матеріали для систем очищення.",
    "menu_description": "",
    "sort_order": 350,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "filter-media",
    "slug": "filter-media",
    "parent_stable_id": "materials-reagents",
    "level": 3,
    "title": "Фільтрувальні матеріали",
    "short_title": "Фільтрувальні матеріали",
    "description": "Завантаження та матеріали для систем очищення води.",
    "menu_description": "",
    "sort_order": 351,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "water-disinfection",
    "slug": "disinfection",
    "parent_stable_id": "water-treatment",
    "level": 2,
    "title": "Знезараження води",
    "short_title": "Знезараження",
    "description": "Обладнання для безреагентного знезараження проточної води.",
    "menu_description": "",
    "sort_order": 360,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "uv-disinfection",
    "slug": "uv-c-lamps",
    "parent_stable_id": "water-disinfection",
    "level": 3,
    "title": "Проточні UV-C лампи",
    "short_title": "UV-C лампи",
    "description": "Проточні ультрафіолетові лампи для знезараження питної та побутової води.",
    "menu_description": "",
    "sort_order": 361,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-home-hubs",
    "slug": "hubs-panels",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Центральні блоки та панелі",
    "short_title": "Блоки й панелі",
    "description": "Головні контролери, панелі та інтерфейси системи Sinum.",
    "menu_description": "",
    "sort_order": 410,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-lighting",
    "slug": "lighting-switches",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Освітлення, вимикачі й димери",
    "short_title": "Освітлення",
    "description": "Сенсорні вимикачі, димери й RGB-модулі керування освітленням.",
    "menu_description": "",
    "sort_order": 420,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-shutters",
    "slug": "shutters-blinds",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Керування ролетами та жалюзі",
    "short_title": "Ролети й жалюзі",
    "description": "Вимикачі та модулі автоматизації ролет і жалюзі.",
    "menu_description": "",
    "sort_order": 430,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-relays",
    "slug": "relays-sockets",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Реле, розетки та DIN-модулі",
    "short_title": "Реле й розетки",
    "description": "Силові реле, розетки, вхідні плати та модулі для щита.",
    "menu_description": "",
    "sort_order": 440,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-sensors",
    "slug": "sensors-security",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Датчики, безпека та якість повітря",
    "short_title": "Датчики й безпека",
    "description": "Датчики диму, протікання, відкривання, руху та якості повітря.",
    "menu_description": "",
    "sort_order": 450,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-climate",
    "slug": "climate-control",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Клімат і терморегуляція",
    "short_title": "Клімат",
    "description": "Терморегулятори, клапани та модулі кліматичного керування Sinum.",
    "menu_description": "",
    "sort_order": 460,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "smart-accessories",
    "slug": "power-connectivity",
    "parent_stable_id": "smart-home",
    "level": 2,
    "title": "Живлення, зв’язок і монтаж",
    "short_title": "Живлення й монтаж",
    "description": "Блоки живлення, кабелі, ретранслятори, рамки та монтажні аксесуари.",
    "menu_description": "",
    "sort_order": 470,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "air-conditioners",
    "slug": "air-conditioners",
    "parent_stable_id": "climate",
    "level": 2,
    "title": "Кондиціонери",
    "short_title": "Кондиціонери",
    "description": "Побутові спліт- і мультиспліт-системи для охолодження та обігріву.",
    "menu_description": "",
    "sort_order": 510,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "humidification",
    "slug": "humidification",
    "parent_stable_id": "climate",
    "level": 2,
    "title": "Туманоутворення та зволоження",
    "short_title": "Туманоутворення",
    "description": "Готові системи та комплектуючі для туманоутворення й охолодження повітря.",
    "menu_description": "",
    "sort_order": 520,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "misting-systems",
    "slug": "systems",
    "parent_stable_id": "humidification",
    "level": 3,
    "title": "Системи туманоутворення",
    "short_title": "Готові системи",
    "description": "Комплектні системи туманоутворення за кількістю форсунок.",
    "menu_description": "",
    "sort_order": 521,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "misting-components",
    "slug": "components",
    "parent_stable_id": "humidification",
    "level": 3,
    "title": "Компоненти туманоутворення",
    "short_title": "Компоненти",
    "description": "Форсунки, трубки, з’єднання та монтажні компоненти систем.",
    "menu_description": "",
    "sort_order": 522,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  },
  {
    "stable_id": "feed-grinders",
    "slug": "feed-grinders",
    "parent_stable_id": "household-equipment",
    "level": 2,
    "title": "Кормоподрібнювачі",
    "short_title": "Кормоподрібнювачі",
    "description": "Електричні подрібнювачі зернових культур і коренеплодів.",
    "menu_description": "",
    "sort_order": 610,
    "status": "active",
    "visibility": "catalog",
    "seo_title": null,
    "seo_description": null
  }
]$seed$::jsonb) as seed(
  stable_id text, slug text, parent_stable_id text, level smallint, title text,
  short_title text, description text, menu_description text, sort_order integer,
  status text, visibility text, seo_title text, seo_description text
);

do $seed_categories$
declare
  current_level smallint;
begin
  for current_level in 1..(select max(level) from _seed_categories) loop
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
      seed.status::public.category_status,
      seed.visibility::public.category_visibility,
      seed.seo_title,
      seed.seo_description
    from _seed_categories seed
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

insert into public.attribute_definitions (
  stable_id, label, value_type, unit, filterable, sortable, sort_order,
  aliases, normalization_config, status
)
select
  stable_id, label, value_type::public.attribute_value_type, unit,
  filterable, sortable, sort_order, aliases, normalization_config,
  status::public.record_status
from jsonb_to_recordset($seed$[
  {
    "stable_id": "productType",
    "label": "Тип обладнання",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 1,
    "aliases": [
      {
        "pattern": "^тип обладнання$",
        "flags": "i"
      },
      {
        "pattern": "^тип продукту$",
        "flags": "i"
      },
      {
        "pattern": "^категорія$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "purpose",
    "label": "Призначення",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 2,
    "aliases": [
      {
        "pattern": "^призначення$",
        "flags": "i"
      },
      {
        "pattern": "^застосування$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "type",
    "label": "Тип",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 3,
    "aliases": [
      {
        "pattern": "^тип$",
        "flags": "i"
      },
      {
        "pattern": "^виконання$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "technology",
    "label": "Технологія очищення",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 4,
    "aliases": [
      {
        "pattern": "^технологія(?: очищення)?$",
        "flags": "i"
      },
      {
        "pattern": "^технология$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "waterSource",
    "label": "Джерело води",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 5,
    "aliases": [
      {
        "pattern": "^джерело води$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "installation",
    "label": "Монтаж",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 6,
    "aliases": [
      {
        "pattern": "^монтаж$",
        "flags": "i"
      },
      {
        "pattern": "^встановлення$",
        "flags": "i"
      },
      {
        "pattern": "^спосіб встановлення$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "capacityLh",
    "label": "Продуктивність, л/год",
    "value_type": "number",
    "unit": "л/год",
    "filterable": true,
    "sortable": false,
    "sort_order": 7,
    "aliases": [
      {
        "pattern": "^продуктивність(?:,?\\s*л\\/год)?$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "flowM3h",
    "label": "Продуктивність, м³/год",
    "value_type": "number",
    "unit": "м³/год",
    "filterable": true,
    "sortable": false,
    "sort_order": 8,
    "aliases": [
      {
        "pattern": "^qmax$",
        "flags": "i"
      },
      {
        "pattern": "^gmax$",
        "flags": "i"
      },
      {
        "pattern": "^макс\\.?\\s*продуктивність$",
        "flags": "i"
      },
      {
        "pattern": "^максимальна витрата$",
        "flags": "i"
      },
      {
        "pattern": "^витрата$",
        "flags": "i"
      },
      {
        "pattern": "^пропускна здатність(?:\\s*\\(м[³3]\\/год\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^швидкість потоку(?:\\s*\\(м[³3]\\/год\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^номінальна витрата$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "capacityKgh",
    "label": "Продуктивність, кг/год",
    "value_type": "number",
    "unit": "кг/год",
    "filterable": true,
    "sortable": false,
    "sort_order": 8.1,
    "aliases": [
      {
        "pattern": "^продуктивність(?:,?\\s*кг\\/год)?$",
        "flags": "i"
      },
      {
        "pattern": "^продуктивність.*кг\\/год$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "rotationRpm",
    "label": "Частота обертання, об/хв",
    "value_type": "number",
    "unit": "об/хв",
    "filterable": true,
    "sortable": false,
    "sort_order": 8.2,
    "aliases": [
      {
        "pattern": "^частота обертання$",
        "flags": "i"
      },
      {
        "pattern": "^оберти двигуна$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "kvs",
    "label": "Kvs, м³/год",
    "value_type": "number",
    "unit": "м³/год",
    "filterable": true,
    "sortable": false,
    "sort_order": 9,
    "aliases": [
      {
        "pattern": "^kvs(?:\\s*\\(.+\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^kv$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "headM",
    "label": "Максимальний напір, м",
    "value_type": "number",
    "unit": "м",
    "filterable": true,
    "sortable": false,
    "sort_order": 9,
    "aliases": [
      {
        "pattern": "^hmax$",
        "flags": "i"
      },
      {
        "pattern": "^макс\\.?\\s*напір$",
        "flags": "i"
      },
      {
        "pattern": "^максимальний напір$",
        "flags": "i"
      },
      {
        "pattern": "^висота підйому$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "powerKw",
    "label": "Потужність, кВт",
    "value_type": "number",
    "unit": "кВт",
    "filterable": true,
    "sortable": false,
    "sort_order": 10,
    "aliases": [
      {
        "pattern": "^потужність$",
        "flags": "i"
      },
      {
        "pattern": "^споживана потужність$",
        "flags": "i"
      },
      {
        "pattern": "^макс\\.?\\s*споживана потужність$",
        "flags": "i"
      },
      {
        "pattern": "^мощность$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "heatOutputKw",
    "label": "Теплова потужність, кВт",
    "value_type": "number",
    "unit": "кВт",
    "filterable": true,
    "sortable": false,
    "sort_order": 11,
    "aliases": [
      {
        "pattern": "^теплова потужність$",
        "flags": "i"
      },
      {
        "pattern": "^номінальна теплова потужність$",
        "flags": "i"
      },
      {
        "pattern": "^максимальна номінальна теплопродуктивність",
        "flags": "i"
      },
      {
        "pattern": "^макс\\. номінальне теплове навантаження",
        "flags": "i"
      },
      {
        "pattern": "^потужність опалення$",
        "flags": "i"
      },
      {
        "pattern": "^потужність макс\\.",
        "flags": "i"
      },
      {
        "pattern": "^qmax:.*(?:20|10)",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "coolingCapacityKw",
    "label": "Потужність охолодження, кВт",
    "value_type": "number",
    "unit": "кВт",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.05,
    "aliases": [
      {
        "pattern": "^потужність охолодження$",
        "flags": "i"
      },
      {
        "pattern": "^холодопродуктивність$",
        "flags": "i"
      },
      {
        "pattern": "^номінальна потужність.*охолодження",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "dhwFlowLMin",
    "label": "Продуктивність ГВП, л/хв",
    "value_type": "number",
    "unit": "л/хв",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.06,
    "aliases": [
      {
        "pattern": "^продуктивність гвп",
        "flags": "i"
      },
      {
        "pattern": "^витрата гарячої води",
        "flags": "i"
      },
      {
        "pattern": "^кількість гарячої води",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "energyClass",
    "label": "Клас енергоефективності",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 11.07,
    "aliases": [
      {
        "pattern": "^клас енергоспоживання$",
        "flags": "i"
      },
      {
        "pattern": "^клас енергоефективності$",
        "flags": "i"
      },
      {
        "pattern": "^енергетичний клас$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "refrigerant",
    "label": "Холодоагент",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 11.08,
    "aliases": [
      {
        "pattern": "^холодоагент$",
        "flags": "i"
      },
      {
        "pattern": "^тип холодоагенту$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "cop",
    "label": "COP",
    "value_type": "number",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 11.09,
    "aliases": [
      {
        "pattern": "^cop(?:\\s|$)",
        "flags": "i"
      },
      {
        "pattern": "^коефіцієнт перетворення cop",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "scop",
    "label": "SCOP",
    "value_type": "number",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 11.1,
    "aliases": [
      {
        "pattern": "^scop(?:\\s|$)",
        "flags": "i"
      },
      {
        "pattern": "^сезонний коефіцієнт.*scop",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "seer",
    "label": "SEER",
    "value_type": "number",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 11.11,
    "aliases": [
      {
        "pattern": "^seer(?:\\s|$)",
        "flags": "i"
      },
      {
        "pattern": "^сезонний коефіцієнт.*seer",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "soundLevelDb",
    "label": "Рівень шуму, дБ",
    "value_type": "number",
    "unit": "дБ",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.12,
    "aliases": [
      {
        "pattern": "^рівень (?:звуку|шуму)",
        "flags": "i"
      },
      {
        "pattern": "^звукова потужність",
        "flags": "i"
      },
      {
        "pattern": "^рівень звукової потужності",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "collectorAreaM2",
    "label": "Площа колектора, м²",
    "value_type": "number",
    "unit": "м²",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.13,
    "aliases": [
      {
        "pattern": "^площа колектора$",
        "flags": "i"
      },
      {
        "pattern": "^загальна площа$",
        "flags": "i"
      },
      {
        "pattern": "^площа абсорбера$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "fuel",
    "label": "Паливо",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 11.1,
    "aliases": [
      {
        "pattern": "^паливо$",
        "flags": "i"
      },
      {
        "pattern": "^вид палива$",
        "flags": "i"
      },
      {
        "pattern": "^основне паливо$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "efficiencyPercent",
    "label": "ККД, %",
    "value_type": "number",
    "unit": "%",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.2,
    "aliases": [
      {
        "pattern": "^ккд",
        "flags": "i"
      },
      {
        "pattern": "^коефіцієнт корисної дії",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "waterVolumeL",
    "label": "Водяна ємність, л",
    "value_type": "number",
    "unit": "л",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.3,
    "aliases": [
      {
        "pattern": "^водяна ємність котла",
        "flags": "i"
      },
      {
        "pattern": "^об[’'`]?єм води",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "fireboxVolumeL",
    "label": "Об’єм топки, л",
    "value_type": "number",
    "unit": "л",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.4,
    "aliases": [
      {
        "pattern": "^об[’'`]?єм топки",
        "flags": "i"
      },
      {
        "pattern": "^топка:\\s*об[’'`]?єм",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "chimneyDiameterMm",
    "label": "Діаметр димоходу, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.5,
    "aliases": [
      {
        "pattern": "^діаметр димоходу",
        "flags": "i"
      },
      {
        "pattern": "^приєднувальні розміри димоходу",
        "flags": "i"
      },
      {
        "pattern": "^рекомендовані параметри димоходу:\\s*внутрішній діаметр",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "chimneyHeightM",
    "label": "Мінімальна висота димоходу, м",
    "value_type": "number",
    "unit": "м",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.6,
    "aliases": [
      {
        "pattern": "^мінімальна висота димоходу",
        "flags": "i"
      },
      {
        "pattern": "^рекомендовані параметри димоходу:\\s*висота",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "consumptionPowerW",
    "label": "Споживання електроенергії, Вт",
    "value_type": "number",
    "unit": "Вт",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.7,
    "aliases": [
      {
        "pattern": "^споживання електроенергії",
        "flags": "i"
      },
      {
        "pattern": "^електрична потужність",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "maxWaterTemperatureC",
    "label": "Максимальна температура води, °C",
    "value_type": "number",
    "unit": "°C",
    "filterable": true,
    "sortable": false,
    "sort_order": 11.8,
    "aliases": [
      {
        "pattern": "^максимальна температура води",
        "flags": "i"
      },
      {
        "pattern": "^макс\\.? температура теплоносія",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "mountingLengthMm",
    "label": "Монтажна довжина, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": true,
    "sortable": false,
    "sort_order": 12,
    "aliases": [
      {
        "pattern": "^довжина насоса$",
        "flags": "i"
      },
      {
        "pattern": "^монтажна довжина$",
        "flags": "i"
      },
      {
        "pattern": "^будівельна довжина$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "diameterMm",
    "label": "Діаметр, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": true,
    "sortable": false,
    "sort_order": 13,
    "aliases": [
      {
        "pattern": "^d\\s*\\(?мм\\)?$",
        "flags": "i"
      },
      {
        "pattern": "^d\\s*\\(?mm\\)?$",
        "flags": "i"
      },
      {
        "pattern": "^діаметр,?\\s*мм$",
        "flags": "i"
      },
      {
        "pattern": "^диаметр,?\\s*мм$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "widthMm",
    "label": "Ширина, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": false,
    "sortable": false,
    "sort_order": 14,
    "aliases": [
      {
        "pattern": "^ширина(?:\\s*\\(мм\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^w\\s*\\(?mm\\)?$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "heightMm",
    "label": "Висота, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": false,
    "sortable": false,
    "sort_order": 15,
    "aliases": [
      {
        "pattern": "^висота(?:\\s*\\(мм\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^h\\s*\\(?mm\\)?$",
        "flags": "i"
      },
      {
        "pattern": "^h\\s*\\(?мм\\)?$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "depthMm",
    "label": "Глибина, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": false,
    "sortable": false,
    "sort_order": 16,
    "aliases": [
      {
        "pattern": "^глибина(?:\\s*\\(мм\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^глубина(?:\\s*\\(мм\\))?$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "dimensions",
    "label": "Габарити",
    "value_type": "select",
    "unit": null,
    "filterable": false,
    "sortable": false,
    "sort_order": 16.5,
    "aliases": [
      {
        "pattern": "^розмір(?:и)?$",
        "flags": "i"
      },
      {
        "pattern": "^габарит(?:и|ні розміри)?$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "volumeL",
    "label": "Об’єм, л",
    "value_type": "number",
    "unit": "л",
    "filterable": true,
    "sortable": false,
    "sort_order": 17,
    "aliases": [
      {
        "pattern": "^об[’'`]?єм(?: бойлера| бака)?$",
        "flags": "i"
      },
      {
        "pattern": "^объем$",
        "flags": "i"
      },
      {
        "pattern": "^місткість$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "weightKg",
    "label": "Вага, кг",
    "value_type": "number",
    "unit": "кг",
    "filterable": false,
    "sortable": false,
    "sort_order": 18,
    "aliases": [
      {
        "pattern": "^вага(?:\\s*\\(кг\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^маса(?:\\s*\\(кг\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^weight$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "filtrationMicron",
    "label": "Тонкість фільтрації, мкм",
    "value_type": "number",
    "unit": "мкм",
    "filterable": true,
    "sortable": false,
    "sort_order": 19,
    "aliases": [
      {
        "pattern": "^тонкість фільтрації$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "pressureBar",
    "label": "Робочий тиск, бар",
    "value_type": "number",
    "unit": "бар",
    "filterable": true,
    "sortable": false,
    "sort_order": 15,
    "aliases": [
      {
        "pattern": "^робочий тиск$",
        "flags": "i"
      },
      {
        "pattern": "^макс\\.?\\s*тиск$",
        "flags": "i"
      },
      {
        "pattern": "^максимальний робочий тиск$",
        "flags": "i"
      },
      {
        "pattern": "^тиск максимальний$",
        "flags": "i"
      },
      {
        "pattern": "^давление$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "diameter",
    "label": "Діаметр / DN",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 16,
    "aliases": [
      {
        "pattern": "^dn$",
        "flags": "i"
      },
      {
        "pattern": "^діаметр$",
        "flags": "i"
      },
      {
        "pattern": "^диаметр$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "connection",
    "label": "Підключення",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 20,
    "aliases": [
      {
        "pattern": "^підключення$",
        "flags": "i"
      },
      {
        "pattern": "^приєднання$",
        "flags": "i"
      },
      {
        "pattern": "^підключення котла$",
        "flags": "i"
      },
      {
        "pattern": "^підключення системи$",
        "flags": "i"
      },
      {
        "pattern": "^підключення контура? опалення$",
        "flags": "i"
      },
      {
        "pattern": "^підключення до контуру опалення$",
        "flags": "i"
      },
      {
        "pattern": "^підключення до колектора$",
        "flags": "i"
      },
      {
        "pattern": "^підключення контурів$",
        "flags": "i"
      },
      {
        "pattern": "^різьба(?: підключення)?$",
        "flags": "i"
      },
      {
        "pattern": "^з'єднання$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "compatibility",
    "label": "Сумісність",
    "value_type": "select",
    "unit": null,
    "filterable": false,
    "sortable": false,
    "sort_order": 21,
    "aliases": [
      {
        "pattern": "^сумісність$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "protectionClass",
    "label": "Клас захисту",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 22,
    "aliases": [
      {
        "pattern": "^клас захисту$",
        "flags": "i"
      },
      {
        "pattern": "^ступінь захисту$",
        "flags": "i"
      },
      {
        "pattern": "^ip$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "outlets",
    "label": "Кількість виходів",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 18,
    "aliases": [
      {
        "pattern": "^кількість виходів$",
        "flags": "i"
      },
      {
        "pattern": "^виходи$",
        "flags": "i"
      },
      {
        "pattern": "^кількість контурів$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "material",
    "label": "Матеріал",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 19,
    "aliases": [
      {
        "pattern": "^матеріал корпусу$",
        "flags": "i"
      },
      {
        "pattern": "^матеріал$",
        "flags": "i"
      },
      {
        "pattern": "^материал$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "voltage",
    "label": "Живлення",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 20,
    "aliases": [
      {
        "pattern": "^напруга$",
        "flags": "i"
      },
      {
        "pattern": "^живлення$",
        "flags": "i"
      },
      {
        "pattern": "^привід\\s*\\/\\s*напруга$",
        "flags": "i"
      },
      {
        "pattern": "^напряжение$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "control",
    "label": "Тип керування",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 21,
    "aliases": [
      {
        "pattern": "^керування$",
        "flags": "i"
      },
      {
        "pattern": "^управління$",
        "flags": "i"
      },
      {
        "pattern": "^управление$",
        "flags": "i"
      },
      {
        "pattern": "^тип керування$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "communication",
    "label": "Спосіб зв’язку",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 21.1,
    "aliases": [
      {
        "pattern": "^комунікація$",
        "flags": "i"
      },
      {
        "pattern": "^спосіб зв[’'`]язку$",
        "flags": "i"
      },
      {
        "pattern": "^тип зв[’'`]язку$",
        "flags": "i"
      },
      {
        "pattern": "^зв[’'`]язок$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "zones",
    "label": "Кількість зон",
    "value_type": "number",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 21.2,
    "aliases": [
      {
        "pattern": "^кількість зон$",
        "flags": "i"
      },
      {
        "pattern": "^зони$",
        "flags": "i"
      },
      {
        "pattern": "^кількість приміщень$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "temperature",
    "label": "Температурний діапазон",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 22,
    "aliases": [
      {
        "pattern": "^діапазон температур$",
        "flags": "i"
      },
      {
        "pattern": "^температура рідини$",
        "flags": "i"
      },
      {
        "pattern": "^макс\\.?\\s*температура$",
        "flags": "i"
      },
      {
        "pattern": "^максимальна температура$",
        "flags": "i"
      },
      {
        "pattern": "^температура$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "eei",
    "label": "Індекс енергоефективності EEI",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 22.1,
    "aliases": [
      {
        "pattern": "^індекс енергетичної ефективності(?: \\(eei\\))?$",
        "flags": "i"
      },
      {
        "pattern": "^eei$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "selfPriming",
    "label": "Самовсмоктування",
    "value_type": "boolean",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 22.2,
    "aliases": [
      {
        "pattern": "^самовсмоктувальне виконання$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [
          "yes",
          "так",
          "да",
          "є"
        ],
        "false": [
          "no",
          "ні",
          "нет",
          "немає",
          "відсутнє"
        ]
      },
      "legacyValues": {
        "true": "yes",
        "false": "no"
      }
    },
    "status": "active"
  },
  {
    "stable_id": "maxImmersionDepthM",
    "label": "Максимальна глибина занурення, м",
    "value_type": "number",
    "unit": "м",
    "filterable": true,
    "sortable": false,
    "sort_order": 22.3,
    "aliases": [
      {
        "pattern": "^максимальна глибина занурення$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "freePassageMm",
    "label": "Вільний прохід, мм",
    "value_type": "number",
    "unit": "мм",
    "filterable": true,
    "sortable": false,
    "sort_order": 22.4,
    "aliases": [
      {
        "pattern": "^вільний сферичний прохід$",
        "flags": "i"
      },
      {
        "pattern": "^вільний прохід$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "cableLengthM",
    "label": "Довжина кабелю, м",
    "value_type": "number",
    "unit": "м",
    "filterable": true,
    "sortable": false,
    "sort_order": 22.5,
    "aliases": [
      {
        "pattern": "^довжина кабелю$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "floatSwitch",
    "label": "Поплавковий вимикач",
    "value_type": "boolean",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 22.6,
    "aliases": [
      {
        "pattern": "^поплавковий вимикач$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [
          "yes",
          "так",
          "да",
          "є"
        ],
        "false": [
          "no",
          "ні",
          "нет",
          "немає",
          "відсутній",
          "відсутнє"
        ]
      },
      "legacyValues": {
        "true": "да",
        "false": "немає"
      }
    },
    "status": "active"
  },
  {
    "stable_id": "waterType",
    "label": "Тип води",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 23,
    "aliases": [
      {
        "pattern": "^вода$",
        "flags": "i"
      },
      {
        "pattern": "^тип води$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "format",
    "label": "Формат / типорозмір",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 24,
    "aliases": [
      {
        "pattern": "^формат$",
        "flags": "i"
      },
      {
        "pattern": "^типорозмір$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "pump",
    "label": "Помпа",
    "value_type": "boolean",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 25,
    "aliases": [
      {
        "pattern": "^помпа$",
        "flags": "i"
      },
      {
        "pattern": "^насос підвищення тиску$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [
          "yes",
          "так",
          "да",
          "є"
        ],
        "false": [
          "no",
          "ні",
          "нет",
          "немає",
          "без помпи"
        ]
      },
      "legacyValues": {
        "true": "yes",
        "false": "no"
      }
    },
    "status": "active"
  },
  {
    "stable_id": "mineralizer",
    "label": "Мінералізація",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 26,
    "aliases": [
      {
        "pattern": "^мінералізація$",
        "flags": "i"
      },
      {
        "pattern": "^мінералізатор$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "flowType",
    "label": "Тип системи",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 27,
    "aliases": [
      {
        "pattern": "^тип системи$",
        "flags": "i"
      },
      {
        "pattern": "^формат системи$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  },
  {
    "stable_id": "scope",
    "label": "Для об’єкта",
    "value_type": "select",
    "unit": null,
    "filterable": true,
    "sortable": false,
    "sort_order": 28,
    "aliases": [
      {
        "pattern": "^для об'єкта$",
        "flags": "i"
      },
      {
        "pattern": "^сфера застосування$",
        "flags": "i"
      }
    ],
    "normalization_config": {
      "booleanValues": {
        "true": [],
        "false": []
      },
      "legacyValues": {}
    },
    "status": "active"
  }
]$seed$::jsonb) as seed(
  stable_id text, label text, value_type text, unit text, filterable boolean,
  sortable boolean, sort_order numeric, aliases jsonb,
  normalization_config jsonb, status text
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

insert into public.category_attributes (
  category_id, attribute_id, facet_enabled, required, sort_order, display_group
)
select
  category.internal_id,
  attribute.internal_id,
  seed.facet_enabled,
  seed.required,
  seed.sort_order,
  seed.display_group
from jsonb_to_recordset($seed$[
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "water-treatment",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "efficiencyPercent",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "dhwFlowLMin",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "energyClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "dimensions",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "gas-boilers",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "fuel",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "efficiencyPercent",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "waterVolumeL",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "maxWaterTemperatureC",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "chimneyDiameterMm",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "solid-fuel-boilers",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "fuel",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "efficiencyPercent",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "waterVolumeL",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "maxWaterTemperatureC",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "chimneyDiameterMm",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-boilers",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-burners",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "fuel",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "efficiencyPercent",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "waterVolumeL",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "maxWaterTemperatureC",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "chimneyDiameterMm",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "heat-generators",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "fuel",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "capacityKgh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "efficiencyPercent",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "steam-generators",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "coolingCapacityKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "refrigerant",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "cop",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "scop",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "energyClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "soundLevelDb",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "maxWaterTemperatureC",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "dimensions",
    "facet_enabled": false,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "heat-pumps",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "volumeL",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "maxWaterTemperatureC",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "dimensions",
    "facet_enabled": false,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "hot-water-tanks",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "volumeL",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "widthMm",
    "facet_enabled": false,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "heightMm",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heat-accumulators",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "circulation-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "system-circulation-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "dhw-circulation-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-hydraulics",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pump-groups",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "distribution-manifolds",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "manifolds-with-hydraulic-separator",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "hydraulic-separators",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "air-dirt-separators",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heating-valves",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "underfloor-heating",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "underfloor-heating",
    "attribute_stable_id": "outlets",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "underfloor-heating",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "underfloor-heating",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "underfloor-heating",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "automation",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "room-thermostats",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heating-controllers",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "zone-control",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heating-sensors-modules",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "collectorAreaM2",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "maxWaterTemperatureC",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "dimensions",
    "facet_enabled": false,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "solar-thermal",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "flue-systems",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heating-components",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-doors-grates",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pellet-hoppers-augers",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-fans",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-cleaning-systems",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "boiler-hydraulic-nodes",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "heating-fittings",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "branded-heating-accessories",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "borehole-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "surface-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "multistage-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-boosting",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "drainage-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-pumps",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "sewage-lifting-units",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "pool-pumps-filtration",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "volumeL",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pressure-tanks",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pump-automation",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "pump-accessories",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "pump-services",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "pump-services",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "reverse-osmosis",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "flow-filters",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "complex-treatment",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "water-softening",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "chlorine-odor-removal",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "mechanical-treatment",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-filters-housings",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "mainline-cartridges",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "drinking-system-cartridges",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "purpose",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "waterSource",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "technology",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "capacityLh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "waterType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "format",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "pump",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "mineralizer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "flowType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "filter-media",
    "attribute_stable_id": "scope",
    "facet_enabled": true,
    "required": false,
    "sort_order": 11,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "uv-disinfection",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "smart-home-hubs",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "smart-lighting",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "smart-shutters",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "smart-relays",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "smart-sensors",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "communication",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "zones",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "installation",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "smart-climate",
    "attribute_stable_id": "temperature",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "smart-accessories",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "coolingCapacityKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "heatOutputKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "refrigerant",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "seer",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "scop",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "energyClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "soundLevelDb",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "dimensions",
    "facet_enabled": false,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "air-conditioners",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 10,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "headM",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "flowM3h",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "pressureBar",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 8,
    "display_group": null
  },
  {
    "category_stable_id": "misting-systems",
    "attribute_stable_id": "control",
    "facet_enabled": true,
    "required": false,
    "sort_order": 9,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "type",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "compatibility",
    "facet_enabled": false,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "connection",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "material",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "consumptionPowerW",
    "facet_enabled": true,
    "required": false,
    "sort_order": 6,
    "display_group": null
  },
  {
    "category_stable_id": "misting-components",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 7,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "productType",
    "facet_enabled": true,
    "required": false,
    "sort_order": 0,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "powerKw",
    "facet_enabled": true,
    "required": false,
    "sort_order": 1,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "capacityKgh",
    "facet_enabled": true,
    "required": false,
    "sort_order": 2,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "rotationRpm",
    "facet_enabled": true,
    "required": false,
    "sort_order": 3,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "voltage",
    "facet_enabled": true,
    "required": false,
    "sort_order": 4,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "protectionClass",
    "facet_enabled": true,
    "required": false,
    "sort_order": 5,
    "display_group": null
  },
  {
    "category_stable_id": "feed-grinders",
    "attribute_stable_id": "weightKg",
    "facet_enabled": false,
    "required": false,
    "sort_order": 6,
    "display_group": null
  }
]$seed$::jsonb) as seed(
  category_stable_id text, attribute_stable_id text, facet_enabled boolean,
  required boolean, sort_order integer, display_group text
)
join public.categories category on category.stable_id = seed.category_stable_id
join public.attribute_definitions attribute on attribute.stable_id = seed.attribute_stable_id
on conflict (category_id, attribute_id) do update set
  facet_enabled = excluded.facet_enabled,
  required = excluded.required,
  sort_order = excluded.sort_order,
  display_group = excluded.display_group;

commit;
