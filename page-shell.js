(function () {
  const BASE_PRODUCTS = Array.isArray(window.sofievkaProducts) ? window.sofievkaProducts : [];
  const TERMOJET_PRODUCTS = Array.isArray(window.sofievkaTermojetProducts) ? window.sofievkaTermojetProducts : [];
  let CATALOG = window.sofievkaCatalog || null;
  let PRODUCTS = Array.isArray(CATALOG?.products) && CATALOG.products.length ? CATALOG.products : [...BASE_PRODUCTS, ...TERMOJET_PRODUCTS];
  const PRODUCT_TYPES = Array.isArray(window.sofievkaProductTypes) ? window.sofievkaProductTypes : [];
  let WATER = window.sofievkaWaterCatalog || { taxonomy: [], categoryBySlug: {}, report: { distribution: {} } };
  let WATER_PRODUCTS = Array.isArray(WATER.products) && WATER.products.length
    ? WATER.products
    : BASE_PRODUCTS.filter(product => product.category === "water");
  const PAGES = {
    brand: renderBrandExtended,
    solutions: renderSolutions,
    services: renderServices,
    contact: renderContact,
    delivery: () => renderArticle("Доставка й оплата", "Умови отримання замовлення", deliveryContent(), "Доставка по Україні", "Точні строки та вартість менеджер підтверджує після перевірки складу й габаритів."),
    warranty: () => renderArticle("Гарантія та сервіс", "Підтримка після покупки", warrantyContent(), "Потрібна діагностика?", "Підготуйте модель, серійний номер і документ про покупку — так ми швидше визначимо наступний крок."),
    about: renderAbout,
    faq: renderFaq,
    partnership: renderPartnership,
    privacy: () => renderLegal("Політика конфіденційності", privacyContent()),
    terms: () => renderLegal("Умови користування", termsContent()),
    returns: () => renderArticle("Обмін і повернення", "Зрозумілий порядок дій", returnsContent(), "Потрібно оформити звернення?", "Не встановлюйте та не використовуйте товар, якщо помітили невідповідність або пошкодження."),
    blog: renderBlog,
    portfolio: renderPortfolio,
    cart: renderCart,
    checkout: renderCheckout,
    favorites: renderFavorites,
    account: renderAccount
  };

  Object.assign(PAGES, {
    catalog: renderCatalogSystem,
    brand: renderBrandSystem,
    solutions: renderSolutionsExtended,
    services: renderServicesExtended,
    contact: renderContactExtended,
    delivery: renderDeliveryExtended,
    warranty: renderWarrantyExtended,
    about: renderAboutExtended,
    faq: renderFaqExtended,
    partnership: renderPartnershipExtended,
    returns: renderReturnsExtended,
    blog: renderBlogExtended,
    portfolio: renderPortfolioExtended,
    payment: renderPaymentExtended,
    buyers: renderBuyersExtended,
    search: renderSearchExtended,
    compare: renderCompareExtended,
    product: renderProductMaster,
    heating: () => renderCatalogSystem("heating"),
    "water-supply": () => renderCatalogSystem("water-supply"),
    climate: () => renderCatalogSystem("climate"),
    plumbing: () => renderCatalogSystem("plumbing"),
    installation: renderInstallationExtended,
    "service-center": renderServiceCenterExtended
  });

  const root = document.querySelector("[data-page-root]");
  const page = document.body.dataset.page;
  window.sofievkaPageShell = Object.freeze({
    header: headerExtended,
    footer: footerExtended
  });
  if (!root || !PAGES[page]) return;
  const loadScript = source => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="${source.split("?")[0]}"]`);
    if (existing) { if (window.sofievkaCatalogUI) resolve(); else existing.addEventListener("load", resolve, { once: true }); return; }
    const script = document.createElement("script");
    script.src = source;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  const initialize = async () => {
    try {
      if (!window.sofievkaBrands) await loadScript("/brands-data.js?v=20260911-model-1");
      if (!window.sofievkaCatalog) await loadScript("/catalog-data.js?v=20260911-pdp-8");
      if (!window.sofievkaCatalogUI) await loadScript("/catalog-ui.js?v=20260911-pdp-8");
      CATALOG = window.sofievkaCatalog || CATALOG;
      PRODUCTS = Array.isArray(CATALOG?.products) && CATALOG.products.length ? CATALOG.products : PRODUCTS;
      WATER = window.sofievkaWaterCatalog || WATER;
      WATER_PRODUCTS = Array.isArray(WATER.products) && WATER.products.length ? WATER.products : WATER_PRODUCTS;
    } catch (error) { console.error("Catalog navigation failed to load", error); }
    root.innerHTML = headerExtended() + `<main id="main" class="page-main">${PAGES[page]()}</main>` + footerExtended() + `<div class="toast" data-page-toast role="status" aria-live="polite"></div>`;
    window.sofievkaCatalogUI?.trackProductImages(root);
    bindGlobal();
    bindExtendedPage(page);
  };
  function money(value) { return new Intl.NumberFormat("uk-UA").format(value) + " грн"; }
  function productCountLabel(count) { const value = Math.abs(Number(count) || 0); const ending = value % 10 === 1 && value % 100 !== 11 ? "товар" : [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100) ? "товари" : "товарів"; return `${value} ${ending}`; }
  function setCanonical(path) { let link = document.querySelector('link[rel="canonical"]'); if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.append(link); } link.href = `https://sofievka.vercel.app${path}`; }
  function cart() { try { const value = JSON.parse(localStorage.getItem("sofievka-cart")) || {}; return Object.fromEntries(Object.entries(value).filter(([id, quantity]) => productById(id) && Number(quantity) > 0)); } catch { return {}; } }
  function saveCart(value) { localStorage.setItem("sofievka-cart", JSON.stringify(value)); updateCounts(); }
  function favorites() { try { const value = JSON.parse(localStorage.getItem("sofievka-favorites")) || []; return value.filter(id => productById(id)); } catch { return []; } }
  function saveFavorites(value) { localStorage.setItem("sofievka-favorites", JSON.stringify(value)); updateCounts(); }
  function productById(id) { return PRODUCTS.find(item => item.id === id) || null; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
  function productUrl(product) { return `/product?id=${encodeURIComponent(product.id)}`; }
  function brandUrl(product) { return CATALOG?.brandUrl(product.brandId || CATALOG.slugify(product.brand)) || `/brands/${encodeURIComponent(product.brand.toLocaleLowerCase("en"))}`; }
  function compareSelection() { try { return (JSON.parse(localStorage.getItem("sofievka-compare")) || []).filter(id => productById(id)).slice(0, 4); } catch { return []; } }
  function saveCompare(value) { localStorage.setItem("sofievka-compare", JSON.stringify(value)); }
  function toggleCompare(id) {
    const product = productById(id);
    if (!product) return false;
    const value = compareSelection();
    if (value.includes(id)) { saveCompare(value.filter(item => item !== id)); toast("Видалено з порівняння"); return false; }
    const first = productById(value[0]);
    if (first && first.compareType !== product.compareType) { toast(`Порівнювати можна лише товари типу «${first.primaryCategoryName}»`); return false; }
    if (value.length >= 4) { toast("У порівнянні вже 4 товари"); return false; }
    saveCompare([...value, id]); toast("Додано до порівняння"); return true;
  }
  function addToCart(id, qty = 1) { const value = cart(); value[id] = (value[id] || 0) + qty; saveCart(value); toast("Товар додано до кошика"); }
  function toggleFavorite(id) { const value = favorites(); const next = value.includes(id) ? value.filter(item => item !== id) : [...value, id]; saveFavorites(next); toast(next.includes(id) ? "Додано в обране" : "Видалено з обраного"); return next.includes(id); }
  function toast(message) { const el = document.querySelector("[data-page-toast]"); if (!el) return; el.textContent = message; el.classList.add("is-visible"); clearTimeout(window.pageToast); window.pageToast = setTimeout(() => el.classList.remove("is-visible"), 2400); }

  function crumbs(current) { return `<nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/index.html">Головна</a><span>/</span><span aria-current="page">${current}</span></nav>`; }
  function hero(kicker, title, lead, light = false) { return `<section class="page-hero${light ? " page-hero--light" : ""}"><div class="container">${crumbs(title)}<div class="page-hero__grid"><div><p class="page-kicker">${kicker}</p><h1>${title}</h1></div><p class="page-hero__lead">${lead}</p></div></div></section>`; }
  function productCard(product) { return extendedProductCard(product); }

  function renderSolutions() { return hero("Готові комплектації", "Рішення для системи в цілому", "Обладнання, автоматика, арматура та монтажні матеріали розглядаються разом — до оформлення замовлення.") + `<section class="page-section"><div class="container"><div class="solution-grid"><article class="solution-card"><div class="solution-card__media"><img src="/assets/images/solution-boiler-room.webp" alt="Комплект обладнання котельні"></div><div class="solution-card__body"><h2>Опалення приватного будинку</h2><p>Котел, циркуляція, розподіл, автоматика й безпека.</p><a class="text-link" href="/contact.html">Запросити комплектацію →</a></div></article><article class="solution-card"><div class="solution-card__media"><img src="/assets/images/hero-water.webp" alt="Обладнання системи водопостачання"></div><div class="solution-card__body"><h2>Водопостачання</h2><p>Джерело, насос, автоматика, бак, фільтрація та споживачі.</p><a class="text-link" href="/contact.html">Запросити комплектацію →</a></div></article><article class="solution-card"><div class="solution-card__media"><img src="/assets/images/hero-climate.webp" alt="Обладнання кліматичної системи"></div><div class="solution-card__body"><h2>Клімат</h2><p>Обладнання, розподіл повітря, зони та керування.</p><a class="text-link" href="/contact.html">Запросити комплектацію →</a></div></article></div></div></section><section class="page-section page-section--white"><div class="container"><div class="page-heading"><h2>Як формується рішення</h2><p>Без квізів і автоматичних обіцянок: вихідні дані перевіряє спеціаліст, а результат фіксується у специфікації.</p></div><div class="process-list"><article><span>01</span><h3>Задача</h3><p>Площа, джерело, режими роботи та обмеження.</p></article><article><span>02</span><h3>Розрахунок</h3><p>Робочі параметри й технічна сумісність.</p></article><article><span>03</span><h3>Специфікація</h3><p>Основне обладнання та потрібні для монтажу позиції.</p></article><article><span>04</span><h3>Реалізація</h3><p>Доставка, монтаж, запуск і сервіс.</p></article></div></div></section>`; }

  function renderServices() { return hero("Монтаж і сервіс", "Від підбору до стабільної роботи", "Один контекст для консультації, доставки, монтажу, запуску та подальшого обслуговування.") + `<section class="page-section"><div class="container"><div class="process-list"><article><span>01</span><h3>Підбір</h3><p>Перевіряємо потужність, напір, монтажні умови й сумісність.</p></article><article><span>02</span><h3>Доставка</h3><p>Узгоджуємо склад, комплектацію, спосіб та строк отримання.</p></article><article><span>03</span><h3>Монтаж і запуск</h3><p>Обсяг робіт і відповідальність сторін фіксуємо до початку.</p></article><article><span>04</span><h3>Сервіс</h3><p>Діагностика, планове обслуговування та гарантійні звернення.</p></article></div></div></section><section class="page-section page-section--white"><div class="container"><div class="page-heading"><h2>Що підготувати для оцінки</h2><p>Чим точніші вихідні дані, тим менше ризику переробок і незапланованих витрат.</p></div><div class="info-grid"><article><img src="/assets/icons/icon-engineer.svg" alt=""><h3>Опис об'єкта</h3><p>Тип приміщення, площа, етап будівництва та бажаний результат.</p></article><article><img src="/assets/icons/icon-installation.svg" alt=""><h3>Фото або проєкт</h3><p>Існуюча система, вузли підключення та доступне місце.</p></article><article><img src="/assets/icons/icon-service.svg" alt=""><h3>Модель обладнання</h3><p>Для сервісу — шильдик, серійний номер та опис симптомів.</p></article></div></div></section><section class="page-section"><div class="container"><div class="aside-card" style="position:static;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:center"><div><h2>Обговоримо ваш об'єкт</h2><p>Залиште контакти або зателефонуйте. Менеджер уточнить дані й наступний крок.</p></div><a class="button button--primary" href="/contact.html">Зв'язатися</a></div></div></section>`; }

  function renderContact() { return hero("Контакти", "Поговоріть із фахівцем", "Допоможемо знайти товар за кодом, перевірити сумісність або підготувати комплектацію.", true) + `<section class="page-section"><div class="container"><div class="contact-grid"><div><dl class="contact-details"><div><dt>Телефони</dt><dd><a href="tel:+380501234567">+38 (050) 123 45 67</a><br><a href="tel:+380671234567">+38 (067) 123 45 67</a></dd></div><div><dt>Email</dt><dd><a href="mailto:info@sofievka.ua">info@sofievka.ua</a></dd></div><div><dt>Графік</dt><dd>Пн–Пт: 9:00–18:00<br>Сб: 9:00–15:00</dd></div><div><dt>Адреса</dt><dd>м. Софіївка, вул. Соборна, 45<br>ТЦ «Софіївський», 1 поверх</dd></div></dl></div><div class="contact-map"><p class="page-kicker">Магазин і консультація</p><h2>Перед візитом уточніть наявність конкретної моделі</h2><p>Менеджер перевірить склад і підготує товар або консультацію до вашого приїзду.</p><a class="button button--primary" href="https://maps.google.com/?q=Софіївка+вул.+Соборна+45" target="_blank" rel="noreferrer">Прокласти маршрут</a></div></div></div></section>`; }

  function renderArticle(title, kicker, content, asideTitle, asideText) { return hero(kicker, title, "Практична інформація до покупки та після отримання замовлення.", true) + `<section class="page-section page-section--white"><div class="container content-layout"><article class="prose">${content}</article><aside class="aside-card"><h2>${asideTitle}</h2><p>${asideText}</p><a class="button button--secondary" href="/contact.html">Зв'язатися з нами</a><div class="link-list"><a href="/delivery.html">Доставка й оплата <span>→</span></a><a href="/warranty.html">Гарантія <span>→</span></a><a href="/returns.html">Повернення <span>→</span></a></div></aside></div></section>`; }
  function deliveryContent(){ return `<h2>Як отримати замовлення</h2><p>Доступні відправлення перевізником по Україні та самовивіз після підтвердження готовності. Спосіб отримання залежить від габаритів, ваги, складу відвантаження та особливостей конкретного обладнання.</p><h2>Підтвердження строку</h2><ol><li>Менеджер перевіряє фактичну наявність усіх позицій.</li><li>Узгоджує місце отримання та орієнтовний строк.</li><li>Для комплектів перевіряє, що замовлення можна відправити без втрати потрібних компонентів.</li></ol><h2>Оплата</h2><p>Доступні способи оплати та потребу в передоплаті менеджер повідомляє до підтвердження замовлення. Для юридичних осіб готується рахунок і комплект супровідних документів.</p><h2>Перевірка при отриманні</h2><p>Огляньте упаковку, комплектацію та відсутність видимих пошкоджень у присутності представника перевізника. Якщо є проблема, зафіксуйте її до завершення отримання та зв'яжіться з магазином.</p>`; }
  function warrantyContent(){ return `<h2>Гарантія виробника</h2><p>Гарантійний строк і умови залежать від бренду та конкретної моделі. Підставою для звернення є документ про покупку, серійний номер і дотримання вимог виробника до монтажу та експлуатації.</p><h2>Перед зверненням</h2><ul><li>Підготуйте точну назву моделі та серійний номер.</li><li>Опишіть симптом і коли він виник.</li><li>Додайте фото підключення або повідомлення на дисплеї, якщо це безпечно.</li><li>Не розбирайте обладнання самостійно.</li></ul><h2>Що відбувається далі</h2><p>Ми уточнюємо обставини, перевіряємо документи та визначаємо коректний маршрут: консультація, діагностика, авторизований сервіс або інше рішення відповідно до умов виробника.</p><h2>Монтаж має значення</h2><p>Для частини обладнання гарантія пов'язана з кваліфікованим монтажем, введенням в експлуатацію та регулярним обслуговуванням. Ці умови потрібно перевірити до встановлення.</p>`; }
  function returnsContent(){ return `<h2>До відправлення назад</h2><p>Спочатку повідомте номер замовлення, модель і причину звернення. Ми перевіримо категорію товару, стан, комплектність та документи й погодимо спосіб передачі.</p><h2>Збережіть комплектність</h2><ul><li>Товар, аксесуари, документація та заводське пакування.</li><li>Документ, що підтверджує покупку.</li><li>Відсутність слідів монтажу або використання, якщо йдеться про товар належної якості.</li></ul><h2>Пошкодження при доставці</h2><p>Огляд виконується у відділенні або при кур'єрі. Видиме пошкодження упаковки чи товару потрібно одразу зафіксувати актом перевізника та повідомити магазин.</p><h2>Важливе уточнення</h2><p>Можливість обміну або повернення залежить від стану товару, його категорії, індивідуальної комплектації та чинних норм. Фінальну процедуру підтверджує відповідальний менеджер після перевірки звернення.</p>`; }

  function renderAbout(){ return hero("Про компанію", "Інженерний магазин, а не просто вітрина", "Ми будуємо роботу навколо сумісності системи, зрозумілої комплектації та підтримки після покупки.") + `<section class="page-section"><div class="container content-layout"><article class="prose"><h2>Наш підхід</h2><p>ТД «Софіївка» працює з обладнанням для опалення, водопостачання, сантехніки та клімату. Для покупця важлива не лише окрема модель, а те, як вона працюватиме разом з іншими компонентами.</p><p>Тому ми відокремлюємо підтверджені характеристики від припущень, уточнюємо вихідні дані та формуємо комплектацію до замовлення. Там, де потрібен розрахунок або огляд об'єкта, ми прямо про це говоримо.</p><h2>Що це дає</h2><ul><li>Менше ризику несумісних покупок.</li><li>Зрозумілий перелік потрібного для монтажу.</li><li>Один контекст від консультації до сервісу.</li><li>Документація та гарантійний маршрут без зайвих обіцянок.</li></ul></article><aside class="aside-card"><h2>Потрібен підбір?</h2><p>Опишіть задачу та надішліть наявні фото або проєкт.</p><a class="button button--primary" href="/contact.html">Зв'язатися</a></aside></div></section>`; }

  function renderFaq(){ const items=[["Як перевірити сумісність товару?","Надішліть модель наявного обладнання, фото шильдика або схему системи. Для систем очищення води важливі аналіз води, витрата та умови підключення."],["Звідки надходять ціни та наявність?","Назви, ціни, статус наявності, описи й зображення 176 товарів Ecosoft та 343 товарів Termojet імпортовані з каталогів постачальників. Перед оплатою замовлення додатково підтверджує менеджер."],["Чи можна замовити монтаж разом з обладнанням?","Так, після уточнення географії, обсягу робіт і стану об'єкта. Оцінка та межі відповідальності погоджуються до початку робіт."],["Як дізнатися строк доставки?","Менеджер перевіряє склад відвантаження, габарити та доступний спосіб перевезення, після чого підтверджує орієнтовний строк."],["Що потрібно для гарантійного звернення?","Модель, серійний номер, документ про покупку, опис симптомів і, за можливості, фото підключення або повідомлення на дисплеї."],["Працюєте з монтажниками та підприємствами?","Так. Передбачено окремий процес для специфікацій, рахунків, документів і повторних закупівель."]]; return hero("Допомога", "Часті запитання", "Короткі відповіді про підбір, доставку, монтаж і сервіс.", true)+`<section class="page-section page-section--white"><div class="container"><div class="faq-list">${items.map(([q,a])=>`<details class="faq-item"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></div></section>`; }

  function renderPartnership(){ return hero("Для професіоналів", "Закупівлі за специфікацією", "Монтажникам, проєктантам і бізнесу — швидкий пошук за кодом, документи та комплектація об'єкта.") + `<section class="page-section"><div class="container"><div class="info-grid"><article><img src="/assets/icons/icon-engineer.svg" alt=""><h2>Технічна підтримка</h2><p>Перевірка моделей, характеристик і сумісних компонентів.</p></article><article><img src="/assets/icons/icon-delivery.svg" alt=""><h2>Комплектація об'єкта</h2><p>Зведення позицій, доступності та графіка постачання.</p></article><article><img src="/assets/icons/icon-warranty.svg" alt=""><h2>Документи</h2><p>Рахунки, супровідні документи та матеріали виробника.</p></article></div></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Як почати</h2><ol><li>Надішліть реквізити та контакт відповідальної особи.</li><li>Додайте специфікацію у зручному форматі або список кодів.</li><li>Позначте об'єкт, бажаний строк і спосіб отримання.</li><li>Менеджер повернеться з перевіреною пропозицією та питаннями.</li></ol><h2>Без вигаданих “персональних цін”</h2><p>Комерційні умови залежать від бренду, обсягу, регулярності та способу оплати. Вони підтверджуються індивідуально, а не показуються як універсальна обіцянка.</p></article><aside class="aside-card"><h2>Надіслати специфікацію</h2><p>Вкажіть об'єкт у темі листа, додайте коди та кількість.</p><a class="button button--primary" href="mailto:partner@sofievka.ua?subject=Специфікація%20об'єкта">partner@sofievka.ua</a></aside></div></section>`; }

  function renderLegal(title, content){ return hero("Правова інформація", title, "Базова редакція для структури сайту. Перед комерційним запуском текст має пройти юридичну перевірку та отримати підтверджені реквізити.", true)+`<section class="page-section page-section--white"><div class="container content-layout"><article class="prose">${content}</article><aside class="aside-card"><h2>Статус документа</h2><p>Робоча редакція від 18 серпня 2026 року. Контактні й юридичні реквізити потрібно підтвердити перед прийманням замовлень.</p><a class="button button--secondary" href="/contact.html">Поставити запитання</a></aside></div></section>`; }
  function privacyContent(){ return `<h2>Які дані можуть оброблятися</h2><p>Контактні дані, зміст звернення, склад замовлення, адреса доставки, технічна інформація про пристрій та службові дані, необхідні для безпеки й роботи сайту.</p><h2>Для чого використовуються дані</h2><ul><li>Опрацювання замовлень і консультацій.</li><li>Організація доставки, оплати, гарантії та сервісу.</li><li>Виконання законних обов'язків і захист від зловживань.</li><li>Аналітика роботи сайту — лише після належного налаштування згоди.</li></ul><h2>Передача третім сторонам</h2><p>Дані можуть передаватися перевізникам, платіжним і сервісним партнерам лише в обсязі, потрібному для відповідної послуги та за наявності правової підстави.</p><h2>Ваші права</h2><p>Ви можете звернутися щодо доступу, уточнення або видалення даних у межах, дозволених законодавством та обов'язками продавця.</p>`; }
  function termsContent(){ return `<h2>Призначення сайту</h2><p>Сайт надає інформацію про асортимент, послуги та способи зв'язку. Замовлення підтверджується менеджером після перевірки товарних даних.</p><h2>Технічна інформація</h2><p>Характеристики мають звірятися з офіційною документацією конкретної моделі. Онлайн-опис не замінює проєкт, розрахунок або інструкцію з монтажу.</p><h2>Оформлення замовлення</h2><p>Замовлення вважається погодженим після перевірки наявності, ціни, комплектації, способу оплати й доставки та підтвердження менеджером.</p><h2>Інтелектуальна власність</h2><p>Назви брендів і товарні знаки належать їхнім правовласникам. Матеріали сайту не можна відтворювати поза межами, дозволеними законом або окремою згодою.</p>`; }

  function renderBlog(){ const cards=[["Підбір","Що підготувати для підбору циркуляційного насоса","Монтажна довжина, робоча точка, тип системи й режим керування — мінімум даних для змістовної консультації."],["Опалення","Чому потужність котла — не єдиний критерій","Димохід, гідравліка, гаряча вода, автоматика та умови сервісу впливають на остаточне рішення."],["Експлуатація","Як прийняти технічне обладнання у перевізника","Перевірка упаковки, моделі, комплектності та фіксація пошкоджень до завершення отримання."]]; return hero("Практичні матеріали","Корисно знати","Короткі технічні пояснення без підміни проєктування та інструкцій виробника.",true)+`<section class="page-section"><div class="container"><div class="article-grid">${cards.map(([k,t,d])=>`<article class="editorial-card"><span>${k}</span><div><h2>${t}</h2><p>${d}</p></div></article>`).join("")}</div><p class="notice" style="margin-top:32px">Повні статті будуть опубліковані після технічної та редакційної перевірки.</p></div></section>`; }
  function renderPortfolio(){ return hero("Реалізовані об'єкти","Рішення, які можна перевірити","Ми не публікуємо вигадані кейси. Тут з'являться підтверджені об'єкти з фотографіями, складом системи та межами виконаних робіт.") + `<section class="page-section"><div class="container"><div class="portfolio-grid"><article class="editorial-card"><span>Формат кейсу</span><div><h2>Вихідна задача</h2><p>Тип об'єкта, обмеження та критерії, за якими обиралося рішення.</p></div></article><article class="editorial-card"><span>Формат кейсу</span><div><h2>Склад системи</h2><p>Перевірені моделі, ключові вузли та монтажні матеріали без рекламного перебільшення.</p></div></article><article class="editorial-card"><span>Формат кейсу</span><div><h2>Результат і сервіс</h2><p>Фактичний обсяг робіт, запуск, документація та подальше обслуговування.</p></div></article></div><div class="empty-state" style="margin-top:32px"><h2>Готуємо перші підтверджені кейси</h2><p>Фото й результати будуть додані після дозволу замовників та технічної перевірки описів.</p><a class="button button--secondary" href="/solutions.html">Переглянути напрями рішень</a></div></div></section>`; }

  function renderCart(){ const value=cart(); const lines=Object.entries(value).filter(([id,q])=>q>0 && productById(id)); return hero("Кошик","Ваше замовлення","Перевірте товари й кількість перед оформленням.",true)+`<section class="page-section"><div class="container" data-cart-view>${cartMarkup(lines)}</div></section>`; }
  function cartMarkup(lines){ if(!lines.length) return `<div class="empty-state"><h2>Кошик порожній</h2><p>Додайте товар з каталогу, щоб перейти до оформлення.</p><a class="button button--primary" href="/catalog.html">До каталогу</a></div>`; const total=lines.reduce((sum,[id,q])=>sum+productById(id).price*q,0); return `<div class="cart-layout"><div class="cart-items">${lines.map(([id,q])=>{const p=productById(id);return `<article class="cart-item"><a class="cart-item__image" href="${productUrl(p)}"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}"></a><div><h2><a href="${productUrl(p)}">${escapeHtml(p.title)}</a></h2><p>Код товару: ${escapeHtml(p.sku)}</p><div class="cart-item__controls"><button data-qty="${escapeHtml(id)}" data-delta="-1" aria-label="Зменшити">−</button><output>${q}</output><button data-qty="${escapeHtml(id)}" data-delta="1" aria-label="Збільшити">+</button></div></div><div class="cart-item__price"><strong>${money(p.price*q)}</strong><button class="cart-item__remove" data-remove="${escapeHtml(id)}">Видалити</button></div></article>`}).join("")}</div><aside class="order-summary"><h2>Разом</h2><dl><div><dt>Товари</dt><dd>${money(total)}</dd></div><div><dt>Доставка</dt><dd>після уточнення</dd></div><div class="order-summary__total"><dt>До оплати</dt><dd>${money(total)}</dd></div></dl><a class="button button--primary" href="/checkout.html">Перейти до оформлення</a></aside></div>`; }

  function renderCheckout(){ const value=cart(); const lines=Object.entries(value).filter(([id,q])=>q>0 && productById(id)); const total=lines.reduce((s,[id,q])=>s+productById(id).price*q,0); return hero("Оформлення","Перевірка майбутнього замовлення","Перевірте склад кошика та доступні способи отримання. Онлайн-оформлення буде активоване після погодження операційного й юридичного процесу.",true)+`<section class="page-section"><div class="container checkout-layout"><form class="checkout-form" data-checkout><div class="notice"><strong>Замовлення не надсилається.</strong> Онлайн-оформлення ще не активне. Дані з цієї форми залишаються у браузері й не передаються магазину.</div><section class="form-section"><h2>1. Контактні дані</h2><div class="form-grid"><label class="field"><span>Ім'я</span><input name="name" autocomplete="name" required></label><label class="field"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" required placeholder="+38 (___) ___ __ __"></label><label class="field field--full"><span>Email</span><input name="email" type="email" autocomplete="email"></label></div></section><section class="form-section"><h2>2. Доставка</h2><div class="choice-list"><label class="choice"><input type="radio" name="delivery" value="carrier" checked><span><strong>Перевізник по Україні</strong><small>Місто й відділення менеджер уточнить під час підтвердження.</small></span></label><label class="choice"><input type="radio" name="delivery" value="pickup"><span><strong>Самовивіз</strong><small>Після підтвердження готовності замовлення.</small></span></label></div></section><section class="form-section"><h2>3. Оплата</h2><div class="choice-list"><label class="choice"><input type="radio" name="payment" value="confirm" checked><span><strong>Після підтвердження менеджером</strong><small>Доступний спосіб залежить від товару та доставки.</small></span></label></div><label class="field" style="margin-top:18px"><span>Коментар</span><textarea name="comment" placeholder="Питання щодо сумісності, доставки або документів"></textarea></label></section><button class="button button--primary" type="submit">Перевірити заповнення</button></form><aside class="order-summary"><h2>Ваше замовлення</h2><dl>${lines.length?lines.map(([id,q])=>{const p=productById(id);return `<div><dt>${escapeHtml(p.title)} · ${q} шт.</dt><dd>${money(p.price*q)}</dd></div>`}).join(""):`<div><dt>Кошик</dt><dd>порожній</dd></div>`}<div class="order-summary__total"><dt>Разом</dt><dd>${money(total)}</dd></div></dl><a href="/cart.html">← Повернутися до кошика</a></aside></div></section>`; }
  function renderFavorites(){ const selected=favorites().map(productById).filter(Boolean); return hero("Збережене","Обрані товари","Зберігайте моделі для порівняння або майбутньої консультації.",true)+`<section class="page-section"><div class="container">${selected.length?`<div class="catalog-products">${selected.map(productCard).join("")}</div>`:`<div class="empty-state"><h2>Поки нічого не збережено</h2><p>Позначте серцем потрібні товари — вони з'являться тут.</p><a class="button button--primary" href="/catalog.html">Перейти до каталогу</a></div>`}</div></section>`; }
  function renderAccount(){ return hero("Профіль","Особистий кабінет","Майбутнє місце для замовлень, збережених специфікацій і сервісних звернень.",true)+`<section class="page-section"><div class="container content-layout"><form class="aside-card" style="position:static" data-account><h2>Увійти</h2><p>Авторизація ще не підключена. Форма працює лише як візуальний сценарій.</p><label class="field" style="margin-top:22px"><span>Email або телефон</span><input required></label><label class="field" style="margin-top:14px"><span>Пароль</span><input type="password" required></label><button class="button button--primary" type="submit">Продовжити</button></form><div class="prose"><h2>Для приватних клієнтів</h2><p>Історія замовлень, гарантійні документи, адреси доставки та збережені комплекти.</p><h2>Для професіоналів</h2><p>Об'єкти, специфікації, повторне замовлення за кодами й доступ до погоджених документів.</p></div></div></section>`; }

  function bindGlobal(){
    const toggle=document.querySelector("[data-page-menu]");
    const menu=document.querySelector("#page-catalog-menu");
    window.sofievkaCatalogUI?.bindMenu({toggle,menu});
    window.sofievkaCatalogUI?.bindSearch(document.querySelector("[data-search]"));
    document.querySelector("[data-history-back]")?.addEventListener("click",()=>history.back());
    document.addEventListener("click",e=>{
      const add=e.target.closest("[data-add]");
      if(add){
        const qty=Number(document.querySelector("[data-product-qty]")?.value||1);
        addToCart(add.dataset.add,qty);
        const quantity=cart()[add.dataset.add]||qty;
        add.classList.add("is-in-cart");
        add.textContent=`У кошику · ${quantity}`;
        add.setAttribute("aria-label",`У кошику ${quantity} шт. Додати ще`);
      }
      const fav=e.target.closest("[data-favorite]");
      if(fav){
        const active=toggleFavorite(fav.dataset.favorite);
        fav.classList.toggle("is-active",active);
        fav.setAttribute("aria-pressed",String(active));
        fav.setAttribute("aria-label",active?"Видалити з обраного":"Додати в обране");
        const label=fav.querySelector("span");
        if(label) label.textContent=active?"В обраному":"В обране";
      }
      const compare=e.target.closest("[data-compare]");
      if(compare){
        const active=toggleCompare(compare.dataset.compare);
        compare.classList.toggle("is-active",active);
        compare.setAttribute("aria-pressed",String(active));
        compare.setAttribute("aria-label",active?"Видалити з порівняння":"Додати до порівняння");
        const label=compare.querySelector("span");
        if(label) label.textContent=active?"У порівнянні":"Порівняти";
      }
    });
    updateCounts();
  }
  function updateCounts(){ const cartCount=Object.values(cart()).reduce((s,q)=>s+q,0); document.querySelectorAll("[data-cart-count]").forEach(x=>x.textContent=cartCount); document.querySelectorAll("[data-fav-count]").forEach(x=>x.textContent=favorites().length); }
  function bindPage(name){ if(name==="catalog"){const params=new URLSearchParams(location.search);let category=params.get("category")||"all";const query=(params.get("q")||"").toLocaleLowerCase("uk");const pills=[...document.querySelectorAll("[data-category]")];const render=()=>{const brands=[...document.querySelectorAll("[data-brand-filter]:checked")].map(x=>x.value);const result=PRODUCTS.filter(p=>(category==="all"||p.category===category)&&(!brands.length||brands.includes(p.brand))&&(!query||`${p.brand} ${p.model} ${p.code}`.toLocaleLowerCase("uk").includes(query)));document.querySelector("[data-catalog-products]").innerHTML=result.length?result.map(productCard).join(""):`<div class="catalog-empty"><h2>Нічого не знайдено</h2><p>Спробуйте іншу категорію або очистіть фільтри.</p></div>`;document.querySelector("[data-result-count]").textContent=result.length;pills.forEach(b=>b.classList.toggle("is-active",b.dataset.category===category));};pills.forEach(b=>b.addEventListener("click",()=>{category=b.dataset.category;render();}));document.querySelectorAll("[data-brand-filter]").forEach(x=>x.addEventListener("change",render));document.querySelector("[data-filter-toggle]")?.addEventListener("click",()=>document.querySelector("[data-filter]")?.classList.toggle("is-open"));render();}
    if(name==="cart") document.querySelector("[data-cart-view]")?.addEventListener("click",e=>{const q=e.target.closest("[data-qty]");const r=e.target.closest("[data-remove]");const value=cart();if(q)value[q.dataset.qty]=Math.max(0,(value[q.dataset.qty]||0)+Number(q.dataset.delta));if(r)delete value[r.dataset.remove];if(q||r){saveCart(value);const lines=Object.entries(value).filter(([,n])=>n>0);document.querySelector("[data-cart-view]").innerHTML=cartMarkup(lines);}});
    document.querySelector("[data-checkout]")?.addEventListener("submit",e=>{e.preventDefault();toast("Заповнення перевірено. Дані не надсилалися й замовлення не створене.");});document.querySelector("[data-account]")?.addEventListener("submit",e=>{e.preventDefault();toast("Авторизація ще не підключена");}); }
  function siteNavLink(href, label, pages) {
    const active = pages.includes(page);
    return `<a href="${href}"${active ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`;
  }

  function siteNavMarkup(className = "site-nav") {
    return `<nav class="${className}" aria-label="Основна навігація"><div class="container ${className}__inner">${[
      siteNavLink("/about.html", "Про нас", ["about"]),
      siteNavLink("/solutions.html", "Рішення", ["solutions"]),
      siteNavLink("/installation.html", "Монтаж", ["installation"]),
      siteNavLink("/service-center.html", "Сервіс", ["service-center"]),
      siteNavLink("/delivery.html", "Доставка й оплата", ["delivery", "payment"]),
      siteNavLink("/contact.html", "Контакти", ["contact"])
    ].join("")}</div></nav>`;
  }

  function headerExtended() {
    const searchQuery = page === "search" ? (new URLSearchParams(location.search).get("q") || "") : "";
    return `<a class="skip-link" href="#main">Перейти до основного вмісту</a>
      <div class="utility-bar"><div class="container utility-bar__inner"><ul><li>Інженерний торговий дім</li><li>Обладнання, комплектація, монтаж і сервіс</li><li><a href="/partnership.html">Для професіоналів</a></li></ul><div class="utility-bar__contact"><a href="/contact.html">Контакти та графік роботи</a></div></div></div>
      <header class="site-header" data-page-header>${siteNavMarkup()}<div class="container site-header__inner">
        <a class="brand" href="/index.html" aria-label="Софіївка, головна"><img src="/assets/logo-sofievka-transparent.png" width="1942" height="809" alt="Софіївка"></a>
        <div class="catalog-navigation"><button class="catalog-button" type="button" data-page-menu aria-expanded="false" aria-controls="page-catalog-menu" aria-haspopup="true" aria-label="Відкрити каталог і меню"><span class="catalog-button__mark" aria-hidden="true"><i></i><i></i><i></i></span>Каталог</button>
        <nav class="catalog-menu" id="page-catalog-menu" hidden aria-label="Каталог товарів">${window.sofievkaCatalogUI?.megaMenu() || `<div class="catalog-menu__panel"><a class="catalog-menu__all" href="/catalog">Увесь каталог <span aria-hidden="true">→</span></a></div>`}<div class="catalog-menu__support"><a href="/about.html">Про нас</a><a href="/delivery.html">Доставка</a><a href="/payment.html">Оплата</a><a href="/blog.html">Блог</a><a href="/installation.html">Монтаж</a><a href="/service-center.html">Сервіс</a><a href="/contact.html">Контакти</a></div></nav></div>
        <form class="search" data-search action="/search" role="search"><label class="sr-only" for="page-search">Пошук товарів, брендів і категорій</label><input id="page-search" name="q" type="search" value="${escapeHtml(searchQuery)}" autocomplete="off" placeholder="Назва, бренд, модель або артикул" aria-controls="page-search-results" aria-expanded="false"><button type="submit">Знайти</button><div class="search-results" id="page-search-results" aria-live="polite" hidden></div></form>
        <div class="header-actions"><a class="header-action" href="/favorites.html" data-favorites aria-label="Обране"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l7.8-7.5a5.5 5.5 0 0 0-.2-7.9Z"/></svg><span class="header-action__label">Обране</span><span class="header-action__count" data-fav-count>0</span></a><a class="header-action" href="/cart.html" data-cart aria-label="Кошик"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span class="header-action__label">Кошик</span><span class="header-action__count" data-cart-count>0</span></a></div>
      </div></header>`;
  }

  function footerExtended() {
    return `<footer class="footer"><div class="container footer__grid"><nav aria-label="Каталог у підвалі"><h2>Каталог</h2><a href="/catalog/heating">Опалення</a><a href="/catalog/water-supply">Водопостачання</a><a href="/catalog/plumbing">Сантехніка</a><a href="/catalog/climate">Клімат</a></nav><nav aria-label="Послуги у підвалі"><h2>Послуги</h2><a href="/installation.html">Монтаж</a><a href="/service-center.html">Сервісний центр</a><a href="/solutions.html">Комплексні рішення</a><a href="/partnership.html">Для монтажників</a></nav><nav aria-label="Покупцям у підвалі"><h2>Покупцям</h2><a href="/delivery.html">Доставка</a><a href="/payment.html">Оплата</a><a href="/warranty.html">Гарантія</a><a href="/returns.html">Обмін і повернення</a></nav><div class="footer__contacts"><h2>Компанія</h2><a href="/about.html">Про нас</a><a href="/brands">Бренди</a><a href="/contact.html">Контакти та графік</a><p><a href="/partnership.html">Надіслати специфікацію</a><br><a href="/faq.html">Часті запитання</a></p></div></div><div class="container footer__bottom"><span>© 2026 Торговий дім «Софіївка»</span><div class="footer__bottom-meta"><div class="footer__socials" aria-hidden="true"><span class="footer__social" title="Instagram"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1"></circle></svg></span><span class="footer__social" title="Facebook"><svg viewBox="0 0 24 24"><path d="M14.5 8H17V4.5h-2.5C11.7 4.5 10 6.2 10 9v2H7v3.5h3V21h4v-6.5h3L17.5 11H14V9c0-.7.3-1 1-1Z"></path></svg></span><span class="footer__social" title="YouTube"><svg viewBox="0 0 24 24"><path d="M20.2 7.1c-.2-.9-.9-1.6-1.8-1.8C16.8 5 12 5 12 5s-4.8 0-6.4.3c-.9.2-1.6.9-1.8 1.8C3.5 8.7 3.5 12 3.5 12s0 3.3.3 4.9c.2.9.9 1.6 1.8 1.8 1.6.3 6.4.3 6.4.3s4.8 0 6.4-.3c.9-.2 1.6-.9 1.8-1.8.3-1.6.3-4.9.3-4.9s0-3.3-.3-4.9Z"></path><path class="footer__social-play" d="m10 15.5 5-3.5-5-3.5v7Z"></path></svg></span></div><span><a href="/privacy.html">Конфіденційність</a> · <a href="/terms.html">Умови</a></span></div></div></footer>`;
  }

  const FEATURE_LABELS = {
    pump: ["Помпа", { yes: "Є", no: "Без помпи" }], mineralizer: ["Мінералізація", { yes: "Є", no: "Без мінералізатора" }],
    flowType: ["Тип системи", { direct: "Прямоточна", tank: "З накопичувальним баком" }], stages: ["Ступені очищення", null],
    users: ["Кількість користувачів", null], capacity: ["Продуктивність", null], scope: ["Для об’єкта", { apartment: "Квартира", house: "Будинок", business: "Бізнес / HoReCa" }],
    waterSource: ["Джерело води", { mains: "Водогін", borehole: "Свердловина" }], installation: ["Встановлення", { "under-sink": "Під мийку" }],
    purpose: ["Призначення", { mechanical: "Механічне очищення", softening: "Пом’якшення", "iron-removal": "Знезалізнення", "chlorine-odor": "Хлор і запахи", complex: "Комплексне очищення" }]
  };
  function featureEntries(product, limit = 99) {
    return Object.entries(product.features || {}).map(([key, value]) => {
      const config = FEATURE_LABELS[key]; if (!config || !value) return null;
      const display = config[1]?.[value] || (key === "stages" ? `${value}` : key === "users" ? `${value} ос.` : value);
      return [config[0], display];
    }).filter(Boolean).slice(0, limit);
  }
  function detailEntries(product, limit = 99) {
    if (Array.isArray(product.technicalDetails) && product.technicalDetails.length) return product.technicalDetails.slice(0, limit);
    const features = featureEntries(product, limit);
    if (features.length) return features;
    return (product.attributes || []).map(attribute => [attribute.label, attribute.value]).filter(([label, value]) => label && value).slice(0, limit);
  }
  function waterCategoryUrl(slug) { return slug ? `/catalog/water-treatment/${encodeURIComponent(slug)}` : "/catalog/water-treatment"; }
  function waterCrumbs(product) {
    if (product.category !== "water") return `<nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/index.html">Головна</a><span>→</span><a href="/heating.html">Опалення</a><span>→</span><a href="/brands/termojet">Termojet</a><span>→</span><span aria-current="page">${escapeHtml(product.primaryCategoryName)}</span></nav>`;
    const category = WATER.categoryBySlug[product.primaryCategory] || {};
    return `<nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/catalog/water-treatment">Каталог</a><span>→</span><a href="/water-supply.html">Водопостачання</a><span>→</span><a href="/catalog/water-treatment">Очищення води</a>${category.groupName ? `<span>→</span><a href="${waterCategoryUrl(product.primaryCategory)}">${escapeHtml(category.groupName)}</a>` : ""}<span>→</span><a aria-current="page" href="${waterCategoryUrl(product.primaryCategory)}">${escapeHtml(product.primaryCategoryName)}</a></nav>`;
  }
  function productCrumbs(product) {
    if (CATALOG && product.sectionId) {
      const category = CATALOG.categoryById[product.primaryCategoryId];
      const chain = category ? [...CATALOG.getCategoryAncestors(category.id), category] : [];
      return `<nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/">Головна</a><span>/</span><a href="/catalog">Каталог</a>${chain.map(item => `<span>/</span><a href="${CATALOG.getCategoryPath(item.id)}">${escapeHtml(item.title || item.name)}</a>`).join("")}<span>/</span><span aria-current="page">${escapeHtml(product.title)}</span></nav>`;
    }
    if (product.category === "water") return waterCrumbs(product);
    return `<nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/index.html">Головна</a><span>→</span><a href="/heating.html">Опалення</a><span>→</span><a href="/brands/termojet">Termojet</a><span>→</span><span aria-current="page">${escapeHtml(product.primaryCategoryName)}</span></nav>`;
  }

  function extendedProductCard(product) {
    return window.sofievkaCatalogUI?.renderProductCard(product, {
      favoriteIds: favorites(),
      compareIds: compareSelection(),
      cart: cart()
    }) || "";
  }

  function renderCatalogSystem() {
    return window.sofievkaCatalogUI?.render({ pageName: page }) || renderCatalogExtended();
  }

  function renderBrandSystem() {
    return window.sofievkaCatalogUI?.render({ pageName: "brand" }) || renderBrandExtended();
  }

  function renderCatalogExtended() {
    const PRODUCTS = WATER_PRODUCTS;
    const brands = [...new Set(WATER_PRODUCTS.map(product => product.brand))];
    const categoryTiles = WATER.taxonomy.map(group => ({ ...group, count: group.children.reduce((sum, item) => sum + (WATER.report.distribution[item.slug] || 0), 0) }));
    const skeletons = Array.from({ length: 6 }, () => `<div class="product-skeleton" aria-hidden="true"><i></i><b></b><span></span><span></span></div>`).join("");
    return `<section class="water-catalog-hero"><div class="container"><nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/catalog/water-treatment">Каталог</a><span>→</span><a href="/water-supply.html">Водопостачання</a><span>→</span><span aria-current="page">Очищення води</span></nav><p class="page-kicker">Очищення води</p><h1>Обладнання для очищення води</h1><p>Оберіть тип системи або задачу очищення. Бренд, ціна та підтверджені параметри допоможуть звузити вибір.</p></div></section><section class="page-section page-section--compact"><div class="container"><div class="water-category-grid">${categoryTiles.map(group => `<article><span>${String(group.count).padStart(2, "0")}</span><h2>${escapeHtml(group.name)}</h2><nav aria-label="${escapeHtml(group.name)}">${group.children.map(category => `<a href="${waterCategoryUrl(category.slug)}">${escapeHtml(category.name)} <small>${WATER.report.distribution[category.slug] || 0}</small></a>`).join("")}</nav></article>`).join("")}</div><a class="horeca-collection" href="/catalog/water-treatment?scope=business"><span>Добірка</span><strong>Рішення для бізнесу / HoReCa</strong><small>Товари залишаються у своїх основних категоріях</small></a></div></section><section class="page-section catalog-section"><div class="container"><div class="catalog-panel-head"><div><p class="page-kicker">Каталог товарів</p><h2 data-catalog-title>Усе обладнання</h2></div><button class="button button--secondary mobile-filter-button" type="button" data-filter-toggle aria-expanded="false">Фільтри</button></div><div class="active-filters" data-active-filters></div><div class="catalog-layout"><aside class="catalog-filter" data-filter aria-label="Фільтри каталогу"><div class="catalog-filter__head"><h2>Фільтри</h2><button type="button" data-filter-close aria-label="Закрити фільтри">Закрити</button></div><div class="filter-group"><strong>Бренд</strong>${brands.map(brand => `<label><input type="checkbox" value="${escapeHtml(brand.toLocaleLowerCase("en"))}" data-filter-key="brand"> ${escapeHtml(brand)}</label>`).join("")}</div><div class="filter-group"><strong>Ціна, грн</strong><div class="price-filter"><input type="number" min="0" inputmode="numeric" placeholder="від" aria-label="Мінімальна ціна" data-price-min><input type="number" min="0" inputmode="numeric" placeholder="до" aria-label="Максимальна ціна" data-price-max></div></div><div class="filter-group"><strong>Наявність</strong><label><input type="checkbox" value="in_stock" data-filter-key="availability"> В наявності</label></div><div class="filter-group"><strong>Для об’єкта</strong><label><input type="checkbox" value="apartment" data-filter-key="scope"> Квартира</label><label><input type="checkbox" value="house" data-filter-key="scope"> Будинок</label><label><input type="checkbox" value="business" data-filter-key="scope"> Бізнес / HoReCa</label></div><div class="filter-group"><strong>Джерело води</strong><label><input type="checkbox" value="mains" data-filter-key="waterSource"> Водогін</label><label><input type="checkbox" value="borehole" data-filter-key="waterSource"> Свердловина</label></div><div class="filter-group"><strong>Призначення очищення</strong><label><input type="checkbox" value="mechanical" data-filter-key="purpose"> Механічне</label><label><input type="checkbox" value="softening" data-filter-key="purpose"> Пом’якшення</label><label><input type="checkbox" value="iron-removal" data-filter-key="purpose"> Знезалізнення</label><label><input type="checkbox" value="chlorine-odor" data-filter-key="purpose"> Хлор і запахи</label><label><input type="checkbox" value="complex" data-filter-key="purpose"> Комплексне</label></div><div class="filter-group context-filter" data-context="reverse-osmosis"><strong>Зворотний осмос</strong><label><input type="checkbox" value="yes" data-filter-key="pump"> З помпою</label><label><input type="checkbox" value="yes" data-filter-key="mineralizer"> З мінералізатором</label><label><input type="checkbox" value="direct" data-filter-key="flowType"> Прямоточний</label><label><input type="checkbox" value="tank" data-filter-key="flowType"> З накопичувальним баком</label></div><button class="button button--secondary filter-clear-all" type="button" data-filter-clear>Очистити все</button></aside><div class="catalog-results"><div class="catalog-toolbar"><p>Знайдено: <strong data-result-count>${PRODUCTS.length}</strong></p><select data-catalog-sort aria-label="Сортування"><option value="popular">За замовчуванням</option><option value="price-asc">Спочатку дешевші</option><option value="price-desc">Спочатку дорожчі</option><option value="name">За назвою</option></select></div><div class="catalog-products is-loading" data-catalog-products>${skeletons}</div><div class="catalog-more"><button class="button button--secondary" type="button" data-load-more>Показати ще</button></div></div></div></div></section><section class="page-section water-help"><div class="container"><div><p class="page-kicker">Потрібна допомога</p><h2>Підберемо систему за аналізом води й умовами монтажу</h2><p>Для свердловини або комплексного очищення надішліть аналіз води, бажану витрату та фото місця встановлення.</p><a class="button button--primary" href="/contact.html">Отримати консультацію</a></div><div class="water-guide"><h3>Коротко про технології</h3><p><b>Механічне очищення</b> затримує пісок, мул та іржу. <b>Пом’якшення</b> знижує жорсткість. <b>Зворотний осмос</b> готує питну воду.</p><a href="/faq.html">Поширені запитання →</a></div></div></section>`;
  }

  function pdpIcon(label = "") {
    const value = label.toLocaleLowerCase("uk");
    let body = `<circle cx="12" cy="12" r="7"/><path d="M12 9v6M9 12h6"/>`;
    if (/продуктив|витрат|потік/.test(value)) body = `<path d="M4 12h14M14 7l5 5-5 5"/><path d="M5 7h4M5 17h4"/>`;
    else if (/мінерал|вода|очищ/.test(value)) body = `<path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11Z"/><path d="M9 15.5c.7 1.1 1.7 1.7 3 1.7"/>`;
    else if (/ступ|етап/.test(value)) body = `<path d="m5 8 7-4 7 4-7 4-7-4Z"/><path d="m5 12 7 4 7-4M5 16l7 4 7-4"/>`;
    else if (/помп|живлен|потуж/.test(value)) body = `<path d="m13 2-7 12h6l-1 8 7-12h-6l1-8Z"/>`;
    else if (/формат|розмір|габарит|фасув/.test(value)) body = `<path d="M4 7 12 3l8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/>`;
    else if (/підключ|суміс/.test(value)) body = `<path d="M8.5 14.5 6 17a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M15.5 9.5 18 7a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M8 16l8-8"/>`;
    else if (/ресурс|обслугов|комплект/.test(value)) body = `<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.2 15a7 7 0 0 1-11.7 2M5.8 9A7 7 0 0 1 17.5 7"/>`;
    else if (/температур/.test(value)) body = `<path d="M10 14.8V5a2 2 0 0 1 4 0v9.8a4 4 0 1 1-4 0Z"/><path d="M12 8v8"/>`;
    else if (/встанов|монтаж/.test(value)) body = `<path d="m14 5 5 5M12 7l5 5-9 9H3v-5l9-9Z"/><path d="m15 4 2-2 5 5-2 2"/>`;
    else if (/гарант|сертиф/.test(value)) body = `<path d="m12 3 7 3v5c0 4.7-2.7 8-7 10-4.3-2-7-5.3-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>`;
    return `<svg class="pdp-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  function selectKeyFacts(product) {
    return (window.sofievkaPdp?.keySpecs(product, 5) || []).map(item => [item.label, item.value]);
  }

  function galleryImages(product) {
    return window.sofievkaPdp?.images(product) || [];
  }

  function groupTechnicalDetails(product) {
    return (window.sofievkaPdp?.specificationGroups(product) || []).map(group => ({ ...group, icon: group.id === "performance" ? "Продуктивність" : group.id === "connection" ? "Підключення" : group.id === "dimensions" ? "Габарити" : "Технічні дані", items: group.items.map(item => [item.label, item.value]) }));
  }

  function customerDescriptionSections(product) {
    if (Array.isArray(product.descriptionSections) && product.descriptionSections.length) return product.descriptionSections;
    if (product.source?.supplier !== "ecosoft") {
      const text = String(product.fullDescription || product.description || "").trim();
      return text ? [{ title: "Про товар", paragraphs: [text] }] : [];
    }
    const attributes = (product.sourceAttributes || []).filter(item => item?.label && item?.value);
    const fact = (...patterns) => {
      const item = attributes.find(entry => {
        const label = String(entry.label).split(":").pop().replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
        return patterns.some(pattern => pattern.test(label));
      });
      return item ? `${String(item.label).split(":").pop().replace(/\s+/g, " ").trim()} — ${item.value}` : "";
    };
    const facts = (...patterns) => patterns.map(pattern => fact(pattern)).filter(Boolean).slice(0, 3);
    const title = product.title;
    const category = product.primaryCategoryId;
    const factSentence = values => values.length ? ` Під час підбору варто врахувати дані цієї моделі: ${values.join("; ").replace(/; ([^;]*)$/, "; $1")}.` : "";
    const extraBenefits = [
      /помп|pump/i.test(title) ? "Вбудована помпа допомагає системі стабільно працювати там, де тиску у водопроводі недостатньо для мембрани." : "",
      /мінерал|aqua ?calcium|calcium/i.test(title) ? "Фінішний модуль коригує мінеральний склад і смак уже очищеної води." : "",
      /wifi|connect/i.test(title) ? "Підключені функції спрощують контроль стану системи та своєчасне обслуговування." : ""
    ].filter(Boolean);

    let intro;
    let benefits;
    let principle;
    let selection;
    if (category === "reverse-osmosis") {
      intro = `${title} — система глибокого очищення питної води для дому або професійного використання. Вона зменшує вміст розчинених домішок, солей жорсткості та інших забруднень, які проходять крізь звичайні механічні картриджі.`;
      benefits = `Головна перевага зворотного осмосу — стабільна якість води для пиття, приготування їжі та напоїв. Система працює без постійної участі користувача: достатньо вчасно обслуговувати змінні елементи.${extraBenefits.length ? ` ${extraBenefits.join(" ")}` : ""}`;
      principle = "Вода послідовно проходить попереднє очищення, а потім надходить на напівпроникну мембрану. Мембрана пропускає молекули води, тоді як основна частина розчинених домішок відводиться в дренаж; після цього вода проходить фінішне кондиціювання.";
      selection = `Перед замовленням потрібно звірити тиск і температуру вхідної води, потрібну продуктивність та місце для монтажу.${factSentence(facts(/продуктивність/, /тиск на вході/, /накопичувальний бак/))}`;
    } else if (category === "flow-filters") {
      intro = `${title} — проточна система для доочищення водопровідної води без накопичувального бака. Очищена вода готується під час користування та подається до окремого питного крана.`;
      benefits = "Такий формат займає небагато місця під мийкою, не потребує підключення до дренажу та зберігає природний мінеральний склад води. Система зручна там, де вихідна вода вже відповідає базовим вимогам, але потребує покращення смаку, запаху й прозорості.";
      principle = "Картриджі працюють послідовно: механічний ступінь затримує завислі частинки, а сорбційні матеріали зменшують вміст хлору й органічних домішок. Кожен наступний етап доповнює попередній.";
      selection = `Ресурс залежить від якості води та фактичного споживання, тому елементи слід замінювати комплектом за рекомендованим інтервалом.${factSentence(facts(/кількість ступенів/, /продуктивність/, /тиск/))}`;
    } else if (category === "mechanical-treatment") {
      intro = `${title} — система попереднього очищення води для будинку або комерційного об’єкта. Її завдання — затримувати пісок, мул, іржу та інші завислі частинки до того, як вода потрапить у сантехніку й наступні ступені водопідготовки.`;
      benefits = "Попереднє очищення захищає трубопровід, арматуру, побутову техніку та більш чутливі фільтри від передчасного забруднення. Автоматизована робота зменшує кількість ручного обслуговування.";
      principle = "Потік проходить крізь фільтрувальне завантаження, де механічні домішки утримуються в товщі матеріалу. Під час промивання накопичені забруднення вимиваються в каналізацію, а завантаження відновлює робочу здатність.";
      selection = `Модель підбирають за піковою витратою води, розміром підключення, робочим тиском і результатом аналізу води.${factSentence(facts(/продуктивність робоча/, /робочий тиск/, /діаметр підключення|підключення установки/))}`;
    } else if (category === "water-softening") {
      intro = `${title} — система пом’якшення води, яка зменшує концентрацію солей жорсткості. Вона допомагає запобігати накипу на нагрівальних елементах, сантехніці та теплообмінниках.`;
      benefits = "Пом’якшена вода знижує утворення білого нальоту, покращує роботу мийних засобів і допомагає продовжити строк служби обладнання. Автоматичний клапан керує робочими циклами та регенерацією.";
      principle = "Вода проходить крізь іонообмінну смолу, яка затримує іони кальцію та магнію. Коли ресурс смоли вичерпується, система відновлює її розчином солі та повертається до фільтрації.";
      selection = `Для коректного підбору потрібні аналіз води, пікова витрата, добове споживання й дані про каналізацію та місце монтажу.${factSentence(facts(/продуктивність робоча/, /об'єм фільтрувального матеріалу/, /витрата солі/))}`;
    } else if (category === "complex-treatment") {
      intro = `${title} — система комплексного очищення води для об’єктів, де одночасно присутні кілька типових проблем: жорсткість, залізо, марганець або органічні домішки. Конкретний склад забруднень обов’язково підтверджують аналізом води.`;
      benefits = "Одна установка може замінити кілька послідовних ступенів очищення, заощаджуючи місце та спрощуючи обслуговування. Керування робочими циклами й відновленням завантаження відбувається автоматично.";
      principle = "Спеціалізоване багатокомпонентне завантаження поєднує кілька механізмів очищення. Після вичерпання робочої ємності система проводить регенерацію та вимиває накопичені домішки в каналізацію.";
      selection = `Ефективність залежить від складу вихідної води, витрати й умов експлуатації, тому модель підбирають тільки після аналізу води.${factSentence(facts(/продуктивність робоча/, /об'єм фільтрувального матеріалу/, /ресурс/))}`;
    } else if (category === "chlorine-odor-removal") {
      intro = `${title} — система сорбційного очищення води від хлору, органічних сполук та небажаних запахів. Її встановлюють на вводі води, щоб покращити її органолептичні властивості в усіх точках споживання.`;
      benefits = "Очищення робить воду комфортнішою для побутового використання та допомагає захистити наступні ступені водопідготовки від окиснювального впливу хлору. Автоматична промивка підтримує роботу завантаження.";
      principle = "Вода контактує із сорбційним матеріалом, на поверхні якого утримуються хлор та частина органічних домішок. Під час зворотного промивання шар розпушується й очищується від накопичених механічних частинок.";
      selection = `Підбір виконують за піковою витратою, вмістом хлору й органіки, робочим тиском та доступною витратою води на промивання.${factSentence(facts(/продуктивність робоча/, /об'єм фільтрувального матеріалу/, /робочий тиск/))}`;
    } else if (category === "mainline-filters-housings") {
      if (/наповнювач|засипк/i.test(title)) {
        intro = `${title} — змінний матеріал для сервісного обслуговування фільтра від накипу. Він дає змогу відновити роботу наявного корпуса без заміни всього пристрою.`;
        benefits = "Регулярне оновлення наповнювача допомагає захищати нагрівальні елементи побутової техніки від твердих відкладень і підтримувати нормальний протік води через фільтр.";
        principle = "Під час контакту з водою активний компонент впливає на утворення кристалів солей жорсткості, щоб вони менше закріплювалися на нагрітих поверхнях. Це захисна підготовка технічної води, а не пом’якшення для пиття.";
        selection = `Перед заміною потрібно звірити сумісність із корпусом, об’єм засипки та рекомендований ресурс.${factSentence(facts(/об'єм|вага|маса/, /ресурс/, /сумісність/))}`;
      } else if (/картридж/i.test(title)) {
        intro = `${title} — змінний елемент для обслуговування магістрального фільтра. Він відновлює захист обладнання від накипу без заміни корпуса та підключення.`;
        benefits = "Своєчасна заміна картриджа допомагає підтримувати стабільний потік і зменшує утворення твердих відкладень на нагрівальних елементах.";
        principle = "Вода проходить крізь активний матеріал картриджа, який впливає на кристалізацію солей жорсткості. Такий елемент призначений для технічного захисту обладнання, а не для приготування питної води.";
        selection = `Потрібно перевірити сумісність із корпусом, температуру води та рекомендований строк служби.${factSentence(facts(/сумісність/, /ресурс/, /температура води/))}`;
      } else if (/накип/i.test(title)) {
        intro = `${title} — компактний проточний фільтр для захисту пральної, посудомийної або іншої водонагрівальної техніки від накипу.`;
        benefits = "Фільтр установлюється безпосередньо на лінії подачі води до приладу, займає мало місця та обслуговується заміною наповнювача або картриджа.";
        principle = "Під час проходження води активний матеріал зменшує здатність солей жорсткості формувати щільні відкладення на нагрітих поверхнях. Це продовжує робочий період техніки між очищеннями.";
        selection = `Перед монтажем звіряють різьбу підключення, температуру води, напрям потоку та ресурс елемента.${factSentence(facts(/підключення/, /температура води/, /ресурс/))}`;
      } else {
        intro = `${title} — магістральний фільтр або корпус для очищення води на вході до квартири, будинку чи окремого обладнання. Призначення залежить від установленого фільтрувального елемента.`;
        benefits = "Магістральний формат дає змогу захистити одразу кілька точок водорозбору, а змінний картридж можна підібрати під конкретне завдання — від механічних домішок до покращення запаху води.";
        principle = "Весь потік проходить через змінний елемент усередині герметичного корпусу. Забруднення затримуються матеріалом картриджа, тому його ресурс і своєчасна заміна прямо впливають на перепад тиску та якість очищення.";
        selection = `Потрібно перевірити типорозмір картриджа, діаметр приєднання, температуру води та допустимий робочий тиск.${factSentence(facts(/типорозмір/, /діаметр підключення|підключення/, /робочий тиск/))}`;
      }
    } else if (category === "drinking-system-cartridges") {
      intro = `${title} — змінний елемент або комплект картриджів для обслуговування питної системи. Він відновлює передбачену виробником послідовність очищення без заміни самого фільтра.`;
      benefits = "Своєчасна заміна підтримує смак і прозорість води, захищає наступні ступені та не допускає надмірного падіння продуктивності. Комплект зручний тим, що сумісні елементи змінюються одночасно.";
      principle = "Залежно від складу комплекту вода проходить механічну, сорбційну або фінішну обробку. Кожен картридж виконує окреме завдання, а загальний результат залежить від правильної послідовності встановлення.";
      selection = `Перед купівлею слід звірити сумісність із моделлю фільтра та рекомендований інтервал заміни.${factSentence(facts(/сумісність/, /рекомендований інтервал заміни/, /тонкість фільтрації/))}`;
    } else if (category === "mainline-cartridges") {
      intro = `${title} — змінний картридж для магістрального корпусу. Він виконує конкретне завдання очищення та дає змогу обслуговувати систему без заміни корпуса.`;
      benefits = "Правильно підібраний елемент захищає сантехніку й побутову техніку, допомагає підтримувати потрібну якість води та передбачувану пропускну здатність системи.";
      principle = "Вода проходить крізь фільтрувальний матеріал по всій робочій площі картриджа. Частинки або розчинені домішки затримуються відповідно до типу матеріалу, а після вичерпання ресурсу елемент замінюють.";
      selection = `Ключові критерії — типорозмір, матеріал, тонкість фільтрації, температура води та сумісність із корпусом.${factSentence(facts(/типорозмір/, /матеріал/, /рейтинг фільтрації|тонкість фільтрації/))}`;
    } else if (category === "filter-media") {
      if (/сіл|salt|ecosil/i.test(title)) {
        intro = `${title} — витратний матеріал для регенерації іонообмінної смоли в системах пом’якшення води. Таблетована форма рівномірно розчиняється та підходить для приготування сольового розчину в баку системи.`;
        benefits = "Чиста таблетована сіль допомагає смолі повноцінно відновлювати робочу ємність і зменшує ризик осаду в сольовому баку. Регулярне поповнення запасу потрібне для безперервного пом’якшення води.";
        principle = "Під час регенерації система забирає сольовий розчин і пропускає його крізь смолу. Іони натрію витісняють накопичені кальцій і магній, після чого домішки вимиваються в каналізацію.";
        selection = `Сіль засипають у передбачений для неї бак і підтримують рівень відповідно до інструкції фільтра. Витрата залежить від жорсткості води, об’єму смоли та частоти регенерацій.${factSentence(facts(/маса|вага/, /фасування|упаковка/))}`;
      } else if (/кварц|пісок|sand/i.test(title)) {
        intro = `${title} — інертний матеріал для формування підтримувального шару у завантажувальному фільтрі. Він використовується як підкладка під основне робоче завантаження.`;
        benefits = "Правильно сформований шар допомагає рівномірно розподіляти потік, утримує дрібніше завантаження та захищає нижню дренажно-розподільчу систему корпуса.";
        principle = "Вода проходить між зернами матеріалу, а стабільна гранулометрія підтримує структуру шару під час фільтрації та зворотного промивання. Сам матеріал не замінює активне очищувальне завантаження.";
        selection = `Фракцію й кількість визначають за діаметром корпуса, конструкцією дренажу та схемою завантаження. Перед засипанням матеріал слід використовувати згідно з проєктом системи.${factSentence(facts(/фракція|розмір гранул/, /маса|вага/, /об'єм/))}`;
      } else {
        intro = `${title} — фільтрувальний матеріал для завантажувальних систем водопідготовки. Його використовують для первинного запуску установки або планової заміни робочого середовища.`;
        benefits = "Окреме завантаження дає змогу відновити ресурс системи та зберегти її корпус, автоматику й підключення. Результат залежить від відповідності матеріалу складу води та режиму роботи фільтра.";
        principle = "Під час проходження води матеріал затримує або перетворює цільові домішки завдяки своїм сорбційним, каталітичним чи іонообмінним властивостям. Конкретний механізм залежить від типу завантаження.";
        selection = `Матеріал і його кількість підбирають за аналізом води, об’ємом корпуса та параметрами керувального клапана. Змішувати різні завантаження без проєктного розрахунку не слід.${factSentence(facts(/маса|вага/, /об'єм/, /робочий діапазон ph/))}`;
      }
    } else {
      const text = String(product.fullDescription || product.description || "").trim();
      return text ? [{ title: "Про товар", paragraphs: [text] }] : [];
    }
    return [
      { title: "Що це за система", paragraphs: [intro] },
      { title: "Переваги у щоденному використанні", paragraphs: [benefits] },
      { title: "Як працює", paragraphs: [principle] },
      { title: "Підбір та обслуговування", paragraphs: [selection] }
    ];
  }

  function emphasizeDescriptionParagraph(paragraph, sectionTitle, product) {
    const escaped = escapeHtml(paragraph);
    const escapedTitle = escapeHtml(product.title);
    if (sectionTitle === "Що це за система" && escaped.includes(escapedTitle)) {
      return escaped.replace(escapedTitle, `<strong>${escapedTitle}</strong>`);
    }
    const firstSentence = escaped.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
    if (firstSentence && firstSentence.length <= 240) return `<strong>${firstSentence}</strong>${escaped.slice(firstSentence.length)}`;
    return escaped;
  }

  const pdpPlainText = value => String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  function pdpExcerpt(value, limit = 220) {
    const text = pdpPlainText(value);
    if (text.length <= limit) return text;
    const clipped = text.slice(0, limit + 1).replace(/\s+\S*$/, "").trim();
    return `${clipped || text.slice(0, limit).trim()}…`;
  }

  function createPdpViewModel(product) {
    const descriptionSections = customerDescriptionSections(product)
      .map(section => ({
        title: pdpPlainText(section.title),
        paragraphs: (section.paragraphs || []).map(pdpPlainText).filter(Boolean)
      }))
      .filter(section => section.paragraphs.length);
    const fallbackDescription = pdpPlainText(product.fullDescription || product.description || "");
    const description = descriptionSections.flatMap(section => section.paragraphs).join("\n\n") || fallbackDescription;
    const summarySource = pdpPlainText(product.shortDescription || product.description || "");
    const purchase = window.sofievkaPdp?.purchase?.(product) || {
      status: product.availability || "unknown",
      statusLabel: product.availabilityLabel || "Наявність уточнюйте",
      amount: Number(product.price) || null,
      oldAmount: null,
      purchasable: product.availability === "in_stock" && Number(product.price) > 0
    };
    const compatibilityValue = product.normalizedAttributes?.compatibility;
    return Object.freeze({
      product,
      images: galleryImages(product),
      keyFacts: (window.sofievkaPdp?.keySpecs?.(product, 6) || []).map(item => [item.label, item.value]),
      groups: (window.sofievkaPdp?.specificationGroups?.(product) || []).map(group => ({ ...group, items: group.items.map(item => [item.label, item.value]) })),
      documents: window.sofievkaPdp?.documents?.(product) || [],
      accessories: window.sofievkaPdp?.accessoryProducts?.(product, 4) || [],
      compatibleProducts: window.sofievkaPdp?.compatibleProducts?.(product, 4) || [],
      similarProducts: window.sofievkaPdp?.relatedProducts?.(product, 4) || [],
      purchase,
      model: window.sofievkaPdp?.model?.(product) || product.sku,
      series: CATALOG?.attributeSchema?.seriesLabels?.[product.seriesId] || "",
      description,
      descriptionSections,
      summary: summarySource && summarySource !== description ? pdpExcerpt(summarySource) : "",
      compatibility: compatibilityValue ? CATALOG.valueLabel(CATALOG.attributeDefinitions.compatibility, compatibilityValue) : "",
      installationRelevant: window.sofievkaPdp?.installationRelevant?.(product) ?? true,
      cartQuantity: Number(cart()[product.id] || 0),
      favoriteActive: favorites().includes(product.id),
      compareActive: compareSelection().includes(product.id)
    });
  }

  function renderPdpPrice(view) {
    const { purchase } = view;
    return purchase.amount
      ? `<div class="pdp-price">${purchase.oldAmount ? `<del>${money(purchase.oldAmount)}</del>` : ""}<strong>${money(purchase.amount)}</strong></div>`
      : `<strong class="pdp-price pdp-price--request">Ціну уточнюйте</strong>`;
  }

  function renderPdpPrimaryAction(view, modifier = "") {
    const { product, purchase, cartQuantity } = view;
    if (purchase.purchasable) {
      const label = cartQuantity ? `У кошику · ${cartQuantity}` : "Купити";
      return `<button class="button button--primary pdp-buy${modifier ? ` ${modifier}` : ""}${cartQuantity ? " is-in-cart" : ""}" type="button" data-add="${escapeHtml(product.id)}" aria-label="${escapeHtml(cartQuantity ? `У кошику ${cartQuantity} шт. Додати ще` : `Додати ${product.title} до кошика`)}">${pdpIcon("Кошик")}<span data-buy-label>${label}</span></button>`;
    }
    const label = purchase.amount ? "Уточнити наявність" : "Уточнити ціну";
    return `<a class="button button--primary pdp-buy pdp-buy--consult${modifier ? ` ${modifier}` : ""}" href="/contact.html?product=${encodeURIComponent(product.sku || product.id)}">${pdpIcon("Консультація")}<span>${label}</span></a>`;
  }

  function renderPdpIdentity(view) {
    const { product, model, series, summary } = view;
    return `<header class="pdp-heading">
      ${series ? `<div class="pdp-heading__top"><span class="pdp__series">Серія ${escapeHtml(series)}</span></div>` : ""}
      <h1>${escapeHtml(product.title)}</h1>
      <dl class="pdp-identifiers">${model !== product.sku ? `<div><dt>Модель</dt><dd>${escapeHtml(model)}</dd></div>` : ""}<div><dt>Артикул</dt><dd>${escapeHtml(product.sku || product.id)}<button class="pdp-copy-code" type="button" data-copy-sku="${escapeHtml(product.sku || product.id)}" aria-label="Копіювати артикул ${escapeHtml(product.sku || product.id)}">${pdpIcon("Документ")}</button></dd></div></dl>
      ${summary ? `<p class="pdp-summary">${escapeHtml(summary)}</p>` : ""}
    </header>`;
  }

  function renderPdpGallery(view) {
    const { product, images } = view;
    const mainImage = images[0] || "";
    const thumbs = images.length > 1 ? `<div class="pdp-thumbs" aria-label="Галерея товару">${images.map((src, index) => `<button class="pdp-thumb${index === 0 ? " is-active" : ""}" type="button" data-gallery-thumb data-gallery-index="${index}" data-gallery-src="${escapeHtml(src)}" data-gallery-alt="${escapeHtml(product.title)}${index ? `, фото ${index + 1}` : ""}" aria-label="Показати фото ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHtml(src)}" width="144" height="108" loading="${index ? "lazy" : "eager"}" alt=""></button>`).join("")}</div>` : "";
    return `<div class="pdp-gallery${images.length > 1 ? "" : " pdp-gallery--single"}" data-product-gallery tabindex="-1">
      ${thumbs}
      <div class="pdp__media${mainImage ? "" : " is-fallback"}" data-gallery-main>
        ${mainImage ? `<img data-gallery-main-image src="${escapeHtml(mainImage)}" width="1000" height="1000" fetchpriority="high" decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('is-fallback')" alt="${escapeHtml(product.title)}">` : ""}
        ${mainImage ? `<button class="pdp-gallery__image-hit" type="button" data-gallery-open aria-label="Відкрити фото товару у повному розмірі"></button>` : ""}
        <span class="pdp-image-fallback" aria-hidden="true">${pdpIcon("Габарити")}<b>Фото готується</b></span>
        ${images.length > 1 ? `<span class="pdp-gallery__counter" data-gallery-counter>1 / ${images.length}</span><button class="pdp-gallery__arrow pdp-gallery__arrow--prev" type="button" data-gallery-prev aria-label="Попереднє фото">←</button><button class="pdp-gallery__arrow pdp-gallery__arrow--next" type="button" data-gallery-next aria-label="Наступне фото">→</button>` : ""}
        ${mainImage ? `<button class="pdp-gallery__zoom" type="button" data-gallery-zoom aria-label="Відкрити збільшене фото">${pdpIcon("Збільшити")}<span>Збільшити</span></button>` : ""}
      </div>
    </div>`;
  }

  function renderPdpPurchase(view) {
    const { product, purchase, favoriteActive, compareActive } = view;
    const quantity = purchase.purchasable ? `<div class="pdp-quantity" aria-label="Кількість товару"><button type="button" data-pdp-qty-change="-1" aria-label="Зменшити кількість">−</button><input type="number" min="1" max="99" step="1" value="1" inputmode="numeric" data-product-qty aria-label="Кількість"><button type="button" data-pdp-qty-change="1" aria-label="Збільшити кількість">+</button></div><span class="pdp-unit">шт.</span>` : "";
    return `<div class="pdp-purchase" data-pdp-purchase>
      <div class="pdp-purchase__line"><span class="buy-box__status buy-box__status--${escapeHtml(purchase.status)}"><i aria-hidden="true"></i>${escapeHtml(purchase.statusLabel)}</span>${renderPdpPrice(view)}</div>
      <div class="pdp-buy-row${purchase.purchasable ? "" : " pdp-buy-row--single"}">${quantity}${renderPdpPrimaryAction(view)}</div>
      <a class="button button--outline-dark pdp-advice" href="/contact.html?product=${encodeURIComponent(product.sku || product.id)}">${pdpIcon("Консультація")}<span>Отримати консультацію</span></a>
      <div class="pdp-secondary-actions"><button class="pdp-favorite${favoriteActive ? " is-active" : ""}" type="button" data-favorite="${escapeHtml(product.id)}" aria-label="${favoriteActive ? "Видалити з обраного" : "Додати в обране"}" aria-pressed="${favoriteActive}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l7.8-7.5a5.5 5.5 0 0 0-.2-7.9Z"/></svg><span>${favoriteActive ? "В обраному" : "В обране"}</span></button><button class="pdp-compare${compareActive ? " is-active" : ""}" type="button" data-compare="${escapeHtml(product.id)}" aria-label="${compareActive ? "Видалити з порівняння" : "Додати до порівняння"}" aria-pressed="${compareActive}">${pdpIcon("Порівняти")}<span>${compareActive ? "У порівнянні" : "Порівняти"}</span></button></div>
      <p class="pdp-service-note">Ціну, наявність і комплектність менеджер підтвердить перед оплатою.</p>
    </div>`;
  }

  function renderPdpTrust(view) {
    const { product, installationRelevant } = view;
    const items = [
      ["/assets/icons/icon-delivery.svg", "Доставка", "за тарифами перевізника", "/delivery.html"],
      ["/assets/icons/icon-warranty.svg", "Гарантія", product.warranty || "від виробника", "/warranty.html"],
      ...(installationRelevant ? [["/assets/icons/icon-installation.svg", "Монтаж і сервіс", "професійний запуск", "/installation.html"]] : [])
    ];
    return `<ul class="pdp-trust" id="purchase-info" aria-label="Доставка, гарантія та сервіс">${items.map(([icon, title, text, href]) => `<li><a href="${href}"><img src="${icon}" width="24" height="24" alt=""><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text)}</small></span></a></li>`).join("")}</ul>`;
  }

  function renderPdpKeySpecifications(view) {
    if (!view.keyFacts.length) return "";
    return `<aside class="pdp-key-specs" aria-labelledby="key-specs-title"><h3 id="key-specs-title">Ключові характеристики</h3><dl>${view.keyFacts.map(([label, value]) => `<div><dt>${escapeHtml(label.replace(/, .+$/, ""))}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></aside>`;
  }

  function renderPdpOverview(view) {
    if (!view.description && !view.keyFacts.length) return "";
    const title = view.description ? "Опис товару" : "Ключові характеристики";
    const structuredDescription = view.descriptionSections.length
      ? view.descriptionSections.map(section => `<section>${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ""}${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>`).join("")
      : view.description.split(/\n{2,}/).filter(Boolean).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("");
    return `<section class="pdp-detail-section pdp-overview" id="overview" aria-labelledby="overview-title"><div class="container"><details class="pdp-module" data-pdp-module open><summary><span>${title}</span><b aria-hidden="true"></b></summary><div class="pdp-module__body"><div class="pdp-section__head"><h2 id="overview-title">${title}</h2></div><div class="pdp-overview__grid${view.description && view.keyFacts.length ? "" : " is-single"}">${view.description ? `<div class="pdp-description-copy">${structuredDescription}</div>` : ""}${renderPdpKeySpecifications(view)}</div></div></details></div></section>`;
  }

  function renderPdpSpecifications(view) {
    if (!view.groups.length) return "";
    const items = view.groups.flatMap(group => group.items);
    return `<section class="pdp-detail-section pdp-specifications" id="specifications" aria-labelledby="specifications-title"><div class="container"><details class="pdp-module" data-pdp-module open><summary><span>Характеристики</span><b aria-hidden="true"></b></summary><div class="pdp-module__body"><div class="pdp-section__head"><h2 id="specifications-title">Характеристики</h2></div><dl class="pdp-spec-table">${items.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></div></details></div></section>`;
  }

  function renderPdpCompatibility(view) {
    if (!view.compatibility) return "";
    return `<section class="pdp-detail-section pdp-compatibility" id="compatibility" aria-labelledby="compatibility-title"><div class="container"><details class="pdp-module" data-pdp-module open><summary><span>Сумісність</span><b aria-hidden="true"></b></summary><div class="pdp-module__body"><div class="pdp-compatibility__row"><div>${pdpIcon("Сумісність")}<h2 id="compatibility-title">Сумісність</h2></div><p>${escapeHtml(view.compatibility)}</p><a href="/contact.html?product=${encodeURIComponent(view.product.sku || view.product.id)}">Перевірити для вашої системи →</a></div></div></details></div></section>`;
  }

  function renderPdpDocuments(view) {
    if (!view.documents.length) return "";
    return `<section class="pdp-detail-section pdp-documents" id="documents" aria-labelledby="documents-title"><div class="container"><details class="pdp-module" data-pdp-module open><summary><span>Документи</span><b aria-hidden="true"></b></summary><div class="pdp-module__body"><div class="pdp-section__head"><h2 id="documents-title">Документи</h2></div><div class="pdp-document-list">${view.documents.map(doc => `<a href="${escapeHtml(doc.url)}" target="_blank" rel="noreferrer"><span class="pdp-document-list__icon">${pdpIcon("Документ")}</span><span><small>${escapeHtml([doc.type, doc.language, doc.audience, doc.size].filter(Boolean).join(" · "))}</small><strong>${escapeHtml(doc.title)}</strong></span><b>Відкрити ↗</b></a>`).join("")}</div></div></details></div></section>`;
  }

  function renderPdpProductRail({ id, title, products }) {
    if (!products.length) return "";
    return `<section class="pdp-related-section" id="${id}" aria-labelledby="${id}-title"><div class="container"><div class="pdp-section__head"><h2 id="${id}-title">${escapeHtml(title)}</h2></div><div class="catalog-products pdp-related-products">${products.map(extendedProductCard).join("")}</div></div></section>`;
  }

  function renderPdpMobileBuybar(view) {
    return `<div class="pdp-mobile-buybar" data-pdp-mobile-buybar aria-label="Швидка покупка"><div><span>${escapeHtml(view.purchase.statusLabel)}</span><strong>${view.purchase.amount ? money(view.purchase.amount) : "Ціну уточнюйте"}</strong></div>${renderPdpPrimaryAction(view, "pdp-buy--sticky")}</div>`;
  }

  window.sofievkaPdpComponents = Object.freeze({
    createViewModel: createPdpViewModel,
    gallery: renderPdpGallery,
    identity: renderPdpIdentity,
    price: renderPdpPrice,
    primaryAction: renderPdpPrimaryAction,
    purchase: renderPdpPurchase,
    keySpecifications: renderPdpKeySpecifications,
    trust: renderPdpTrust,
    overview: renderPdpOverview,
    specifications: renderPdpSpecifications,
    compatibility: renderPdpCompatibility,
    documents: renderPdpDocuments,
    productRail: renderPdpProductRail,
    mobileBuybar: renderPdpMobileBuybar
  });

  function renderProductMaster() {
    const id = new URLSearchParams(location.search).get("id");
    const product = productById(id);
    if (!product) {
      document.title = "Товар не знайдено | ТД «Софіївка»";
      return `<section class="pdp-missing"><div class="container">${crumbs("Товар не знайдено")}<span class="pdp-missing__code">404</span><h1>Товар не знайдено</h1><p>${id ? "Посилання містить невідомий ідентифікатор товару." : "У посиланні немає ідентифікатора товару."}</p><div><a class="button button--primary" href="/catalog">До каталогу</a><button class="text-link pdp-back" type="button" data-history-back>← Повернутися назад</button></div></div></section>`;
    }
    document.title = product.seo?.title || product.seoTitle || `${product.title} | ТД «Софіївка»`;
    const metaDescription = document.querySelector('meta[name="description"]');
    const productDescription = product.seo?.description || product.seoDescription;
    if (metaDescription && productDescription) metaDescription.setAttribute("content", productDescription);
    setCanonical(`/product?id=${encodeURIComponent(product.id)}`);
    const view = createPdpViewModel(product);
    const navItems = [
      ...((view.description || view.keyFacts.length) ? [["overview", view.description ? "Опис товару" : "Ключові характеристики"]] : []),
      ...(view.groups.length ? [["specifications", "Характеристики"]] : []),
      ...(view.compatibility ? [["compatibility", "Сумісність"]] : []),
      ...(view.documents.length ? [["documents", "Документи"]] : []),
      ...(view.compatibleProducts.length ? [["compatible-products", "Сумісні товари"]] : []),
      ...(view.accessories.length ? [["accessories", "Аксесуари"]] : []),
      ...(view.similarProducts.length ? [["similar", "Схожі товари"]] : [])
    ];
    const mainImage = view.images[0] || "";
    return `<article class="pdp-master">
      <section class="pdp pdp-hero"><div class="container">${productCrumbs(product)}<div class="pdp__top">${renderPdpIdentity(view)}${renderPdpGallery(view)}${renderPdpPurchase(view)}${renderPdpTrust(view)}</div></div></section>
      ${navItems.length ? `<nav class="pdp-anchor-nav" aria-label="Навігація сторінкою"><div class="container">${navItems.map(([anchor, label], index) => `<a href="#${anchor}"${index === 0 ? ' class="is-active" aria-current="location"' : ""}>${label}</a>`).join("")}</div></nav>` : ""}
      <div class="pdp-detail-stack">${renderPdpOverview(view)}${renderPdpSpecifications(view)}${renderPdpCompatibility(view)}${renderPdpDocuments(view)}</div>
      ${renderPdpProductRail({ id: "compatible-products", title: "Сумісні товари", products: view.compatibleProducts })}
      ${renderPdpProductRail({ id: "accessories", title: "Аксесуари", products: view.accessories })}
      ${renderPdpProductRail({ id: "similar", title: "Схожі товари", products: view.similarProducts })}
      ${renderPdpMobileBuybar(view)}
      ${mainImage ? `<dialog class="pdp-lightbox" data-gallery-dialog aria-label="Збільшене фото товару"><button type="button" data-gallery-close aria-label="Закрити збільшене фото">×</button><img data-gallery-dialog-image src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.title)}, збільшене фото"></dialog>` : ""}
    </article>`;
  }

  function renderSearchExtended() {
    const query = (new URLSearchParams(location.search).get("q") || "").trim();
    document.title = query ? `${query} — пошук | ТД «Софіївка»` : "Пошук по каталогу | ТД «Софіївка»";
    return `<section class="search-page-hero"><div class="container">${crumbs("Пошук")}<p class="page-kicker">Каталог інженерного обладнання</p><h1>${query ? "Результати пошуку" : "Пошук по каталогу"}</h1>${query ? `<p class="search-page-hero__query">«${escapeHtml(query)}»</p>` : `<p>Введіть назву, бренд, модель або артикул.</p>`}</div></section><section class="page-section search-page-section"><div class="container"><form class="search-page-form" action="/search"><label for="search-page-query">Пошуковий запит</label><div><input id="search-page-query" name="q" type="search" value="${escapeHtml(query)}" placeholder="Наприклад, Ecosoft осмос або MO550MECOSTD"><button class="button button--primary" type="submit">Знайти</button></div></form><div class="search-page-results" data-search-page-results aria-live="polite"></div></div></section>`;
  }

  function renderBrandExtended() {
    const pathSlug = location.pathname.split("/").filter(Boolean).pop()?.replace(/\.html$/, "");
    const slug = pathSlug && pathSlug !== "brand" ? pathSlug : new URLSearchParams(location.search).get("slug") || "ecosoft";
    const brands = [...new Set(PRODUCTS.map(product => product.brand))];
    const brand = brands.find(item => item.toLocaleLowerCase("en") === slug.toLocaleLowerCase("en"));
    if (!brand) return hero("Бренди", "Бренд не знайдено", "Перейдіть до переліку доступних виробників.", true) + `<section class="page-section"><div class="container"><a class="button button--primary" href="/brands.html">Усі бренди</a></div></section>`;
    document.title = `${brand} | ТД «Софіївка»`; setCanonical(`/brands/${encodeURIComponent(slug)}`);
    const allItems = PRODUCTS.filter(product => product.brand === brand);
    const categories = [...new Map(allItems.map(product => [product.primaryCategory, product.primaryCategoryName])).entries()];
    const params = new URLSearchParams(location.search);
    const selectedCategory = categories.some(([categorySlug]) => categorySlug === params.get("category")) ? params.get("category") : "";
    const items = selectedCategory ? allItems.filter(product => product.primaryCategory === selectedCategory) : allItems;
    const selectedName = categories.find(([categorySlug]) => categorySlug === selectedCategory)?.[1];
    const catalogLabel = allItems.every(product => product.category === "water") ? "каталогу очищення води" : "каталогу опалення";
    const categoryLinks = [
      `<a class="${selectedCategory ? "" : "is-active"}" href="/brands/${encodeURIComponent(slug)}#brand-products">Усі категорії <span>${allItems.length}</span></a>`,
      ...categories.map(([categorySlug, name]) => `<a class="${selectedCategory === categorySlug ? "is-active" : ""}" href="/brands/${encodeURIComponent(slug)}?category=${encodeURIComponent(categorySlug)}#brand-products">${escapeHtml(name)} <span>${allItems.filter(product => product.primaryCategory === categorySlug).length}</span></a>`)
    ].join("");
    return `<section class="brand-hero"><div class="container"><nav class="page-breadcrumbs" aria-label="Хлібні крихти"><a href="/brands.html">Бренди</a><span>→</span><span aria-current="page">${escapeHtml(brand)}</span></nav><p class="page-kicker">Виробник</p><h1>${escapeHtml(brand)}</h1><p>${allItems.length} товарів у ${categories.length} категоріях ${catalogLabel}.${brand === "Ecosoft" ? " Ключові параметри звірено з офіційним каталогом Ecosoft 2026." : ""}</p></div></section><section class="page-section page-section--compact"><div class="container brand-categories">${categoryLinks}</div></section><section class="page-section" id="brand-products"><div class="container"><div class="page-heading"><h2>${selectedName ? escapeHtml(selectedName) : `Товари ${escapeHtml(brand)}`}</h2><p>${selectedCategory ? `Знайдено ${items.length} товарів у вибраній категорії.` : "Оберіть категорію або перегляньте весь асортимент бренду."}</p></div><div class="catalog-products">${items.map(extendedProductCard).join("")}</div></div></section>`;
  }

  function renderCompareExtended() {
    const queryIds = new URLSearchParams(location.search).get("ids");
    const requestedIds = (queryIds ? queryIds.split(",") : compareSelection()).filter(Boolean).slice(0, 4);
    const selected = requestedIds.map(productById).filter(Boolean);
    if (!selected.length) return hero("Порівняння", "Немає товарів для порівняння", "Позначте потрібні моделі в каталозі — випадкові товари не додаються.", true) + `<section class="page-section"><div class="container empty-state"><a class="button button--primary" href="/catalog/water-treatment">До каталогу</a></div></section>`;
    const compatible = selected.filter(product => product.compareType === selected[0].compareType);
    const keys = [...new Set(compatible.flatMap(product => Object.keys(product.features || {})))];
    return hero("Порівняння", compatible[0].primaryCategoryName, "Поруч показані лише сумісні товари та підтверджені характеристики.", true) + `<section class="page-section"><div class="container compare-scroll"><table class="compare-table"><thead><tr><th>Параметр</th>${compatible.map(product => `<th><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}"><span>${escapeHtml(product.brand)}</span><strong>${escapeHtml(product.shortTitle || product.title)}</strong></th>`).join("")}</tr></thead><tbody><tr><th>Код товару</th>${compatible.map(product => `<td>${escapeHtml(product.sku)}</td>`).join("")}</tr>${keys.map(key => { const label = FEATURE_LABELS[key]?.[0] || key; return `<tr><th>${escapeHtml(label)}</th>${compatible.map(product => `<td>${escapeHtml(featureEntries({ features: { [key]: product.features?.[key] } })[0]?.[1] || "—")}</td>`).join("")}</tr>`; }).join("")}<tr><th>Наявність</th>${compatible.map(product => `<td>${escapeHtml(product.availabilityLabel)}</td>`).join("")}</tr><tr><th>Ціна</th>${compatible.map(product => `<td><strong>${money(product.price)}</strong></td>`).join("")}</tr><tr><th>Дія</th>${compatible.map(product => `<td><a class="button button--secondary" href="${productUrl(product)}">Переглянути</a></td>`).join("")}</tr></tbody></table></div></section>`;
  }

  function renderBuyersExtended() {
    const items = [["delivery.html", "Доставка", "Способи отримання, перевірка вантажу та строки."], ["payment.html", "Оплата", "Коли й за якими реквізитами оплачується замовлення."], ["warranty.html", "Гарантія", "Документи, діагностика та маршрут звернення."], ["returns.html", "Обмін і повернення", "Умови для товару належної якості та дії при пошкодженні."], ["faq.html", "Часті запитання", "Короткі відповіді про підбір, покупку й сервіс."], ["contact.html", "Контакти", "Телефони, графік і маршрут до магазину."]];
    return hero("Покупцям", "Усе важливе до замовлення", "Умови отримання, оплати, гарантії та повернення зібрані в одному розділі.", true) + `<section class="page-section"><div class="container buyer-help-grid">${items.map(([href, title, text], index) => `<a href="/${href}"><span>0${index + 1}</span><h2>${title}</h2><p>${text}</p><b>Перейти →</b></a>`).join("")}</div></section>`;
  }

  function renderAboutExtended() {
    return hero("Про компанію", "Технічний магазин із відповідальністю за контекст", "Ми продаємо обладнання для опалення, водопостачання, сантехніки та клімату й допомагаємо перевірити, як окремі компоненти працюватимуть разом.") + `<section class="page-section"><div class="container about-principles"><article><span>01</span><h2>Спочатку задача</h2><p>Уточнюємо об'єкт, режими роботи та наявну систему, а не починаємо з випадкової моделі.</p></article><article><span>02</span><h2>Потім сумісність</h2><p>Звіряємо потужність, приєднання, автоматику, монтажні параметри та документацію.</p></article><article><span>03</span><h2>Після цього поставка</h2><p>Фіксуємо комплектність, спосіб отримання, відповідальних і наступний крок.</p></article></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Чим займається «Софіївка»</h2><p>Ми комплектуємо приватні будинки, квартири, комерційні приміщення та об'єкти монтажних організацій. У каталозі поєднуємо основне обладнання, автоматику, запірну арматуру, трубопровідні системи та витратні матеріали.</p><p>Наше завдання — зробити шлях від запиту до запуску зрозумілим. Якщо для рішення потрібен теплотехнічний розрахунок, аналіз води або огляд місця монтажу, ми не підміняємо це онлайн-обіцянкою.</p><h2>Як ми працюємо з інформацією</h2><ul><li>Характеристики товарів звіряються з документами конкретної моделі.</li><li>Ціна й наявність підтверджуються перед оплатою.</li><li>Аналоги пропонуються лише після порівняння технічних параметрів.</li><li>Обсяг монтажу та сервісу погоджується до початку робіт.</li></ul><h2>Для приватних і професійних клієнтів</h2><p>Приватним покупцям допомагаємо сформувати комплект і зрозуміти, що потрібно підготувати до монтажу. Монтажникам, проєктантам та бізнесу пропонуємо роботу зі специфікаціями, кодами, рахунками й поетапними поставками.</p></article><aside class="aside-card"><p class="page-kicker">Швидкий маршрут</p><h2>Є проєкт або список обладнання?</h2><p>Надішліть документ чи фото. Ми структуруємо запит і повернемося з уточненнями.</p><a class="button button--primary" href="/contact.html">Передати задачу</a><div class="link-list"><a href="/partnership.html">Для професіоналів <span>→</span></a><a href="/portfolio.html">Формат кейсів <span>→</span></a><a href="/brands.html">Бренди <span>→</span></a></div></aside></div></section>`;
  }

  function renderDeliveryExtended() {
    return hero("Покупцям", "Доставка замовлень", "Спосіб, строк і вартість отримання залежать від складу відвантаження, габаритів, ваги та адреси.", true) + `<section class="page-section"><div class="container"><div class="page-heading"><h2>Доступні сценарії отримання</h2><p>Фінальний варіант менеджер підтверджує разом із наявністю та комплектністю замовлення.</p></div><div class="delivery-methods"><article><img src="/assets/icons/icon-delivery.svg" alt=""><h3>Перевізником по Україні</h3><p>До відділення або за адресою, якщо габарити та правила перевізника це дозволяють.</p></article><article><img src="/assets/icons/icon-return.svg" alt=""><h3>Самовивіз</h3><p>Після повідомлення, що весь комплект зібраний і готовий до видачі.</p></article><article><img src="/assets/icons/icon-installation.svg" alt=""><h3>На об'єкт</h3><p>Для комплектних поставок графік і розвантаження погоджуються окремо.</p></article></div></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Як формується строк</h2><ol><li>Перевіряємо фактичний склад відвантаження кожної позиції.</li><li>Уточнюємо, чи можна відправити комплект одним місцем або однією партією.</li><li>Звіряємо обмеження перевізника для довгомірних, важких і крихких товарів.</li><li>Підтверджуємо орієнтовну дату відправлення та спосіб отримання.</li></ol><h2>Що перевірити при отриманні</h2><ul><li>Кількість місць, цілісність упаковки й відсутність слідів удару або намокання.</li><li>Назву та модель на коробці, якщо вона доступна без пошкодження упаковки.</li><li>Комплектність за супровідними документами.</li><li>Пошкодження потрібно зафіксувати до завершення отримання за правилами перевізника.</li></ul><h2>Великогабаритні товари</h2><p>Радіатори, баки, котли, довгомірні труби та інше об'ємне обладнання можуть потребувати окремого тарифу, дерев'яного каркаса або адресної доставки. Такі умови погоджуємо до оплати.</p></article><aside class="aside-card"><h2>Потрібен розрахунок доставки?</h2><p>Надішліть список товарів, населений пункт і бажаний спосіб отримання.</p><a class="button button--secondary" href="/contact.html">Уточнити доставку</a><div class="link-list"><a href="/payment.html">Оплата <span>→</span></a><a href="/returns.html">Повернення <span>→</span></a><a href="/faq.html">Часті запитання <span>→</span></a></div></aside></div></section>`;
  }

  function renderPaymentExtended() {
    return hero("Покупцям", "Оплата без неузгоджених переказів", "Оплачуйте замовлення лише після підтвердження моделі, ціни, комплектності, способу доставки та актуальних реквізитів.", true) + `<section class="page-section"><div class="container payment-grid"><article><span>01</span><h2>Безготівковий рахунок</h2><p>Для фізичних осіб, ФОП і підприємств. Реквізити та строк резерву вказуються в рахунку.</p></article><article><span>02</span><h2>Оплата при отриманні</h2><p>Доступність залежить від товару, суми, способу перевезення та правил перевізника.</p></article><article><span>03</span><h2>Оплата в магазині</h2><p>Після підтвердження, що товар є в точці видачі та підготовлений до отримання.</p></article></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Безпечний порядок оплати</h2><ol><li>Менеджер перевіряє артикул, ціну, залишок і комплектність.</li><li>Ви отримуєте підсумок замовлення та погоджений спосіб доставки.</li><li>Для безготівкової оплати надсилається рахунок з актуальними реквізитами.</li><li>Після зарахування коштів замовлення переходить до комплектування або відправлення.</li></ol><h2>Для підприємств і монтажних організацій</h2><p>Документи формуються за підтвердженими реквізитами та номенклатурою. Якщо об'єкт постачається частинами, порядок рахунків і відвантажень узгоджується до першої оплати.</p><h2>Поточний порядок оформлення</h2><p>Онлайн-еквайринг і автоматичне створення замовлення на сайті наразі недоступні. Менеджер погоджує спосіб оплати та надає актуальні реквізити після перевірки товарів. Не здійснюйте переказ до отримання підтвердження.</p></article><aside class="aside-card"><h2>Перевірити рахунок</h2><p>Звірте назву продавця, перелік товарів, кількість, суму та призначення платежу.</p><a class="button button--secondary" href="/contact.html">Зв'язатися з менеджером</a><div class="link-list"><a href="/delivery.html">Доставка <span>→</span></a><a href="/buyers.html">Покупцям <span>→</span></a><a href="/terms.html">Умови користування <span>→</span></a></div></aside></div></section>`;
  }

  function renderWarrantyExtended() {
    return hero("Після покупки", "Гарантія та сервісний маршрут", "Умови гарантії залежать від виробника, моделі, правильності монтажу та документів, що супроводжують конкретний товар.", true) + `<section class="page-section"><div class="container warranty-flow"><article><span>01</span><h2>Зберіть дані</h2><p>Модель, серійний номер, документ про покупку, дата монтажу та опис симптомів.</p></article><article><span>02</span><h2>Не розбирайте обладнання</h2><p>До погодження діагностики не порушуйте пломби й не змінюйте підключення.</p></article><article><span>03</span><h2>Передайте звернення</h2><p>Ми визначимо, чи потрібен продавець, сервісний партнер або виробник.</p></article><article><span>04</span><h2>Зафіксуйте результат</h2><p>Отримайте акт, висновок або інший документ за процедурою конкретного бренду.</p></article></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Що підготувати</h2><ul><li>Фото шильдика з моделлю та серійним номером.</li><li>Документ про покупку й гарантійний документ, якщо він передбачений.</li><li>Фото загального підключення та повідомлення на дисплеї.</li><li>Короткий опис: коли з'явився симптом і за яких умов.</li></ul><h2>Монтаж і гарантія</h2><p>Для частини технічно складного обладнання виробник може встановлювати вимоги до монтажу, першого запуску та обслуговування. Їх потрібно звірити з інструкцією та гарантійними умовами конкретної моделі до встановлення.</p><h2>Планове обслуговування</h2><p>Гарантія не замінює регламентне обслуговування. Фільтри, теплообмінники, рухомі вузли та системи відведення продуктів згоряння перевіряються за документацією виробника й умовами експлуатації.</p></article><aside class="aside-card"><h2>Потрібна діагностика?</h2><p>Надішліть модель, серійний номер і фото підключення — це допоможе визначити правильний маршрут.</p><a class="button button--primary" href="/service-center.html">До сервісного центру</a><div class="link-list"><a href="/returns.html">Обмін і повернення <span>→</span></a><a href="/contact.html">Контакти <span>→</span></a></div></aside></div></section>`;
  }

  function renderReturnsExtended() {
    return hero("Після покупки", "Обмін і повернення", "Порядок дій залежить від стану товару, його категорії, комплектності, документів і характеру звернення.", true) + `<section class="page-section"><div class="container return-scenarios"><article><p class="page-kicker">Товар належної якості</p><h2>Не встановлювався й не використовувався</h2><p>Для обміну важливо зберегти товарний вигляд, споживчі властивості, пломби, ярлики, комплектність і розрахунковий документ.</p></article><article><p class="page-kicker">Пошкодження при доставці</p><h2>Фіксуйте до завершення отримання</h2><p>Зробіть фото, повідомте представника перевізника та оформіть документи за його процедурою.</p></article><article><p class="page-kicker">Несправність</p><h2>Потрібна діагностика</h2><p>Не демонтуйте й не розбирайте товар без погодженого маршруту сервісного звернення.</p></article></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Строк для обміну товару належної якості</h2><p>Закон України «Про захист прав споживачів» передбачає право на обмін непродовольчого товару належної якості протягом 14 днів, не рахуючи дня купівлі, якщо продавець не оголосив триваліший строк і виконані встановлені законом умови.</p><p>Окремі товари та товари, виготовлені, нарізані або розкроєні під визначений покупцем розмір, можуть належати до переліку винятків. Перед прийманням рішення потрібно перевірити актуальну категорію конкретного товару.</p><h2>Як подати звернення</h2><ol><li>Повідомте номер документа про покупку та код товару.</li><li>Опишіть причину звернення й стан упаковки.</li><li>Додайте фото товару, комплекту, пломб і маркування.</li><li>Дочекайтеся погодження способу та адреси передачі товару.</li></ol><h2>Офіційні джерела</h2><ul><li><a href="https://zakon.rada.gov.ua/go/1023-12" target="_blank" rel="noreferrer">Закон України «Про захист прав споживачів»</a>.</li><li><a href="https://zakon.rada.gov.ua/laws/show/1243-2024-%D0%BF" target="_blank" rel="noreferrer">Актуальний перелік товарів, що не підлягають обміну або поверненню</a>.</li></ul></article><aside class="aside-card"><h2>Перед відправленням</h2><p>Не надсилайте товар без погодження. Спочатку потрібно визначити тип звернення та відповідальну сторону.</p><a class="button button--secondary" href="/contact.html">Оформити звернення</a><div class="link-list"><a href="/warranty.html">Гарантія <span>→</span></a><a href="/delivery.html">Доставка <span>→</span></a></div></aside></div></section>`;
  }

  function renderFaqExtended() {
    const groups = [
      ["Підбір", [["Що потрібно для підбору котла?", "Площа й тепловтрати, кількість точок гарячої води, тип димоходу, електроживлення, схема системи та бажана автоматика."], ["Як підібрати насос?", "Потрібні витрата, напір, монтажна довжина, діаметр приєднання, тип теплоносія й режим керування."], ["Можна замінити товар аналогом?", "Так, але лише після порівняння робочих параметрів, розмірів, підключень, керування та гарантійних умов."]]],
      ["Замовлення", [["Як підтверджуються ціни та наявність?", "Перед оплатою менеджер додатково перевіряє актуальну ціну, залишок і комплектність замовлення."], ["Коли замовлення вважається погодженим?", "Після підтвердження моделі, кількості, ціни, комплектності, способу оплати й доставки."], ["Чи можна замовити весь комплект?", "Так. Надішліть специфікацію або опис системи, щоб перевірити основне обладнання та монтажні компоненти."]]],
      ["Доставка і сервіс", [["Як дізнатися строк доставки?", "Менеджер перевіряє склад відвантаження, габарити й спосіб перевезення, після чого підтверджує орієнтовний строк."], ["Що робити при пошкодженні упаковки?", "Зафіксуйте пошкодження до завершення отримання та оформіть документи за процедурою перевізника."], ["Що потрібно для сервісного звернення?", "Модель, серійний номер, документ про покупку, опис симптомів і фото підключення або повідомлення на дисплеї."]]]
    ];
    return hero("Допомога", "Часті запитання", "Відповіді про підбір, замовлення, доставку, монтаж і сервіс.", true) + `<section class="page-section page-section--white"><div class="container faq-groups">${groups.map(([title, items]) => `<section><h2>${title}</h2><div class="faq-list">${items.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join("")}</div></section>`).join("")}</div></section>`;
  }

  function renderPartnershipExtended() {
    return hero("Для професіоналів", "Закупівлі й комплектація за специфікацією", "Монтажникам, проєктантам і бізнесу — робота за кодами, перевірка аналогів, документи та узгоджені поставки.") + `<section class="page-section"><div class="container partner-capabilities"><article><span>01</span><h2>Специфікації</h2><p>Приймаємо PDF, XLSX або структурований список із кодами й кількістю.</p></article><article><span>02</span><h2>Технічна перевірка</h2><p>Звіряємо моделі, базові параметри та критичні точки сумісності.</p></article><article><span>03</span><h2>Поставка</h2><p>Фіксуємо резерв, партії, строки та спосіб передачі на об'єкт.</p></article><article><span>04</span><h2>Повторні замовлення</h2><p>Зберігаємо контекст об'єкта, щоб швидше відновити погоджений склад.</p></article></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Що надіслати для першого прорахунку</h2><ul><li>Назву або внутрішнє позначення об'єкта.</li><li>Коди, моделі, кількість і допустимі аналоги.</li><li>Бажаний строк та адресу або спосіб отримання.</li><li>Реквізити для рахунку після технічного погодження.</li></ul><h2>Як працюємо з аналогами</h2><p>Альтернатива не повинна змінювати проєкт непомітно. Ми позначаємо відмінності у приєднаннях, потужності, керуванні, монтажних розмірах та гарантійному маршруті.</p><h2>Комерційні умови</h2><p>Ціна залежить від бренду, обсягу, регулярності, способу оплати та логістики. Конкретні умови фіксуються у пропозиції, а не декларуються універсально на сторінці.</p></article><aside class="aside-card"><h2>Надіслати специфікацію</h2><p>У темі листа вкажіть об'єкт, а у файлі — коди та кількість.</p><a class="button button--primary" href="mailto:partner@sofievka.ua?subject=Специфікація%20об'єкта">partner@sofievka.ua</a><div class="link-list"><a href="/installation.html">Монтаж <span>→</span></a><a href="/delivery.html">Поставка <span>→</span></a></div></aside></div></section>`;
  }

  function renderInstallationExtended() {
    return hero("Монтаж", "Від огляду до контрольованого запуску", "Обсяг робіт визначається після вихідних даних або огляду. Обладнання, монтажні матеріали й відповідальність сторін фіксуються до початку.") + `<section class="page-section"><div class="container installation-steps"><article><span>01</span><h2>Вихідні дані</h2><p>План, фото, проєкт, наявне обладнання та очікуваний режим роботи.</p></article><article><span>02</span><h2>Оцінка</h2><p>Перелік робіт, матеріалів, підготовчих вимог і доступів на об'єкті.</p></article><article><span>03</span><h2>Монтаж</h2><p>Встановлення за погодженою схемою та документацією виробника.</p></article><article><span>04</span><h2>Запуск</h2><p>Перевірка, налаштування, пояснення основних режимів і передача документів.</p></article></div></section><section class="page-section page-section--white"><div class="container"><div class="page-heading"><h2>Напрями робіт</h2><p>Фактична доступність робіт залежить від географії, типу обладнання та завантаження монтажної команди.</p></div><div class="service-direction-grid"><article><img src="/assets/icons/icon-heating.svg" alt=""><h3>Опалення</h3><p>Котельні, радіаторні контури, тепла підлога, автоматика.</p></article><article><img src="/assets/icons/icon-pump.svg" alt=""><h3>Водопостачання</h3><p>Насоси, автоматика, баки, фільтрація та обв'язка.</p></article><article><img src="/assets/icons/icon-climate.svg" alt=""><h3>Клімат</h3><p>Кондиціонери, локальна вентиляція, траси та дренаж.</p></article></div></div></section><section class="page-section"><div class="container consultation-band"><div><p class="page-kicker">Почати оцінку</p><h2>Покажіть об'єкт і задачу</h2><p>Підготуйте фото, план або проєкт та орієнтовний строк робіт.</p></div><a class="button button--primary" href="/contact.html">Запросити оцінку</a></div></section>`;
  }

  function renderServiceCenterExtended() {
    return hero("Сервісний центр", "Діагностика починається з правильної інформації", "Підготуйте модель, серійний номер, умови монтажу й точний опис симптомів — так простіше визначити наступний крок.") + `<section class="page-section"><div class="container service-request-grid"><article><img src="/assets/icons/icon-service.svg" alt=""><h2>Діагностика</h2><p>Визначення маршруту звернення та потрібних матеріалів до виїзду або приймання.</p></article><article><img src="/assets/icons/icon-warranty.svg" alt=""><h2>Гарантійний випадок</h2><p>Перевірка документів і вимог виробника до монтажу та обслуговування.</p></article><article><img src="/assets/icons/icon-automation.svg" alt=""><h2>Планове обслуговування</h2><p>Регламентні роботи за типом обладнання та фактичними умовами експлуатації.</p></article></div></section><section class="page-section page-section--white"><div class="container content-layout"><article class="prose"><h2>Що надіслати</h2><ol><li>Фото шильдика й серійного номера.</li><li>Фото загального підключення без демонтажу корпусу.</li><li>Код помилки або точний опис індикації.</li><li>Коли й за яких умов виникає проблема.</li><li>Документ про покупку та запуск, якщо звернення гарантійне.</li></ol><h2>Чого не робити до консультації</h2><p>Не порушуйте пломби, не змінюйте налаштування без фіксації та не демонтуйте обладнання, якщо це може ускладнити діагностику або гарантійний розгляд.</p></article><aside class="aside-card"><h2>Створити сервісне звернення</h2><p>Опишіть симптом і додайте підготовлені фото у зручному каналі зв'язку.</p><a class="button button--primary" href="/contact.html">Контакти сервісу</a><div class="link-list"><a href="/warranty.html">Гарантія <span>→</span></a><a href="/installation.html">Монтаж <span>→</span></a></div></aside></div></section>`;
  }

  function renderServicesExtended() {
    return hero("Послуги", "Один маршрут від підбору до сервісу", "Консультація, комплектація, монтаж, запуск і подальша підтримка працюють у спільному контексті.") + `<section class="page-section"><div class="container service-hub-grid"><a href="/solutions.html"><span>01</span><h2>Комплектація системи</h2><p>Основне обладнання, автоматика, арматура й монтажні матеріали.</p><b>Детальніше →</b></a><a href="/installation.html"><span>02</span><h2>Монтаж і запуск</h2><p>Оцінка об'єкта, погоджений склад робіт і контрольований запуск.</p><b>Детальніше →</b></a><a href="/service-center.html"><span>03</span><h2>Сервісний центр</h2><p>Діагностика, гарантійний маршрут і планове обслуговування.</p><b>Детальніше →</b></a><a href="/partnership.html"><span>04</span><h2>Для професіоналів</h2><p>Специфікації, документи та поетапні поставки на об'єкт.</p><b>Детальніше →</b></a></div></section>`;
  }

  function renderSolutionsExtended() {
    return hero("Комплексні рішення", "Система важливіша за окрему коробку", "Ми розглядаємо джерело, розподіл, автоматику, безпеку та монтажні матеріали як один комплект.") + `<section class="page-section"><div class="container solution-grid"><article class="solution-card" id="heating-house"><div class="solution-card__media"><img src="/assets/images/solution-boiler-room.webp" alt="Обладнання котельні"></div><div class="solution-card__body"><h2>Котельня приватного будинку</h2><p>Теплове навантаження, гаряча вода, циркуляція, розподіл і керування.</p><a class="text-link" href="/heating.html">Напрям опалення →</a></div></article><article class="solution-card" id="water-treatment"><div class="solution-card__media"><img src="/assets/images/hero-water.webp" alt="Система водопостачання"></div><div class="solution-card__body"><h2>Вода зі свердловини</h2><p>Насос, захист, накопичення, стабілізація тиску та очищення.</p><a class="text-link" href="/water-supply.html">Напрям води →</a></div></article><article class="solution-card" id="climate-object"><div class="solution-card__media"><img src="/assets/images/hero-climate.webp" alt="Кліматична система"></div><div class="solution-card__body"><h2>Клімат приміщення</h2><p>Потужність, розташування, траси, дренаж і доступ до сервісу.</p><a class="text-link" href="/climate.html">Напрям клімату →</a></div></article></div></section><section class="page-section page-section--white"><div class="container"><div class="page-heading"><h2>Як формується специфікація</h2><p>Результатом має бути не абстрактна рекомендація, а перевірений перелік із кількістю та примітками.</p></div><div class="process-list"><article><span>01</span><h3>Задача</h3><p>Об'єкт, режими, обмеження й критерії.</p></article><article><span>02</span><h3>Розрахунок</h3><p>Робочі параметри та точки сумісності.</p></article><article><span>03</span><h3>Комплект</h3><p>Основне обладнання й монтажні компоненти.</p></article><article><span>04</span><h3>Реалізація</h3><p>Поставка, монтаж, запуск і документи.</p></article></div></div></section>`;
  }

  function renderContactExtended() {
    return hero("Контакти", "Поговоріть із фахівцем", "Знайдемо товар за кодом, перевіримо базову сумісність або приймемо специфікацію на прорахунок.", true) + `<section class="page-section"><div class="container contact-grid"><div><dl class="contact-details"><div><dt>Телефони</dt><dd><a href="tel:+380501234567">+38 (050) 123 45 67</a><br><a href="tel:+380671234567">+38 (067) 123 45 67</a></dd></div><div><dt>Email</dt><dd><a href="mailto:info@sofievka.ua">info@sofievka.ua</a><br><a href="mailto:partner@sofievka.ua">partner@sofievka.ua</a></dd></div><div><dt>Графік</dt><dd>Пн–Пт: 9:00–18:00<br>Сб: 9:00–15:00</dd></div><div><dt>Адреса макета</dt><dd>м. Софіївка, вул. Соборна, 45<br><small>Підтвердити перед публічним запуском</small></dd></div></dl><div class="contact-purpose"><h2>Що вказати у зверненні</h2><ul><li>Назву або код товару.</li><li>Тип об'єкта й коротку задачу.</li><li>Фото, схему або специфікацію.</li><li>Місто й бажаний строк.</li></ul></div></div><div class="contact-map"><p class="page-kicker">Магазин і консультація</p><h2>Перед візитом уточніть наявність моделі</h2><p>Менеджер перевірить склад і підготує товар або консультацію до вашого приїзду.</p><a class="button button--primary" href="https://maps.google.com/?q=Софіївка+вул.+Соборна+45" target="_blank" rel="noreferrer">Прокласти маршрут</a></div></div></section>`;
  }

  function renderBlogExtended() {
    const cards = [["Підбір", "Що підготувати для підбору циркуляційного насоса", "Робоча точка, монтажна довжина та режим керування.", "/assets/images/product-pump.webp"], ["Опалення", "Чому потужність котла — лише початок", "Димохід, гідравліка, гаряча вода й автоматика.", "/assets/images/hero-heating.webp"], ["Доставка", "Як прийняти технічне обладнання", "Упаковка, модель, комплектність і фіксація пошкоджень.", "/assets/images/article-technician.webp"], ["Вода", "Які дані потрібні для системи зі свердловини", "Дебіт, рівні води, витрата, тиск і якість води.", "/assets/images/hero-water.webp"], ["Клімат", "Де закінчується онлайн-підбір кондиціонера", "Теплоприпливи, траса, дренаж і місця блоків.", "/assets/images/hero-climate.webp"], ["Сервіс", "Що сфотографувати перед зверненням", "Шильдик, підключення, індикацію та умови появи помилки.", "/assets/images/showroom.webp"]];
    return hero("Практичні матеріали", "Корисно знати до покупки", "Короткі технічні орієнтири для вибору, отримання та експлуатації інженерного обладнання.", true) + `<section class="page-section"><div class="container article-grid article-grid--expanded">${cards.map(([kicker, title, text, image]) => `<article class="article-preview"><img src="${image}" alt="" loading="lazy"><div><span>${kicker}</span><h2>${title}</h2><p>${text}</p><a href="/contact.html">Поставити запитання →</a></div></article>`).join("")}</div></section>`;
  }

  function renderPortfolioExtended() {
    return hero("Інженерні задачі", "Від вихідних даних до робочої системи", "Показуємо логіку комплектації без вигаданих об’єктів, результатів або технічних показників.") + `<section class="page-section"><div class="container portfolio-showcase"><article class="portfolio-lead"><img src="/assets/images/solution-boiler-room.webp" alt="Обладнання котельні"><div><p class="page-kicker">Комплексна задача</p><h2>Котельня приватного будинку</h2><p>Тепловтрати, гаряча вода, зони опалення, автоматика, склад обладнання та межі монтажних робіт розглядаються як одна система.</p><a class="text-link" href="/solutions.html">Переглянути підхід до рішень →</a></div></article><div class="portfolio-notes"><article><span>01</span><h3>Вихідні дані</h3><p>Тип об'єкта, режими роботи, наявні мережі та технічні обмеження.</p></article><article><span>02</span><h3>Специфікація</h3><p>Основне обладнання, автоматика, арматура й монтажні компоненти.</p></article><article><span>03</span><h3>Реалізація</h3><p>Поставка, монтаж, запуск і розподіл відповідальності між учасниками.</p></article><article><span>04</span><h3>Супровід</h3><p>Документація, планове обслуговування та зрозумілий сервісний маршрут.</p></article></div></div></section><section class="page-section page-section--white"><div class="container consultation-band consultation-band--light"><div><p class="page-kicker">Ваш об'єкт</p><h2>Почнемо з задачі та вихідних даних</h2><p>Надішліть специфікацію, схему або опис об'єкта — визначимо, яких даних бракує для наступного кроку.</p></div><a class="button button--secondary" href="/contact.html">Передати задачу</a></div></section>`;
  }

  function bindExtendedPage(name) {
    if (["catalog", "brand", "heating", "water-supply", "plumbing", "climate"].includes(name) && window.sofievkaCatalogUI) {
      window.sofievkaCatalogUI.bind({ pageName: name, productCard: extendedProductCard });
      return;
    }
    if (name !== "catalog") bindPage(name);

    if (name === "catalog") {
      document.querySelector('[data-filter-key="availability"]')?.closest(".filter-group")?.insertAdjacentHTML("afterend", `<div class="filter-group"><strong>Тип встановлення</strong><label><input type="checkbox" value="under-sink" data-filter-key="installation"> Під мийку</label></div>`);
      let params = new URLSearchParams(location.search);
      const pathSlug = location.pathname.startsWith("/catalog/water-treatment/") ? location.pathname.split("/").filter(Boolean).pop() : "";
      const legacyTypeMap = { "reverse-osmosis": "reverse-osmosis", "flow-filters": "flow-filters", "mainline-filters": "mainline-filters-housings", "water-filter-cartridges": "drinking-system-cartridges", "mainline-cartridges": "mainline-cartridges", "filter-media": "filter-media", horeca: "" };
      let activeType = WATER.categoryBySlug[pathSlug] ? pathSlug : (legacyTypeMap[params.get("type")] || "");
      let sort = params.get("sort") || "popular";
      let visibleCount = 24;
      const productRoot = document.querySelector("[data-catalog-products]");
      const count = document.querySelector("[data-result-count]");
      const inputs = [...document.querySelectorAll("[data-filter-key]")];
      const priceMin = document.querySelector("[data-price-min]");
      const priceMax = document.querySelector("[data-price-max]");
      const loadMore = document.querySelector("[data-load-more]");
      const filterPanel = document.querySelector("[data-filter]");
      const activeRoot = document.querySelector("[data-active-filters]");
      const title = document.querySelector("[data-catalog-title]");
      const sortSelect = document.querySelector("[data-catalog-sort]");

      const valuesFor = key => (params.get(key) || "").split(",").filter(Boolean);
      const restoreControls = () => {
        inputs.forEach(input => { input.checked = valuesFor(input.dataset.filterKey).includes(input.value); });
        if (priceMin) priceMin.value = params.get("priceMin") || "";
        if (priceMax) priceMax.value = params.get("priceMax") || "";
        sort = params.get("sort") || "popular"; if (sortSelect) sortSelect.value = sort;
      };
      const writeUrl = (push = true) => {
        const next = new URLSearchParams();
        const keys = [...new Set(inputs.map(input => input.dataset.filterKey))];
        keys.forEach(key => { const values = inputs.filter(input => input.dataset.filterKey === key && input.checked).map(input => input.value); if (values.length) next.set(key, values.join(",")); });
        if (priceMin?.value) next.set("priceMin", priceMin.value);
        if (priceMax?.value) next.set("priceMax", priceMax.value);
        if (sort !== "popular") next.set("sort", sort);
        if (params.get("q")) next.set("q", params.get("q"));
        params = next;
        const path = waterCategoryUrl(activeType);
        const url = `${path}${next.toString() ? `?${next}` : ""}`;
        history[push ? "pushState" : "replaceState"]({}, "", url);
        const canonical = document.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = `https://sofievka.vercel.app${path}`;
      };

      const render = () => {
        const selected = Object.fromEntries([...new Set(inputs.map(input => input.dataset.filterKey))].map(key => [key, inputs.filter(input => input.dataset.filterKey === key && input.checked).map(input => input.value)]));
        const query = (params.get("q") || "").trim().toLocaleLowerCase("uk");
        const min = Number(priceMin?.value || 0); const max = Number(priceMax?.value || Infinity);
        const result = WATER_PRODUCTS.filter(product => (!activeType || product.primaryCategory === activeType) && product.price >= min && product.price <= max && (!query || `${product.title} ${product.sku} ${product.primaryCategoryName} ${product.description}`.toLocaleLowerCase("uk").includes(query)) && Object.entries(selected).every(([key, values]) => !values.length || values.includes(key === "brand" ? product.brand.toLocaleLowerCase("en") : key === "availability" ? product.availability : product.features?.[key])));
        if (sort === "price-asc") result.sort((first, second) => first.price - second.price);
        if (sort === "price-desc") result.sort((first, second) => second.price - first.price);
        if (sort === "name") result.sort((first, second) => first.title.localeCompare(second.title, "uk"));
        productRoot.classList.remove("is-loading");
        productRoot.innerHTML = !WATER_PRODUCTS.length ? `<div class="catalog-empty"><span aria-hidden="true">!</span><h2>Не вдалося завантажити товари</h2><p>Перевірте з’єднання та оновіть сторінку.</p><button class="button button--primary" type="button" onclick="location.reload()">Спробувати ще раз</button></div>` : result.length ? result.slice(0, visibleCount).map(extendedProductCard).join("") : `<div class="catalog-empty"><span aria-hidden="true">0</span><h2>Нічого не знайдено</h2><p>Змініть або очистіть активні фільтри.</p><button class="button button--primary" type="button" data-empty-clear>Очистити фільтри</button></div>`;
        count.textContent = result.length;
        title.textContent = activeType ? WATER.categoryBySlug[activeType]?.name || "Каталог товарів" : "Усе обладнання";
        filterPanel.dataset.activeCategory = activeType;
        const chips = [];
        if (activeType) chips.push(`<a href="/catalog/water-treatment">${escapeHtml(WATER.categoryBySlug[activeType]?.name)} <span aria-hidden="true">×</span></a>`);
        inputs.filter(input => input.checked).forEach(input => chips.push(`<button type="button" data-remove-filter="${escapeHtml(input.dataset.filterKey)}" data-remove-value="${escapeHtml(input.value)}">${escapeHtml(input.parentElement.textContent.trim())} <span aria-hidden="true">×</span></button>`));
        if (priceMin?.value) chips.push(`<button type="button" data-remove-price="priceMin">Від ${escapeHtml(priceMin.value)} грн <span>×</span></button>`);
        if (priceMax?.value) chips.push(`<button type="button" data-remove-price="priceMax">До ${escapeHtml(priceMax.value)} грн <span>×</span></button>`);
        activeRoot.innerHTML = chips.length ? `${chips.join("")}<button class="active-filters__clear" type="button" data-filter-clear>Очистити все</button>` : "";
        if (loadMore) {
          loadMore.hidden = visibleCount >= result.length;
          loadMore.textContent = `Показати ще (${Math.min(24, Math.max(0, result.length - visibleCount))})`;
        }
      };

      const update = () => { visibleCount = 24; writeUrl(); render(); };
      inputs.forEach(input => input.addEventListener("change", update));
      [priceMin, priceMax].forEach(input => input?.addEventListener("change", update));
      sortSelect?.addEventListener("change", event => { sort = event.target.value; update(); });
      document.addEventListener("click", event => {
        if (event.target.closest("[data-filter-clear], [data-empty-clear]")) { inputs.forEach(input => { input.checked = false; }); if (priceMin) priceMin.value = ""; if (priceMax) priceMax.value = ""; params = new URLSearchParams(); activeType = ""; writeUrl(); render(); }
        const remove = event.target.closest("[data-remove-filter]"); if (remove) { const input = inputs.find(item => item.dataset.filterKey === remove.dataset.removeFilter && item.value === remove.dataset.removeValue); if (input) input.checked = false; update(); }
        const removePrice = event.target.closest("[data-remove-price]"); if (removePrice) { const input = removePrice.dataset.removePrice === "priceMin" ? priceMin : priceMax; if (input) input.value = ""; update(); }
      });
      const setFilterOpen = open => { filterPanel.classList.toggle("is-open", open); document.querySelector("[data-filter-toggle]")?.setAttribute("aria-expanded", String(open)); document.body.classList.toggle("filter-drawer-open", open); };
      document.querySelector("[data-filter-toggle]")?.addEventListener("click", () => setFilterOpen(true));
      document.querySelector("[data-filter-close]")?.addEventListener("click", () => setFilterOpen(false));
      loadMore?.addEventListener("click", () => { visibleCount += 24; render(); });
      window.addEventListener("popstate", () => { params = new URLSearchParams(location.search); const slug = location.pathname.startsWith("/catalog/water-treatment/") ? location.pathname.split("/").filter(Boolean).pop() : ""; activeType = WATER.categoryBySlug[slug] ? slug : ""; restoreControls(); visibleCount = 24; render(); });
      restoreControls();
      if (params.get("category") === "water" || params.has("type")) writeUrl(false);
      requestAnimationFrame(render);
    }

    if (name === "search") {
      const query = (new URLSearchParams(location.search).get("q") || "").trim();
      const root = document.querySelector("[data-search-page-results]");
      if (!root) return;
      if (!query) {
        root.innerHTML = `<div class="empty-state search-empty"><span aria-hidden="true">⌕</span><h2>Пошук по каталогу</h2><p>Введіть назву, бренд, модель або артикул.</p></div>`;
      } else {
        const found = window.sofievkaCatalogSearch?.search(query) || { products: [], totalProducts: 0, categories: [], brands: [] };
        if (!found.totalProducts) {
          root.innerHTML = `<div class="empty-state search-empty"><span aria-hidden="true">0</span><h2>За запитом «${escapeHtml(query)}» нічого не знайдено</h2><p>Перевірте написання або введіть точну модель чи артикул.</p><ul><li>Перевірте написання</li><li>Введіть модель або артикул</li><li>Перейдіть до каталогу</li></ul><a class="button button--primary" href="/catalog">До каталогу</a></div>`;
        } else {
          const related = [...found.categories.slice(0, 3).map(hit => `<a href="${escapeHtml(hit.href)}"><span>Категорія</span>${escapeHtml(hit.entity.title)} <small>${productCountLabel(hit.count)}</small></a>`), ...found.brands.slice(0, 2).map(hit => `<a href="${escapeHtml(hit.href)}"><span>Бренд</span>${escapeHtml(hit.entity.name)} <small>${productCountLabel(hit.count)}</small></a>`)].join("");
          let visible = 24;
          const renderProducts = () => {
            root.innerHTML = `<div class="search-result-head"><div><span>«${escapeHtml(query)}»</span><h2>${productCountLabel(found.totalProducts)}</h2></div><a href="/catalog">Увесь каталог →</a></div>${related ? `<nav class="search-related" aria-label="Пов’язані категорії та бренди">${related}</nav>` : ""}<div class="catalog-products">${found.products.slice(0, visible).map(extendedProductCard).join("")}</div>${visible < found.totalProducts ? `<div class="catalog-more"><button class="button button--secondary" type="button" data-search-more>Показати ще (${Math.min(24, found.totalProducts - visible)})</button></div>` : ""}`;
            window.sofievkaCatalogUI?.trackProductImages(root);
            root.querySelector("[data-search-more]")?.addEventListener("click", () => { visible += 24; renderProducts(); });
          };
          renderProducts();
        }
      }
    }
    if (name === "product") {
      const id = new URLSearchParams(location.search).get("id");
      if (id && productById(id)) { let viewed = []; try { viewed = JSON.parse(localStorage.getItem("sofievka-viewed")) || []; } catch {} localStorage.setItem("sofievka-viewed", JSON.stringify([id, ...viewed.filter(item => item !== id)].slice(0, 8))); }
      const galleryMain = document.querySelector("[data-gallery-main]");
      const galleryImage = document.querySelector("[data-gallery-main-image]");
      const galleryThumbs = [...document.querySelectorAll("[data-gallery-thumb]")];
      const galleryCounter = document.querySelector("[data-gallery-counter]");
      const galleryDialog = document.querySelector("[data-gallery-dialog]");
      const dialogImage = document.querySelector("[data-gallery-dialog-image]");
      document.querySelectorAll("[data-gallery-zoom], [data-gallery-open]").forEach(control => control.addEventListener("click", () => galleryDialog?.showModal()));
      document.querySelector("[data-gallery-close]")?.addEventListener("click", () => galleryDialog?.close());
      galleryDialog?.addEventListener("click", event => { if (event.target === galleryDialog) galleryDialog.close(); });
      const selectGalleryImage = index => {
        if (!galleryImage) return;
        const normalizedIndex = (index + galleryThumbs.length) % galleryThumbs.length;
        const thumb = galleryThumbs[normalizedIndex];
        if (!thumb) return;
        galleryMain?.classList.remove("is-fallback");
        galleryThumbs.forEach(item => { item.classList.remove("is-active"); item.setAttribute("aria-pressed", "false"); });
        thumb.classList.add("is-active");
        thumb.setAttribute("aria-pressed", "true");
        thumb.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        if (galleryCounter) galleryCounter.textContent = `${normalizedIndex + 1} / ${galleryThumbs.length}`;
        galleryImage.style.opacity = "0";
        requestAnimationFrame(() => {
          galleryImage.src = thumb.dataset.gallerySrc;
          galleryImage.alt = thumb.dataset.galleryAlt;
          galleryImage.hidden = false;
          if (dialogImage) { dialogImage.src = thumb.dataset.gallerySrc; dialogImage.alt = `${thumb.dataset.galleryAlt}, збільшене фото`; }
          galleryImage.addEventListener("load", () => { galleryImage.style.opacity = "1"; galleryImage.hidden = false; galleryMain?.classList.remove("is-fallback"); }, { once: true });
          galleryImage.addEventListener("error", () => { galleryImage.hidden = true; galleryMain?.classList.add("is-fallback"); }, { once: true });
          if (galleryImage.complete) galleryImage.style.opacity = "1";
        });
      };
      galleryThumbs.forEach((thumb, index) => thumb.addEventListener("click", () => selectGalleryImage(index)));
      document.querySelector("[data-gallery-prev]")?.addEventListener("click", () => selectGalleryImage(Math.max(0, galleryThumbs.findIndex(item => item.classList.contains("is-active"))) - 1));
      document.querySelector("[data-gallery-next]")?.addEventListener("click", () => selectGalleryImage(Math.max(0, galleryThumbs.findIndex(item => item.classList.contains("is-active"))) + 1));

      const quantityInput = document.querySelector("[data-product-qty]");
      const normalizeQuantity = value => Math.min(99, Math.max(1, Math.round(Number(value) || 1)));
      document.querySelectorAll("[data-pdp-qty-change]").forEach(button => button.addEventListener("click", () => {
        if (!quantityInput) return;
        quantityInput.value = normalizeQuantity(Number(quantityInput.value) + Number(button.dataset.pdpQtyChange));
      }));
      quantityInput?.addEventListener("change", () => { quantityInput.value = normalizeQuantity(quantityInput.value); });

      document.querySelector("[data-copy-sku]")?.addEventListener("click", async event => {
        const value = event.currentTarget.dataset.copySku || "";
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
          await navigator.clipboard.writeText(value);
        } catch {
          const field = document.createElement("textarea");
          field.value = value;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.append(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
        toast("Артикул скопійовано");
      });

      const modules = [...document.querySelectorAll("[data-pdp-module]")];
      const mobileModules = window.matchMedia ? window.matchMedia("(max-width: 620px)") : { matches: false, addEventListener() {} };
      const setModuleMode = () => modules.forEach((module, index) => { module.open = mobileModules.matches ? index === 0 : true; });
      setModuleMode();
      mobileModules.addEventListener?.("change", setModuleMode);

      const navLinks = [...document.querySelectorAll(".pdp-anchor-nav a[href^='#']")];
      navLinks.forEach(link => link.addEventListener("click", () => {
        const target = document.querySelector(link.hash);
        const module = target?.querySelector("[data-pdp-module]");
        if (module) module.open = true;
      }));
      if ("IntersectionObserver" in window && navLinks.length) {
        const sections = navLinks.map(link => document.querySelector(link.hash)).filter(Boolean);
        const sectionObserver = new IntersectionObserver(entries => {
          const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          navLinks.forEach(link => {
            const active = link.hash === `#${visible.target.id}`;
            link.classList.toggle("is-active", active);
            if (active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
          });
        }, { rootMargin: "-18% 0px -68%", threshold: [0, .1, .35] });
        sections.forEach(section => sectionObserver.observe(section));
      }

      const purchase = document.querySelector("[data-pdp-purchase]");
      const mobileBuybar = document.querySelector("[data-pdp-mobile-buybar]");
      if (purchase && mobileBuybar && "IntersectionObserver" in window) {
        let purchaseVisible = true;
        const syncMobileBuybar = () => mobileBuybar.classList.toggle("is-visible", mobileModules.matches && !purchaseVisible && window.scrollY > 80);
        new IntersectionObserver(([entry]) => { purchaseVisible = entry.isIntersecting; syncMobileBuybar(); }, { threshold: .08 }).observe(purchase);
        addEventListener("scroll", syncMobileBuybar, { passive: true });
        mobileModules.addEventListener?.("change", syncMobileBuybar);
      }
    }
  }

  initialize();
})();
