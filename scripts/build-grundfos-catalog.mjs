import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_FILE = path.join(ROOT, "tmp", "grundfos-source", "products-all.json");
const DOCUMENTS_FILE = path.join(ROOT, "tmp", "grundfos-source", "documents.json");
const SKU_DOCUMENTS_FILE = path.join(ROOT, "tmp", "grundfos-source", "documents-extra-by-sku.json");
const OUT_FILE = path.join(ROOT, "grundfos-products-data.js");
const MEDIA_DIR = path.join(ROOT, "assets", "products", "grundfos");
const VERIFIED_ON = "2026-09-21";
const PRICE_LIST_PAGE = "https://www.grundfos.com/ua/contact/where-to-buy/PriceList";
const PRICE_LIST_PDF = "https://portals.grundfos.com/content/dam/local/uk-ua/catalogues/_jcr_content1/%D0%9F%D1%80%D0%B0%D0%B9%D1%81%20%D0%BB%D0%B8%D1%81%D1%82%202025%20%D0%BD%D0%B0%20%D0%BF%D0%BE%D0%B1%D1%83%D1%82%D0%BE%D0%B2%D0%B5%20%D0%BE%D0%B1%D0%BB%D0%B0%D0%B4%D0%BD%D0%B0%D0%BD%D0%BD%D1%8F.pdf";

function clean(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return clean(value)
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "");
}

function seriesSlug(value) {
  return slugify(String(value).replace(/\+/g, " plus "));
}

function groupKey(record) {
  const name = clean(record.product?.name).toUpperCase();
  if (record.page >= 14 && record.page <= 18) {
    if (name.startsWith("GT-U+")) return "GT-U+";
    return name.match(/^GT-(?:HR|[DHU])/)?.[0] || "GT";
  }
  if (record.page === 13) return name.startsWith("PM TWIN") ? "PM TWIN" : name.replace(/\s+/g, " ");
  if (record.page === 8 && !name.startsWith("CMBE TWIN")) return "CMBE ACCESSORIES";
  if (record.page === 9 && !name.startsWith("SCALA1")) return "SCALA ACCESSORIES";
  if (record.page === 26) return "UNILIFT ACCESSORIES";
  if (record.page === 28 && !name.startsWith("CONLIFT1")) return "CONLIFT ACCESSORIES";
  if (record.page === 33 && String(record.productNumber) === "98377171") return "MULTILIFT SERVICE";
  if (record.page === 33 && !/^M(?:SS)?\./.test(name)) return "MULTILIFT ACCESSORIES";
  if (record.page === 37) return "CIRCULATION ACCESSORIES";
  if (record.page === 42) return /^(?:MI 301|MI401)/.test(name) ? "GRUNDFOS GO" : "ALPHA ACCESSORIES";
  if (record.page === 33) return "MULTILIFT";
  if (name.startsWith("CMBE TWIN")) return "CMBE TWIN";
  if (name.startsWith("MULTIBOX")) return "MULTIBOX";
  if (name.includes("UNILIFT CC")) return "UNILIFT CC";
  if (name.startsWith("UNILIFT KP")) return "UNILIFT KP";
  if (name.startsWith("UNILIFT AP12")) return "UNILIFT AP12";
  if (/^UNILIFT AP(?:35B|50B)/.test(name)) return "UNILIFT AP B";
  if (name.startsWith("UNILIFT APG")) return "UNILIFT APG";
  if (/^UNILIFT AP(?:35|50)/.test(name)) return "UNILIFT AP";
  if (name.startsWith("ALPHA2") && /\bN\b/.test(name)) return "ALPHA2 N";
  if (name.startsWith("ALPHA1") && /\bN\b/.test(name)) return "ALPHA1 N";
  if (name.startsWith("ALPHA1 L")) return "ALPHA1 L";
  if (name.startsWith("ALPHA SOLAR")) return "ALPHA SOLAR";
  return name.split(/\s+/)[0];
}

function seriesName(record) {
  const name = clean(record.product?.name);
  const upper = name.toUpperCase();
  const group = groupKey(record);
  if (["GT-D", "GT-H", "GT-HR", "GT-U", "GT-U+"].includes(group)) return group;
  if (["PM 1", "PM 2", "PM TWIN"].includes(group)) return group;
  if (group.endsWith("ACCESSORIES") || group === "GRUNDFOS GO" || group === "MULTILIFT SERVICE") return group;
  if (record.page === 33) return "MULTILIFT MSS / M";
  if (upper.startsWith("CMBE TWIN")) return "CMBE TWIN";
  if (/^JP .*\bPT-H\b/i.test(name)) return "JP PT-H";
  if (/^JP .*\bPM1\b/i.test(name)) return "JP PM";
  if (/^UNILIFT AP12/i.test(name)) return "UNILIFT AP12";
  if (/^UNILIFT AP(?:35B|50B)/i.test(name)) return "UNILIFT AP35B / AP50B";
  if (/^UNILIFT AP(?:35|50)/i.test(name)) return "UNILIFT AP35 / AP50";
  if (/^UNILIFT APG/i.test(name)) return "UNILIFT APG";
  if (/^UNILIFT KP/i.test(name)) return "UNILIFT KP";
  if (/UNILIFT CC/i.test(name)) return name.startsWith("MULTIBOX") ? "MULTIBOX UNILIFT CC" : "UNILIFT CC";
  if (/^ALPHA2 .*\bN\b/i.test(name)) return "ALPHA2 N";
  if (/^ALPHA1 .*\bN\b/i.test(name)) return "ALPHA1 N";
  if (/^ALPHA1 L/i.test(name)) return "ALPHA1 L";
  if (/^ALPHA SOLAR/i.test(name)) return "ALPHA SOLAR";
  if (/^ALPHA3/i.test(name)) return "ALPHA3";
  if (/^ALPHA2/i.test(name)) return "ALPHA2";
  if (/^COMFORT/i.test(name)) return "COMFORT";
  if (/^SOLOLIFT2/i.test(name)) return "SOLOLIFT2";
  if (/^CMBE/i.test(name)) return "CMBE";
  if (/^SCALA2/i.test(name)) return "SCALA2";
  if (/^SCALA1/i.test(name)) return "SCALA1";
  if (/^JP/i.test(name)) return "JP";
  if (/^UPA/i.test(name)) return "UPA";
  if (/^CONLIFT1/i.test(name)) return "CONLIFT1";
  return name.split(/\s+/)[0];
}

function classify(record) {
  const group = groupKey(record);
  const series = seriesName(record);
  const sku = String(record.productNumber);
  const name = clean(record.product?.name);
  if (record.page >= 14 && record.page <= 18) return { category: "water-supply", sourceCategoryId: "grundfos-pressure-tanks", type: "Мембранний бак", series, kind: "tank" };
  if (record.page === 13) return { category: "water-supply", sourceCategoryId: "grundfos-pump-automation", type: "Контролер тиску", series, kind: "controller" };
  if (sku === "98377171") return { category: "water-supply", sourceCategoryId: "grundfos-pump-services", type: "Пусконалагодження каналізаційної установки", series, kind: "service" };
  if ([8, 9, 26, 28, 33].includes(record.page) && !["CMBE TWIN", "SCALA1", "CONLIFT1", "MULTILIFT"].includes(group)) {
    let type = "Комплектуючі для насоса";
    if (/Vibration damper/i.test(name)) type = "Віброгасник";
    else if (/manifold set/i.test(name)) type = "Комплект колекторів";
    else if (/Twin installation set/i.test(name)) type = "Комплект здвоєного монтажу";
    else if (/Non-return valve/i.test(name)) type = "Зворотний клапан";
    else if (/Alarm PCB/i.test(name)) type = "Сигнальна плата";
    else if (/Bolts, nuts and gasket/i.test(name)) type = "Монтажний комплект";
    return { category: "water-supply", sourceCategoryId: "grundfos-pump-accessories", type, series, kind: "accessory" };
  }
  if (record.page === 37 || record.page === 42) {
    const automation = ["95906254", "98465228", "96406992", "98046408", "98916967"].includes(sku);
    let type = automation ? "Автоматика для насосів" : "Комплектуючі для циркуляційних насосів";
    if (/Relay module/i.test(name)) type = "Релейний модуль";
    else if (/Connecting piece with ball valve/i.test(name)) type = "Комплект підключення з кульовим краном";
    else if (/Union set/i.test(name)) type = "Комплект накидних гайок";
    else if (/time switch|^TS 3/i.test(name)) type = "Таймер";
    else if (/Venting flange/i.test(name)) type = "Деаераційний фланець";
    else if (/Flanges/i.test(name)) type = "Комплект фланців";
    else if (/Insulation/i.test(name)) type = "Теплоізоляційний кожух";
    else if (/MI 301/i.test(name)) type = "Модуль дистанційного керування";
    else if (/ALPHA Reader/i.test(name)) type = "Діагностичний модуль";
    return { category: "heating", sourceCategoryId: automation ? "grundfos-heating-automation" : "grundfos-heating-components", type, series, kind: automation ? "controller" : "accessory" };
  }
  if (["ALPHA2 N", "ALPHA1 N", "COMFORT"].includes(group)) return { category: "heating", sourceCategoryId: "grundfos-dhw-circulation", type: "Циркуляційний насос для ГВП", series };
  if (["ALPHA3", "ALPHA2", "ALPHA1 L", "ALPHA SOLAR"].includes(group)) return { category: "heating", sourceCategoryId: "grundfos-circulation", type: "Циркуляційний насос", series };
  if (["SCALA2", "SCALA1", "CMBE", "CMBE TWIN", "UPA"].includes(group) || series === "JP PM" || series === "JP PT-H") return { category: "water-supply", sourceCategoryId: "grundfos-pressure", type: "Установка підвищення тиску", series };
  if (group === "JP") return { category: "water-supply", sourceCategoryId: "grundfos-surface", type: "Самовсмоктувальний поверхневий насос", series };
  if (["SOLOLIFT2", "MULTILIFT", "CONLIFT1"].includes(group)) return { category: "water-supply", sourceCategoryId: "grundfos-lifting", type: "Установка відведення стічних вод", series };
  if (group === "UNILIFT APG") return { category: "water-supply", sourceCategoryId: "grundfos-sewage", type: "Каналізаційний насос", series };
  return { category: "water-supply", sourceCategoryId: "grundfos-drainage", type: "Дренажний насос", series };
}

function valueWithUnit(property) {
  const value = clean(property?.value);
  const unit = clean(property?.unitText);
  if (!unit || value.toLocaleLowerCase("uk").endsWith(unit.toLocaleLowerCase("uk"))) return value;
  return `${value} ${unit}`;
}

function technicalDetails(record) {
  const ignored = /^(?:Product No|Product picture|Набір кривих|Габаритне креслення|Danish|Finnish|Swedish|Norwegian)$/i;
  const labelTranslations = {
    "Type connector": "Тип штекера",
    "Port-to-port l.": "Монтажна довжина",
    "Max. operating": "Максимальний робочий тиск",
    "Min. ambient": "Мінімальна температура довкілля",
    "Impeller": "Матеріал робочого колеса",
    "Pow cable lengt": "Довжина кабелю живлення",
    "Thermal protec": "Тепловий захист",
    "Installation": "Монтаж",
    "Inst depth max": "Максимальна глибина монтажу",
    "Wiring diagram": "Схема електричного підключення",
    "Fits to": "Сумісність",
    "Dry run protect": "Захист від сухого ходу",
    "Orientation": "Орієнтація монтажу",
    "Tank": "Матеріал бака",
    "Pressure gauge": "Манометр",
    "Gas fill valve": "Газовий клапан",
    "Power cable": "Кабель живлення",
    "Baseplates": "Опорні плити",
    "Valve": "Клапани"
  };
  const seen = new Set();
  return (record.product?.additionalProperty || []).flatMap(property => {
    const label = clean(property.name);
    const value = valueWithUnit(property);
    const key = `${label}\u0000${value}`;
    if (!label || !value || ignored.test(label) || seen.has(key)) return [];
    seen.add(key);
    const displayLabel = label === "Product No" ? "Артикул" : label === "Модель" ? "Виконання" : (labelTranslations[label] || label);
    return [[displayLabel, value]];
  });
}

function findSpec(details, patterns) {
  for (const pattern of patterns) {
    const row = details.find(([label]) => pattern.test(label));
    if (row) return row;
  }
  return null;
}

function numberFrom(value) {
  const match = clean(value).replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function normalizedFeatures(details, classification) {
  const result = { productType: classification.type };
  const setNumber = (key, patterns) => {
    const row = findSpec(details, patterns);
    let value = numberFrom(row?.[1]);
    const unitText = clean(row?.[1]).toLocaleLowerCase("uk");
    if (key === "headM" && /дм/.test(unitText)) value /= 10;
    else if (key === "headM" && /см/.test(unitText)) value /= 100;
    else if (key === "flowM3h" && /л\s*\/\s*(?:с|сек)/.test(unitText)) value *= 3.6;
    else if (key === "flowM3h" && /л\s*\/\s*(?:хв|мин)/.test(unitText)) value *= 0.06;
    else if (key === "flowM3h" && /л\s*\/\s*год/.test(unitText)) value /= 1000;
    else if (key === "mountingLengthMm" && /см/.test(unitText)) value *= 10;
    if (Number.isFinite(value)) result[key] = Number(value.toFixed(4));
  };
  setNumber("headM", [/^Максимальний напір$/i, /^Max.*head/i]);
  setNumber("flowM3h", [/^Максимальна витрата$/i, /^Max.*flow/i]);
  setNumber("mountingLengthMm", [/^Port-to-port l\.?$/i, /монтажна довжина/i]);
  setNumber("pressureBar", [/^Робочий тиск$/i, /^Max\. operating/i, /максимальний робочий тиск/i]);
  setNumber("weightKg", [/^Вага нетто$/i]);
  setNumber("freePassageMm", [/максимальний розмір частинок/i, /вільний прохід/i]);
  setNumber("cableLengthM", [/довжина кабелю/i, /^Pow cable lengt/i]);
  setNumber("volumeL", [/^Об[’'`]єм бака$/i, /^Об[’'`]єм$/i]);
  const power = findSpec(details, [/споживана потужність P1/i, /^P1 мінімальний$/i]);
  const powerValue = numberFrom(power?.[1]);
  if (Number.isFinite(powerValue)) result.powerKw = /кВт|kw/i.test(power[1]) ? powerValue : Number((powerValue / 1000).toFixed(4));
  const textFields = {
    connection: [/розмір підключення/i, /^вихід насоса$/i, /^DN2$/i],
    voltage: [/номінальна напруга/i],
    protectionClass: [/IP-клас/i],
    eei: [/енергоефективності.*EEI/i],
    control: [/автоматичний нічний/i, /режим регулювання/i],
    compatibility: [/^Сумісність$/i, /^Підходить до$/i],
    material: [/^Матеріал бака$/i, /^Матеріал$/i, /^Мембрана$/i],
    installation: [/^Орієнтація монтажу$/i, /^Монтаж$/i]
  };
  for (const [key, patterns] of Object.entries(textFields)) {
    const row = findSpec(details, patterns);
    if (row) result[key] = row[1];
  }
  const minTemp = findSpec(details, [/мінімальна температура рідини/i]);
  const maxTemp = findSpec(details, [/максимальна температура рідини/i]);
  if (minTemp || maxTemp) result.temperature = [minTemp?.[1], maxTemp?.[1]].filter(Boolean).join("…");
  return result;
}

function keyFeatures(details, classification) {
  const patterns = classification.kind === "tank"
    ? [/об[’'`]?єм бака/i, /максимальний робочий тиск/i, /розмір підключення/i, /початковий тиск/i, /тип мембрани/i, /^Мембрана$/i, /орієнтація монтажу/i, /максимальна температура рідини/i]
    : classification.kind === "controller"
      ? [/номінальна напруга/i, /максимальний робочий тиск/i, /захист від сухого ходу/i, /IP-клас/i, /розмір підключення/i, /сумісність/i, /максимальна температура/i, /P1 макс/i]
    : classification.kind === "accessory"
      ? [/сумісність/i, /підходить до/i, /з'єднання/i, /розмір підключення/i, /матеріал/i, /максимальний робочий тиск/i, /вага нетто/i, /^H$|^L\d?$|^W$/i]
    : classification.category === "heating"
    ? [/максимальний напір/i, /максимальна витрата/i, /монтажна довжина/i, /розмір підключення/i, /робочий тиск/i, /номінальна напруга/i, /IP-клас/i, /температура рідини/i, /EEI/i, /споживана потужність P1/i]
    : [/максимальний напір/i, /максимальна витрата/i, /максимальний розмір частинок/i, /розмір підключення/i, /вихід насоса/i, /робочий тиск/i, /номінальна напруга/i, /IP-клас/i, /довжина кабелю/i, /споживана потужність P1/i];
  const rows = [];
  for (const pattern of patterns) {
    const row = details.find(item => pattern.test(item[0]));
    if (row && !rows.some(item => item[0] === row[0])) rows.push(row);
  }
  if (rows.length < 5) {
    for (const row of details) {
      if (!rows.some(item => item[0] === row[0])) rows.push(row);
      if (rows.length >= 8) break;
    }
  }
  return rows.slice(0, 8).map(([label, value]) => `${label}: ${value}`);
}

function applications(record) {
  return [...new Set(clean(record.product?.applicationCategory).split(/\s*,\s*/).map(clean).filter(Boolean))];
}

const familyCopy = Object.freeze({
  SCALA2: "компактна самовсмоктувальна установка з автоматичним підтриманням тиску в домашній системі водопостачання",
  SCALA1: "комплектна самовсмоктувальна установка для автоматичної подачі води та підвищення тиску",
  CMBE: "компактна установка з багатоступеневим насосом і регульованою частотою обертання для стабілізації тиску",
  "CMBE TWIN": "здвоєна установка підвищення тиску з частотним регулюванням і двома насосами",
  JP: "самовсмоктувальний відцентровий насос для подачі чистої води у побутових системах",
  UPA: "компактний насос для локального підвищення тиску у водопроводі",
  "UNILIFT CC": "компактний заглибний дренажний насос для чистої або слабко забрудненої води",
  "UNILIFT KP": "заглибний дренажний насос із нержавіючої сталі для переносного або стаціонарного монтажу",
  "UNILIFT AP12": "заглибний насос для дренажної та побутової стічної води з допустимими твердими включеннями",
  "UNILIFT AP": "заглибний насос із нержавіючої сталі для відведення стічної та дренажної води",
  "UNILIFT AP B": "заглибний насос для стічної води, придатний до стаціонарного монтажу на автоматичній муфті",
  "UNILIFT APG": "каналізаційний насос із подрібнювальним механізмом для напірного відведення стоків",
  MULTIBOX: "готовий мобільний комплект для аварійного водовідведення та осушення",
  CONLIFT1: "компактна установка для збирання та відведення конденсату",
  SOLOLIFT2: "компактна автоматична каналізаційна установка для санітарних приладів",
  MULTILIFT: "комплектна установка для накопичення і напірного відведення побутових стічних вод",
  COMFORT: "енергоефективний насос мокрого ротора для рециркуляції гарячої води",
  "ALPHA2 N": "циркуляційний насос у корозійностійкому виконанні для систем гарячого водопостачання",
  "ALPHA1 N": "циркуляційний насос у корозійностійкому виконанні для рециркуляції гарячої води",
  ALPHA3: "електронний циркуляційний насос для систем опалення та кондиціювання з автоматичним регулюванням",
  ALPHA2: "електронний циркуляційний насос для опалення та кондиціювання з адаптацією до потреб системи",
  "ALPHA1 L": "високоефективний циркуляційний насос для базових систем опалення",
  "ALPHA SOLAR": "циркуляційний насос для сонячних теплових систем",
  "PM 1": "електронний контролер для автоматичного запуску й зупинки насоса з базовим захистом системи",
  "PM 2": "електронний контролер насоса з налаштуванням робочого тиску та функціями захисту",
  "PM TWIN": "контролер для почергового й спільного керування двома насосами",
  "GT-D": "сталевий напірний бак із подвійною бутилкаучуковою мембраною для систем питного водопостачання",
  "GT-H": "мембранний напірний бак для стабілізації тиску та зменшення кількості пусків насоса",
  "GT-HR": "мембранний бак зі змінною мембраною для систем водопостачання",
  "GT-U": "напірний бак із замінною мембраною для накопичення води та компенсації змін тиску",
  "GT-U+": "сталевий мембранний бак великого об’єму для водопостачання та підвищення тиску",
  "CMBE ACCESSORIES": "офіційна комплектуюча для установок CMBE TWIN",
  "SCALA ACCESSORIES": "офіційний монтажний комплект для здвоєної установки SCALA1",
  "UNILIFT ACCESSORIES": "офіційна комплектуюча для дренажного обладнання UNILIFT",
  "CONLIFT ACCESSORIES": "офіційна електрична комплектуюча для установки CONLIFT",
  "MULTILIFT ACCESSORIES": "офіційний монтажний комплект для каналізаційних установок MULTILIFT",
  "MULTILIFT SERVICE": "офіційна послуга введення каналізаційної установки MULTILIFT в експлуатацію",
  "CIRCULATION ACCESSORIES": "офіційна комплектуюча для циркуляційних насосів Grundfos",
  "ALPHA ACCESSORIES": "офіційна комплектуюча для циркуляційних насосів ALPHA",
  "GRUNDFOS GO": "модуль керування або діагностики сумісного обладнання Grundfos"
});

function lowerFirst(value = "") {
  const text = clean(value);
  return text ? `${text.charAt(0).toLocaleLowerCase("uk")}${text.slice(1)}` : "";
}

function editorialDescription(record, classification, details, features) {
  const model = clean(record.product?.name);
  const group = groupKey(record);
  const purpose = familyCopy[group] || lowerFirst(classification.type);
  const uses = applications(record);
  const featureSentence = features.map(value => lowerFirst(value.replace(/[:.]$/, ""))).join("; ");
  const materialRows = details.filter(([label]) => /корпус насоса|робоче колесо|ущільнення вала|монтаж сухий|установка горизонтальна/i.test(label)).slice(0, 5);
  const materialSentence = materialRows.map(([label, value]) => `${lowerFirst(label)} — ${value}`).join("; ");
  const constructionRows = details.filter(([label]) => /тип електродвигуна|з електродвигуном|тепловий захист|захист електродвигуна|реле рівня|автоматичний нічний|сітчастий фільтр|кабельна вилка|роз'єм електроживлення|тип штекера|тип робочого колеса|монтаж$|мембрана|матеріал бака|орієнтація монтажу|сумісність|підходить до|з'єднання/i.test(label)).slice(0, 6);
  const constructionSentence = constructionRows.length
    ? constructionRows.map(([label, value]) => `${lowerFirst(label)} — ${value}`).join("; ")
    : `виконання та комплектність визначені виробником для артикулу ${record.productNumber}`;
  const sections = [
    { title: "Опис", paragraphs: [`Grundfos ${model} належить до серії ${classification.series}. Це ${purpose}.`] },
    { title: "Призначення", paragraphs: [uses.length ? `Виробник передбачає застосування у таких системах: ${uses.map(lowerFirst).join("; ")}.` : `${classification.type} призначено для відповідної побутової інженерної системи та сумісного обладнання Grundfos.`] },
    { title: "Конструкція та робота", paragraphs: [`Для цієї моделі офіційно зазначено: ${constructionSentence}.`] },
    { title: "Параметри конкретної моделі", paragraphs: [`Для Grundfos ${model} виробник підтверджує такі ключові дані: ${featureSentence}.`] }
  ];
  if (materialSentence) sections.push({ title: "Матеріали та монтаж", paragraphs: [`За офіційною специфікацією: ${materialSentence}.`] });
  sections.push({ title: classification.kind === "service" ? "Умови виконання" : "Підбір", paragraphs: [classification.kind === "service" ? "Склад робіт і можливість виїзду потрібно погодити для конкретної установки та об’єкта." : "Перед замовленням потрібно звірити сумісність, тип приєднання, допустимий тиск і температуру, параметри електроживлення та умови монтажу з технічними даними цього виконання."] });
  const shortBase = `Grundfos ${model} — ${purpose}`;
  const shortDescription = `${shortBase.length <= 218 ? shortBase : `${classification.type} Grundfos ${model}`}.`;
  return { applications: uses, sections, shortDescription, fullDescription: sections.flatMap(section => section.paragraphs).join("\n\n") };
}

function selectDocuments(documentGroup = {}) {
  const links = Array.isArray(documentGroup.links) ? documentGroup.links : [];
  const find = pattern => links.find(item => pattern.test(clean(item.text)));
  const manual = find(/I\s*&\s*O|installation.*operating|інструкц.*монтаж|інструкції з монтажу та експлуатації|quick guide/i)
    || find(/safety instructions/i);
  const datasheet = find(/data booklet|product brochure|буклет|брошур|стисле керівництво з вибору/i);
  const certificate = find(/certificate|declaration|сертифікат|деклараці/i);
  const selected = [manual, datasheet, certificate].filter(Boolean);
  if (!selected.length && links.length) selected.push(links[0]);
  const documents = [...new Map(selected.map(item => [item.href, item])).values()].map(item => ({ type: "PDF", title: clean(item.text) || "Документ Grundfos", url: item.href }));
  return { manual, datasheet, certificate, documents };
}

async function downloadImage(url, target, options = {}) {
  try {
    await fs.access(target);
    return true;
  } catch {}
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "image/avif,image/webp,image/png,image/*" } });
      if (!response.ok) throw new Error(`${response.status}`);
      const input = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) throw new Error("Invalid image");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await sharp(input)
        .resize({ width: options.width || 1400, height: options.height || 1400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: options.quality || 90, alphaQuality: 95, effort: 6 })
        .toFile(target);
      return true;
    } catch (error) {
      if (attempt === 4) return false;
      await new Promise(resolve => setTimeout(resolve, 350 * attempt));
    }
  }
  return false;
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
      if ((index + 1) % 25 === 0) console.log(`Processed ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

async function main() {
  const records = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
  const documentGroups = JSON.parse(await fs.readFile(DOCUMENTS_FILE, "utf8"));
  const skuDocumentRows = JSON.parse(await fs.readFile(SKU_DOCUMENTS_FILE, "utf8"));
  const skuDocuments = Object.fromEntries(skuDocumentRows.map(item => [String(item.productNumber), item]));
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const products = await mapLimit(records, 10, async record => {
    const sku = String(record.productNumber);
    const classification = classify(record);
    const details = technicalDetails(record);
    const features = keyFeatures(details, classification);
    const editorial = editorialDescription(record, classification, details, features);
    const docs = selectDocuments(skuDocuments[sku] || documentGroups[groupKey(record)]);
    const mainSource = `https://api.grundfos.com/gpi/imaging/product?productnumber=${encodeURIComponent(sku)}&w=1600&h=1600`;
    const dimensionSource = `https://api.grundfos.com/gpi/imaging/dimdrawing/?productnumber=${encodeURIComponent(sku)}&frequency=50&languagecode=UKR&productrange=GUA&searchdomain=SALEABLE&unitsystem=4&currency=EUR&w=1400&h=1000`;
    const mainName = `${slugify(sku)}-main.webp`;
    const dimensionName = `${slugify(sku)}-dimensions.webp`;
    const [hasMain, hasDimensions] = await Promise.all([
      downloadImage(mainSource, path.join(MEDIA_DIR, mainName)),
      downloadImage(dimensionSource, path.join(MEDIA_DIR, dimensionName), { width: 1400, height: 1000, quality: 88 })
    ]);
    const mainImage = hasMain ? `/assets/products/grundfos/${mainName}` : "";
    const dimensionDiagram = hasDimensions ? `/assets/products/grundfos/${dimensionName}` : "";
    const images = [mainImage, dimensionDiagram].filter(Boolean);
    const imageSources = [
      ...(mainImage ? [{ local: mainImage, source: mainSource, original: clean(record.product?.image), type: "product" }] : []),
      ...(dimensionDiagram ? [{ local: dimensionDiagram, source: dimensionSource, original: dimensionSource, type: "dimensions" }] : [])
    ];
    const manufacturerUrl = clean(record.finalUrl || record.product?.url || record.sourceUrl);
    const ean = clean(record.product?.gtin13 || findSpec(details, [/EAN номер/i])?.[1]);
    const model = clean(record.product?.name);
    const title = classification.kind === "tank"
      ? `Мембранний бак Grundfos ${model}`
      : classification.kind === "controller"
        ? `${classification.type} Grundfos ${model}`
        : classification.kind === "accessory"
          ? `${classification.type} Grundfos ${model}`
          : classification.kind === "service"
            ? "Пусконалагодження каналізаційних установок Grundfos MULTILIFT"
            : `Насос Grundfos ${model}`;
    const compatibility = clean(findSpec(details, [/^Сумісність$/i, /^Підходить до$/i])?.[1]);
    const sourceUrls = [...new Set([manufacturerUrl, PRICE_LIST_PAGE, PRICE_LIST_PDF, clean(record.sourceUrl), mainSource, ...(hasDimensions ? [dimensionSource] : []), ...docs.documents.map(item => item.url)].filter(Boolean))];
    const seoDescription = `${classification.type} Grundfos ${clean(record.product?.name)}: офіційні характеристики, застосування, фото та документи виробника.`;
    return {
      id: `grundfos-${sku}`,
      sku,
      manufacturerCode: sku,
      manufacturer_code: sku,
      ean,
      EAN: ean,
      brand: "Grundfos",
      category: classification.category,
      sourceCategoryId: classification.sourceCategoryId,
      typeSlug: classification.sourceCategoryId,
      type: classification.type,
      subcategory: classification.type,
      series: classification.series,
      seriesId: `grundfos-${seriesSlug(classification.series)}`,
      model,
      title,
      productName: title,
      product_name: title,
      shortDescription: editorial.shortDescription,
      short_description: editorial.shortDescription,
      fullDescription: editorial.fullDescription,
      full_description: editorial.fullDescription,
      description: editorial.fullDescription,
      descriptionSections: editorial.sections,
      keyFeatures: features,
      key_features: features,
      applications: editorial.applications,
      compatibility,
      technicalDetails: details,
      features: normalizedFeatures(details, classification),
      attributes: [],
      image: mainImage,
      mainImage,
      main_image: mainImage,
      images,
      galleryImages: images,
      gallery_images: images,
      dimensionDiagram,
      dimension_diagram: dimensionDiagram,
      imageSourceUrl: mainSource,
      image_source_url: mainSource,
      imageSources,
      image_sources: imageSources,
      documents: docs.documents,
      manualPdf: docs.manual?.href || "",
      manual_pdf: docs.manual?.href || "",
      datasheetPdf: docs.datasheet?.href || "",
      datasheet_pdf: docs.datasheet?.href || "",
      certificatePdf: docs.certificate?.href || "",
      certificate_pdf: docs.certificate?.href || "",
      manufacturerUrl,
      manufacturer_url: manufacturerUrl,
      descriptionSourceUrl: manufacturerUrl,
      description_source_url: manufacturerUrl,
      sourceUrls,
      source_urls: sourceUrls,
      dateVerified: VERIFIED_ON,
      date_verified: VERIFIED_ON,
      seo: { title: `${title} — характеристики | ТД «Софіївка»`, description: seoDescription },
      seoTitle: `${title} — характеристики | ТД «Софіївка»`,
      seo_title: `${title} — характеристики | ТД «Софіївка»`,
      seoDescription,
      seo_description: seoDescription,
      price: 0,
      currency: "UAH",
      availability: "unknown",
      availabilityLabel: "Наявність уточнюйте",
      condition: "new",
      conditionLabel: "Новий",
      officialCatalogEdition: "Офіційний прайс-лист Grundfos для побутового обладнання 2025"
    };
  });
  products.sort((a, b) => a.series.localeCompare(b.series, "uk") || a.model.localeCompare(b.model, "uk"));
  const seriesLabels = Object.fromEntries([...new Map(products.map(product => [product.seriesId, product.series])).entries()]);
  const output = `(function(){"use strict";const PRODUCTS=${JSON.stringify(products)};window.sofievkaGrundfosSeriesLabels=Object.freeze(${JSON.stringify(seriesLabels)});window.sofievkaGrundfosProducts=Object.freeze(PRODUCTS.map(product=>Object.freeze(product)));})();\n`;
  await fs.writeFile(OUT_FILE, output);
  const report = {
    verifiedOn: VERIFIED_ON,
    source: PRICE_LIST_PAGE,
    skuCount: products.length,
    seriesCount: new Set(products.map(product => product.series)).size,
    series: Object.entries(products.reduce((all, product) => ({ ...all, [product.series]: (all[product.series] || 0) + 1 }), {})).map(([name, skuCount]) => ({ name, skuCount })),
    imageCoverage: products.filter(product => product.mainImage).length,
    dimensionCoverage: products.filter(product => product.dimensionDiagram).length,
    eanCoverage: products.filter(product => product.ean).length,
    documentCoverage: products.filter(product => product.documents.length).length
  };
  await fs.writeFile(path.join(ROOT, "tmp", "grundfos-source", "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();
