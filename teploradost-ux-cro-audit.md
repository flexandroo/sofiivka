# Teploradost: UX/UI, ecommerce, CRO та IA-аудит

**Версія дослідження:** 17 серпня 2026  
**Основний сайт:** [teploradost.com.ua](https://teploradost.com.ua/)  
**Формат:** робочий документ для Product Manager, UX/UI Designer, SEO, Content, Development і Ecommerce-команди.

> Важливо: це аудит публічної версії сайту та доступних без авторизації сценаріїв. Дані про конверсію, внутрішній пошук, повернення, маржинальність і підтримку не надані, тому бізнес-ефект окремих гіпотез потрібно підтвердити аналітикою та тестами. Конкретні UI-спостереження нижче перевірені на desktop і mobile, у каталозі, категорії, PDP, сервісах, пошуку та анонімному checkout.

## Методика і принцип рішення

Аудит оцінює не лише “красиво / некрасиво”, а шість робіт користувача:

1. Швидко знайти вже відомий товар за назвою, моделлю або кодом.
2. Зрозуміти, який товар підходить, якщо технічних знань немає.
3. Порівняти технічно схожі SKU без відкривання десяти вкладок.
4. Зібрати працездатну систему, не забувши монтажні компоненти.
5. Переконатися в сумісності, наявності, доставці, гарантії та документації.
6. Для PRO — перетворити специфікацію або повторне замовлення на кошик за хвилини.

Кожна ключова рекомендація сформульована як **Що змінити → Чому → Патерн / джерело**. Референси не пропонується копіювати буквально: з них вилучено механіку, яку треба адаптувати до української логістики, мов, оплати та звичок покупців.

---

# A. Executive summary

1. **Teploradost уже має сильний ecommerce-фундамент, але слабку систему пріоритетів.** Великий каталог, фільтри, порівняння, обране, бонуси, розстрочки, документи, відео, монтаж і сервіс — це активи. Проблема не у відсутності функцій, а в одночасній конкуренції всіх функцій за увагу.
2. **Головна сторінка зараз схожа на каталог промоакцій, а не на вхід до інженерного магазину.** Їй потрібні три чіткі маршрути: “Знаю, що шукаю”, “Підбираю обладнання”, “Потрібне комплексне рішення”.
3. **Каталог організований переважно мовою товарних груп.** Для B2C треба паралельний шлях “за задачею”: заміна котла, опалення будинку, тепла підлога, вода зі свердловини, підвищення тиску, рециркуляція ГВП тощо.
4. **Search — критичний фронт зростання.** Реальний autocomplete знаходить точну модель, кириличний бренд і внутрішній код, але `grunfos 25 60` повертає 0 результатів; dropdown містить лише п’ять товарів. Немає категорій, бренду, гайдів, наявності, коду та “виправлено на…”.
5. **Фільтри є функціональними, але не перетворюють інженерні параметри на рішення.** Потрібні категорійні шаблони, пояснення параметрів, одиниці виміру, популярні значення, залежні фасети, sticky-selected chips і результат без перезавантаження контексту.
6. **Картка товару в листингу перевантажена сервісними й промо-сигналами.** У першому шарі достатньо 2–4 диференціюючих параметрів, ціни, реальної наявності/терміну, коду і головного CTA. Відео, бонуси, кредитні провайдери та другорядні бейджі мають розкриватися за потреби.
7. **PDP містить багато потрібного, але не веде від рішення до впевненої покупки.** Верх сторінки має відповідати на п’ять питань: чи підходить, що входить, коли отримаю, скільки коштує система, хто допоможе встановити.
8. **Cross-sell треба розділити за семантикою.** “Потрібно для монтажу” — обов’язкове; “Сумісні товари” — технічно дозволене; “З цим купують” — поведінкове; “Аналоги” — взаємозамінне; “Готовий комплект” — валідована система. Змішування цих блоків створює ризик помилкового комплектування.
9. **PDP і категорії мають показувати сумісність як дані, а не маркетингову рекомендацію.** Для цього потрібна compatibility-модель у PIM: тип системи, приєднання, протокол, потужність, середовище, тиск, діаметр, покоління, обов’язковість компонента.
10. **B2C і PRO не треба розводити на два окремі магазини.** Один каталог може мати перемикач режиму взаємодії: “Для дому” дає пояснення, майстрів, калькулятори й рішення; “Для професіоналів” — коди, швидке замовлення, VAT-ціни, залишки, списки, специфікації та документи.
11. **Checkout технічно повний, але сприймається як довга форма.** Публічний сценарій має три кроки — контакти, доставка, оплата — плюс окремий кошик. Його слід зробити прогресивним, з guest checkout за замовчуванням, адресними підказками, чітким підсумком і мінімумом модальних відволікань.
12. **Mobile вже має корисну нижню навігацію і компактний header, але щільність desktop просто стискається.** Потрібні mobile-first фільтри, sticky “Фільтри / Сортування”, sticky buy bar на PDP, коротші карточки, 44–48 px targets і контроль floating-віджетів.
13. **Візуальний редизайн має бути редакційно-інженерним, а не “ще одним маркетплейсом”.** Основа: теплий світлий фон, графітова типографіка, один зелений бренд-акцент, технічний синій для інформації, червоний лише для ризику/реальної знижки.
14. **Найкращий короткостроковий ефект дадуть не банери, а пошук, фільтри й чистіша картка.** Вони впливають на повторювані високочастотні сценарії і не вимагають повної зміни бекенду.
15. **Нова платформа повинна зберегти URL, canonical, hreflang, structured data і категорійний контент.** IA можна покращувати через навігаційний та solution-шар, не руйнуючи SEO-дерево товарних категорій.
16. **Потрібна продуктова інформаційна модель до візуального редизайну.** Без нормалізованих атрибутів, сумісності, комплектації, документів і залишків красиві компоненти лише приховають хаос даних.
17. **Головна продуктова обіцянка:** не “у нас багато товарів”, а **“підберемо сумісну інженерну систему і доведемо її до монтажу”**.

## North Star і ключові метрики

**North Star:** частка сесій, у яких користувач знаходить або формує придатне до монтажу рішення без звернення через помилку вибору.

Рекомендований scorecard:

| Шар | Метрика | Навіщо |
|---|---|---|
| Search | zero-results rate; search exit rate; autocomplete CTR; exact-SKU success | Виявляє якість найкоротшого шляху до товару |
| Catalog | filter usage; result refinement success; PLP→PDP CTR; compare usage | Показує, чи допомагають фасети, а не лише звужують |
| PDP | add-to-cart; consultation; document opens; bundle attach rate | Розділяє покупку, технічну перевірку та допомогу |
| Solution | calculator completion; quote request; solution→PDP; kit conversion | Вимірює новий B2C-сценарій |
| Cart | accessory attach; cart edit; checkout start | Показує якість комплектації |
| Checkout | step abandonment; completion; validation error rate | Виявляє тертя форми |
| PRO | quick-order use; list-to-cart; reorder; document/BIM download | Вимірює економію часу професіонала |
| Quality | return/cancel reason “не підійшло”; support contacts per order | Перевіряє сумісність і ясність контенту |

---

# B. Основні проблеми поточного Teploradost

## Critical

### B1. Пошук не є толерантним до помилок і не підтримує discovery

**Evidence.** Autocomplete активується після трьох символів із затримкою 1000 ms. `grundfos 25 60`, `грундфос 25 60`, артикул виробника `99411175` та внутрішній код `020628` знаходяться. Помилкове `grunfos 25 60` дає 0 результатів. Dropdown показує максимум п’ять товарів — фото, назву й ціну — та “Усі результати”; категорій, брендів, статей і correction немає.

**Що змінити:** перейти на typo-tolerant index з нормалізацією дефісів/пробілів, латиниці/кирилиці, синонімів і кодів; зробити секційний autocomplete.  
**Чому:** користувач технічного магазину часто пам’ятає не точну назву, а бренд, частину моделі, діаметр або “народну” назву. Zero result тут означає втрату попиту, який уже сформований.  
**Патерн:** [Rexel підтримує slang terms](https://www.rexel.co.uk/uki/website-features); [SupplyHouse Replacement Parts Finder](https://www.supplyhouse.com/replacement-parts); DigiKey і RS будують пошук навколо part number та параметрів.

### B2. Немає явної моделі сумісності й системної комплектації

**Що змінити:** створити compatibility graph і п’ять різних типів рекомендацій на PDP; кожен зв’язок має мати джерело, правила, статус “обов’язково / рекомендовано / альтернатива”.  
**Чому:** у технічному ecommerce неправильний cross-sell може призвести не лише до низької конверсії, а й до повернення, зриву монтажу та втрати довіри.  
**Патерн:** [Caleffi product pages](https://www.caleffi.com/en-int/manual-radiator-valve%26nbsp%3Bangled-version-411-caleffi-411302) зв’язують варіанти, креслення, application і розрахунок; [Geberit Specifier](https://geberit-country-gisa.prod.platform.web.geberit.com/sanitary-piping-systems/digital-tools-software/geberit-bim-plug-in/) відсіює несумісні компоненти; HeatandPlumb використовує “You May Need” для монтажних доповнень.

### B3. Інформаційна модель не передує UI

**Що змінити:** нормалізувати атрибути, одиниці, назви, документи, статуси життєвого циклу, комплектацію і синоніми в PIM; лише потім будувати універсальні компоненти PLP/PDP.  
**Чому:** зараз довгі SEO-назви, різні формати параметрів і promo-елементи змушують UI показувати багато сирих даних. Без PIM редизайн швидко повернеться до перевантаження.  
**Патерн:** [Uponor Catalogue](https://www.uponor.com/en-gb/catalogue) має пошук за назвою/part number, системи, технічну документацію і item-level datasheet; [Grundfos Product Center](https://www.grundfos.com/solutions/support/help-centre) об’єднує curves, CAD/BIM, документи, replacement і sizing.

### B4. Перша архітектура — лише “товарна”, а не “задачна”

**Що змінити:** додати повноцінний “Рішення” шар, який формує систему і специфікацію, не дублюючи каталог.  
**Чому:** непрофесіонал не знає, чи починати з котла, насоса, автоматики або гідравліки. Він мислить результатом: тепло в будинку, стабільний тиск, гаряча вода.  
**Патерн:** [Ferguson Shop by Job](https://www.ferguson.com/) показує задачу і “What You’ll Need”; [Viessmann Product Finder](https://www.viessmann.co.uk/en/productfinder.html) рекомендує систему після простих питань; [Warmup](https://www.warmup.co.uk/) веде до quote за типом системи.

## High priority

### B5. Головна сторінка має забагато рівнозначних промо-блоків

**Evidence.** Перший екран одночасно підтримує довгий каталог ліворуч, горизонтальні швидкі категорії, кілька банерів і сервісні елементи; далі йдуть повторні продукт-каруселі, акції та промо. Візуально важко зрозуміти, що є головною дією.

**Що змінити:** обмежити hero однією обіцянкою і трьома маршрутами; залишити максимум один комерційний promo-slot на екран; замінити кілька каруселей на task/solution і curated categories.  
**Чому:** кожен новий банер зменшує помітність попереднього; користувач не бачить експертності, лише торговий тиск.  
**Патерн:** Reece і Warmup використовують великі, спокійні hero-блоки; Ferguson швидко переходить до job architecture.

### B6. Фільтри не пояснюють технічний вибір

**Що змінити:** для кожної категорії мати facet schema: порядок за інформаційною цінністю, tooltip, одиниці, популярні пресети, search-in-filter, ranges, залежності, selected chips і “показати N”.  
**Чому:** однаковий алфавітний список характеристик не відповідає реальному процесу підбору. Наприклад, для котла тип/паливо/потужність важливіші за другорядну комплектацію, а для насоса — duty point і середовище.  
**Патерн:** [Ferguson boilers](https://www.ferguson.com/category/heating-cooling/hydronics/boilers/) дає application-specific facets; [Grainger pumps](https://www.grainger.com/category/pumps/well-groundwater-pumps/submersible-deep-well-pumps) пояснює параметри прямо у фільтрі; McMaster використовує ілюстровані значення.

### B7. Product cards важко сканувати

**Що змінити:** зробити два рівні картки: compact default і expanded compare; залишити до чотирьох ключових атрибутів, а bonus/video/installment сховати в PDP або popover.  
**Чому:** надмірна кількість бейджів, кредитних логотипів і маркерів збільшує час порівняння і створює “візуальну ціну” кожному товару.  
**Патерн:** SupplyHouse у list view показує SKU, rating, price, stock, delivery і action; DigiKey використовує щільну, але вирівняну таблицю параметрів.

### B8. PDP має функції, але слабку progressive disclosure

**Що змінити:** зібрати buy box навколо ключових характеристик, варіанта, наявності, доставки та CTA; розстрочки — одна строка “від X/міс”; деталі розкрити; sticky anchor nav для specs/docs/compatibility/reviews.  
**Чому:** зараз однаково гучні ціна, бонуси, кредитні провайдери, монтаж, one-click і сервісні повідомлення. Це знижує ясність основної покупки.  
**Патерн:** Viessmann/Vaillant спочатку пояснюють fit і benefits, потім деталізують; SupplyHouse тримає purchase data компактно, а manuals і parts — нижче.

### B9. Надмірно довгі й місцями шаблонні SEO-тексти

**Evidence.** Частина PDP має громіздкі повторювані конструкції про купівлю, міста і “вигідну вартість”. Деякі title значно довші за зручний SERP/scan формат; головна має title близько 129 символів.

**Що змінити:** розділити visible decision content і SEO-support; у верхній частині — унікальна користь/fit, нижче — структурована довідка; переписати шаблонні фрагменти й прибрати мовні артефакти.  
**Чому:** шаблонний текст не допомагає вибрати і послаблює преміальне відчуття; довгі назви руйнують картки.  
**Патерн:** Viessmann і Caleffi структурують факти таблицями та applications; Plumbworld показує, що довге education може працювати лише при чітких секціях і реальній користі.

### B10. Checkout візуально та когнітивно важчий, ніж має бути

**Evidence.** Публічна форма має кроки “1 Контактні дані”, “2 Доставка”, “3 Оплата”, login всередині першого кроку, поле прізвища, email, згоду, коментар, адресу, кошик, промокод і “Не дзвонити”. Доставка та платежі динамічні; окремі способи мають мінімальні суми.

**Що змінити:** guest checkout як default; login — непомітне посилання; progressive steps з готовими summary; optional fields згортати; мінімальні суми показувати до вибору payment; sticky order summary на desktop і bottom total на mobile.  
**Чому:** користувач уже прийняв рішення — checkout має підтверджувати, а не вимагати вивчення нової системи.  
**Патерн:** Screwfix/Toolstation зводять отримання товару до чіткого branch/delivery вибору; SupplyHouse показує точні строки ще до checkout.

## Medium priority

- **Непослідовна візуальна семантика.** Знижки, бонуси, доставка, наявність, відео й фінансування мають багато кольорів і форм. Потрібен semantic token set. Патерн: Warmup/Viessmann — один акцент, нейтральна система.
- **170 зображень на головній і 133 без alt** у перевіреному HTML. Потрібні content linting, meaningful alt і performance-budget. Це accessibility, SEO і LCP-ризик.
- **Каталог має надто глибокі й місцями технічні назви.** Потрібні aliases, plain-language subtitles і contextual guides, не зміна SEO URL. Патерн: Ferguson feature shortcuts; RS “Guides & Articles” усередині категорії.
- **Сервісна сторінка відокремлена від товарної воронки.** Інтегрувати “замовити монтаж”, пусконалагодження, проєкт і сервіс у relevant PDP/solution, а не лише окрему landing. Патерн: Warmup installer/quote; Vaillant Find an Installer.
- **Документи є, але не мають єдиного taxonomy.** Тип, мова, версія, дата, модель/серія, розмір файлу, “для користувача / монтажника / проєктанта”. Патерн: ViBooks 30,000+ documents; Vaillant Literature filters.
- **Статуси товару недостатньо нормалізовані.** “В наявності”, “Під замовлення”, “Немає”, “Архів”, “Знято з виробництва” мають вести до різних наступних дій. Для discontinued — автоматично показувати валідований replacement. Патерн: Schneider Product Substitution, Grundfos Replacement.

## Nice to have

- Project workspace для збережених специфікацій і кімнат/об’єктів.
- Shareable carts і PDF/Excel proposal.
- Barcode/QR scanner у PRO mobile.
- BIM/CAD для пріоритетних технічних категорій.
- Публічні performance curves і простий graph viewer для насосів.
- AI-помічник лише поверх структурованої бази, з посиланнями на документи й без права “вигадувати” сумісність.

---

# C. Що не можна ламати

| Актив | Що зберегти | Як модернізувати без втрати |
|---|---|---|
| Велике SEO-дерево | Індексовані категорії, підкатегорії, product URLs | URL mapping, 301 лише там, де необхідно; паралельний solution-layer без дублювання категорій |
| Canonical і мовність | canonical; `uk-UA`, `ru-UA`, `x-default` hreflang | Автоматичні QA-тести на кожному template і коректні alternate pairs |
| Structured data | Organization, Store, ItemList, SearchAction, product data | Валідувати price/availability/review, додати BreadcrumbList, FAQ лише для видимого контенту |
| Пошук за моделлю/кодом | Точні моделі, manufacturer part number, внутрішні коди | Додати typo/translit/synonyms, не погіршити exact-match ranking |
| Порівняння й обране | Іконки та списки | Зробити порівняння category-aware і підсвічувати відмінності |
| Детальна PDP | Характеристики, документація, фото, відео, reviews | Перебудувати порядок і progressive disclosure; не видаляти технічну глибину |
| Наявність і CTA | “В наявності / під замовлення”, buy, one-click | Додати дату/джерело, branch/warehouse, expected lead time; one-click не конкурує з buy |
| Оплата | Українські провайдери, ПДВ/без ПДВ, кредит/частини | Один компактний selector, eligibility і final cost до CTA |
| Монтаж і послуги | Монтаж, консультація, service centers | Контекстуалізувати за товаром/рішенням і показувати SLA/географію |
| Бонусна система | 1% механіка та накопичення | Пояснювати коротко біля ціни; повні правила — drawer, не великий modal |
| Mobile navigation | Компактний header, нижня навігація, sticky catalog | Скоротити floating conflicts, адаптувати картки й фільтри mobile-first |
| Trust | Реальні контакти, шоурум, гарантія, відгуки, сервіс | Підняти релевантні trust-сигнали до decision point, а не дублювати всюди |

### SEO guardrails для редизайну

1. Crawl старого й staging-сайту; порівняння status, canonical, title, H1, indexability, hreflang, structured data.
2. Immutable ID для категорії/товару; slug не є primary key.
3. Один індексований URL на комбінацію; фасетні URL — правила index/noindex/canonical за search demand.
4. Visible category intro короткий; додаткова корисна довідка нижче, без keyword stuffing.
5. Archived/discontinued PDP не видаляти, якщо є попит/посилання: чіткий статус, документи, replacement, 410 лише коли сторінка справді не має цінності.
6. Performance budget: LCP ≤2.5 s p75, INP ≤200 ms p75, CLS ≤0.1; image dimensions, WebP/AVIF, lazy-load below fold, мінімум third-party.

---

# D. Best practices конкурентів

## Порівняльна таблиця найсильніших патернів

| Елемент | Найкращий сайт / патерн | Чому працює | Як використати в Teploradost |
|---|---|---|---|
| Header | SupplyHouse + Reece | Великий пошук, швидкі PRO-дії, location/account context | Пошук — головний елемент; праворуч лише 4 high-frequency actions; телефон у support popover |
| Mega-menu | HeatandPlumb + Ferguson | Групування за типом/feature/job, а не плоский список | 10–12 core departments; plain-language підказки; окрема колонка “Рішення” |
| Search | SupplyHouse / Rexel | SKU, model, replacement, slang, quick ordering | typo/translit/synonym index; exact code priority; zero-result recovery |
| Search suggestions | Запропонований hybrid SupplyHouse + RS | В одному dropdown можна перейти в product/category/brand/content | 4 секції, 6–8 товарів, stock/price/code, correction і “усі N” |
| Homepage | Ferguson + Reece | Спокійний вхід до job, divisions і services | Hero з трьома маршрутами; solution cards; trust; curated catalog; один promo |
| Categories | Ferguson + Plumbworld | Feature shortcuts, subcategories, facets і education | Visual subcategory rail + top decision presets + SEO guide нижче |
| Subcategories | HeatandPlumb | Mega-menu і landing group за типом, feature, style, accessories | Товарна група + “як вибрати” + compatible adjacent categories |
| Filters | Grainger + Ferguson + DigiKey | Application facets, пояснення, багато параметрів без втрати структури | Category-specific order, tooltip, range, chips, search within facet, compare mode |
| Product listing | SupplyHouse + RS | Щільна інформація вирівняна в повторювані колонки | Toggle grid/list; PRO list з кодом, 4 атрибутами, stock, qty, add |
| Product card | SupplyHouse | SKU, rating, price, exact availability, delivery, list/cart | Зменшити promo badges; показувати shipping promise і ключові параметри |
| Product page | SupplyHouse + Viessmann | Сильний buy box плюс глибока структурована техніка | Split top: fit summary + purchase; нижче specs/docs/system/application |
| Specifications | Caleffi + Grainger | Нормалізовані дані, units, part variants, drawings | Attribute groups; copy value; metric only/dual units where needed; variant matrix |
| Documentation | ViBooks + Vaillant Literature | Централізований пошук за serial/model і типом документа | Document Center + PDP-tab; мова, версія, дата, file size, audience |
| Related products | Vaillant | Пояснює системний зв’язок між generator, control, cylinder | “Працює з…” з причиною сумісності, не generic carousel |
| Compatibility | Geberit Specifier + Caleffi | Правила відсікають технічно неможливі компоненти | PIM compatibility graph; green “Перевірено” і warning з причиною |
| Cross-sell | HeatandPlumb “You May Need” | Монтажні доповнення в контексті обраного варіанту | Checklist mandatory/recommended, one-click add, quantity formula |
| Bundles | Ferguson Shop by Job + Warmup quote | Комплект виходить із задачі, а не з випадкової корзини | Валідовані kits з BOM, варіантами, savings і “що не входить” |
| Brands | Plumbworld + Uponor | Бренд поєднує продукти, education, гарантію та системи | Brand hub: families, certified status, warranty, docs, replacement, solutions |
| Solutions | Viessmann + Warmup + Ferguson | Від простих питань до рекомендації/quote/what-you-need | Guided selector з output: схема, kit, бюджет, монтаж, збереження проєкту |
| Educational content | RS + Warmup | Гайд розташований у момент вибору, а не лише в блозі | 2–3 contextual guides на PLP/PDP; calculators і glossary inline |
| B2B functionality | SupplyHouse + Würth + Rexel | Quick order, lists, saved carts, joblists, approval, invoice | PRO workspace, CSV paste/upload, customer SKU, cost centers, share/approve |
| Mobile UX | Screwfix + Rexel app | Stock nearby, scanner, click & collect, fast reorder | Mobile barcode scanner, persistent search, stock/branch, bottom add-to-cart |
| Cart | SupplyHouse + HeatandPlumb | Qty/availability плюс монтажні доповнення до checkout | Cart completeness check, compatible add-ons, saved cart, delivery grouping |
| Checkout | Toolstation/Screwfix omnichannel logic | Отримання товару та час — головний вибір | Delivery/pickup first-class; exact ETA; guest flow; concise payment eligibility |
| Trust | SupplyHouse + Warmup | Trust прив’язаний до ризику: returns, delivery, warranty, installers | Біля CTA — гарантія/повернення/наявність; біля solution — expertise/cases |

## 1. SupplyHouse

### Що зроблено дуже добре

- Сайт оптимізований для людини, яка знає SKU або модель: search, Reorder, Quick Order, Saved Carts і Lists знаходяться поруч із торговим сценарієм.
- [Quick Order](https://www.supplyhouse.com/quick-order) підтримує SKU + quantity, вставлення списку та завантаження CSV/XLS/XLSX — еталон для монтажників і закупівель.
- У категорії котлів понад 2,000 позицій, але фільтри прив’язані до application: availability, brand, BTU тощо.
- PDP показує SKU, рейтинг/Q&A, exact delivery, кількість на складі, manuals, warranty, replacement parts і related system items.

### Що зроблено погано

- Візуальна мова утилітарна й не створює premium/system-storytelling ефекту.
- Новачок може потонути у специфічних категоріях; copy орієнтований на вже сформований запит.
- Частина сайту захищена Cloudflare, що може створювати додатковий friction у нестандартних середовищах.

### Найкращі UX/UI та ecommerce-рішення

- **UX:** exact stock + delivery promise до checkout; replacement finder; lists.
- **UI:** стабільна щільність і сильне вирівнювання даних; мінімум декоративного шуму.
- **Великий каталог:** фасети, list/grid, compare, SKU-first.
- **PDP:** manuals і parts — частина продукту, не support-післямова.
- **Search & filters:** exact-match і part workflow сильніші за discovery.
- **Mobile:** функціональний, але не еталон візуальної легкості.

### Що адаптувати

1. **Що:** Quick Order з paste/upload і customer lists. **Чому:** скорочує повторне/проєктне замовлення з десятків пошуків до однієї дії. **Патерн:** SupplyHouse Quick Order.
2. **Що:** availability у форматі “X на складі / відправимо до дати”. **Чому:** B2B планує монтаж за часом. **Патерн:** SupplyHouse product list/PDP.
3. **Що:** replacement by model. **Чому:** archived SKU перетворюється на продаж нового аналога. **Патерн:** Find Parts For Your Unit.

## 2. Ferguson

### Що зроблено дуже добре

- [Shop by Job](https://www.ferguson.com/) починається з конкретної роботи — заміна водонагрівача, змішувача, tune-up HVAC — і показує “What You’ll Need”.
- Boilers PLP має feature shortcuts (Combi, High Efficiency, Condensing), fuel shortcuts і глибокі фасети: BTU, application, boiler type, AFUE, material, volts.
- Product rows включають Part #, Item #, Mfr Part #, ratings, branch/shipping availability, lists і compare.
- Контекст branch stock і compliance/certification добре відповідає професійному постачанню.

### Що зроблено погано

- Account/branch gating приховує частину price/availability.
- Велика кількість фасетів без guided mode важка для B2C.
- Enterprise UI місцями щільний і візуально застарілий.

### Найкращі UX/UI та ecommerce-рішення

- **UX:** job-to-BOM; contextual help; branch context.
- **UI:** feature shortcuts над листингом полегшують перший крок.
- **Catalog:** very deep facets і professional identifiers.
- **PDP:** сильні item data та availability, слабший editorial storytelling.
- **Search/filters:** точні, але вимагають знань.
- **Mobile:** task flow переноситься краще, ніж великий facet set.

### Що адаптувати

1. “Робота → перелік потрібного” для типових українських монтажів. Це підвищує basket completeness. Джерело: Ferguson Shop by Job.
2. Feature shortcuts над фільтрами: “двоконтурний”, “конденсаційний”, “для квартири”. Це дає простий вхід без видалення PRO-фасетів. Джерело: Ferguson Boilers.
3. Три коди в PRO-view: код магазину, артикул виробника, серія. Це зменшує помилки закупівлі. Джерело: Ferguson listing.

## 3. Reece

### Що зроблено дуже добре

- Header ставить у центр product search, а Lists, Orders, Buy Again — високочастотні PRO-дії.
- Division navigation (Plumbing/HVAC/Refrigeration/Bath & Kitchen) зрозуміла на верхньому рівні.
- Після входу враховує bill-to account і job/ship-to context — важливо для компаній з багатьма об’єктами.
- Сервісні пропозиції — rapid delivery, tool rental, after-hours, instant credit — сформульовані як вирішення робочих проблем.
- [BIM Library](https://www.reece.com/resources/bim-library) має тисячі об’єктів і пошук за brand/product number.

### Що зроблено погано

- Змішування consumer showroom і trade divisions може бути неочевидним.
- Homepage carousel і повтори послаблюють ієрархію.
- Частина користі відкривається лише після account/location context.

### Найкращі UX/UI та ecommerce-рішення

- **UX:** job account, buy again, service-as-product.
- **UI:** чистий navy/teal, великі зображення, достатньо whitespace.
- **Catalog/PDP:** account-centric; не найкращий B2C education.
- **Search:** постійно помітний, орієнтований на product.
- **Mobile:** account/reorder logic релевантна польовій роботі.

### Що адаптувати

- PRO-акаунт із “Об’єктом доставки” і власною специфікацією. **Чому:** одна компанія веде багато будинків/проєктів. **Патерн:** Reece job/ship-to.
- Послуги як операційні переваги, а не generic “ми професіонали”. **Чому:** швидка доставка й after-hours вимірювані. **Патерн:** Reece Services.

## 4. HeatandPlumb

### Що зроблено дуже добре

- Mega-menu групує асортимент за type, feature, style і accessories.
- Category pages поєднують підкатегорії, BTU/calculator context, filters, variants/sizes, stock і delivery days.
- PDP дозволяє вибирати variants і postcode delivery; “You May Need” додає valves/feet та інші монтажні компоненти.
- Trade account пропонує fixed discounts, account manager і priority delivery.

### Що зроблено погано

- Mega-menu надто великий; homepage перевантажена deals/trust/payments.
- PDP довгі й місцями повторюють промо.
- Trade account не є повним credit account, що обмежує B2B-зрілість.

### Найкращі рішення і адаптація

- **Product page/cross-sell:** “You May Need” прив’язаний до обраного size/variant. Для Teploradost це має стати “Потрібно для монтажу” з перевіреною сумісністю.
- **Delivery:** postcode checker демонструє, що строк доставки — decision data. В Україні аналог — місто/відділення/склад і дата.
- **Bad pattern to avoid:** не переносити pay-provider і deal noise на кожен екран.

## 5. Plumbworld

### Що зроблено дуже добре

- Radiators category має сотні результатів і параметри, зрозумілі покупцю: width, height, BTU Delta50, orientation, panel type, stock.
- PDP поєднує reviews, variants, delivery, технічні схеми, Delta30/50 і compatible legs/spares.
- Довгі пояснення допомагають B2C зрозуміти стандарт, тепловіддачу і розмір.

### Що зроблено погано

- Сильна discount/urgency мова може знижувати premium trust.
- SEO/education sections іноді надмірно довгі.
- Price comparison і promotional modules відволікають від fit.

### Найкращі рішення і адаптація

- **Що:** показувати варіанти як matrix/selector, а не окремі дублікати. **Чому:** покупець порівнює розмір/потужність усередині серії. **Патерн:** Plumbworld radiator PDP.
- **Що:** технічний контент із реальними схемами. **Чому:** він одночасно продає й зменшує помилку. **Патерн:** K-Rad/Park Lane PDP.
- **Не копіювати:** постійні “save X%” і довгі SEO-полотна у верхній частині.

## 6. Warmup

### Що зроблено дуже добре

- Чітко розділяє Electric, Water, Thermostats, Knowledge Centre і Professionals.
- Product/solution page [DCM-PRO](https://www.warmup.co.uk/underfloor-heating/electric/dcm-pro) веде не просто до SKU, а до quote: guide price per m², benefits, how it works, diagrams, warranty, documents і “You will also need”.
- Professionals area розводить reseller, project division, installer і Pro Hydro Tool.
- [Literature Library](https://www.warmup.co.uk/literature) централізує specification, installation, user і troubleshooting documents.

### Що зроблено погано

- Частина сторінок надмірно текстова; carousel зменшує контроль користувача.
- Direct ecommerce слабший: quote-first не підходить для всіх SKU.
- Маркетингові claims мають потребу в локальному proof.

### Найкращі рішення і адаптація

- **Solution storytelling:** схема “benefit → how it works → options → what else needed → quote”. Це еталон для теплої підлоги Teploradost.
- **Audience split:** “Для дому / Для монтажника / Для проєктанта” всередині тієї самої системи.
- **Quote:** для складних систем CTA “Розрахувати комплект” має бути рівним “Купити”, але не замінювати ecommerce для простих товарів.

## 7. Viessmann UK

### Що зроблено дуже добре

- [Product Finder](https://www.viessmann.co.uk/en/productfinder.html) просить відповісти на прості питання, дає рекомендації та веде до консультації без вимоги технічних знань.
- PDP Vitocal структурує output, COP, efficiency, application, operation, DHW, additional features і product cross-section.
- Візуальна мова стримана: великі поля, продукт і система, мало випадкових кольорів.
- [ViBooks](https://www.viessmann.co.uk/en/support/manuals.html) дозволяє пошук за item/serial number і містить понад 30,000 документів для trade partners.

### Що зроблено погано

- Як manufacturer site, не вирішує multi-brand price/stock/checkout.
- Частина PDP дуже довга; consultation CTA повторюється.
- На окремих нових сторінках трапляються незавершені placeholder-фрагменти — приклад, чому content QA обов’язковий.

### Найкращі рішення і адаптація

- **Visual:** premium engineering без темної “luxury” стилізації. Адаптувати whitespace, cross-section, product photography.
- **PDP:** “Application area” і system operation вивести вище сирої таблиці.
- **Docs:** serial/model search і audience filter — основа Document Center.
- **Не копіювати:** manufacturer-only funnel; Teploradost має зберегти multi-brand порівняння і ціну.

## 8. Vaillant UK

### Що зроблено дуже добре

- Product pages формулюють “Ideal for”, ключові benefits, related system products, Find an Installer і Downloads.
- Full system solutions зв’язують boiler/heat pump, controls і cylinder.
- Окремий professional portal дає products, controls simulator, manuals, training і specifier support.
- [Literature search](https://professional.vaillant.co.uk/specifiers/design-and-support/support/literature/) фільтрує installation manual, conformity, technical specification, brochure, spare parts тощо.

### Що зроблено погано

- Дублювання consumer/professional доменів ускладнює пошук контенту.
- Related products показують зв’язок, але не завжди пояснюють точне правило сумісності.
- Деякі pages мають дуже довгі narrative sections.

### Найкращі рішення і адаптація

- **Що:** system relationship і installer CTA на PDP. **Чому:** generator без controls/install не є завершеним рішенням. **Патерн:** Vaillant sensoCOMFORT/VRC 700.
- **Що:** “Ideal for” у 2–3 рядках. **Чому:** B2C бачить fit до технічної таблиці. **Патерн:** Vaillant PDP.
- **Що:** PRO layer всередині одного домену. **Чому:** зберігає SEO й не фрагментує користувача. **Патерн:** беремо функції Vaillant Professional, але не окрему навігаційну екосистему.

## 9. Uponor

### Що зроблено дуже добре

- Solution pages говорять мовою application: renovation, new build, low construction height, floor covering, residential/commercial.
- [Product Catalogue](https://www.uponor.com/en-gb/catalogue) має search by name/part number, system/product group facets, technical docs, item datasheet і personal catalogue/wishlist.
- Для різних аудиторій явно показана користь: homeowner, installer, planner.
- BIM, download centre, support, wiring diagrams, quick start guides і training формують професійну екосистему.

### Що зроблено погано

- Solution pages іноді повторюють benefit copy і стають надмірно довгими.
- Ecommerce та локальна availability не є головною функцією.
- Перехід між глобальними/локальними сторінками може бути неочевидним.

### Найкращі рішення і адаптація

- **Що:** system → components → technical docs → contact/quote. **Чому:** показує, що каталог — частина системи. **Патерн:** Uponor underfloor heating.
- **Що:** audience-specific benefit tabs. **Чому:** одна характеристика має різну цінність для власника й монтажника. **Патерн:** Uponor Controls.
- **Що:** personal submittal package. **Чому:** проєктант збирає не кошик, а пакет специфікації. **Патерн:** Uponor Catalogue.

## 10. Caleffi

### Що зроблено дуже добре

- [Product search](https://www.caleffi.com/en-int/products/search) підтримує product name/code, families і subfamilies.
- PDP має technical data, drawings/specifications, part-number matrix, Kv, materials, pressure/temperature, tender text, 3D models і application tools.
- [Caleffi Schemes](https://www.caleffi.com/en-int/software/caleffi-schemes) поєднує готову гідравлічну схему, список компонентів, serial numbers і прямі product links.
- BIM objects і engineering education перетворюють сайт на робочий інструмент проєктанта.

### Що зроблено погано

- UI дуже технічний і не навчає новачка базовому вибору.
- Немає multi-brand ecommerce, availability і української checkout-логіки.
- Категорійні назви близькі до інженерної taxonomy і важкі для B2C.

### Найкращі рішення і адаптація

- **Що:** product family page з part matrix. **Чому:** десятки розмірів не мають бути десятками хаотичних PDP. **Патерн:** Caleffi valve series.
- **Що:** copyable tender/spec text і drawings. **Чому:** економить час проєктанта. **Патерн:** Caleffi PDP.
- **Що:** solution scheme → BOM → buy/quote. **Чому:** це найсильніший міст між інженерною схемою й ecommerce. **Патерн:** Caleffi Schemes.

---

# E. Proposed UX architecture

## 1. Принцип: три паралельні маршрути

```text
Вхід
├── Знаю товар
│   ├── Search / SKU / model / code
│   ├── Catalog / category / brand
│   └── Quick order / reorder / list
├── Потрібно підібрати
│   ├── Guided selector
│   ├── Calculator
│   ├── Compare
│   └── Consultation
└── Потрібно вирішити задачу
    ├── Shop by Solution
    ├── Questions about object
    ├── Recommended system + BOM
    └── Buy kit / request project / installer
```

SEO-каталог залишається canonical товарною структурою. Solution pages створюють editorial/guided layer і посилаються на ті самі категорії та SKU; вони не дублюють PLP.

## 2. Верхній рівень сайту

1. **Каталог**
   - Опалення
   - Гаряча вода
   - Водопостачання
   - Труби та фітинги
   - Тепла підлога
   - Насоси
   - Сантехніка
   - Вентиляція та кондиціювання
   - Автоматика й електроживлення
   - Інструмент і монтажні матеріали
2. **Рішення**
   - Опалення будинку
   - Заміна котла
   - Тепла підлога
   - Гаряче водопостачання
   - Вода зі свердловини
   - Підвищення тиску
   - Рециркуляція ГВП
   - Захист і балансування системи
   - Автоматизація
3. **Бренди**
4. **Послуги** — підбір, проєкт, монтаж, пуск, сервіс
5. **Знання** — guides, calculators, glossary, documents
6. **PRO** — quick order, projects, lists, invoices, pricing, support

## 3. Mega-menu

**Що змінити:** замість нескінченного дерева показувати на одному відкриванні лише department → 5–8 ключових підгруп → “усі категорії”; праворуч — “Популярні задачі” і contextual guide.  
**Чому:** користувач спершу розпізнає напрямок, потім конкретизує. Показ усіх листків дерева одночасно переносить складність БД у навігацію.  
**Патерн:** HeatandPlumb grouping + Ferguson feature/job shortcuts.

Приклад “Насоси”:

| Товари | За застосуванням | Допомога |
|---|---|---|
| Циркуляційні | Для опалення | Підібрати за Q/H |
| Свердловинні | Для свердловини | Калькулятор насоса |
| Поверхневі | Підвищення тиску | Заміна старої моделі |
| Дренажні | Дренаж/каналізація | Як читати криву |
| Насосні станції | Рециркуляція ГВП | Консультація інженера |

## 4. Brand hub

Кожен стратегічний бренд отримує:

- коротке позиціонування без generic marketing;
- product families;
- “для яких задач”;
- статус офіційності/гарантія/сервіс;
- documents і certificates;
- replacement finder;
- popular products і series comparison;
- сумісні брендові системи;
- контакт сертифікованого спеціаліста, якщо релевантно.

## 5. Information model / PIM minimum

| Entity | Обов’язкові поля |
|---|---|
| Product | internal code, MPN, EAN, brand, series, lifecycle, price, VAT, stock, lead time |
| Variant | dimensions, capacity/output, connection, color, voltage, pack qty, parent series |
| Attribute | normalized name, unit, value, display order, filterable/comparable, tooltip |
| Document | type, language, version/date, model coverage, audience, file size |
| Compatibility | source product, target, relation type, rule, confidence, mandatory, quantity formula |
| Solution | task, object type, constraints, required component roles, optional roles |
| Service | geography, product/category eligibility, price model, SLA, provider qualification |
| Inventory | warehouse/branch, available, reserved, ETA, last update |

## 6. Один сайт для B2C і PRO

Не робити жорсткий modal “Хто ви?”, який блокує старт. Використати soft mode switch у header/account:

| Компонент | Для дому | PRO |
|---|---|---|
| Назва | Зрозуміла + технічна в дужках | Технічна + MPN |
| Ціна | з ПДВ, доступні оплати | contract/opt price, з/без ПДВ |
| Stock | “Отримаєте…” | warehouse/branch quantity |
| Card | 3 ключові benefits | 4–6 attributes, code, qty input |
| CTA | Купити / Допоможіть підібрати | Add qty / Add to joblist |
| Content | пояснення, calculators | datasheet, BIM/CAD, tender text |
| Account | orders, bonus, addresses | users, cost centers, projects, approvals, invoices |

Режим зберігається, але всі дані доступні обом аудиторіям. Це **не два окремі каталоги**, а різна щільність і порядок.

---

# F. Proposed Homepage

## Порядок блоків

### 1. Utility bar

Місто/отримання, “Для професіоналів”, доставка й оплата, контакти. Без трьох телефонів у першому шарі: один “Допомога” popover з графіком, call/chat.

### 2. Main header

- Logo.
- Catalog button.
- Search 50–60% ширини: “Товар, модель, артикул або задача”.
- Account, lists, compare, cart.
- Sticky після 80–120 px; на mobile — logo, search, cart + bottom nav.

**Чому:** known-item search є найкоротшим і найціннішим шляхом.  
**Патерн:** SupplyHouse/Reece.

### 3. Hero: одна обіцянка, три маршрути

**H1:** “Інженерні системи, які точно працюють разом.”  
**Sub:** “Обладнання, розрахунок, сумісний комплект і монтаж — для дому та професійних об’єктів.”

CTA:

1. **Відкрити каталог**
2. **Підібрати рішення**
3. **Завантажити специфікацію** (PRO)

Праворуч — не random lifestyle stock, а реальна котельня/система з 3–4 інтерактивними labels “котел / насос / автоматика / захист”.

### 4. “Почніть із задачі”

6 cards, не carousel:

- Опалити приватний будинок
- Замінити котел
- Зробити теплу підлогу
- Організувати воду зі свердловини
- Підвищити тиск
- Підготувати специфікацію

Картка: задача, для кого, estimated steps (“5 питань · 3 хв”), CTA “Підібрати”.  
**Патерн:** Ferguson Shop by Job + Viessmann Finder.

### 5. Популярні категорії

8–12 category tiles у стабільній grid, реальні cutout-фото або технічні ілюстрації, без різнокольорових фонів. “Усі 120+ категорій” — secondary.

### 6. Expert entry

Дві половини:

- **Для дому:** калькулятори, консультація, монтаж, гарантія.
- **Для професіоналів:** quick order, project lists, stock, documents.

### 7. Curated products

Один tabbed module: “В наявності / Найчастіше обирають / Новинки”. Не 4–6 незалежних каруселей. Кожен tab має бізнес-правило і максимум 8 товарів.

### 8. “Готові системи”

2–3 editorial cases із mini schematic, площа/тип об’єкта, склад системи, бюджетний діапазон, CTA “Подивитися комплект”. Це доказ системної компетентності, а не generic banner.

### 9. Services

Підбір → Проєкт → Доставка → Монтаж/пуск → Сервіс. Показати geography, SLA, хто виконує, приклад ціни або “від”.

### 10. Trust

Лише перевірювані сигнали: років роботи, orders/reviews із source, офіційні гарантії, showrooms, service cases. Поруч — реальні фото команди/складу/проєкту.

### 11. Knowledge

Три contextual guides + calculators, а не останні новини. Наприклад: “Яка потужність котла”, “Як підібрати насос”, “Delta T для радіатора”.

### 12. Brands

Логотипи з фільтром за category; не безкінечна сіра стрічка. Strategic partners можуть мати короткий proof “офіційна гарантія / сервіс”.

### 13. Footer

Catalog, Solutions, Service, PRO, Help, company/legal, contacts, apps/social. Не дублювати повне mega-menu.

## Залишити / прибрати / перенести / переробити

| Дія | Елементи |
|---|---|
| Залишити | search, catalog entry, popular categories, products, brands, services, reviews, contacts |
| Прибрати | дубльовані promo-carousels, випадкові банери, всі credit logos на homepage, декоративні stock-photo blocks |
| Перенести | деталі бонусів/кредиту в PDP/checkout; довгі SEO-тексти нижче; повний список категорій у mega-menu/catalog |
| Переробити | hero, trust, services, product modules, brands, consultation CTA, mobile floating controls |

---

# G. Proposed Catalog UX

## 1. Category landing anatomy

1. Breadcrumbs.
2. H1 + count + 1–2 речення, що пояснюють category.
3. Visual subcategories / popular types.
4. Decision shortcuts (“для квартири”, “до 150 м²”, “конденсаційні”).
5. Toolbar: sort, view, compare, stock city.
6. Selected filter chips.
7. Filter panel + product list.
8. Contextual guide / calculator.
9. FAQ / useful SEO content.
10. Recently viewed.

Breadcrumbs мають бути короткими, schema-enabled і не дублювати H1. SEO-текст над товарами — максимум 240–360 символів; повна довідка нижче.

## 2. Filter system

### Facet hierarchy

1. Availability / delivery.
2. Product type / application.
3. Primary sizing/output parameters.
4. Compatibility/connection.
5. Brand/series.
6. Efficiency/control/material.
7. Price.
8. Secondary characteristics.

Порядок category-specific. Для boiler: type → fuel → output → DHW → chimney → efficiency → brand. Для pump: application → duty point → connection → head/flow → material → power → brand.

### Interaction rules

- Sticky filters на desktop; accordion groups; перші 5–8 значень + search.
- Selected chips над list; “Скинути все” завжди поруч, individual remove.
- OR усередині одного facet, AND між facets; текстова підказка для винятків.
- Counts оновлюються до застосування; disabled zero values не зникають без пояснення.
- Numeric range + common presets; не slider-only.
- Tooltip з plain language і маленькою схемою.
- Dependent facets: тип товару визначає доступні параметри; несумісні значення disabled.
- URL/state shareable; back з PDP повертає scroll/filter state.

### Mobile filters

- Sticky bottom bar: **Фільтри (3)** / **Сортування**.
- Full-screen sheet; header з Close, Reset; accordion; 48 px rows.
- Sticky CTA “Показати 128 товарів”; selected chips перед list.
- Не застосовувати filter на кожен tap із стрибком сторінки.

**Патерн:** Ferguson/Grainger facets + mobile ecommerce sheet.  
**Чому:** користувач може зробити кілька уточнень і контролює результат.

## 3. Sorting

За замовчуванням не “популярність” без пояснення, а **Рекомендовані** з documented ranking: match to filters, availability, completeness, rating volume, commercial priority з обмеженням. Опції:

- Рекомендовані
- Спочатку в наявності
- Ціна ↑ / ↓
- Рейтинг
- Новинки
- Найшвидша доставка

Sponsored/priority placement позначати, не маскувати під organic match.

## 4. Product card

### Default grid

1. Фото 4:3 або 1:1, object-fit contain.
2. Один lifecycle/promo badge максимум + availability dot.
3. Brand eyebrow + MPN/code copy action.
4. Назва до 2–3 рядків.
5. 3–4 category-specific key specs.
6. Rating + review count лише якщо дані meaningful.
7. Ціна/стара ціна; “від X/міс” одним текстом.
8. Delivery promise / lead time.
9. Qty + Buy; compare/favorite secondary.

### PRO list view

| Select | Product | Code / MPN | 4 key specs | Stock/ETA | Price | Qty | Action |
|---|---|---|---|---|---|---|---|

Підтримати multi-select “додати до списку / порівняти / PDF”.

### Скільки інформації оптимально

**Default:** лише дані, які дозволяють відсіяти SKU без PDP. Якщо атрибут однаковий у 90% товарів, він не має бути в card. Video, bonus rules, all payment providers, full warranty і secondary benefits — PDP.

## 5. Compare

- Порівнювати лише близькі product types або попереджати про різні schemas.
- Sticky first column, горизонтальний scroll mobile.
- Toggle “Лише відмінності”.
- Attribute groups і highlight best/constraint, але без суб’єктивного “кращий”.
- Add to cart/list прямо з compare.

## 6. Category content and education

**Що:** додати 2–3 contextual modules — calculator, guide, glossary.  
**Чому:** користувач не залишає PLP, щоб зрозуміти BTU, напір або ΔT.  
**Патерн:** RS Guides & Articles у категорії; Grainger parameter explanations.

---

# H. Proposed Product Page — wireframe-level

## Структура зверху вниз

### 1. Breadcrumbs + lifecycle context

Короткий шлях. Якщо archived/discontinued — одразу помітний нейтральний статус і link “Підібрати актуальну заміну”; не показувати знижкову ціну як активну комерційну пропозицію.

### 2. Identity row

- Brand → brand hub.
- Product type / series.
- H1 без SEO-хвоста.
- Rating/reviews.
- Код Teploradost, MPN, EAN із copy.
- Compare / favorite / share.

### 3. Core product area: 12-column split

**Left 5:** gallery, zoom, video, 360, technical drawing; thumbnails; alt text.  
**Middle 3:** “Підійде, якщо…”, 4–6 key characteristics, variant selector / series matrix, “Що в комплекті”.  
**Right 4 — buy box:**

- status + exact stock/ETA;
- price, VAT state, old price only if real;
- one compact financing row;
- delivery estimator by city;
- quantity / unit / pack multiple;
- primary **Купити**;
- secondary **Потрібна допомога з підбором**;
- installation eligible CTA;
- warranty/returns/payment trust in 3 concise rows.

**Що змінити:** перенести ключові характеристики й fit до buy box, а не залишати все нижче.  
**Чому:** рішення про технічний товар залежить від придатності, не лише ціни.  
**Патерн:** Vaillant “Ideal for”, Viessmann “Application area”, SupplyHouse availability.

### 4. Sticky in-page navigation

Огляд · Характеристики · Сумісність · Документи · Монтаж · Відгуки. Після проходження hero на desktop справа sticky mini buy; на mobile — bottom bar “ціна + купити”.

### 5. System fit / application

2–4 конкретні use cases, constraints і “не підходить, якщо…”. Наприклад, не “для опалення”, а “для закритої системи до X bar; монтажна довжина 180 mm; живлення 230 V”.

### 6. “Що в комплекті”

Фото/список in-box і явне “Не входить: кабель/фітинги/димохід…”. Це зменшує false expectation.

### 7. “Потрібно для монтажу” — checklist

Тільки компоненти, без яких монтаж неможливий або типово потрібний.

| Item | Статус | UX |
|---|---|---|
| Обов’язковий | “Потрібно” | preselected лише якщо універсально й етично; причина + qty formula |
| Залежить від системи | “Перевірте” | 1–2 питання, після яких конкретний SKU |
| Рекомендований | “Радимо” | unchecked, benefit і compatibility proof |

CTA “Додати вибране (4) — X ₴”.  
**Патерн:** HeatandPlumb “You May Need”, але з жорсткішою compatibility data.

### 8. “Готовий комплект”

Системно валідований bundle:

- назва сценарію й обмеження (“будинок 120–160 м², 1 контур”);
- схема;
- component roles;
- variant choice;
- що входить / не входить;
- ціна разом, економія лише реальна;
- stock split і дата повної готовності;
- “Купити комплект / Змінити / Зберегти PDF”.

Це **не** “часто купують разом”; kit має owner, version і rule-based validation.

### 9. Characteristics

- Групи: performance, connections, control/electrical, dimensions, materials, operating limits, compliance.
- 8–12 найважливіших розкриті; решта “Усі 36”.
- Один параметр — одне нормалізоване значення й unit.
- Tooltip/glossary; copy; compare value.
- Performance curves/interactive chart для насосів; ΔT table для радіаторів.

**Патерн:** Caleffi data + Grainger normalized attributes + Grundfos curves.

### 10. Description / how it works

Не prose-полотно. Структура: benefit → mechanism → application → limitation → maintenance. Реальні product/system photos, cross-section, diagram.

### 11. Documentation center on PDP

Tabs/filters:

- Паспорт / datasheet
- Інструкція користувача
- Монтаж і пуск
- Сертифікат / declaration
- Креслення / CAD / BIM
- Гарантія
- Запчастини / service

Кожен рядок: document type, language, coverage, version/date, size, view/download.  
**Патерн:** ViBooks, Vaillant Literature, Uponor Catalogue.

### 12. “Сумісні товари”

Показувати **роль + правило**: “термостат — протокол eBUS, сумісний із поколінням після 2006”; “фітинг — 1½″, PN10”. Badge “Перевірено Teploradost / виробником”; link “чому сумісно”.

### 13. “З цим купують”

Поведінкова рекомендація, але тільки після safety filter. Label “Покупці часто додають”; не стверджувати технічну сумісність. Показати attach rate можна внутрішньо, не обов’язково користувачу.

### 14. “Аналоги”

Таблиця 3–5 replacement products:

| Product | Чому аналог | Відмінності | Stock | Price |
|---|---|---|---|---|

Види: official replacement, direct equivalent, upgrade, budget alternative. Для archived PDP official replacement перший.  
**Патерн:** Schneider Product Substitution + Grundfos Replacement.

### 15. Service / installation

Eligibility, geography, what included, starting price, lead time, installer qualification, warranty boundary. CTA “Замовити з монтажем”; створює один lead/order context.

### 16. Reviews and Q&A

- Verified purchase / verified installation.
- Filters by rating/product variant.
- Review prompt за performance, installation, noise, quality — category-specific.
- Q&A відповіді expert/brand; answers link to docs/specs.

### 17. FAQ + recently viewed

FAQ має відповідати на реальні support/search queries; schema тільки коли content visible. Recently viewed компактний, останній блок.

## Розмежування п’яти recommendation blocks

| Блок | Джерело даних | Обіцянка користувачу | Критерій |
|---|---|---|---|
| Потрібно для монтажу | Engineering rules/BOM | “Не забудете необхідне” | mandatory/dependent components |
| Сумісні товари | Manufacturer/PIM rules | “Технічно працює разом” | validated interface/protocol/dimensions |
| З цим купують | Order behavior + safety rules | “Інші часто додають” | co-purchase, не гарантія |
| Аналоги | Replacement/equivalence rules | “Можна замінити” | same role + documented differences |
| Готовий комплект | Versioned solution BOM | “Система зібрана під сценарій” | all required roles + constraints |

## PDP analytics events

`variant_select`, `stock_check`, `delivery_estimate`, `document_view`, `compatibility_explain`, `add_required_accessory`, `bundle_customize`, `consultation_start`, `install_request`, `replacement_select`, `review_filter`, `add_to_cart`.

---

# I. Proposed Search UX

## 1. Query understanding

Pipeline:

1. lowercase + Unicode normalization;
2. normalize hyphen/slash/space (`25-60`, `25 60`, `25/60`);
3. Ukrainian/Russian morphology;
4. keyboard layout recovery;
5. transliteration both directions;
6. synonyms/slang (`американка`, `гребінка`, `безперебійник`);
7. fuzzy typo with conservative distance for codes;
8. token classification: brand, model, MPN, internal code, numeric attribute/unit;
9. exact MPN/code boost;
10. availability and lifecycle-aware ranking.

Не застосовувати fuzzy до всіх numeric codes без обмеження: помилкова заміна однієї цифри може вести на іншу модель.

## 2. Ideal autocomplete

Запит: **`grundfos 25 60`**

```text
Можливо, ви шукали: Grundfos 25-60

ТОВАРИ (38)
[img] Grundfos ALPHA2 25-60 180
      Код 117118 · MPN 99411175
      В наявності · отримаєте 19 серпня       19 219 ₴
[img] Grundfos ALPHA1 L 25-60 130 …
...

КАТЕГОРІЇ
Циркуляційні насоси Grundfos                    42 товари
Насоси для рециркуляції ГВП Grundfos            8 товарів

БРЕНД
Grundfos — товари, документація, сервіс

РІШЕННЯ ТА ЗНАННЯ
Як підібрати циркуляційний насос
Заміна старого насоса Grundfos

[Показати всі 38 результатів]
```

Desktop dropdown 720–860 px; mobile full-screen overlay. 6–8 product results максимум. Keyboard ↑↓, Enter, Esc, screen-reader labels, highlighted matched tokens.

**Що змінити:** знизити debounce з 1000 до ~200–300 ms після локального input pause; кешувати popular queries.  
**Чому:** 1 s відчувається як затримка й провокує Enter до появи suggestions.  
**Патерн:** high-speed technical distributors; Rexel app позиціонує ultra-fast search.

## 3. Ranking

1. Exact internal code / MPN / EAN.
2. Exact model phrase + brand.
3. All tokens match normalized title/series.
4. Category/brand entity.
5. Attribute match.
6. Synonym/translit/fuzzy.
7. Content/solution.

Within same relevance: in-stock and current lifecycle may rank above unavailable, але archived exact code завжди показується з replacement.

## 4. Search results page

- H1 `Результати для “…”` + count.
- Correction, active tokens and interpreted filters (“Бренд: Grundfos”, “Напір: 6 м”).
- Tabs: Products / Categories / Articles & Documents.
- Facets derived from result set, but category-aware after dominant type.
- “Search within results”.
- Same PLP cards, sort, compare.
- Query explanation only when algorithm changed input.

## 5. Zero results

Не показувати blank state. Послідовність:

1. correction (“grunfos” → Grundfos);
2. remove lowest-confidence token;
3. exact manufacturer/brand/category links;
4. discontinued/replacement search;
5. recent/popular related queries;
6. “Надіслати код/фото шильдика” consultation.

Zero-result analytics повинна зберігати query, language, device, result after correction, next action і eventual conversion.

## 6. Search administration

- Synonym dictionary з owner і moderation.
- Redirect rules для high-value exact queries.
- Merchandising не може витісняти exact match.
- Dashboard: top queries, zero/low results, reformulations, no-click, search-assisted revenue.
- Content gap workflow: zero query → category manager task → synonym/product/content update.

---

# J. Shop by Solution / Shop by Job

## 1. Архітектура розділу

```text
/solutions/
├── heating-home/
│   ├── new-build/
│   ├── renovation/
│   └── replace-boiler/
├── underfloor-heating/
├── hot-water/
├── well-water/
├── pressure-boosting/
├── dhw-recirculation/
├── system-protection/
└── heating-automation/
```

Solution page — не стаття і не category. Вона має guided input і computable output.

## 2. Загальний flow

1. **Задача:** результат plain language.
2. **Об’єкт:** квартира/будинок/комерція, нове/реконструкція.
3. **Вхідні умови:** площа, тепловтрати/утеплення, джерело, точки, поверхи, мережа, існуюче обладнання.
4. **Constraints:** бюджет, шум, висота підлоги, fuel/electricity, smart control.
5. **Рекомендована system architecture:** схема й пояснення ролей.
6. **BOM:** required/optional, variants, quantities, compatibility status.
7. **Output:** total range, stock readiness, documents, installation, alternatives.
8. **Actions:** buy kit, save project, PDF/Excel, share, engineer review.

**Патерни:** Ferguson “What You’ll Need”, Viessmann questions → recommendation, Warmup quote, Caleffi Schemes → parts.

## 3. Приклад: “Опалення приватного будинку”

### Questions

- Площа й регіон.
- Новий будинок чи заміна.
- Рівень утеплення / відомі тепловтрати.
- Газ/електрика/тепловий насос/не знаю.
- Радіатори, тепла підлога або змішана система.
- Кількість санвузлів / потреба ГВП.
- Chimney/flue conditions.
- Remote control / backup power.

### Output roles

- Heat generator.
- Hydraulic distribution / manifold.
- Circulation.
- Expansion and safety.
- Air/dirt separation and protection.
- Emitters / underfloor loops.
- Control / sensors.
- DHW cylinder/recirculation if needed.
- Fittings, valves, insulation, consumables.
- Startup/installation.

Калькулятор має показувати assumptions і діапазон, не видавати engineering estimate за фінальний проєкт.

## 4. Приклад: “Вода зі свердловини”

Inputs: depth, static/dynamic level, distance, floors, simultaneous points, water quality, three-phase, tank/constant pressure. Output: pump duty point, cable/control, protection, check valve, tank/controller, filtration placeholder, fittings. Для невідомих даних — “Як виміряти” і engineer handoff.

## 5. Solution page anatomy

1. Hero з outcome і start CTA.
2. “Підходить для / не підходить”.
3. 3–7 step selector.
4. System schematic.
5. Recommended configurations: Essential / Balanced / Premium — відмінності функціональні, не лише ціна.
6. Editable BOM.
7. Installation scope.
8. Case study with measured context.
9. FAQ/documents.
10. Save/share/consult.

## 6. Governance

- Кожна solution має engineering owner, version, reviewed date.
- Component role не прив’язаний назавжди до одного SKU; rules select available alternatives.
- Якщо stock змінюється, система пропонує validated replacement, не розвалює комплект.
- У cart запускається completeness check.
- Analytics вимірює question drop-off і role substitutions.

---

# K. B2B / PRO UX

## 1. PRO dashboard

- Quick Order.
- Projects / Joblists.
- Saved carts and templates.
- Reorder / Buy Again.
- Quotes and orders.
- Invoices, VAT documents, returns.
- Contract prices and stock.
- Users, roles, approvals, cost centers.
- Documents/submittal packages.
- Dedicated manager / technical support.

## 2. Quick Order

Три modes:

1. Rows: code / MPN / quantity.
2. Paste from spreadsheet — parser показує matched, ambiguous, unavailable.
3. Upload CSV/XLSX — mapping columns.

Result table: requested value → matched SKU → stock/ETA → customer price → replacement/warning. Bulk “add all valid”.  
**Патерн:** SupplyHouse Quick Order.  
**Business effect:** зменшує cost-to-order і стимулює повторні великі кошики.

## 3. Project / Joblist

- Project name, client/object, address, stage.
- Sections by system/room/floor.
- Internal notes and attachments.
- Share read-only/edit/approve.
- Revision history.
- Export PDF/XLSX; generate commercial offer.
- Convert all/section to cart.
- Substitute unavailable items with review.

**Патерн:** Rexel Joblists + Reece job context + Uponor submittal package.

## 4. Procurement controls

For larger B2B:

- Individual permissions and approval thresholds.
- Budgets/cost centers.
- Customer-specific part numbers.
- PO number required/optional.
- Delivery to several job sites.
- Split shipments and backorder policy.
- EDI/API/OCI in later phase.

**Патерн:** [Würth e-business](https://www.wurth.co.uk/en/wurth_gb/digital/digital.php) — approvals, cost centres, OCI/EDI, barcode reorder.

## 5. PRO product experience

- List view default.
- Ex-VAT/inc-VAT preference.
- Warehouse stock count and cut-off.
- Quantity multiples/packaging.
- MPN/internal/customer code.
- Download all documents as package.
- Tender text, CAD/BIM where applicable.
- “Add to project” primary alongside cart.

## 6. PRO mobile

- Barcode/QR scan.
- Photo/nameplate upload to find replacement.
- Voice search/slang support.
- Branch/warehouse stock.
- Recent orders and one-tap reorder.
- Offline/open document cache optional.

**Патерн:** Rexel mobile voice/slang/barcode; Screwfix near-store stock; Geberit Pro image recognition.

---

# L. Mobile UX

## 1. Global mobile shell

Header: menu/logo/cart first row, full-width search second row; on scroll search collapses to icon only after intent is clear. Bottom nav максимум 5: Home, Catalog, Search, Lists/Favorites, Cart. Call/chat — одна support action, не кілька overlapping bubbles.

## 2. Homepage

- No desktop sidebar.
- Hero ≤65–70% first viewport; CTA visible on 360×800.
- Task cards horizontal only if partially visible next card indicates scroll; otherwise 2-column.
- No autoplay text carousel.
- Product cards 1.4–1.6 per viewport width, not tiny 2-column overload for technical categories.

## 3. PLP

- 44–48 px filter/sort controls.
- Chips horizontal scroll with remove.
- Card key attributes limited to 3.
- Compare via select mode, not tiny checkbox.
- State restored after PDP/back.

## 4. PDP

- Gallery first but capped; swipe + thumbnails indicator.
- H1, code, fit, variant, stock, price before long promo.
- Sticky bottom buy bar avoids overlap with support widget.
- Specs use definition rows, not wide table.
- Documents have tap-to-view and clear size.
- Bundle configuration stepper/full-screen sheet.

## 5. Checkout

- One primary task per screen; numeric/email keyboards.
- Address autocomplete; “same as recipient” defaults.
- Delivery cards include date, price, restrictions.
- Sticky total + Continue.
- Apple/Google Pay where operationally available; payment methods grouped, not logo wall.
- Error attached to field, focus moves to first error, entered values remain.

## 6. Accessibility baseline

- WCAG 2.2 AA target.
- Text 16 px body, technical secondary minimum 14 px where necessary.
- Contrast ≥4.5:1 body.
- Visible focus, keyboard mega-menu/search/filter.
- Accessible names for icon buttons.
- No color-only availability.
- Reduced motion; no essential info in hover.

---

# M. Visual direction

## Concept: “Calm Engineering Commerce”

Новий сайт ТД «Софіївка» має виглядати як магазин, у якому **точність інженера поєднана з ясністю сучасного ecommerce**. Не luxury заради luxury і не marketplace noise.

## 1. Palette

| Token | Орієнтир | Використання |
|---|---|---|
| Brand Yellow | `#FFC808` | primary CTA, active state, selected control, key brand accent |
| Brand Yellow Hover | `#F2BB00` | hover primary CTA |
| Brand Yellow Pressed | `#DFAA00` | pressed/active primary CTA |
| Brand Yellow Tint | `#FFF5CE` | soft highlight, selected background, informational accent |
| Canvas | `#F5F4EF` warm off-white | Загальний фон, editorial sections |
| Surface | `#FFFFFF` | cards, forms, overlays |
| Ink / Graphite | `#202020` | headings, body, text/icons on yellow |
| Deep Graphite | `#151515` | dark hero, header/footer, premium contrast sections |
| Muted | `#686762` | secondary text |
| Subtle | `#8C8A84` | codes, captions, metadata |
| Border | `#DDDAD2` | quiet separators |
| Technical | `#275D8C` | info, documents, diagrams |
| Success | `#18794E` | in stock, verified compatibility, successful state |
| Warning | `#8A5A00` | lead time, conditional fit, limited stock |
| Danger/discount | `#B42318` | errors, real time-limited price only |

Жовтий займає не більше 5% інтерфейсу й веде до ключової дії; його не використовують як великий фоновий декор. Орієнтовний розподіл: 65–70% Canvas, 20–25% Surface, 8–10% Graphite, до 5% Brand Yellow. Не більше одного акценту на компонент. Promo campaign може мати art direction, але не змінює semantic UI colors.

Контрастні правила: текст на жовтому — тільки `#202020` (контраст 10.49:1); білий на `#FFC808` заборонений (1.55:1); білий на `#202020` дозволений (16.29:1). Знижки позначаються `#B42318`, щоб жовтий залишався брендовим, а не суто акційним кольором.

## 2. Typography

- Основний і єдиний UI/display шрифт: **Manrope** з повною українською кирилицею.
- Рекомендовані ваги: 400 body, 500 controls/metadata, 600 product names/subheadings, 700 key headings/price; 800 лише для великих editorial акцентів.
- Використовувати OpenType/tabular numerals (`font-variant-numeric: tabular-nums`) у цінах, кодах, залишках і технічних таблицях.
- Technical/data accent: IBM Plex Mono лише для MPN, codes, measurements; не для всього UI.
- Display 48–64 desktop / 34–42 mobile; H1 PLP 36–44; body 16–18; line-height 1.45–1.6.
- Назви товарів не робити uppercase; одиниці й числа non-breaking.

Manrope self-host у WOFF2: окремі статичні файли 400/500/600/700 або один variable-файл після performance-тесту; `font-display: swap`; preconnect до зовнішнього font CDN не потрібен.

## 3. Grid and spacing

- Max content 1360–1440; 12 columns desktop, 8 tablet, 4 mobile.
- Base 4 px; common gaps 8/12/16/24/32/48/72/96.
- Section rhythm 80–120 desktop, 56–80 mobile.
- PLP може бути щільнішим за storytelling, але щільність керована templates, не випадкова.

## 4. Radius, border, shadow

- Controls 8–10 px; cards 12 px; large editorial 16 px.
- Border 1 px тихий; shadow лише overlay/sticky elevation, не кожна card.
- Не робити nested cards. Розділяти background, spacing і rule.

## 5. Product cards

Білі/neutral surfaces, багато чистого простору навколо cutout, однакова baseline назви/price/actions. Hover: border/translation 1–2 px, без драматичних glow.

## 6. Iconography

Єдиний outline set 20/24 px, 1.75–2 px stroke; filled лише active. Технічні symbols можуть бути custom, але з legend/tooltips.

## 7. Photography and illustration

- Реальні змонтовані системи, українські об’єкти, команда, склад.
- Product cutouts із consistent angle/background.
- Cross-section, exploded view, hydraulic/electrical schemes.
- 3D lifestyle render лише коли пояснює placement.
- Заборонити generic “усміхнена сім’я біля термостата” як основний доказ.

## 8. Motion

150–220 ms UI transitions; motion пояснює filter apply, cart add, steps. No autoplay hero carousel. Respect `prefers-reduced-motion`.

## 9. Density modes

- Consumer default: airy, benefit-first.
- PRO/list: compact rows, data-first.
- Один design system із density tokens, не два disconnected UI.

---

# N. Quick wins без повного редизайну

| # | Зміна | Чому | Патерн / effort | KPI |
|---:|---|---|---|---|
| 1 | Додати typo dictionary `grunfos→grundfos`, layout/translit/synonyms | Миттєво знижує zero-results | Rexel slang; **S–M** | zero-result rate |
| 2 | Autocomplete: code, stock, 8 results, categories/brand/content | Більше релевантних виходів | Proposed hybrid; **M** | autocomplete CTR |
| 3 | Скоротити debounce search 1000→250 ms | Підказка встигає до Enter | Fast technical search; **S** | suggestion impression/use |
| 4 | Прибрати 50–70% promo badges із cards | Швидше сканування | SupplyHouse; **S** | PLP→PDP, add-to-cart |
| 5 | Визначити 3 key specs на 10 top categories | Зменшує відкривання невідповідних PDP | Ferguson/Grainger; **M** | PDP back rate |
| 6 | Selected filter chips + sticky reset | Контроль складного підбору | Ferguson; **M** | filter success |
| 7 | Reorder filters by category importance | Прискорює selection | Grainger; **M** | time to first product click |
| 8 | Archived PDP: status + replacement table | Монетизує SEO-трафік старих моделей | Grundfos/Schneider; **M** | archived→current CTR |
| 9 | Об’єднати installment logos в один disclosure | Buy CTA стає головним | Calm buy box; **S** | add-to-cart |
| 10 | Додати “Підійде, якщо…” над fold на top PDP | B2C швидше оцінює fit | Vaillant/Viessmann; **M** | add/consultation |
| 11 | Розвести labels 5 recommendation blocks | Прибирає хибну обіцянку сумісності | HeatandPlumb + rules; **S–M** | accessory returns |
| 12 | Document rows: type/language/date/size | PRO швидше знаходить файл | ViBooks; **M** | document success |
| 13 | Homepage: одна hero + один promo module | Відновлює ієрархію | Reece/Warmup; **M** | hero route CTR |
| 14 | Додати 6 “Почніть із задачі” links | Валідовує solution demand | Ferguson; **M** | solution CTR/leads |
| 15 | Сховати optional checkout fields | Менше form burden | Progressive checkout; **S** | step completion |
| 16 | Показувати payment minimum до select | Менше surprise/errors | Checkout evidence; **S** | payment validation errors |
| 17 | Audit alt: 133 missing на homepage | Accessibility/SEO | Content QA; **S–M** | alt coverage |
| 18 | Прибрати конфлікт floating call/bottom nav/sticky CTA | Менше перекриття mobile | Mobile baseline; **S** | rage/dead clicks |
| 19 | Переписати 50 top SEO/PDP intros | Підвищує trust і scan | Viessmann/Caleffi; **M** | engagement/consultation |
| 20 | Event taxonomy для search/filter/bundle/docs | Дає базу для рішень | Product analytics; **M** | data coverage |

## Перші A/B / usability tests

1. Card clean-up: current vs reduced badges + key specs.
2. Search dropdown: products-only vs sectional.
3. PDP top: current vs fit summary + consolidated finance.
4. Homepage: promo-first vs task-first.
5. Mobile filter: auto-apply vs “Показати N”.

Usability tasks: знайти насос за неточною назвою; замінити archived model; підібрати котел для заданого об’єкта; додати все для монтажу; знайти installation manual; повторити B2B order з 12 SKU.

---

# O. Redesign priorities

## Phase 1 — Foundation and findability (0–12 тижнів)

**Ціль:** зменшити втрати на search/PLP/PDP і підготувати data foundation.

- Analytics audit і event taxonomy.
- SEO crawl, URL inventory, template baseline.
- PIM attribute dictionary для top 10 categories.
- Search typo/translit/synonym and autocomplete v1.
- PLP filter order, chips, card cleanup, PRO list pilot.
- PDP top re-layout, lifecycle/replacement, document taxonomy.
- Mobile overlap/accessibility quick fixes.
- Homepage hierarchy cleanup без повної зміни CMS.

**Exit criteria:** search zero-result ↓, PLP→PDP/add ↑, indexed pages/canonical stable, top-category data completeness ≥90%, no critical WCAG blocker.

## Phase 2 — System commerce (3–7 місяців)

**Ціль:** перейти від продажу SKU до комплекту.

- Compatibility graph v1 для котлів, насосів, теплої підлоги.
- Five recommendation block semantics.
- Bundle builder і cart completeness.
- New homepage + mega-menu + brand hubs.
- Solution MVP: 3 flows (заміна котла, тепла підлога, вода зі свердловини).
- Calculators і expert handoff.
- Checkout progressive redesign.
- Document Center.
- PRO lists, saved carts, reorder, quick order paste/CSV.

**Exit criteria:** accessory attach ↑ без returns ↑; solution completion/quote; checkout completion ↑; PRO repeat-order time ↓.

## Phase 3 — Professional platform and scale (7–15 місяців)

**Ціль:** зробити Teploradost інструментом проєктування й закупівлі.

- Projects/job sites, revisions, approvals, cost centers.
- Price/stock by account and warehouse; multi-address deliveries.
- Full solution library and versioned BOM governance.
- CAD/BIM/tender text for strategic ranges.
- Replacement by nameplate/photo and manufacturer cross-reference.
- Barcode scanner, PRO mobile enhancements.
- ERP/EDI/API/OCI integrations where ROI validated.
- Personalization by role and lifecycle; experimentation platform.

**Exit criteria:** B2B digital share, reorder frequency, project-to-order, document/tool usage, lower support cost/order, lower incompatible return rate.

## Залежності й команда

| Workstream | Owner | Критична залежність |
|---|---|---|
| IA/UX | Product + UX Lead | research, category expert access |
| PIM/compatibility | Product data lead + engineers | manufacturer data, governance |
| Search | Search engineer + ecommerce | query logs, synonym owner |
| SEO | Technical SEO | crawl, migration rules, content |
| UI/design system | Design lead + frontend | tokens, density, accessibility |
| Solutions | HVAC engineer + content + product | calculation assumptions, liability wording |
| PRO | B2B product owner | customer interviews, ERP/account rules |
| Analytics/CRO | Analyst + CRO | clean events, experiment traffic |

## Основні ризики

1. Візуальний редизайн без PIM — швидке повернення хаосу.
2. Solution calculator без engineering governance — неправильні рекомендації й liability.
3. URL restructuring без crawl/mapping — organic traffic loss.
4. Personalization без явного control — користувач не бачить потрібної інформації.
5. Merchandising у search — exact SKU може втратити позицію.
6. Надмірний PRO scope у Phase 1 — довга розробка без швидкого user value.

---

# Appendix 1. Детальний screen-by-screen аудит поточного Teploradost

## Header

### Що працює

- Логотип помітний і стабільно веде на головну.
- Catalog button, search, language, compare, favorite, phone і cart доступні з header.
- Search має descriptive placeholder, clear control і mobile overlay behavior.
- Cart count і переходи зрозумілі; mobile header компактніший за desktop.

### Проблеми

- Забагато однаково помітних actions; немає явної різниці між shopping, support і utility.
- Телефон/контакт і floating callback дублюють support entry.
- Search широкий, але його dropdown функціонально бідніший, ніж візуальна вага поля обіцяє.
- Language/compare/favorite/phone/cart створюють icon decoding burden.

### Рішення

**Що:** catalog + search домінують; account/lists/cart — primary utilities; compare з’являється контекстно; contacts у Help.  
**Чому:** header має підтримувати 80% high-frequency дій, не показувати всю функціональність сайту.  
**Патерн:** Reece/SupplyHouse.

## Навігація і mega-menu

### Що працює

- Каталог широкий і реальний; категорії мають підкатегорії, а URL зберігає hierarchy.
- Структура охоплює automation, safety, HVAC, plumbing, pumps та інші суміжні напрями.

### Проблеми

- Глибина й технічна термінологія змушують новачка знати component class до початку.
- Розширення асортименту за межі core HVAC збільшує top-level cognitive load.
- Немає другого виміру “за застосуванням/задачею”.

### Рішення

Plain-language subtitles, top-level consolidation, task column, “не знаєте, що обрати?” guided entry. SEO pages і URL лишаються.

## Homepage

### Перший екран

**Сильне:** каталог і пошук доступні; багато входів до асортименту.  
**Слабке:** sidebar categories, quick categories, banner/promos і utilities конкурують; немає єдиного value proposition.  
**Зміна:** hero з system promise і трьома routes; category sidebar переноситься в mega-menu. Патерн: Reece/Warmup calm hero.

### Банери й акції

**Сильне:** сайт активно мерчандайзить і може швидко просувати offers.  
**Слабке:** повтори, різні art directions і red-sale cues створюють ad blindness.  
**Зміна:** один governed promo slot, campaign calendar і creative template. Патерн: не копіювати promo density HeatandPlumb/Plumbworld.

### Категорії

**Сильне:** візуальні точки входу.  
**Слабке:** їх багато, порядок не пояснений user jobs.  
**Зміна:** 8–12 strategic categories + 6 solution jobs; решта в catalog.

### Product carousels

**Сильне:** показують breadth, ціни й availability.  
**Слабке:** кілька однакових carousels створюють довгу “полицю без магазину”.  
**Зміна:** один curated tabbed module з чіткими rules; персоналізація пізніше.

### Trust

**Сильне:** контакти, reviews, services, гарантійні/платіжні повідомлення існують.  
**Слабке:** trust розчиняється в промо і повторюється generic statements.  
**Зміна:** risk-proximate proof — delivery біля stock, warranty біля CTA, expertise біля solution.

### Контент і performance

У перевіреному HTML головна мала приблизно 170 `<img>`, із них близько 133 без meaningful `alt`. Це не означає, що всі decorative images потребують тексту, але показує відсутність content linting. Велика кількість media й third-party widgets збільшує LCP/INP-ризик.

## Category / PLP

### Breadcrumbs, H1, subcategories

**Сильне:** hierarchy, H1 і visual subcategory tiles дають контекст.  
**Слабке:** довга category copy може відсувати вибір; subcategory і filters не завжди пояснюють різницю.  
**Зміна:** короткий intro, decision shortcuts, education нижче.

### Filters

**Сильне:** price, brands і технічні характеристики існують; це важливий актив.  
**Слабке:** порядок не завжди відображає selection sequence; технічні labels без tooltip; mobile modal успадковує великий набір; selected-state потребує сильнішого control.  
**Зміна:** facet schema by category, selected chips, range presets, dependency, “show N”.

### Product cards

У картках є code, image, title, stock, reviews, price/old price, discount, video, bonus, installments, favorite/compare, CTA. Це функціонально багато, але scan cost високий. “Оптова ціна”, “доставка 1 грн”, bonus і bank counter не мають однаково конкурувати з product identity.

**Recommended card:** code + brand + title + 3 specs + price + stock/ETA + buy; інше progressive.

## PDP

### Сильні активи

- Gallery з кількома фото, іноді video.
- Title, reviews, code, brand, stock.
- Price, buy, one-click, installment, bonus, wholesale, installation.
- Delivery/payment/warranty detail.
- Description, characteristics, documentation, certificates, photos, reviews.
- “Купують разом” і analog behavior на archived products.

### Ключові проблеми

1. Buy area має забагато parallel CTAs/signals.
2. Key fit/limitations не завжди видно до description/specs.
3. Long title/SEO copy погіршує scan і довіру.
4. Related semantics нечіткі: behavioral “купують” не гарантує compatibility.
5. Archived/current price/states можуть виглядати як active offer, хоча buy impossible.
6. Documents існують, але version/language/audience не уніфіковані.

### Приклад перевіреного товару

На PDP Grundfos ALPHA2 25-60 180 видно code `117118`, manufacturer, stock, wholesale price, installation CTA, price, buy/one-click і bonus. Це багато корисних signals; новий дизайн має не видалити їх, а подати в послідовності **fit → availability → price → buy → service**, а wholesale/installment details розкрити.

## Search

### Реальні результати

| Query | Autocomplete |
|---|---|
| `grundfos 25 60` | 5 товарів; перші релевантні ALPHA1/ALPHA2 |
| `грундфос 25 60` | 5 товарів |
| `grunfos 25 60` | 0 |
| `grundfos 99411175` | точний ALPHA2 |
| `020628` | точний archived UPS 25-60 |

Отже exact codes і common Cyrillic brand працюють; typo recovery й mixed-entity dropdown — головні gaps.

## Services

Сторінка має hero CTA, список service directions і чотири кроки “Як ми працюємо”. Це правильна база, але stock images і відсутність product-context послаблюють довіру.

**Зміна:** cases, real technicians, certifications, geography/SLA, service scope; service CTA на eligible PDP/solution.  
**Патерн:** Warmup installer network + Vaillant Find an Installer.

## Cart / checkout

### Що працює

- Add-to-cart дає modal feedback і може показувати related/cheaper-together blocks.
- Checkout структурований у три кроки: Contact, Delivery, Payment.
- Є guest continuation, city/delivery selection, promo, optional “не дзвонити”, payment constraints.

### Проблеми

- Login form усередині first step додає complexity до guest path.
- Довга форма показує багато optional/contact/address fields одразу.
- Payment minimum може стати пізнім surprise.
- Cart cross-sell має успадкувати compatibility semantics, а не лише sales logic.

### Рішення

Guest-first, collapsible summary, optional disclosure, early eligibility, exact delivery, sticky total. Cart має показувати “Комплект повний / бракує X” лише для validated system context.

## Mobile

### Що працює

- Compact header, horizontal categories, sticky catalog button, bottom navigation.
- Product/cards і main actions доступні; mobile не є просто desktop overflow.

### Проблеми

- Promo density і carousels створюють довгу сторінку.
- Floating call, bottom navigation і potential sticky CTA можуть перекриватися.
- Technical filters/cards залишаються щільними; small icons мають touch-target risk.

### Рішення

Full-screen search/filter, 48 px controls, clean bottom hierarchy, 1–1.5 card width, sticky buy bar, no overlapping widgets.

---

# Appendix 2. Додаткові світові референси (15)

## 1. Grainger

[Pumps category](https://www.grainger.com/category/pumps) і [deep-well pump filters](https://www.grainger.com/category/pumps/well-groundwater-pumps/submersible-deep-well-pumps) варті уваги через application taxonomy, десятки тисяч SKU, filter explanations, standards, previously purchased, branch stock і normalized PDP specs/CAD. Для Teploradost: пояснювати HP/head/connection прямо у facet і зробити “раніше купували” PRO-фільтром. Не копіювати enterprise density без progressive disclosure.

## 2. McMaster-Carr

[McMaster-Carr catalog](https://www.mcmaster.com/) — еталон швидкого переходу від function до precise part. Filters містять ілюстровані типи, material, measurements, compliance; product families мають короткі functional descriptions, CAD і certificates. Для Teploradost: “що робить” перед назвою серії, visual filter values, verified specs. UI дуже утилітарний — це reference логіки, не visual target.

## 3. RS

[RS HVAC category](https://uk.rs-online.com/web/c/hvac-fans-thermal-management/) поєднує 8,000+ results, in-stock, brand, technical facets, MPN/stock number, ex-VAT price, qty/add і Guides & Articles. Для Teploradost: PRO list view, contextual education у PLP, manufacturer + internal code, filter search. Уникати сотень необроблених значень без category curation.

## 4. Screwfix

[Screwfix app](https://press.screwfix.com/screwfix-launches-new-app/) показує близькі stores, live stock, Click & Collect check-in, basket QR для оплати в store. Для Teploradost: mobile branch/warehouse context, QR/shareable cart, pickup ETA. Сила — omnichannel certainty, не складна технічна документація.

## 5. Toolstation

[Toolstation Plumbing](https://www.toolstation.com/plumbing/c15) і trade account демонструють 5-minute click & collect, delivery, product code, ex/incl VAT, quantity прямо у list. Для Teploradost: отримання товару як primary card data й дуже короткий reorder path. Не переносити bargain-led visual tone у premium direction.

## 6. Hilti

[Hilti product page](https://www.hilti.co.uk/c/CLS_MEA_TOOL_INSERT_7127/CLS_MEA_DIGITAL_LAYOUT_TOOLS_7127/r4728599) має configurator, technical data, documents, options, features і applications; [BIM/CAD resources](https://www.hilti.co.uk/content/hilti/E1/GB/en/business/business/engineering/bim-cad-resources.html) інтегруються з Revit/AutoCAD/Tekla. Для Teploradost: product configuration, approval/certificate на variant level, engineering center.

## 7. Würth

[Würth Online Shop](https://www.wurth.co.uk/en/wurth_gb/services/e_business/wuerth_online_shop/wuerth_onlineshop.php) підтримує product/name/number/trade-name search, certifications, datasheets, 3-click order, cost centres, approvals, Click & Collect і subscriptions. Для Teploradost: purchasing governance, scheduled replenishment, customer-specific workflow; це Phase 3 PRO reference.

## 8. Schneider Electric

[Schneider Help Centre](https://www.se.com/uk/en/work/support/) об’єднує product selector, documentation/CAD/certificates, product substitution, real-time price/availability і order management. Для Teploradost: один support hub за customer job, lifecycle-aware replacement і multi-product availability check.

## 9. Rexel

[Rexel website features](https://www.rexel.co.uk/uki/website-features) — slang search, saved carts, joblists, one-click related suggestions, invoices; [mobile](https://www.rexel.co.uk/uki/mobile-app) — voice search, live stock/price, branch pickup. Це найближчий reference для українського PRO electrical/HVAC commerce: customer vocabulary, joblist-to-cart і account documents.

## 10. Wavin

[Wavin Tools & Services](https://wavin.com/gb/tools-services) і [BIM Revit](https://wavin.com/gb/tools-services/bim-centre) мають intelligent assistance, automatic fittings, validation і automated bill of materials. Для Teploradost: майбутній pipe/underfloor configurator повинен не просто малювати, а генерувати реальні part numbers і перевіряти junctions.

## 11. Geberit

[Geberit BIM Plug-in](https://geberit-country-gisa.prod.platform.web.geberit.com/sanitary-piping-systems/digital-tools-software/geberit-bim-plug-in/) дає central catalogue, compatible selection, documents і planning; Geberit Pro використовує scan/image recognition для ідентифікації product/spares. Для Teploradost: nameplate/photo replacement, compatible assembly selector, spare-part workflows.

## 12. Grundfos Product Center

[Grundfos Help Centre/Product tools](https://www.grundfos.com/solutions/support/help-centre) об’єднує sizing, pump replacement, liquids, curves, CAD, BIM, drawings і docs. Для Teploradost: окремий “Підібрати насос” із Q/H, replacement будь-якого бренду, curve viewer і project save. Це сильніший reference за звичайну ecommerce PLP для насосів.

## 13. Danfoss

[Danfoss Design Center](https://designcenter.danfoss.com/en-us/tools) має Heat Selector, Coolselector, BIM і HVAC design; contractor hub дає Ref Tools, troubleshooting, product finder і spare parts. Для Teploradost: field tools і troubleshooting можуть створювати довічну цінність після продажу, а не лише lead до SKU.

## 14. DigiKey

[DigiKey parametric listing](https://www.digikey.com/en/products/filter/industrial-sensors/temperature-sensors-analog-and-digital-output-industrial/1073) — приклад extreme SKU scale: stacked/scrolling filters, compare-ready table, MPN, quantity available, price breaks, status, specs, downloadable table, parametric equivalents. Для Teploradost: PRO table mode і substitutes; не копіювати 20+ columns для B2C.

## 15. Fastenal

[Fastenal CAD Resources](https://www.fastenal.com/fast/services-and-solutions/product-resources/cad-resources) показує CAD icon безпосередньо на PDP, interactive viewer, 19 export formats, 2D drawings і product standards. Для Teploradost: CAD/BIM availability має бути видимим attribute/action, а не захованим у footer support.

## Як використати додаткові референси без “feature bloat”

| Потреба Teploradost | 1-й reference | 2-й reference | Фаза |
|---|---|---|---|
| Search language | Rexel | SupplyHouse | 1 |
| Technical filters | Grainger | RS/DigiKey | 1 |
| Replacement | Grundfos | Schneider/Geberit | 1–2 |
| Solution BOM | Wavin | Caleffi | 2 |
| Documents | ViBooks | Schneider/Hilti | 1–2 |
| PRO ordering | SupplyHouse | Würth/Rexel | 2–3 |
| CAD/BIM | Hilti | Wavin/Fastenal | 3 |
| Omnichannel mobile | Screwfix | Toolstation/Rexel | 2–3 |

---

# Appendix 3. Рекомендований delivery package для старту дизайну

Щоб команда могла почати без повторного “discovery з нуля”, наступними артефактами мають бути:

1. **Current-state sitemap + URL/SEO inventory.**
2. **Target IA** з catalog/solution/knowledge/PRO.
3. **Attribute dictionary** для котлів, насосів, теплої підлоги.
4. **Search relevance spec** з 200 representative queries і expected results.
5. **Compatibility relation spec** і ownership.
6. **Wireframes:** homepage, mega-menu, PLP grid/list, compare, current/archived PDP, bundle, search, cart, 3-step checkout, PRO quick order, solution selector.
7. **Design system:** tokens, responsive grid, density modes, cards, filters, data tables, documents, status/badges, form validation.
8. **Content templates:** product title, fit summary, key specs, application/limits, document metadata, solution case.
9. **Analytics plan** і experiment backlog.
10. **Migration QA checklist** SEO/performance/accessibility/data.

## П’ять рішень, які Product Manager має зафіксувати першими

1. Які 10 категорій дають найбільше revenue/search/support — вони йдуть у Phase 1 PIM.
2. Які три solution flows мають достатньо expert data й попиту для MVP.
3. Яке визначення “сумісності” юридично й операційно може гарантувати магазин.
4. Які stock/ETA дані справді надійні й з якою freshness.
5. Які PRO capabilities підтримує ERP зараз, а які потребують інтеграцій.

---

## Підсумкова продуктова теза

Teploradost не повинен перемагати кількістю банерів або виглядати як полегшена копія Viessmann. Його унікальна позиція сильніша: **multi-brand engineering commerce**, де покупець може знайти точний SKU, зрозуміти рішення, перевірити сумісність, зібрати повний комплект, отримати документацію, доставку й монтаж в одному місці. SupplyHouse дає швидкість, Ferguson — job logic, Warmup/Viessmann — пояснення, Caleffi/Uponor — технічну глибину. Власна система Teploradost має з’єднати ці якості навколо українського сервісу, складу, оплати та монтажу.

---

# Appendix 4. Повний coverage-check 10 обов’язкових референсів

Ця матриця доповнює детальні breakdown вище й гарантує, що для кожного сайту окремо оцінені ecommerce, великий каталог, PDP, search/filters, mobile і visual layer.

| Сайт | Ecommerce / великий каталог | PDP | Search & filters | Mobile UX | UI / що адаптувати і чого уникати |
|---|---|---|---|---|---|
| SupplyHouse | Quick Order, lists, reorder, stock/ETA, 2k+ boiler SKU | SKU, Q&A, stock qty, delivery, manuals, parts, returns | Сильний known-item і replacement; глибокі facets | Функціональний PRO-first; висока density | **Адаптувати:** quick order, exact ETA, replacement. **Уникати:** утилітарності як єдиного visual tone |
| Ferguson | Shop by Job, branch inventory, item/part identifiers, compliance | Branch/shipping context, compare/list, technical product data | Feature shortcuts + дуже глибокі application facets | Job entry корисний; великі filters потребують sheet/progressive | **Адаптувати:** job→BOM, feature shortcuts. **Уникати:** account gating і enterprise clutter |
| Reece | Divisions, Buy Again, job/ship-to account, service logistics | Trade/account context переважає editorial product story | Великий search у header; product discovery залежить від location/account | App/account pattern сильний для польових закупівель | **Адаптувати:** project context, operational services. **Уникати:** consumer/trade ambiguity |
| HeatandPlumb | B2C catalog + trade discounts; variants, stock, delivery | Variant selector, postcode ETA, specs, “You May Need” | Type/feature/style mega-menu; radiator facets і calculator context | Responsive shopping; mega-menu/filter density усе ще висока | **Адаптувати:** installation add-ons. **Уникати:** deal/payment noise й надвелике menu |
| Plumbworld | Сильний B2C, hundreds of radiator results, options and stock | Technical drawings, Delta30/50, size/color variants, compatible parts, reviews | Facets by width/height/BTU/orientation/material | Consumer-friendly cards, але long PDP/promos збільшують scroll | **Адаптувати:** variant matrix, visual education. **Уникати:** excessive urgency/SEO length |
| Warmup | Quote-led system commerce; professional/reseller/project flows | Guide price, benefits, diagrams, warranty, docs, “you will also need” | Product families і quote tools важливіші за SKU search | Clean story; long sections треба стискати на small screens | **Адаптувати:** solution story і quote. **Уникати:** заміни всього ecommerce lead-form воронкою |
| Viessmann | Manufacturer solution funnel, Product Finder, installer leads | Application, output/COP, efficiency, cross-section, downloads | Guided questions і serial/item document search; не multi-brand facets | Premium responsive storytelling; technical tables потребують mobile grouping | **Адаптувати:** visual calm, fit summary, ViBooks. **Уникати:** manufacturer-only порівняння |
| Vaillant | Full-system products, service/quote, consumer + professional support | Ideal-for, benefits, related system products, installer, downloads | Product navigation + literature type filters; compatibility partly narrative | Clear consumer modules, але довгі stories і portal split | **Адаптувати:** system relations, installer CTA. **Уникати:** fragmented consumer/pro domains |
| Uponor | System/solution catalogue, personal catalogue, submittal/BIM | Product-system context і docs; direct cart/stock не core | Search by name/part; system/product-group filters | Responsive solution experience; content repetition creates scroll | **Адаптувати:** audience benefits, submittal, system taxonomy. **Уникати:** marketing repetition |
| Caleffi | Professional catalogue, family/series, schemes, BOM, BIM | Part matrix, technical data, drawings, tender text, 3D, applications | Code/name search, family/subfamily taxonomy; B2C guidance слабка | Data-heavy pages usable, but not novice-first | **Адаптувати:** series matrix, copyable specs, scheme→BOM. **Уникати:** raw engineering taxonomy for B2C |

## Примітка щодо mobile і checkout референсів

Публічні mobile/layout states оцінювалися там, де сторінки були доступні без авторизації. Account-specific ordering, contract pricing і фінальне проведення оплати навмисно не виконувалися. Тому recommendations спираються на видимі flows, офіційно описані можливості й перевірені публічні сторінки, а не на припущення про закриті кабінети.

## Основні сторінки Teploradost, перевірені в аудиті

- [Головна](https://teploradost.com.ua/ua)
- [Категорія газових котлів](https://teploradost.com.ua/ua/kotly-otopleniya/gazovye-kotly/)
- [PDP Baxi Duo-tec Compact](https://teploradost.com.ua/ua/dvuhkonturnyj-kondensacionnyj-kotel-baxi-duotec-compact-24-e)
- [PDP Grundfos ALPHA2 25-60 180](https://teploradost.com.ua/ua/cirkulyacionnyj-nasos-grundfosalpha22560180)
- [Archived PDP Grundfos UPS 25-60](https://teploradost.com.ua/ua/cirkulyacionnyj-nasos-grundfos-ups-2560-180)
- [Послуги](https://teploradost.com.ua/ua/services)
- [Checkout](https://teploradost.com.ua/ua/checkout)
