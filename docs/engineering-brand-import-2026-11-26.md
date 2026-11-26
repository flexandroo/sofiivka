# Інженерний асортимент REHAU, Tweetop і OXI — 26.11.2026

**Статус: завершено. 8 005 погоджених товарів опубліковано в PROD; SQL-аудити, browser QA та фінальні live-перевірки — PASS.** Поточний обсяг REHAU — усе інженерне **без інструменту та його спеціальної оснастки**. Production-збірка READY; правильні прев’ю товарів підтверджені після виправлення OG/Twitter.

| Бренд | Опубліковано | Звіт |
| --- | ---: | --- |
| REHAU | 7 639 | [Труби, фітинги, опалення, каналізація, автоматика, зовнішні мережі та системні комплектуючі; без інструменту](rehau-import-2026-11-26.md) |
| Tweetop | 345 | [Прес-система, труби, монтажні компоненти та інструмент](tweetop-import-2026-11-25.md) |
| OXI | 21 | [Пелетні пальники EVO та Ceramic PRO](oxi-import-2026-11-25.md) |
| **Публічний випуск** | **8 005** | |

Початковий збір містив 7 905 перевірених REHAU товарів і 8 271 товар трьох брендів. Після останнього рішення користувача 266 REHAU SKU виключено з публікації: 260 інструментів/спеціальної оснастки та 6 багаторазових опресувальних заглушок. У джерелі ці шість прямо визначені як тимчасове випробувальне оснащення з інтегрованим повітровипускним клапаном. Звичайні системні заглушки, кліпси, кріплення, арматура та основні комплекти клапанів/колекторів з комплектним інструментом залишаються.

Exact exclusion list із SKU, sourceId, legacyId, призначенням та офіційними доказами: `imports/rehau-no-tools-exclusions.json`. Зберігаються три системні позиції, які початково помилково потрапили до tools category: RAUGEO 13524301002 та два набори повітровідвідників HKV-D P 14710571001/14710581001. Їхні доведені назви, категорії, одиниці й source provenance виправлені лише в новій scoped партії; деталі — у звіті REHAU.

## Поетапне продовження

Початковий job `engineering-brands-20261126-b733226f1110` має історичний manifest із 124 parent chunks. Для поточного обліку використано **лише parents 1–74**: вони додали 5 011 товарів — REHAU 4 645, Tweetop 345, OXI 21. Серед них 196 виключених тепер REHAU tools переведено у draft зі збереженням source data, галереї та документів. Решта 70 виключених SKU відсутні в БД, що підтвердив фінальний аудит. Старі parents 75–124 не використано для продовження.

Новий job — **`engineering-no-tools-20261126-58f77cb362d6`**, manifest `imports/releases/engineering-no-tools-20261126-58f77cb362d6/manifest.json`. Перед продовженням перевірка reference для партії 7 639 показала **4 449 existing, 3 190 ready, 0 blocked і 0 price changes**. Усі **3 190** нових записів решти опубліковано; вони належать **48 logical parent chunks**. Transport subdivision створював менші атомарні транзакції зі збереженням parent source_ref, exact source values та їхніх hashes.

Кілька `import_runs` з одним parent source_ref допустимі: успіх звірено за exact product IDs, distinct source_ref та сумою `records_succeeded`. Підсумок двох етапів — **8 201 власний source product: 8 005 published та 196 retained drafts**. Аудит підтвердив 222 import runs, усі 122 очікувані distinct source_ref, суму `records_succeeded` 8 201 і відсутність неочікуваних власних товарів або source_ref. Transport спочатку обмежено 600 KB, фінальне продовження — 300 KB. У derived SQL задано transaction-local statement_timeout 45s/90s, lock_timeout 5s та jit off; постійна конфігурація БД не змінювалася. Після тайм-аутів MCP exact IDs та стан транзакції перевірялися перед продовженням.

Для останніх parents 43–48 застосовано перевірений opt-in `--single-refresh=true`: замість першої повної побудови draft snapshot створюється мінімальний snapshot під тим самим pointer/release lock, після чого незмінний source UPDATE додає всі характеристики. Остаточна публікація будує повний snapshot/card один раз у тій самій транзакції. Чисті repo migrations та дві незалежні PGlite БД підтвердили повну рівність 75 реальних товарів із початковим подвійним refresh, включно з raw sourceEvidence, характеристиками, порядком, цінами, медіа, series, snapshots/cards, replay та rollback. Типовий режим helper і standalone draft SQL лишилися побайтово незмінними.

## Точні source counts

Це кількості рядків на товари, а не кількості унікальних медіафайлів. Характеристики наведено **після нормалізації import-check**, яку використовують source records і публічні snapshots.

| Набір | Товари | Image rows | Document rows | Рядки характеристик |
| --- | ---: | ---: | ---: | ---: |
| Початковий повний збір трьох брендів | 8 271 | 16 272 | 28 334 | 144 381 |
| Погоджений публічний scope без REHAU tools | 8 005 | 15 912 | 26 799 | 143 139 |
| Старий етап, parents 1–74 | 5 011 | 9 725 | 19 299 | 86 359 |
| Новий remainder | 3 190 | 6 453 | 8 680 | 57 672 |
| Збережені раніше імпортовані tools у draft | 196 | 266 | 1 180 | 892 |
| Усі власні товари після двох етапів, включно з draft tools | 8 201 | 16 178 | 27 979 | 144 031 |

Підсумковий облік: **19 629 products у БД, 19 327 published/public cards, 196 drafts, 47 hidden та 59 archived**. Вихідні 106 неопублікованих записів складаються з 47 прихованих і 59 архівних, а не з чернеток. Чернетками є 196 виключених tools власного імпорту. Типи й дані старих записів збережено; whole-row audit підтвердив їхню повну незмінність.

## Заморожені джерела й локальні перевірки

| Артефакт | SHA256 |
| --- | --- |
| Початковий `imports/rehau-2026-11-25.json`, 7 905 collected | `c927bdc6722bd8aaa4d37afe171379dea4b67055c308ed006d7481468ca4a963` |
| Поточний `imports/rehau-no-tools-2026-11-26.json`, 7 639 scoped | `6b64f10c1725f8daf7e69f01491429b957794f32b91ef86c7350ecda1639babf` |
| `imports/rehau-no-tools-exclusions.json`, 266 excluded | `d773b7930e6a7236674f7ec39f6d670882ffe0dd286ad4fd8e4bd49b9a2b86d1` |
| `imports/tweetop-2026-11-25.json` | `c81ea998e2734ffa75c8f87c46614f79d23f0efbbb72c5e3991b2598778d5f03` |
| `imports/oxi-2026-11-25.json` | `37474f16b2b37c2734e5537f84c1134571b63cde2acb352a4577b0e03719c502` |
| `imports/wave2-metadata.sql` | `2a46103cc930317a6304a38fa5455b47a97a31285f6d5258a74d76c665f9d381` |

Незалежна scope QA підтвердила exact 266 exclusions, усі 7 636 незмінених kept objects та збереження всіх вихідних sourceEvidence полів у трьох виправлених KEEP. Початковий frozen batch і джерельні медіа не переписано. Повноту UA 4 333 / DE 6 800 і весь union 8 298 підтверджує [source audit](rehau-ua-completeness-2026-11-26.md); 266 інструментів є scope exclusions, а не прогалиною збирання.

Історична PGlite-репетиція початкового scope: `imports/rehearsals/engineering-brands-20261126-b733226f1110-local.json`, PASS для 8 271 товару, exact source characteristics, цін, public cards, галереї й документів та незмінності sentinel. Окремі локальні subdivision-сценарії довели partial publication, завершення решти, точну рівність whole-parent baseline та ідемпотентні повтори parts/parent. Фактичний результат production окремо підтверджено фінальними аудитами нижче.

Поточний remainder також пройшов повну PGlite-репетицію: `imports/rehearsals/engineering-no-tools-20261126-58f77cb362d6-local.json`, 3 190 товарів / 48 chunks, PASS за 25 816 мс; максимум draft 306 мс, publication 238 мс, atomic replay 492 мс. Durable scope fixture `tests/fixtures/rehau-no-tools-scope.json` зберігає 266 виключень і три KEEP без залежності від ignored imports. Read-only `node scripts/import/verify-wave2-live.mjs` використовує цей fixture за замовчуванням; offline regression — 308 checks PASS.

Незалежна REHAU semantic/unit-регресія початкового frozen SHA містить 32 346 перевірок, 637/637 audited SKU, 15/15 контрольних SKU, 625 значень контурів, 4 точні кути, 36 self-tests; unresolved = 0. Для нового scope додатково звірено exact exclusions і три source-proven classification corrections.

Медіа локальні. Точний офіційний рисунок самого товару допускається як `MEASURED_DRAWING`; загальна монтажна схема чи сусідній варіант не підміняють товар. Поточні 7 639 REHAU посилаються на 2 780 локальних WebP та 309 PDF paths, що відповідають 293 різним PDF binary SHA; повтори source bindings між різними SKU не є новими файлами чи продуктами.

Для всіх 8 005 опублікованих товарів storefront price невідома: `price: null`, `priceCurrency: UAH`. Вихідні EUR/PLN-суми й одиниці залишаються source evidence; вони не видаються за UAH. Наявність джерела не стала наявністю магазину. Окрема перевірка row hashes підтвердила незмінність усіх вихідних 11 428 products, їхніх цін та пов'язаних даних.

## Фінальна перевірка PROD

Read-only `tmp/wave2-no-tools-final-audit.sql` виконано в PROD, **PASS**. SHA256 SQL: `08816a314c7ba6d99bd50815013b19287e2e5faf3fab82fbfdbb55b3b9a74b21`. Результат збережено в `imports/wave2-final-scope-audit.json`, SHA256 `bd88a49688c9e7f711e8ad3d7f0913f6ad30672e56638afcba740cb37d513a4a`. Усі 22 лічильники помилок дорівнюють нулю. Підтверджено:

- desired public IDs 7 639 REHAU + 345 Tweetop + 21 OXI, exact owners old 74 + new 48 source_ref;
- exact core/source checksums, повний sourceEvidence/whitelist, характеристики source record → snapshot sourceAttributes/unmappedAttributes;
- source-proven категорії, назви, моделі, описи, SEO, series, null UAH, галерею й документи в active public read model;
- 0 public для всіх 266 excluded tools, збереження 196 source-owned drafts та відсутність 70 never-imported SKU;
- точні source/global counts вище, без вимоги одного import_run на parent source_ref.

Незмінність старого каталогу підтверджено окремим `imports/wave2-old-data-final-audit.json`, **PASS**, SHA256 `9d44369e0f51a5bcc1b788f4a50ecc6441f1322612f5e3acd950dbf026110a08`. Baseline — product IDs із `created_at <= 2026-11-25T19:23:00.927981+00:00`; дочірні таблиці звірено тільки для цих IDs. Кількість published серед них залишилася 11 322. Усі count/hash пари точно рівні baseline:

| Старі дані | Рядків | MD5 повних рядків |
| --- | ---: | --- |
| Products | 11 428 | `e50641f0479b22cc540541a908522d0a` |
| Source records | 11 428 | `b54cb623cb1fb64f476b650f575ad81b` |
| Typed attributes | 34 026 | `a9e438f73447d3527a11abec4f64316c` |
| Source attributes | 95 444 | `468edf5dfb459e341221547271436421` |
| Media | 21 493 | `17f618778cc0f587e90352bc7e0acb8e` |
| Documents | 55 413 | `60520f7de1db6fd63fc41bd9d462e42c` |

Окремий protected-field hash також незмінний: `1e4122db4325e722b71c4ada34e3581b`.

Production-збірка з SEO-виправленням `49eedec4f57502bb35b2fadaf97bf4ccd8e7ece8` має статус **READY**, deployment `dpl_AVrqmRh6qEmYvH3KpZ6v5QxAE6HG`, основний alias [sofievka.vercel.app](https://sofievka.vercel.app): зібрано **19 327 публічних товарів і 19 489 sitemap URLs**, джерело Supabase PROD `fkjarsouuchjiedrrblc`, без помилок prerender/frame. Browser QA виконано на desktop 1 366 × 900 та mobile 390 × 844: Tweetop-фільтр товщини стінки 2 мм показав 43 результати, мобільний drawer відкривається й закривається. На REHAU PDP у desktop та Tweetop/OXI PDP у mobile відображаються справжні зображення й CTA запиту ціни; для Tweetop перевірено шість локальних PDF-посилань. Горизонтального overflow не виявлено. Протокол — `imports/wave2-browser-qa.json`.

Після цього деплою `node scripts/import/verify-wave2-live.mjs` — **309 checks PASS**, результат `imports/wave2-live-qa.json`: точні brand counts, усі 266 виключень, три збережені системні KEEP, typed filters, медіа/PDF, SSR title/description/canonical/robots/JSON-LD та правильний перший OG title. Фільтри дали 43 Tweetop труби зі стінкою 2 мм, 61 REHAU колектор із двома виходами та два OXI пальники 18 кВт. `node tests/live-smoke.mjs` — **181 checks PASS**, результат `imports/wave2-live-smoke-qa.json`: сторінки сайту, категорії, товари, sitemap, весь каталог і facets. Локальні `tests/seo-page-qa.mjs` та `tests/seo-qa.mjs` також PASS; регресії перевіряють заміну дубльованих social tags і правильне резервне зображення без логотипа.

Поточні незалежні quality gaps не змішані зі scope exclusions: REHAU — 20 поточних прогалин і 6 окремих legacy currentness candidates; Tweetop — 43 image gaps; OXI CP-1200 — немає достатнього exact-model технічного підтвердження. Повні причини наведені у відповідних звітах брендів.
