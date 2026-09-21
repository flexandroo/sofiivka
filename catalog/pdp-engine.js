(function () {
  "use strict";

  const catalog = window.sofievkaCatalog;
  if (!catalog) throw new Error("Catalog facade must load before the PDP engine.");

  const schema = catalog.attributeSchema || {};
  const definitions = catalog.attributeDefinitions || {};
  const products = catalog.products || [];
  const brands = catalog.brands || [];
  const groupDefinitions = Object.freeze([
    Object.freeze({ id: "main", title: "Основні параметри", keys: Object.freeze(["productType", "purpose", "type", "technology", "waterSource", "installation", "flowType", "scope", "pump", "mineralizer"]) }),
    Object.freeze({ id: "performance", title: "Робочі параметри", keys: Object.freeze(["capacityLh", "flowM3h", "headM", "kvs", "powerKw", "heatOutputKw", "pressureBar", "temperature", "filtrationMicron", "eei", "maxImmersionDepthM", "freePassageMm"]) }),
    Object.freeze({ id: "connection", title: "Підключення та сумісність", keys: Object.freeze(["diameter", "diameterMm", "connection", "mountingLengthMm", "outlets", "compatibility", "control", "voltage", "protectionClass", "material", "selfPriming", "cableLengthM", "floatSwitch"]) }),
    Object.freeze({ id: "dimensions", title: "Габарити та формат", keys: Object.freeze(["widthMm", "heightMm", "depthMm", "dimensions", "volumeL", "weightKg", "format"]) })
  ]);

  const hasValue = value => value !== undefined && value !== null && value !== "";
  const genericSourceLabels = new Set(["категорія", "бренд", "стан", "наявність"]);
  const cleanSourceLabel = label => String(label || "").replace(/\s+/g, " ").trim();
  const splitSourceLabel = label => {
    const normalized = cleanSourceLabel(label);
    const grouped = normalized.match(/^(Вимоги до води[^:]*|Допустимі показники[^:]*|Основні властивості|Рекомендовані умови експлуатації|Технічні параметри|Технічні характеристики(?: матеріалу)?|Умови експлуатації|Характеристики (?:градієнтного картриджа|картриджа|кварцового піску|колби фільтра|матеріалу)[^:]*|Яку воду може очистити фільтр\?|Якість води[^:]*?)\*{0,3}:\s*(.+)$/i);
    return grouped ? { group: grouped[1].trim(), label: grouped[2].trim() } : { group: "Основні характеристики", label: normalized };
  };
  const canonicalSourceLabel = label => splitSourceLabel(label).label.toLocaleLowerCase("uk-UA").replace(/[.*]+$/g, "").replace(/\s+/g, " ").trim();

  function sourceSpecificationEntries(product) {
    const candidates = (Array.isArray(product.sourceAttributes) ? product.sourceAttributes : [])
      .filter(item => item?.label && hasValue(item.value) && !genericSourceLabels.has(cleanSourceLabel(item.label).toLocaleLowerCase("uk-UA")))
      .map((item, index) => {
        const parsed = splitSourceLabel(item.label);
        return { id: `source-${index}`, group: parsed.group, label: parsed.label, value: String(item.value).trim(), prefixed: parsed.group !== "Основні характеристики", canonicalLabel: canonicalSourceLabel(item.label) };
      });
    const groupedDuplicates = new Set(candidates.filter(item => item.prefixed).map(item => `${item.canonicalLabel}\u0000${item.value}`));
    const chosen = new Map();
    candidates.forEach(candidate => {
        if (!candidate.prefixed && groupedDuplicates.has(`${candidate.canonicalLabel}\u0000${candidate.value}`)) return;
        const key = `${candidate.group.toLocaleLowerCase("uk-UA")}\u0000${candidate.canonicalLabel}`;
        const current = chosen.get(key);
        if (!current || candidate.value.length > current.value.length) chosen.set(key, candidate);
      });
    return [...chosen.values()];
  }

  const keyPriorities = Object.freeze({
    "reverse-osmosis": [/номінальна продуктивність|продуктивність/, /накопичувальний бак/, /тиск на вході/, /кількість ступенів/, /монтаж/, /конверсія/, /температура води на вході|температура вхідної води/],
    "flow-filters": [/кількість ступенів/, /продуктивність/, /тиск/, /температура/, /підключення/],
    "mechanical-treatment": [/продуктивність робоча/, /робочий тиск/, /діаметр підключення|підключення установки/, /рейтинг фільтрації|тонкість фільтрації/, /ресурс/],
    "water-softening": [/продуктивність робоча/, /робочий тиск/, /об'єм фільтрувального матеріалу/, /витрата солі/, /діаметр підключення|підключення установки/],
    "complex-treatment": [/продуктивність робоча/, /робочий тиск/, /об'єм фільтрувального матеріалу/, /ресурс/, /діаметр підключення|підключення установки/],
    "chlorine-odor-removal": [/продуктивність робоча/, /робочий тиск/, /об'єм фільтрувального матеріалу/, /ресурс/, /діаметр підключення|підключення установки/],
    "mainline-filters-housings": [/рейтинг фільтрації|тонкість фільтрації/, /типорозмір/, /діаметр підключення|підключення/, /робочий тиск/, /температура води/],
    "drinking-system-cartridges": [/рекомендований інтервал заміни/, /тонкість фільтрації/, /кількість ступенів|кількість елементів/, /тип води/, /сумісність/],
    "mainline-cartridges": [/рейтинг фільтрації|тонкість фільтрації/, /тип картриджа/, /матеріал/, /типорозмір/, /ресурс/, /температура води/],
    "filter-media": [/маса|вага/, /об'єм/, /упаковка/, /робоча температура/, /робочий діапазон ph/, /застосування/]
  });
  const attributeEntry = (product, id) => {
    const value = product.normalizedAttributes?.[id];
    const definition = definitions[id];
    if (!definition || !hasValue(value)) return null;
    return Object.freeze({ id, label: definition.label, value: catalog.valueLabel(definition, value) });
  };

  function keySpecs(product, limit = 5) {
    if (product.source?.supplier === "ecosoft") {
      const entries = sourceSpecificationEntries(product);
      const priorities = keyPriorities[product.primaryCategoryId] || [];
      const selected = [];
      priorities.forEach(pattern => {
        const match = entries.find(item => pattern.test(item.label.toLocaleLowerCase("uk-UA")) && !selected.includes(item));
        if (match) selected.push(match);
      });
      entries.forEach(item => { if (selected.length < limit && !selected.includes(item)) selected.push(item); });
      return Object.freeze(selected.slice(0, limit).map((item, index) => Object.freeze({ id: `source-key-${index}`, label: item.label, value: item.value })));
    }
    const priority = schema.pdpPriorityByCategory?.[product.primaryCategoryId] || [];
    const fallback = schema.pdpFallbackPriority || Object.keys(definitions);
    return Object.freeze([...new Set([...priority, ...fallback])].flatMap(id => attributeEntry(product, id) || []).slice(0, limit));
  }

  function specificationGroups(product) {
    if (product.source?.supplier === "ecosoft") {
      const grouped = new Map();
      sourceSpecificationEntries(product).forEach(item => {
        if (!grouped.has(item.group)) grouped.set(item.group, []);
        grouped.get(item.group).push(Object.freeze({ id: item.id, label: item.label, value: item.value }));
      });
      return Object.freeze([...grouped.entries()].map(([title, items], index) => Object.freeze({ id: `source-group-${index}`, title, items: Object.freeze(items) })));
    }
    const normalizedIds = Object.keys(product.normalizedAttributes || {}).filter(id => definitions[id] && hasValue(product.normalizedAttributes[id]));
    const unmappedItems = (Array.isArray(product.unmappedAttributes) ? product.unmappedAttributes : [])
      .filter(item => item?.label && hasValue(item.value))
      .map(item => Object.freeze({ id: `source-${item.label}`, label: item.label, value: String(item.value) }));
    if (normalizedIds.length <= 5) {
      const items = normalizedIds.map(id => attributeEntry(product, id)).filter(Boolean);
      const groups = items.length ? [Object.freeze({ id: "technical", title: "Технічні дані", items: Object.freeze(items) })] : [];
      if (unmappedItems.length) groups.push(Object.freeze({ id: "complete", title: "Повні характеристики", items: Object.freeze(unmappedItems) }));
      return Object.freeze(groups);
    }
    const assigned = new Set();
    const groups = groupDefinitions.flatMap(group => {
      const ids = group.keys.filter(id => normalizedIds.includes(id));
      const items = ids.map(id => attributeEntry(product, id)).filter(Boolean);
      if (items.length < 2) return [];
      ids.forEach(id => assigned.add(id));
      return [Object.freeze({ id: group.id, title: group.title, items: Object.freeze(items) })];
    });
    const remaining = normalizedIds.filter(id => !assigned.has(id)).map(id => attributeEntry(product, id)).filter(Boolean);
    if (remaining.length) groups.push(Object.freeze({ id: "other", title: "Інші характеристики", items: Object.freeze(remaining) }));
    if (unmappedItems.length) groups.push(Object.freeze({ id: "complete", title: "Повні характеристики", items: Object.freeze(unmappedItems) }));
    return Object.freeze(groups);
  }

  function images(product) {
    const candidates = [product.image, ...(Array.isArray(product.images) ? product.images : []), ...(Array.isArray(product.gallery) ? product.gallery : [])]
      .map(item => typeof item === "string" ? item : item?.src)
      .filter(Boolean);
    return Object.freeze([...new Set(candidates)]);
  }

  function documents(product) {
    return Object.freeze((Array.isArray(product.documents) ? product.documents : []).filter(item => item?.url && /^https?:\/\/|^\//.test(item.url)).map(item => Object.freeze({
      type: item.type || "document",
      title: item.title || "Документ виробника",
      url: item.url
    })));
  }

  function model(product) {
    const sourceModel = (product.unmappedAttributes || []).find(item => /^модель$/i.test(item.label) && hasValue(item.value))?.value;
    if (sourceModel) return String(sourceModel);
    if (product.model && product.model !== product.title) return String(product.model);
    return String(product.sku || product.id);
  }

  function purchase(product) {
    const status = product.inventory?.status || product.stockStatus || product.availability || "unknown";
    const amount = Number(product.pricing?.amount ?? product.price);
    const oldAmount = Number(product.pricing?.oldAmount ?? product.oldPrice ?? 0);
    return Object.freeze({
      status,
      statusLabel: product.availabilityLabel || (status === "in_stock" ? "В наявності" : status === "out_of_stock" ? "Немає в наявності" : "Наявність уточнюйте"),
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      oldAmount: Number.isFinite(oldAmount) && oldAmount > amount ? oldAmount : null,
      purchasable: status === "in_stock" && Number.isFinite(amount) && amount > 0
    });
  }

  function relatedProducts(product, limit = 4) {
    const sourceAttributes = product.normalizedAttributes || {};
    return Object.freeze(products.filter(item => item.id !== product.id && item.primaryCategoryId === product.primaryCategoryId).map(item => {
      const shared = Object.keys(sourceAttributes).filter(id => hasValue(sourceAttributes[id]) && sourceAttributes[id] === item.normalizedAttributes?.[id]).length;
      const score = (item.seriesId && item.seriesId === product.seriesId ? 40 : 0) + (item.brandId === product.brandId ? 12 : 0) + shared * 5;
      const priceDistance = Math.abs(Number(item.price || 0) - Number(product.price || 0));
      return { item, score, priceDistance };
    }).sort((a, b) => b.score - a.score || a.priceDistance - b.priceDistance || a.item.id.localeCompare(b.item.id)).slice(0, limit).map(entry => entry.item));
  }

  function brand(product) {
    return brands.find(item => item.id === product.brandId) || null;
  }

  function installationRelevant(product) {
    return !new Set(["drinking-system-cartridges", "mainline-cartridges", "filter-media"]).has(product.primaryCategoryId);
  }

  window.sofievkaPdp = Object.freeze({ keySpecs, specificationGroups, images, documents, model, purchase, relatedProducts, brand, installationRelevant });
})();
