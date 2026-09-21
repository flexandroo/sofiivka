(function () {
  "use strict";

  const taxonomy = window.sofievkaTaxonomy;
  const attributeSchema = window.sofievkaAttributeSchema;
  const sourceMappings = window.sofievkaSourceMappings;
  if (!taxonomy || !attributeSchema || !sourceMappings) throw new Error("Catalog foundations must load before product normalization.");

  const slugify = value => String(value || "")
    .toLocaleLowerCase("uk")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  const officialEcosoftFacts = Object.freeze({
    MO3400PECO: [["Продуктивність", "60 л/год"], ["ККД", "50%"], ["Формат", "Прямоточний, без бака"]],
    MO1500PECO: [["Продуктивність", "78 л/год"], ["ККД", "50%"], ["Формат", "Прямоточний, без бака"]],
    MO2800PECO: [["Продуктивність", "120 л/год"], ["ККД", "67%"], ["Формат", "Прямоточний, без бака"]],
    MO3600PECO: [["Продуктивність", "90 л/год"], ["ККД", "50–65%"], ["Формат", "Прямоточний, без бака"]],
    MO3600MPECO: [["Продуктивність", "90 л/год"], ["Мінералізація", "40–70 мг/л"], ["ККД", "60%"]],
    MO675MPUREBALECO: [["Продуктивність", "12 л/год"], ["Мінералізація", "Кальцій і магній"], ["ККД", "50%"]],
    MO675MBALPSECO: [["Продуктивність", "12 л/год"], ["Мінералізація", "Кальцій і магній"], ["Помпа", "Є"]],
    MO675PUREMACECO: [["Продуктивність", "12 л/год"], ["Мінералізація", "Кальцій"], ["ККД", "50%"]],
    MO675PSMACECO: [["Продуктивність", "12 л/год"], ["Мінералізація", "Кальцій"], ["Помпа", "Є"]],
    MO675MECO: [["Продуктивність", "8 л/год"], ["Мінералізація", "20–30 мг/л"], ["ККД", "35%"]],
    MO675MPSECO: [["Продуктивність", "8 л/год"], ["Мінералізація", "20–30 мг/л"], ["Помпа", "Є"]],
    MO550MECOSTD: [["Продуктивність", "8 л/год"], ["Мінералізація", "20–30 мг/л"], ["ККД", "35%"]],
    MO650MECOSTD: [["Продуктивність", "8 л/год"], ["Мінералізація", "20–30 мг/л"], ["ККД", "35%"]],
    MO550MPECOSTD: [["Продуктивність", "8 л/год"], ["Мінералізація", "20–30 мг/л"], ["Помпа", "Є"]],
    ROBUST1000STD: [["Продуктивність", "55–60 л/год"], ["Застосування", "Невеликі кафе й офіси"], ["Режим роботи", "До 20 год/добу"]],
    ROBUST1500ECO: [["Продуктивність", "90–100 л/год"], ["Застосування", "Кафе, готелі, лабораторії"], ["Режим роботи", "До 20 год/добу"]],
    ROBUSTCOFFEE: [["Продуктивність", "70–75 л/год"], ["Застосування", "Вода для кави за SCA"], ["Режим роботи", "До 20 год/добу"]],
    ROBUST3000MAX: [["Продуктивність", "150–160 л/год"], ["Застосування", "Ресторани й обладнання HoReCa"], ["Режим роботи", "До 20 год/добу"]],
    ROBUST4000: [["Продуктивність", "150–180 л/год"], ["Застосування", "Професійні посудомийні машини"], ["Формат", "Прямоточний"]]
  });

  const editorialCorrections = Object.freeze({
    "termojet-wp_20506": "Високоефективний циркуляційний насос SPE12 для рециркуляції води в системах гарячого водопостачання. Компактний корпус і тиха робота підходять для побутового використання.",
    "termojet-wp_20502": "Високоефективний циркуляційний насос SPE12 з таймером і термостатом для рециркуляції води в системах гарячого водопостачання. Компактний корпус і тиха робота підходять для побутового використання."
  });

  function cleanSupplierText(value) {
    return String(value || "")
      .replace(/\*+$/g, "")
      .replace(/мінеральнихолій/giu, "мінеральних олій")
      .replace(/характеристиками,близькими/giu, "характеристиками, близькими")
      .replace(/ізмагнітним/giu, "із магнітним")
      .trim();
  }

  function applyEditorialCorrections(product, category) {
    const correctedDescription = editorialCorrections[product.id] || cleanSupplierText(product.description);
    const correctedType = /^акція$/iu.test(String(product.type || "")) ? category.title : product.type || category.title;
    return {
      ...product,
      type: correctedType,
      description: correctedDescription,
      shortDescription: editorialCorrections[product.id] || cleanSupplierText(product.shortDescription || correctedDescription),
      fullDescription: editorialCorrections[product.id] || cleanSupplierText(product.fullDescription || correctedDescription)
    };
  }

  function pushFact(facts, origins, label, value, provenance = "derived", rule = "title-description") {
    if (!value || facts.some(([existingLabel]) => existingLabel === label)) return;
    facts.push([label, value]);
    origins[label] = Object.freeze({ provenance, rule });
  }

  function ecosoftDetails(product, categoryId, categoryTitle) {
    const source = `${product.title || ""} ${product.description || ""}`.replace(/[“”]/g, '"');
    const lower = source.toLocaleLowerCase("uk");
    const facts = [];
    const origins = {};
    (officialEcosoftFacts[product.sku] || []).forEach(([label, value]) => pushFact(facts, origins, label, value, "source-confirmed", "ecosoft-official-2026"));
    const size = source.match(/(\d+(?:[.,]\d+)?["″”]\s*[xх×]\s*\d+(?:[.,]\d+)?["″”]?)/i)?.[1] || source.match(/(\d+(?:[.,]\d+)?["″”])/i)?.[1];
    const microns = source.match(/(\d+(?:[–-]\d+)?)\s*мкм/i)?.[1];
    const packageQuantity = String(product.title || "").match(/(\d+)\s*шт\.?/i)?.[1];
    const period = String(product.title || "").match(/(\d+)\s*місяц/i)?.[1];
    const massOrVolume = String(product.title || "").match(/(\d+(?:[.,]\d+)?)\s*(кг|л|мл)/i);
    const gpd = String(product.title || "").match(/(\d+)\s*GPD/i)?.[1];
    const connection = String(product.title || "").match(/\b(1\/2|3\/4|1)["″”]/)?.[1];

    if (categoryId === "reverse-osmosis") {
      pushFact(facts, origins, "Технологія", "Зворотний осмос");
      pushFact(facts, origins, "Встановлення", /настільн/i.test(lower) ? "Настільне" : "Під мийку");
      pushFact(facts, origins, "Формат", /cross|прямоточ|robust/i.test(lower) ? "Прямоточний, без бака" : "З накопичувальним баком");
    } else if (categoryId === "flow-filters") {
      pushFact(facts, origins, "Тип", "Триступеневий проточний фільтр");
      pushFact(facts, origins, "Встановлення", "Під мийку");
      pushFact(facts, origins, "Призначення", "Доочищення питної води");
    } else if (categoryId === "drinking-system-cartridges") {
      pushFact(facts, origins, "Тип", /мембран/i.test(lower) ? "Мембранний елемент" : /комплект|запас/i.test(lower) ? "Комплект змінних елементів" : /мінераліз/i.test(lower) ? "Мінералізатор" : "Змінний картридж");
      pushFact(facts, origins, "Сумісність", /pure aquacalcium/i.test(lower) ? "PURE AquaCalcium" : /pure balance/i.test(lower) ? "PURE Balance" : /absolute/i.test(lower) ? "Absolute" : /standard pro/i.test(lower) ? "Standard PRO" : /standard/i.test(lower) ? "Standard" : /потрійн/i.test(lower) ? "Потрійні фільтри" : "Системи зворотного осмосу");
      if (gpd) pushFact(facts, origins, "Продуктивність мембрани", `${gpd} GPD`);
      if (period) pushFact(facts, origins, "Комплект на", `${period} місяців`);
    } else if (categoryId === "mainline-cartridges") {
      pushFact(facts, origins, "Призначення", /сірковод/i.test(lower) ? "Видалення сірководню" : /заліз/i.test(lower) ? "Видалення заліза" : /пом.?якш/i.test(lower) ? "Пом’якшення води" : /вугіл|карбон|cto/i.test(lower) ? "Видалення хлору й запахів" : "Механічне очищення");
      if (size) pushFact(facts, origins, "Формат", size.replace(/[xх]/gi, "×"));
      if (microns) pushFact(facts, origins, "Тонкість фільтрації", `${microns} мкм`);
    } else if (categoryId === "mainline-filters-housings") {
      pushFact(facts, origins, "Призначення", /накип/i.test(lower) ? "Захист від накипу" : "Механічне очищення");
      pushFact(facts, origins, "Вода", /гаряч/i.test(lower) ? "Гаряча" : "Холодна");
      if (connection) pushFact(facts, origins, "Підключення", `${connection}″`);
    } else if (categoryId === "filter-media") {
      pushFact(facts, origins, "Тип", /сіль/i.test(lower) ? "Сіль для регенерації" : /вугіл/i.test(lower) ? "Активоване вугілля" : /смол/i.test(lower) ? "Іонообмінна смола" : /пісок/i.test(lower) ? "Кварцова підкладка" : "Фільтрувальне завантаження");
      if (massOrVolume) pushFact(facts, origins, "Фасування", `${massOrVolume[1].replace(",", ".")} ${massOrVolume[2]}`);
      pushFact(facts, origins, "Застосування", /сіль/i.test(lower) ? "Регенерація пом’якшувачів" : "Засипні системи очищення");
    } else {
      pushFact(facts, origins, "Призначення", categoryTitle);
      const users = lower.match(/(?:до|від)\s+(\d+(?:[-–]\d+)?)\s+(?:осіб|користувач)/i)?.[1];
      const bathrooms = lower.match(/(\d+(?:[-–]\d+)?)\s*санвуз/i)?.[1];
      if (users) pushFact(facts, origins, "Для сім’ї", `${users} ос.`);
      if (bathrooms) pushFact(facts, origins, "Кількість санвузлів", bathrooms);
      pushFact(facts, origins, "Встановлення", /компактн/i.test(lower) ? "Компактний корпус" : "Колонна система");
    }
    if (packageQuantity) pushFact(facts, origins, "У комплекті", `${packageQuantity} шт.`);
    pushFact(facts, origins, "Категорія", categoryTitle, "mapped", "central-taxonomy");
    return { facts: facts.slice(0, 8), origins };
  }

  function ecosoftFeatures(product, categoryId) {
    const text = `${product.title || ""} ${product.description || ""}`.toLocaleLowerCase("uk");
    const features = {};
    const origins = {};
    const set = (id, value, rule) => { if (value !== "" && value !== null && value !== undefined) { features[id] = value; origins[id] = Object.freeze({ provenance: "derived", rule }); } };
    if (/без помп/.test(text)) set("pump", "no", "negative-title-pattern");
    else if (/помп|насос підвищення тиску/.test(text)) set("pump", "yes", "title-description-pattern");
    if (/без мінераліз/.test(text)) set("mineralizer", "no", "negative-title-pattern");
    else if (/мінераліз/.test(text)) set("mineralizer", "yes", "title-description-pattern");
    if (/прямоточ|cross solo|cross 90|robust/.test(text)) set("flowType", "direct", "title-description-pattern");
    else if (/накопичувальн.*бак/.test(text)) set("flowType", "tank", "title-description-pattern");
    if (/квартир/.test(text)) set("scope", "apartment", "title-description-pattern");
    else if (/будин|котедж/.test(text)) set("scope", "house", "title-description-pattern");
    if (product.typeSlug === "horeca" || /кафе|ресторан|готел|horeca|coffee/.test(text)) set("scope", "business", "supplier-category-or-text-pattern");
    if (/свердлов|артезіан/.test(text)) set("waterSource", "borehole", "title-description-pattern");
    else if (/водопровід|водогін/.test(text)) set("waterSource", "mains", "title-description-pattern");
    if (["reverse-osmosis", "flow-filters"].includes(categoryId)) set("installation", "under-sink", "category-rule");
    const purposeByCategory = { "mechanical-treatment": "mechanical", "water-softening": "softening", "chlorine-odor-removal": "chlorine-odor", "complex-treatment": "complex" };
    if (purposeByCategory[categoryId]) set("purpose", purposeByCategory[categoryId], "category-rule");
    return { features, origins };
  }

  function readableEcosoftDescription(product, categoryId, categoryTitle) {
    const title = String(product.title || "").toLocaleLowerCase("uk");
    if (/robust/i.test(title)) return "Прямоточна система зворотного осмосу для професійного використання у кафе, ресторанах, готелях та інших закладах.";
    if (categoryId === "reverse-osmosis") return /cross/i.test(title) ? "Компактна прямоточна система зворотного осмосу для щоденного очищення питної води без накопичувального бака." : `Система зворотного осмосу для питної води${/помп/i.test(title) ? " зі стабільною роботою за низького вхідного тиску" : " з накопичувальним баком"}${/мінераліз|balance|aquacalcium/i.test(title) ? " та мінералізацією" : ""}.`;
    if (categoryId === "flow-filters") return "Триступеневий проточний фільтр для доочищення питної води під кухонною мийкою.";
    if (categoryId === "drinking-system-cartridges") return /комплект|запас/i.test(title) ? "Комплект змінних елементів для планового обслуговування сумісної питної системи Ecosoft." : "Змінний елемент для відновлення якості очищення у сумісній питній системі Ecosoft.";
    if (categoryId === "mainline-cartridges") return /вугіл|карбон|cto/i.test(title) ? "Магістральний картридж для зниження вмісту хлору, стороннього запаху та органічних домішок у воді." : /заліз/i.test(title) ? "Магістральний картридж для зниження вмісту заліза у воді." : /сірковод/i.test(title) ? "Магістральний картридж для зниження вмісту сірководню та неприємного запаху." : "Картридж для механічного очищення води від піску, мулу, іржі та інших нерозчинних домішок.";
    if (categoryId === "mainline-filters-housings") return /накип/i.test(title) ? "Компактне рішення для захисту побутової техніки та нагрівального обладнання від утворення накипу." : "Магістральний фільтр або корпус для попереднього механічного очищення води у квартирі чи будинку.";
    if (categoryId === "filter-media") return "Матеріал для завантаження або регенерації засипної системи очищення води. Тип і кількість підбирають за складом води та параметрами фільтра.";
    return `Система Ecosoft для категорії «${categoryTitle.toLocaleLowerCase("uk")}». Підбір моделі виконується за аналізом води, піковою витратою та умовами монтажу.`;
  }

  function sourceAttributeEntries(product) {
    return (Array.isArray(product.attributes) ? product.attributes : []).map(attribute => Array.isArray(attribute)
      ? { label: cleanSupplierText(attribute[0]).replace(/\*+(?=:|$)/g, ""), value: cleanSupplierText(attribute[1]), origin: "supplier" }
      : { label: cleanSupplierText(attribute?.label).replace(/\*+(?=:|$)/g, ""), value: cleanSupplierText(attribute?.value), origin: "supplier" }).filter(item => item.label && item.value);
  }

  function detailEntries(product) {
    const technical = (Array.isArray(product.technicalDetails) ? product.technicalDetails : []).map(entry => ({
      label: String(entry?.[0] || "").trim(),
      value: String(entry?.[1] || "").trim(),
      origin: product.technicalDetailOrigins?.[entry?.[0]]?.provenance || "supplier",
      rule: product.technicalDetailOrigins?.[entry?.[0]]?.rule || "supplier-attribute"
    }));
    const combined = [...sourceAttributeEntries(product), ...technical];
    const seen = new Set();
    return combined.filter(item => item.label && item.value && !seen.has(`${item.label}\u0000${item.value}`) && seen.add(`${item.label}\u0000${item.value}`));
  }

  function matchesAlias(label, definition) {
    return definition.aliases.some(alias => alias instanceof RegExp ? alias.test(label) : String(alias).toLocaleLowerCase("uk") === label.toLocaleLowerCase("uk"));
  }

  function parseNumber(value, label, definition) {
    if (typeof value === "number" && Number.isFinite(value)) return { value: Number(value.toFixed(4)), unitStatus: "normalized-feature" };
    const normalized = String(value || "").replace(/,/g, ".").replace(/\s+/g, " ");
    if (/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/.test(normalized)) return { value: null, unitStatus: "range-preserved" };
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return { value: null, unitStatus: "malformed" };
    let number = Number(match[0]);
    const unitText = `${label} ${normalized}`.toLocaleLowerCase("uk");
    const unitPatterns = {
      "кВт": /квт|(^|\s)вт\b/i,
      "м³/год": /м[³3]\s*\/\s*год|л\s*\/\s*(?:хв|мин|год)|^kvs?\b/i,
      "м": /(^|\s)м(?:\s|$)/i,
      "мм": /мм|mm|(^|\s)см(?:\s|$)/i,
      "бар": /бар|bar|мпа/i,
      "л": /(^|\s)л(?:\s|$)/i,
      "л/год": /л\s*\/\s*год|м[³3]\s*\/\s*год/i,
      "кг": /кг|kg/i,
      "мкм": /мкм|micron/i
    };
    if (definition.unit && unitPatterns[definition.unit] && !unitPatterns[definition.unit].test(unitText)) return { value: null, unitStatus: "unknown-unit" };
    if (definition.unit === "кВт" && /(^|\s)вт\b/i.test(unitText) && !/квт/i.test(unitText)) number /= 1000;
    else if (definition.unit === "м³/год" && /л\s*\/\s*хв|л\/мин/i.test(unitText)) number *= 0.06;
    else if (definition.unit === "м³/год" && /л\s*\/\s*год/i.test(unitText)) number /= 1000;
    else if (definition.unit === "бар" && /мпа/i.test(unitText)) number *= 10;
    else if (definition.unit === "мм" && /(^|\s)см\b/i.test(unitText)) number *= 10;
    else if (definition.unit === "л/год" && /м³\s*\/\s*год/i.test(unitText)) number *= 1000;
    return Number.isFinite(number) ? { value: Number(number.toFixed(4)), unitStatus: "normalized" } : { value: null, unitStatus: "malformed" };
  }

  function normalizeAttributes(product, supplier, category) {
    const entries = detailEntries(product);
    const normalized = {};
    const records = [];
    const usedEntries = new Set();
    const featureValues = product.features || {};
    const featureOrigins = product.featureOrigins || {};

    Object.entries(attributeSchema.definitions).forEach(([id, definition]) => {
      let value = featureValues[id];
      let provenance = featureOrigins[id]?.provenance || (value !== undefined ? (supplier === "ecosoft" ? "derived" : "source-confirmed") : "");
      let rule = featureOrigins[id]?.rule || (value !== undefined ? "normalized-feature" : "");
      let sourceLabel = "";
      let sourceValue = "";
      if (id === "productType") {
        value = product.type || category.title;
        provenance = "mapped";
        rule = "supplier-category-mapping";
      }
      if (value === undefined || value === null || value === "") {
        const index = entries.findIndex(entry => !usedEntries.has(entry) && matchesAlias(entry.label, definition));
        if (index >= 0) {
          const entry = entries[index];
          usedEntries.add(entry);
          value = entry.value;
          sourceLabel = entry.label;
          sourceValue = entry.value;
          provenance = entry.origin === "supplier" ? "source-confirmed" : entry.origin;
          rule = entry.rule || "attribute-alias";
        }
      }
      if (value === undefined || value === null || value === "") return;
      let unitStatus = "not-applicable";
      if (definition.type === "number") {
        const parsed = parseNumber(value, sourceLabel, definition);
        if (parsed.value === null) return;
        value = parsed.value;
        unitStatus = parsed.unitStatus;
      }
      entries.filter(entry => matchesAlias(entry.label, definition)).forEach(entry => usedEntries.add(entry));
      normalized[id] = value;
      records.push(Object.freeze({ id, label: definition.label, value, unit: definition.unit || "", provenance, rule, sourceLabel, sourceValue, unitStatus }));
    });

    const ignoredLabels = [/^категорія$/i, /^категорія виробника$/i, /^офіційна назва$/i, /^бренд$/i, /^стан$/i, /^наявність$/i, /^артикул/i];
    const unmapped = entries.filter(entry => !usedEntries.has(entry) && !ignoredLabels.some(pattern => pattern.test(entry.label))).map(entry => Object.freeze({ label: entry.label, value: entry.value, provenance: entry.origin === "supplier" ? "source-confirmed" : entry.origin }));
    return { normalized: Object.freeze(normalized), records: Object.freeze(records), unmapped: Object.freeze(unmapped) };
  }

  function enrichEcosoft(product, mapping) {
    const category = taxonomy.byId[mapping.categoryId];
    const featureData = ecosoftFeatures(product, mapping.categoryId);
    const detailData = ecosoftDetails(product, mapping.categoryId, category.title);
    const description = String(product.description || "").trim() || readableEcosoftDescription(product, mapping.categoryId, category.title);
    const slug = product.slug || product.link?.split("/").filter(Boolean).pop() || product.id;
    return {
      ...product,
      slug: slugify(slug),
      shortTitle: String(product.title || "").replace(/\s+Ecosoft\s+/i, " ").replace(/\s{2,}/g, " ").trim(),
      shortDescription: description,
      fullDescription: description,
      supplierCategory: product.type,
      sourceUrl: "",
      officialSourceUrl: "",
      officialCatalogEdition: "Актуальні дані виробника",
      features: Object.freeze(featureData.features),
      featureOrigins: Object.freeze(featureData.origins),
      technicalDetails: Object.freeze(detailData.facts.map(item => Object.freeze(item))),
      technicalDetailOrigins: Object.freeze(detailData.origins),
      cardFacts: Object.freeze(detailData.facts.slice(0, 3).map(item => Object.freeze(item))),
      variants: Object.freeze([]),
      compatibleProducts: Object.freeze([]),
      compatibleConsumables: Object.freeze([]),
      documents: Object.freeze(Array.isArray(product.documents) ? [...product.documents] : []),
      instructions: Object.freeze(Array.isArray(product.instructions) ? [...product.instructions] : [])
    };
  }

  function normalizeProduct(rawProduct) {
    const supplier = sourceMappings.supplierFor(rawProduct);
    const mapping = sourceMappings.resolve(rawProduct, supplier);
    const category = taxonomy.byId[mapping.categoryId];
    if (!supplier || !category) return Object.freeze({ ...rawProduct, normalizationError: !supplier ? "unknown-supplier" : "unmapped-category" });
    const enrichedProduct = supplier === "ecosoft" ? enrichEcosoft(rawProduct, mapping) : rawProduct;
    const product = applyEditorialCorrections(enrichedProduct, category);
    const supplierConfig = sourceMappings.suppliers[supplier];
    const brandId = supplierConfig.brandId;
    const attributeResult = normalizeAttributes(product, supplier, category);
    const sourceAttributes = Object.freeze(sourceAttributeEntries(rawProduct).map(item => Object.freeze({ label: item.label, value: item.value })));
    const imageOrigin = supplierConfig.imageOrigin || "";
    const resolveImage = value => typeof value === "string" && imageOrigin && value.startsWith("/images/") ? `${imageOrigin}${value}` : value;
    const images = Object.freeze((Array.isArray(product.images) && product.images.length ? [...product.images] : [product.image].filter(Boolean)).map(resolveImage));
    const tags = Object.freeze([...new Set([...(Array.isArray(product.tags) ? product.tags : []), ...mapping.tags])]);
    const collections = Object.freeze([...new Set([...(Array.isArray(product.collections) ? product.collections : []), ...mapping.collectionIds])]);
    const amount = Number(product.price);
    const inventoryStatus = product.availability || "unknown";
    return Object.freeze({
      ...product,
      id: product.id,
      sku: product.sku,
      slug: slugify(product.slug || product.link?.split("/").filter(Boolean).pop() || product.id),
      model: product.model || product.title,
      seriesId: mapping.seriesId || product.seriesId || null,
      brandId,
      primaryCategoryId: category.id,
      secondaryCategoryIds: Object.freeze(Array.isArray(product.secondaryCategoryIds) ? [...product.secondaryCategoryIds] : []),
      sectionId: category.sectionId,
      sourceCategoryId: mapping.sourceCategory,
      sourceCategoryName: product.primaryCategoryName || product.type || mapping.sourceCategory,
      primaryCategory: category.id,
      primaryCategoryName: category.title,
      categoryGroup: category.parentId,
      categoryGroupName: taxonomy.byId[category.parentId]?.title || "",
      normalizedType: category.id,
      price: amount,
      pricing: Object.freeze({ amount, currency: product.currency || "UAH" }),
      inventory: Object.freeze({ status: inventoryStatus }),
      stockStatus: inventoryStatus,
      images,
      sourceAttributes,
      attributes: sourceAttributes,
      catalogAttributes: attributeResult.records,
      normalizedAttributes: attributeResult.normalized,
      unmappedAttributes: attributeResult.unmapped,
      tags,
      collections,
      source: Object.freeze({ supplier, sourceId: String(product.id), sourceCategory: mapping.sourceCategory, mappingStatus: mapping.mappingStatus }),
      compareType: category.id,
      badges: Object.freeze(Array.isArray(product.badges) ? [...product.badges] : []),
      image: images[0] || ""
    });
  }

  function normalizeAll(rawProducts) {
    const seenIds = new Set();
    const seenSlugs = new Set();
    const duplicateInputIds = [];
    const adjustedSlugs = [];
    const products = [];
    rawProducts.forEach(rawProduct => {
      if (!rawProduct?.id || seenIds.has(rawProduct.id)) {
        if (rawProduct?.id) duplicateInputIds.push(rawProduct.id);
        return;
      }
      seenIds.add(rawProduct.id);
      let product = normalizeProduct(rawProduct);
      if (!product.normalizationError && seenSlugs.has(product.slug)) {
        const originalSlug = product.slug;
        const uniqueSlug = `${originalSlug}-${slugify(product.id)}`;
        product = Object.freeze({ ...product, slug: uniqueSlug });
        adjustedSlugs.push(Object.freeze({ id: product.id, originalSlug, slug: uniqueSlug }));
      }
      if (product.slug) seenSlugs.add(product.slug);
      products.push(product);
    });
    return Object.freeze({ products: Object.freeze(products), duplicateInputIds: Object.freeze(duplicateInputIds), adjustedSlugs: Object.freeze(adjustedSlugs) });
  }

  const rawWaterProducts = Array.isArray(window.sofievkaRawWaterProducts)
    ? window.sofievkaRawWaterProducts
    : (Array.isArray(window.sofievkaProducts) ? window.sofievkaProducts : []);
  const rawHeatingProducts = Array.isArray(window.sofievkaTermojetProducts) ? window.sofievkaTermojetProducts : [];
  const rawWiloProducts = Array.isArray(window.sofievkaWiloProducts) ? window.sofievkaWiloProducts : [];
  const rawGrundfosProducts = Array.isArray(window.sofievkaGrundfosProducts) ? window.sofievkaGrundfosProducts : [];
  const rawTekkhausProducts = Array.isArray(window.sofievkaTekkhausProducts) ? window.sofievkaTekkhausProducts : [];
  const rawTechProducts = Array.isArray(window.sofievkaTechProducts) ? window.sofievkaTechProducts : [];
  const rawHeatingBrandsProducts = Array.isArray(window.sofievkaHeatingBrandsProducts) ? window.sofievkaHeatingBrandsProducts : [];
  const rawBaxiBuderusProducts = Array.isArray(window.sofievkaBaxiBuderusProducts) ? window.sofievkaBaxiBuderusProducts : [];
  const result = normalizeAll([...rawWaterProducts, ...rawHeatingProducts, ...rawWiloProducts, ...rawGrundfosProducts, ...rawTekkhausProducts, ...rawTechProducts, ...rawHeatingBrandsProducts, ...rawBaxiBuderusProducts]);

  window.sofievkaProductNormalizer = Object.freeze({ slugify, normalizeProduct, normalizeAll });
  window.sofievkaNormalizedProducts = result.products;
  window.sofievkaNormalizationReport = Object.freeze({
    sourceCount: rawWaterProducts.length + rawHeatingProducts.length + rawWiloProducts.length + rawGrundfosProducts.length + rawTekkhausProducts.length + rawTechProducts.length + rawHeatingBrandsProducts.length + rawBaxiBuderusProducts.length,
    normalizedCount: result.products.length,
    waterSourceCount: rawWaterProducts.length,
    heatingSourceCount: rawHeatingProducts.length,
    wiloSourceCount: rawWiloProducts.length,
    grundfosSourceCount: rawGrundfosProducts.length,
    tekkhausSourceCount: rawTekkhausProducts.length,
    techSourceCount: rawTechProducts.length,
    heatingBrandsSourceCount: rawHeatingBrandsProducts.length,
    baxiBuderusSourceCount: rawBaxiBuderusProducts.length,
    duplicateInputIds: result.duplicateInputIds,
    adjustedSlugs: result.adjustedSlugs,
    normalizationErrors: Object.freeze(result.products.filter(product => product.normalizationError).map(product => Object.freeze({ id: product.id, error: product.normalizationError })))
  });
})();
