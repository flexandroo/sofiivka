// Builds the standard non-destructive import batch from the complete manufacturer capture.
// node scripts/import/general-fittings-batch.mjs --media   (resumable media capture)
// node scripts/import/general-fittings-batch.mjs --build   (requires completed --crawl)
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "../../tmp/import-tools/node_modules/sharp/lib/index.js";
import { ROOT, OUT, clean, pool, request } from "./general-fittings-catalog.mjs";
import { SCOPE_NAMES, FAMILY_COPY, classify, labelFor, APPLICATIONS } from "./general-fittings-editorial.mjs";

const MEDIA = path.join(ROOT, "assets/products/general-fittings");
const MANIFEST = path.join(OUT, "general-fittings-media.json");
const CAPTURE = path.join(OUT, "general-fittings-source.json");
const DATE = "2026-11-25";
const SERIES_UK = { "Angle valves": "Кутові крани", "Washing machine taps": "Крани для пральних машин", "Other valves and filters": "Клапани та фільтри", "Eurocone fittings": "Євроконус", "Adapters and inserts for radiator valves": "Адаптери радіаторної арматури", "Multilayer pipe systems accessories": "Комплектуючі металополімерних труб" };
const seriesName = value => SERIES_UK[value] || value.replace(/^LINE /, "");
const isPipeBend = form => /^AC00\.(?:70|80)(?:\s|$)/.test(form.title) && /\bBEND\b/.test(form.content);
export function manufacturerClaimPolicy(form, familyRows, construction) {
  const source = clean(form.content).toUpperCase();
  const nonFluidBox = source === "BOX FOR ELBOW";
  const explicitMaterialConflict = /\bBRONZE\b/.test(source);
  return {
    nonFluidBox, explicitMaterialConflict,
    allowGenericBodyMaterial: !nonFluidBox && !explicitMaterialConflict,
    familyRows: nonFluidBox ? [] : familyRows,
    construction: nonFluidBox ? "Монтажна коробка призначена для встановлення сумісного кутника. Матеріал коробки та параметри монтажу слід звірити за документацією конкретного виробу."
      : explicitMaterialConflict ? construction?.replace("Корпус виготовлено з латуні, гільзу — з нержавіючої сталі AISI 304.", "Гільзу виготовлено з нержавіючої сталі AISI 304.") : construction
  };
}
const documentType = url => /flyer|brochure|catalog|_BRO_/i.test(url) ? "catalog" : /technical|scheda|tech_|dati|datasheet|DTS_|_UK_2026/i.test(url) ? "datasheet" : "certificate";
function documentModel(url) {
  const file = decodeURIComponent(new URL(url).pathname.split("/").pop());
  return file.match(/^DTS_([A-Z0-9]+(?:\.[A-Z0-9]+)+)(?:_|-|\.pdf$)/i)?.[1].toUpperCase() || null;
}
function applicableDocuments(form, family, manifest) {
  const sources = [...new Set([...form.documents, ...family.documents])].filter(url => manifest.documents[url]);
  const model = form.title.match(/^[A-Z0-9]+(?:\.[A-Z0-9]+)+/i)?.[0].toUpperCase();
  const exact = url => documentModel(url) === model && (!/^AC00\.(70|80)$/.test(model || "") || isPipeBend(form));
  const hasExact = sources.some(url => documentType(url) === "datasheet" && documentModel(url) && exact(url));
  return sources.filter(url => documentType(url) !== "datasheet" || (documentModel(url) ? exact(url) : !hasExact && !isPipeBend(form)));
}
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const canonicalImage = url => url.replace(/\.webp$/, "");
const relativeFile = url => {
  const stem = decodeURIComponent(new URL(url).pathname.split("/").pop()).replace(/\.(?:webp|png|jpe?g|gif|pdf)$/gi, "").replace(/\.(?:png|jpe?g|gif)$/i, "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase().slice(0, 80);
  const pdf = /\.pdf(?:\?|$)/i.test(url);
  return `assets/products/general-fittings/${stem}-${hash(pdf ? url : canonicalImage(url)).slice(0, 10)}.${pdf ? "pdf" : "webp"}`;
};

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function loadManifest() { try { return JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch { return { images: {}, documents: {}, failures: [] }; } }
let nextDownload = 0;
async function binary(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const scheduled = Math.max(Date.now(), nextDownload); nextDownload = scheduled + 700;
    if (scheduled > Date.now()) await new Promise(resolve => setTimeout(resolve, scheduled - Date.now()));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (response.status === 429) { await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1))); throw Error(`HTTP 429 ${url}`); }
      if (!response.ok) throw Error(`HTTP ${response.status} ${url}`);
      return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
    } catch (error) { last = error; }
  }
  throw last;
}

async function downloadImage(url, manifest) {
  const key = canonicalImage(url); const file = relativeFile(url); const absolute = path.join(ROOT, file);
  if (manifest.images[key]?.path && await exists(absolute)) return manifest.images[key];
  const { bytes } = await binary(url);
  const output = await sharp(bytes, { failOn: "error" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 88, effort: 5 }).toBuffer({ resolveWithObject: true });
  await fs.writeFile(absolute, output.data);
  const entry = { path: file, sourceUrl: url, width: output.info.width, height: output.info.height, bytes: output.data.length, sha256: hash(output.data) };
  manifest.images[key] = entry;
  return entry;
}

function relevantPdf(url) {
  const decoded = decodeURIComponent(url);
  // Country-specific approvals in Russian/Belarusian/Kazakh are not product instructions.
  return !/[А-Яа-яЁё]/.test(decoded) && !/GOST|EAC|RUSSIA|BELARUS|KAZAKH/i.test(decoded);
}

async function downloadPdf(url, manifest) {
  const file = relativeFile(url); const absolute = path.join(ROOT, file);
  if (manifest.documents[url]?.path && await exists(absolute)) return manifest.documents[url];
  const { bytes, contentType } = await binary(url);
  if (!bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-")) throw Error(`Not a PDF: ${url} (${contentType})`);
  await fs.writeFile(absolute, bytes);
  const entry = { path: file, sourceUrl: url, contentType, bytes: bytes.length, sha256: hash(bytes) };
  manifest.documents[url] = entry;
  return entry;
}

async function media() {
  await fs.mkdir(MEDIA, { recursive: true }); await fs.mkdir(OUT, { recursive: true });
  const manifest = await loadManifest();
  const urls = new Set(), pdfUrls = new Set();
  // Reading the cache also allows media work while the complete catalogue capture is running.
  for (const name of await fs.readdir(path.join(OUT, "general-fittings-cache"))) {
    const html = await fs.readFile(path.join(OUT, "general-fittings-cache", name), "utf8");
    const main = html.match(/<main>([\s\S]*?)<\/main>/)?.[1]; if (!main) continue;
    const imageBlock = main.slice(main.indexOf('class="sn_main_product__images"'), main.indexOf("<h1"));
    const imageMap = new Map();
    for (const match of imageBlock.matchAll(/(?:data-)?srcset="([^"]+)"/g)) {
      const url = clean(match[1]); if (!url.startsWith("https://www.generalfittings.it/") || url.includes(" ")) continue;
      if (!imageMap.has(canonicalImage(url)) || url.endsWith(".webp")) imageMap.set(canonicalImage(url), url);
    }
    for (const url of imageMap.values()) urls.add(url);
    for (const match of html.matchAll(/href="([^"]+\.pdf(?:\?[^"]*)?)"/gi)) if (relevantPdf(clean(match[1]))) pdfUrls.add(clean(match[1]));
  }
  const tasks = [...urls].map(url => ({ url, kind: "image" })).concat([...pdfUrls].map(url => ({ url, kind: "pdf" })));
  let done = 0; const failures = [];
  await pool(tasks, 2, async task => {
    try { if (task.kind === "image") await downloadImage(task.url, manifest); else await downloadPdf(task.url, manifest); }
    catch (error) { failures.push({ ...task, message: String(error) }); }
    done += 1;
    if (done % 20 === 0) { await fs.writeFile(MANIFEST, JSON.stringify({ ...manifest, failures }, null, 2)); console.error(`Media: ${done}/${tasks.length}`); }
  });
  manifest.failures = failures; manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.error(JSON.stringify({ images: Object.keys(manifest.images).length, pdfs: Object.keys(manifest.documents).length, failures }));
}

async function logo() {
  for (const name of await fs.readdir(path.join(OUT, "general-fittings-cache"))) {
    const html = await fs.readFile(path.join(OUT, "general-fittings-cache", name), "utf8");
    const symbol = html.match(/<symbol\b[^>]*id="sn-icn-logo-general-fittings"[^>]*>([\s\S]*?)<\/symbol>/);
    if (!symbol) continue;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165 46" role="img" aria-label="General Fittings">${symbol[1]}</svg>\n`;
    if (/<script|<foreignObject|\bon\w+=|https?:\/\//i.test(symbol[1])) throw Error("Unsafe external logo content");
    await fs.mkdir(path.join(ROOT, "assets/brands"), { recursive: true });
    await fs.writeFile(path.join(ROOT, "assets/brands/general-fittings.svg"), svg);
    console.error("Official General Fittings vector logo extracted from the manufacturer's inline symbol.");
    return;
  }
  throw Error("Official logo symbol not found");
}

const PDF_TEXT_CACHE = new Map();
function pdfBodyEvidence(documents, manifest) {
  for (const url of documents.filter(u => /DTS_|_UK_2026/.test(u))) {
    const local = manifest.documents[url]; if (!local) continue;
    let text;
    try { if (!PDF_TEXT_CACHE.has(url)) PDF_TEXT_CACHE.set(url, execFileSync("pdftotext", ["-layout", path.join(ROOT, local.path), "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 })); text = PDF_TEXT_CACHE.get(url); }
    catch { continue; }
    const lines = text.split(/\r?\n/); const lineIndex = lines.findIndex(l => /^\s*\d+\s+Body\s{2,}/i.test(l)); const line = lines[lineIndex];
    if (!line) continue;
    let raw = line.replace(/^\s*\d+\s+Body\s{2,}/i, "").trim();
    if (/UNI EN\s*$/.test(raw) && /^\s+\d[\d/ -]*$/.test(lines[lineIndex + 1] || "")) raw += " " + lines[lineIndex + 1].trim();
    const translated = raw.replace(/stainless steel/gi, "Нержавіюча сталь").replace(/hot[- ](?:stamped|pressed) brass/gi, "Гаряче штампована латунь").replace(/chrome plated/gi, "хромована").replace(/brass/gi, "Латунь").replace(/steel/gi, "Сталь").replace(/plastic/gi, "Пластик");
    return { sourceUrl: url, localPath: local.path, sourceLine: clean(line.trim() + (/UNI EN\s*$/.test(line) ? " " + lines[lineIndex + 1] : "")), material: clean(translated), genericMaterial: /brass/i.test(raw) ? "Латунь" : null };
  }
  return null;
}

function translatedValue(value) {
  return clean(value).replace(/[”″“]/g, '"').replace(/\s*[xX]\s*/g, "×").replace(/\bbar\b/g, "бар").replace(/\bmm\b/g, "мм").replace(/\bkg\b/g, "кг")
    .replace(/\bmale\b/gi, "зовнішня різьба").replace(/\bfemale\b/gi, "внутрішня різьба").replace(/\bred\b/gi, "червоний").replace(/\bblue\b/gi, "синій").replace(/\bblack\b/gi, "чорний").replace(/\bwhite\b/gi, "білий")
    .replace(/\bsmall\b/gi, "малий").replace(/\bbig\b/gi, "великий").replace(/\bchrome[- ]plated\b/gi, "хромований").replace(/\bnickel[- ]plated\b/gi, "нікельований")
    .replace(/\byellow\b/gi, "латунний").replace(/\bnickel\b/gi, "нікельований").replace(/\bchrome\b/gi, "хромований").replace(/\bpolished\b/gi, "полірований")
    .replace(/\bhorizontal\b/gi, "горизонтальний").replace(/\bvertical\b/gi, "вертикальний").replace(/\bstraight\b/gi, "прямий").replace(/\bangle\b/gi, "кутовий")
    .replace(/\bhandle\b/gi, "ручка").replace(/\bcompact\b/gi, "компактний").replace(/\blockable\b/gi, "з блокуванням").replace(/\bsingle hole\b/gi, "один монтажний отвір")
    .replace(/\bconical gasket\b/gi, "конічна прокладка").replace(/\bfor Pe-x pipe\b/gi, "для труб PE-X").replace(/\bfor multilayer pipe\b/gi, "для металополімерних труб")
    .replace(/\bfor art\.\s*/gi, "для виробу ").replace(/\((\d+) ways\)/gi, "($1 виходи)").replace(/\bfor gas\b/gi, "для газу").replace(/\bwater\b/gi, "вода").replace(/\bgas\b/gi, "газ")
    .replace(/\bno LBP\b/gi, "без контролю необтисненого з’єднання").replace(/\bon demand\b/gi, "за запитом").replace(/\bwith 4 self-tapping screws\b/gi, "із чотирма саморізами")
    .replace(/\bprofile\b/gi, "профіль").replace(/\bTipo Roma\b/g, "виконання Roma").replace(/\brosso\b/gi, "червоний").replace(/\bspazzolato\b/gi, "матове покриття").replace(/^h\.\s*/i, "висота ");
}

function numericProperties(family) {
  const result = [];
  for (const row of family.properties || []) {
    const label = labelFor(row.label); let value = translatedValue(row.value);
    // A duplicated responsive block on the manufacturer's 7E00 page puts the long caution into numeric cells.
    if (!label || !/\d/.test(value) || /only with|after performing|maximum percentage/i.test(value) || value.length > 90) continue;
    if (!result.some(r => r.label === label && r.value === value)) result.push({ label, value });
  }
  return result;
}

async function applicationProperties(family) {
  const html = await request(family.link); const main = html.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? "";
  const result = [];
  const chunks = main.split('<div class="sn_accordion__i">').slice(1);
  for (const chunk of chunks) {
    const button = chunk.match(/<button\b[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "";
    const name = clean(button).toLowerCase(); const application = APPLICATIONS[name]; if (!application) continue;
    for (const dl of chunk.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/g)) {
      const sourceLabel = clean(dl[1].match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/)?.[1]);
      const sourceValue = clean(dl[1].match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/)?.[1]);
      const label = labelFor(sourceLabel); const value = translatedValue(sourceValue);
      if (!label || !/\d/.test(value) || value.length > 70 || /only with|maximum percentage/i.test(value)) continue;
      const row = { label: `${label}: ${application}`, value };
      if (!result.some(r => r.label === row.label && r.value === row.value)) result.push(row);
    }
    if (/-20.C/.test(clean(chunk)) && /glycol/.test(clean(chunk))) {
      const percent = clean(chunk).match(/(?:max(?:imum)?(?: of)?|percentage of)\s*(?:of\s*)?(\d+)\s*%/i)?.[1];
      if (percent) result.push({ label: `Умова для мінусової температури: ${application}`, value: `Гліколевий антифриз, не більше ${percent}%` });
    }
  }
  return result.length ? result : numericProperties(family);
}

function numericRow(label, value) {
  const normalized = translatedValue(value);
  if (/Товщина|Довжина|діаметр|Міжосьова/i.test(label) && /^\d+(?:[.,]\d+)?$/.test(normalized)) return { label, value: normalized.replace(".", ","), unit: "мм" };
  return { label, value: normalized };
}

function makeSeo(title, characteristics) {
  const suffix = " — купити в ТД «Софіївка»";
  const facts = characteristics.filter(r => /Розмір|Матеріал|Виконання/.test(r.label)).slice(0, 2).map(r => `${r.label.toLowerCase()} ${r.value}${r.unit ? " " + r.unit : ""}`).join(", ");
  let text = `${title}. ${facts ? facts + ". " : ""}Технічні характеристики, фото та документація виробника для підбору до системи.`;
  if (text.length > 160) text = text.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  if (text.length < 120) text += " Підбір з’єднання за параметрами труби.";
  return { seoTitle: (title + suffix).length <= 70 ? title + suffix : title, seoDescription: text.slice(0, 160) };
}

async function build() {
  const capture = JSON.parse(await fs.readFile(CAPTURE, "utf8")); const manifest = await loadManifest();
  const reference = JSON.parse(await fs.readFile(path.join(OUT, "reference-staged.json"), "utf8"));
  const allowedFilters = new Set(Object.keys(reference.attributes || {}));
  const familyById = new Map(capture.families.map(f => [f.id, f]));
  const familyProperties = new Map(await pool(capture.families, 2, async family => [family.id, await applicationProperties(family)]));
  const formDocumentUrls = new Map(capture.forms.map(form => [form.link, applicableDocuments(form, familyById.get(form.familyId), manifest)]));
  const productsBySku = new Map(), exclusions = [], issues = [], sourceVariants = [];
  for (const form of capture.forms) {
    const kind = classify(clean(form.content), form.scope); const family = familyById.get(form.familyId); const pipeBend = isPipeBend(form);
    if (form.familyTitle === "Multilayer pipe systems accessories") kind.excluded = "Монтажний інструмент і його деталі, поза запитом на крани та фітинги";
    const sourceCategory = `${SCOPE_NAMES[form.scope]} → ${form.familyTitle}`;
    const codeTables = form.tables.filter(table => table.headings.some(h => /^code$/i.test(h)));
    if (kind.excluded) { exclusions.push({ sourceUrl: form.link, form: form.title, reason: kind.excluded, variants: codeTables[0]?.rows.length ?? 0 }); continue; }
    if (!codeTables.length) { issues.push({ sourceUrl: form.link, issue: "Немає офіційної таблиці артикулів" }); continue; }
    const byCode = new Map();
    for (const table of codeTables) {
      const index = table.headings.findIndex(h => /^code$/i.test(h));
      for (const row of table.rows) {
        const sku = clean(row[index]); if (!sku || !/^[A-Z0-9][A-Z0-9./_-]*$/i.test(sku)) continue;
        if (row.some(value => /until stocks are exhausted|discontinued|obsolete|out of production/i.test(value))) {
          exclusions.push({ sourceUrl: form.link, sku, reason: "Варіант виводиться з виробництва: до вичерпання залишків", variants: 1 }); continue;
        }
        if (!byCode.has(sku)) byCode.set(sku, []);
        for (let i = 0; i < table.headings.length; i += 1) {
          const label = table.headings[i], value = row[i];
          if (i === index || !value || value === "-" || /piece|pack|pallet|bag|box|ean/i.test(label)) continue;
          const translated = labelFor(label);
          if (!translated) { issues.push({ sourceUrl: form.link, sku, issue: `Неперекладена характеристика: ${label}`, value }); continue; }
          byCode.get(sku).push(numericRow(translated, value));
        }
      }
    }
    for (const [sku, dimensions] of byCode) {
      sourceVariants.push({ sku, sourceUrl: form.link, form: form.title });
      const size = dimensions.find(d => d.label === "Розмір приєднання")?.value;
      const title = `${kind.type} General Fittings ${sku}${size ? " " + size : ""}`;
      const images = form.images.map(url => manifest.images[canonicalImage(url)]?.path).filter(Boolean);
      if (!images.length) { issues.push({ sourceUrl: form.link, sku, issue: "Фото не завантажено" }); continue; }
      const characteristics = [...dimensions];
      const featureRows = kind.features.map(value => ({ label: "Виконання", value }));
      characteristics.push(...featureRows);
      const accessories = kind.category === "pipe-installation-components" || /Кільце|кільце|прокладка|Комплектуюча/.test(kind.type);
      const hasBody = !accessories && !/Гайка|гайка|Комплект різьбового/.test(kind.type);
      const pdfSources = formDocumentUrls.get(form.link) || [];
      const bodyEvidence = hasBody && !pipeBend ? pdfBodyEvidence(pdfSources, manifest) : null;
      const claimPolicy = manufacturerClaimPolicy(form, familyProperties.get(form.familyId) || [], FAMILY_COPY[family.title]);
      const directMaterial = !claimPolicy.allowGenericBodyMaterial ? null : pipeBend ? (/PLASTIC/.test(form.content) ? "Пластик" : "Сталь") : /STAINLESS STEEL/.test(form.content) ? "Нержавіюча сталь" : /PLASTIC/.test(form.content) ? "Пластик" : /BRASS/.test(form.content) ? "Латунь" : bodyEvidence?.genericMaterial || (!accessories && /brass/i.test(family.sourceText) ? "Латунь" : null);
      if (directMaterial) characteristics.push({ label: "Матеріал", value: directMaterial });
      if (claimPolicy.allowGenericBodyMaterial && bodyEvidence && !/PLASTIC|STAINLESS STEEL/.test(form.content)) characteristics.push({ label: "Матеріал корпусу за паспортом серії", value: bodyEvidence.material });
      if (pipeBend) {
        characteristics.push({ label: "Матеріал напрямної за паспортом", value: /PLASTIC/.test(form.content) ? "Поліамід PA6, 30% скловолокна" : "Оцинкована сталь" }, { label: "Робоча температура", value: "110", unit: "°C" }, { label: "Термостійкість", value: ">165", unit: "°C" });
      } else characteristics.push(...claimPolicy.familyRows);
      let construction = claimPolicy.construction;
      if (pipeBend) construction = "Напрямна використовується для холодного вигинання труби, її підтримання та захисту від механічних впливів. Виріб не є з’єднанням для транспортування середовища. Матеріал стійкий до агресивних речовин у будівельних розчинах. Розмір вибирають відповідно до діаметра труби.";
      if (dimensions.some(row => /без контролю необтисненого/.test(row.value))) construction = construction?.replace(/ має функцію виявлення необтисненого з’єднання: до пресування вода виходить через негерметичну ділянку\./, ". Цей варіант не має функції контролю необтисненого з’єднання.");
      if (!construction) issues.push({ sourceUrl: form.link, sku, issue: `Немає українського опису серії ${family.title}` });
      const purpose = claimPolicy.nonFluidBox ? "призначена для встановлення сумісного кутника" : pipeBend ? "використовується для вигинання, підтримання та механічного захисту сумісної труби" : kind.category === "shutoff-valves" ? "використовується для керування потоком у сумісній трубопровідній системі" : "використовується для монтажу сумісного трубопровідного з’єднання";
      const intro = `${title} ${purpose}.${size ? ` Розмір приєднання: ${size}.` : ""}`;
      const sections = [
        { title: "Застосування та конструкція", paragraphs: [construction || "", kind.features.length ? kind.features.join(". ") + "." : ""].filter(Boolean) },
        { title: "Монтаж і сумісність", paragraphs: [claimPolicy.nonFluidBox ? "Перед монтажем звірте сумісність кутника та монтажне розташування за документацією виробника." : "Перед установленням звірте тип труби, розміри, виконання різьби та вимоги технічного паспорта конкретної серії. Робочі параметри залежать від середовища й наявності ущільнень; дотримуйтеся наведених у характеристиках умов."] }
      ];
      const description = [intro, ...sections.flatMap(s => s.paragraphs)].join("\n\n");
      const filters = {};
      if (allowedFilters.has("material") && directMaterial && reference.attributes.material.values.includes(directMaterial)) filters.material = directMaterial;
      if (allowedFilters.has("connection") && size) {
        const exact = reference.attributes.connection.values.find(v => v.replace(/[”″“]/g, '"') === size);
        if (exact) filters.connection = exact;
      }
      const thickness = dimensions.find(d => d.label === "Товщина стінки труби");
      if (thickness && /^\d+(?:[,.]\d+)?$/.test(thickness.value)) {
        // Keep wall thickness only as a source characteristic: it is not pipe OD.
      }
      if (allowedFilters.has("pipeDiameterMm") && kind.category === "pipe-fittings" && /copper-pipe|pe-x-pipe|polyethylene-pipe|multilayer-pipe/.test(form.scope) && size) {
        const pipeSizes = [...new Set(size.split("×").map(part => part.trim()).filter(part => /^\d+(?:[.,]\d+)?$/.test(part)).map(Number))];
        if (pipeSizes.length === 1 && pipeSizes[0] >= 6) filters.pipeDiameterMm = pipeSizes[0];
      }
      const pressures = pipeBend || claimPolicy.nonFluidBox ? [] : [...new Set(claimPolicy.familyRows.filter(r => /Максимальний робочий тиск/.test(r.label) && /^\d+(?:[.,]\d+)? бар$/.test(r.value)).map(r => Number(r.value.replace(" бар", "").replace(",", "."))))];
      if (allowedFilters.has("pressureBar") && pressures.length === 1) filters.pressureBar = pressures[0];
      if (allowedFilters.has("angleDegrees") && kind.category === "pipe-fittings") {
        if (/90.DEGREE|90°/.test(form.content)) filters.angleDegrees = 90;
        else if (/45°/.test(form.content)) filters.angleDegrees = 45;
      }
      const documents = pdfSources.map((url, i) => {
        const type = documentType(url), model = documentModel(url);
        return { title: type === "datasheet" && model ? `Технічний паспорт ${model}` : `${type === "datasheet" ? "Технічний паспорт" : type === "catalog" ? "Каталог" : "Сертифікат"} серії ${seriesName(form.familyTitle)}${type === "certificate" ? " " + (i + 1) : ""}`, type, url: manifest.documents[url].path };
      });
      const record = { sourceId: sku, sourceUrl: form.link, sourceCategory, sku, model: sku, series: pipeBend || SERIES_UK[form.familyTitle] ? null : form.familyTitle.replace(/^LINE /, ""), brand: "general-fittings", title, category: kind.category, price: null, priceCurrency: "UAH", vatIncluded: null, shortDescription: intro.slice(0, 300), description, sections, characteristics, filters, images: [...new Set(images)], documents, ...makeSeo(title, characteristics), sourceEvidence: { manufacturerForm: form.title, manufacturerDescription: clean(form.content), familyUrl: form.familyUrl, capturedAt: capture.capturedAt, htmlSha256: form.htmlSha256, sourceImageUrls: form.images, sourceDocumentUrls: pdfSources, ...(bodyEvidence ? { bodyMaterialPdfEvidence: bodyEvidence } : {}), ...(pipeBend ? { componentMaterialPdf: { sourceUrl: pdfSources.find(url => documentModel(url) === form.title.match(/^AC00\.\d+/)?.[0]), material: directMaterial === "Пластик" ? "POLYAMIDE PA6 30% FV" : "FE GALVANIZED", operatingTemperatureC: 110, thermalResistanceMinC: 165 } } : {}) } };
      if (claimPolicy.explicitMaterialConflict) record.sourceEvidence.materialConflict = { exactModelDescription: clean(form.content), seriesBodyEvidence: bodyEvidence, decision: "Специфічний матеріал корпусу не публікується до уточнення виробника: BRONZE у моделі суперечить загальній таблиці латунного корпусу серії." };
      if (productsBySku.has(sku)) {
        const prior = productsBySku.get(sku); prior.sourceEvidence.additionalSourceUrls ??= []; prior.sourceEvidence.additionalSourceUrls.push(form.link);
        continue;
      }
      productsBySku.set(sku, record);
    }
  }
  const products = [...productsBySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const batch = { supplier: "general-fittings", supplierName: "General Fittings — офіційний каталог виробника", brand: "general-fittings", collectedAt: DATE, sourceSite: capture.sourceSite, products };
  await fs.writeFile(path.join(OUT, `general-fittings-${DATE}.json`), JSON.stringify(batch, null, 2));
  const rawVariantOccurrences = capture.forms.reduce((n, form) => n + (form.tables[0]?.rows.length || 0), 0);
  const excludedVariantOccurrences = exclusions.reduce((n, item) => n + (item.variants || 0), 0);
  const coverage = { capturedAt: capture.capturedAt, sourceSite: capture.sourceSite, scopes: capture.sections.map(s => ({ scope: s.scope, families: s.families.length })), families: capture.families.length, productForms: capture.forms.length, rawVariantOccurrences, excludedVariantOccurrences, duplicateRowsWithinForms: rawVariantOccurrences - excludedVariantOccurrences - sourceVariants.length, duplicateSkusAcrossForms: sourceVariants.length - products.length, officialVariantOccurrences: sourceVariants.length, uniqueImportedVariants: products.length, categories: Object.fromEntries([...new Set(products.map(p => p.category))].map(c => [c, products.filter(p => p.category === c).length])), exclusions, issues, media: { images: Object.keys(manifest.images).length, documents: Object.keys(manifest.documents).length, downloadFailures: manifest.failures }, pricePolicy: "Офіційний виробник не публікує роздрібні ціни. Усі нові ціни null, наявні товари й ціни не змінюються.", sourceEvidence: ["https://www.generalfittings.it/en/", "https://www.generalfittings.it/en/about-us/", "https://feko.ua/o-nas", "https://feko.ua/firmy/general-fittings/katalog"] };
  await fs.writeFile(path.join(OUT, `general-fittings-${DATE}.coverage.json`), JSON.stringify(coverage, null, 2));
  console.error(JSON.stringify({ products: products.length, excludedForms: exclusions.length, issues: issues.length, categories: coverage.categories }));
}

if (process.argv.includes("--media")) await media();
if (process.argv.includes("--build")) await build();
if (process.argv.includes("--logo")) await logo();
