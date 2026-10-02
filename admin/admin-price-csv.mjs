// Price import/export file handling for /admin/products/import. Pure functions (no DOM), so the
// CSV parser, number/status parsing and the XLSX reader are unit-tested in Node (tests/price-import-qa.mjs).
//
// Export: UTF-8 with BOM, ";" separator, comma decimals — opens directly in Excel with a Ukrainian
// locale; SKU/ID that look like numbers are written as ="…" so Excel keeps leading zeros; text that
// starts with = + - @ gets an apostrophe (formula-injection guard), the same rules as the CRM export.
// Import: CSV (";", "," or tab, quoted fields, BOM, UTF-8 or Windows-1251) and XLSX (first sheet),
// read with the browser's own DecompressionStream — no extra library.

export const PRICE_STATUS_LABELS = Object.freeze({ known: "Вказана", on_request: "За запитом", unknown: "Не вказана" });
export const INVENTORY_LABELS = Object.freeze({ in_stock: "В наявності", out_of_stock: "Немає", preorder: "Передзамовлення", discontinued: "Знято", unknown: "Невідомо" });
export const PUBLICATION_LABELS = Object.freeze({ published: "Опубліковано", draft: "Чернетка", hidden: "Приховано", archived: "Архів" });

export const IMPORT_FIELDS = Object.freeze([
  { id: "sku", label: "SKU", key: true },
  { id: "legacyId", label: "Legacy ID", key: true },
  { id: "price", label: "Ціна" },
  { id: "oldPrice", label: "Стара ціна" },
  { id: "priceStatus", label: "Статус ціни" },
  { id: "inventoryStatus", label: "Наявність" }
]);

const PRICE_ALIASES = {
  known: ["known", "вказана", "ціна вказана", "є ціна"],
  on_request: ["on_request", "on request", "за запитом", "ціна за запитом", "під запит", "по запиту", "договірна"],
  unknown: ["unknown", "не вказана", "невідомо", "немає ціни"]
};
const INVENTORY_ALIASES = {
  in_stock: ["in_stock", "in stock", "в наявності", "є в наявності", "у наявності", "наявність", "є", "так", "yes", "+", "в наличии", "есть"],
  out_of_stock: ["out_of_stock", "out of stock", "немає", "немає в наявності", "нема", "відсутній", "відсутня", "ні", "no", "нет", "нет в наличии"],
  preorder: ["preorder", "передзамовлення", "під замовлення", "на замовлення", "очікується", "под заказ"],
  discontinued: ["discontinued", "знято", "знято з продажу", "знятий з виробництва", "знято з виробництва"],
  unknown: ["unknown", "невідомо", "уточнюйте"]
};

// ---------------------------------------------------------------------------
// CSV reading
// ---------------------------------------------------------------------------
export function decodeText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    // Excel "CSV" on a Ukrainian Windows saves in Windows-1251.
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

export function detectDelimiter(text) {
  const sample = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/).filter(line => line.trim()).slice(0, 10);
  const counts = { ";": 0, ",": 0, "\t": 0 };
  for (const line of sample) {
    let quoted = false;
    for (const character of line) {
      if (character === '"') quoted = !quoted;
      else if (!quoted && character in counts) counts[character] += 1;
    }
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"] && counts[";"] > 0) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return counts[","] > 0 ? "," : ";";
}

export function parseCsv(input, delimiter = null) {
  const text = String(input ?? "").replace(/^﻿/, "");
  const separator = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = false;
      } else cell += character;
    } else if (character === '"') {
      quoted = true;
    } else if (character === separator) {
      row.push(cell); cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return { delimiter: separator, rows: rows.map(cells => cells.map(cleanCell)) };
}

// Undo the export's Excel guards: ="00123" and '=text.
export function cleanCell(value) {
  let text = String(value ?? "").replace(/ /g, " ").trim();
  const formula = text.match(/^="(.*)"$/s);
  if (formula) text = formula[1].replace(/""/g, '"');
  if (/^'[=+\-@]/.test(text)) text = text.slice(1);
  return text;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------
export function parseAmount(raw) {
  let text = cleanCell(raw).toLowerCase().replace(/[\s ]/g, "").replace(/(грн\.?|uah|₴|\$|€)$/u, "").replace(/^(грн\.?|uah|₴|\$|€)/u, "");
  if (text === "") return { value: null, empty: true };
  if (/^-/.test(text) && /^-[\d.,]+$/.test(text)) return { error: "не може бути від’ємною" };
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return { error: `«${cleanCell(raw)}» не є числом` };
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const mark = lastComma >= 0 ? "," : ".";
    const parts = text.split(mark);
    // "1,234,567" or "1.234.567" are thousands; a single mark is the decimal separator.
    text = parts.length > 2 ? parts.join("") : parts.join(".");
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: `«${cleanCell(raw)}» не є числом` };
  const value = Math.round(Number(text) * 100) / 100;
  if (!Number.isFinite(value) || value >= 1e12) return { error: "завелике число" };
  return { value };
}

const normalizeWord = value => cleanCell(value).toLocaleLowerCase("uk-UA").replace(/[’ʼ`]/g, "'").replace(/\s+/g, " ").replace(/[.!]$/, "");

export function parseStatus(kind, raw) {
  const text = normalizeWord(raw);
  if (text === "") return { value: null, empty: true };
  const aliases = kind === "price" ? PRICE_ALIASES : INVENTORY_ALIASES;
  const labels = kind === "price" ? PRICE_STATUS_LABELS : INVENTORY_LABELS;
  for (const [value, list] of Object.entries(aliases)) {
    if (list.includes(text) || normalizeWord(labels[value]) === text) return { value };
  }
  if (kind === "inventory" && /^\d+([.,]\d+)?$/.test(text)) {
    // Supplier stock columns often hold a quantity: 0 means out of stock.
    return { value: Number(text.replace(",", ".")) > 0 ? "in_stock" : "out_of_stock" };
  }
  return { error: kind === "price" ? `невідомий статус ціни «${cleanCell(raw)}»` : `невідомий статус наявності «${cleanCell(raw)}»` };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
const HEADER_RULES = [
  ["legacyId", /^(legacy ?id|legacy|id товару|id)$/],
  ["sku", /^(sku|артикул|арт\.?|код товару|код|vendor code|артикул постачальника)$/],
  ["oldPrice", /(стара|старая|old|до знижки|перекреслена|без знижки)/],
  ["priceStatus", /(статус ціни|price ?status)/],
  ["inventoryStatus", /(наявн|наличи|залиш|остат|stock|inventory|склад)/],
  ["price", /^(ціна|цена|price|роздрібна ціна|роздріб|ррц|ціна,? ?грн|ціна \(грн\)|ціна продажу)/]
];

export function guessMapping(headers) {
  const mapping = {};
  headers.forEach((header, index) => {
    const text = normalizeWord(header).replace(/,? ?(грн|uah)$/, "").trim();
    for (const [field, pattern] of HEADER_RULES) {
      if (mapping[field] === undefined && pattern.test(text)) { mapping[field] = index; break; }
    }
  });
  return mapping;
}

// First row (of the first 20) that looks like a header; otherwise the first non-empty row.
export function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const mapping = guessMapping(rows[index] || []);
    if (mapping.sku !== undefined || mapping.legacyId !== undefined) return index;
  }
  return Math.max(0, rows.findIndex(row => row.some(cell => cell !== "")));
}

// Turns the table into RPC rows. mapping: { key (or sku / legacyId): columnIndex, price?, oldPrice?, priceStatus?, inventoryStatus? }.
// Rows that fail here never reach the server; they come back as `problems` with the same shape as
// server results so the preview shows both together.
export function buildImportRows(table, headerIndex, mapping, matchBy = "sku") {
  const rows = [];
  const problems = [];
  const seen = new Map();
  const keyLabel = matchBy === "sku" ? "SKU" : "Legacy ID";
  const keyColumn = mapping.key ?? (matchBy === "sku" ? mapping.sku : mapping.legacyId);
  if (keyColumn === undefined) throw new Error(`Оберіть колонку ${keyLabel}.`);
  for (let index = headerIndex + 1; index < table.length; index += 1) {
    const cells = table[index] || [];
    if (!cells.some(cell => String(cell).trim() !== "")) continue;
    const line = index + 1;
    const key = cleanCell(cells[keyColumn]);
    const problem = message => problems.push({ line, key, status: "invalid", message, legacyId: null, sku: null, title: null, before: null, after: null });
    if (!key) { problem(`Порожній ${keyLabel}.`); continue; }
    const normalizedKey = matchBy === "sku" ? key.toLocaleLowerCase("en-US") : key;
    if (seen.has(normalizedKey)) { problem(`${keyLabel} повторюється у файлі (рядок ${seen.get(normalizedKey)}).`); continue; }
    seen.set(normalizedKey, line);
    const entry = { line, key };
    const errors = [];
    if (mapping.price !== undefined) {
      const amount = parseAmount(cells[mapping.price]);
      if (amount.error) errors.push(`Ціна: ${amount.error}.`);
      else if (amount.value === 0) errors.push("Ціна має бути більшою за 0. Для товару без ціни вкажіть статус «За запитом».");
      else if (!amount.empty) entry.price = amount.value;
    }
    if (mapping.oldPrice !== undefined) {
      const amount = parseAmount(cells[mapping.oldPrice]);
      if (amount.error) errors.push(`Стара ціна: ${amount.error}.`);
      else entry.oldPrice = amount.empty ? null : amount.value;
    }
    if (mapping.priceStatus !== undefined) {
      const status = parseStatus("price", cells[mapping.priceStatus]);
      if (status.error) errors.push(`${capitalize(status.error)}.`);
      else if (!status.empty) entry.priceStatus = status.value;
    }
    if (mapping.inventoryStatus !== undefined) {
      const status = parseStatus("inventory", cells[mapping.inventoryStatus]);
      if (status.error) errors.push(`${capitalize(status.error)}.`);
      else if (!status.empty) entry.inventoryStatus = status.value;
    }
    if (errors.length) { problem(errors.join(" ")); continue; }
    rows.push(entry);
  }
  return { rows, problems };
}

const capitalize = text => text.charAt(0).toLocaleUpperCase("uk-UA") + text.slice(1);

// ---------------------------------------------------------------------------
// CSV writing
// ---------------------------------------------------------------------------
export const EXPORT_COLUMNS = Object.freeze([
  ["SKU", row => csvText(row.sku)],
  ["Legacy ID", row => csvText(row.legacyId)],
  ["Назва", row => row.title],
  ["Бренд", row => row.brand],
  ["Ціна, грн", row => csvAmount(row.priceStatus === "known" ? row.amount : null)],
  ["Стара ціна, грн", row => csvAmount(row.oldAmount)],
  ["Статус ціни", row => PRICE_STATUS_LABELS[row.priceStatus] || row.priceStatus],
  ["Наявність", row => INVENTORY_LABELS[row.inventoryStatus] || row.inventoryStatus],
  ["Публікація", row => PUBLICATION_LABELS[row.publicationStatus] || row.publicationStatus]
]);

export function toCsv(columns, rows) {
  const lines = [columns.map(([title]) => csvCell(title)).join(";")];
  for (const row of rows) lines.push(columns.map(([, read]) => csvCell(read(row))).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

class CsvRaw {
  constructor(text) { this.text = text; }
}

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof CsvRaw) return value.text;
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Codes that Excel would turn into numbers or dates ("00123", "1-2", "1E5") stay text through ="…".
export function csvText(value) {
  const text = String(value ?? "");
  return text && /^[\d\s.,eE+\-/:]+$/.test(text) && !/[";\r\n]/.test(text) ? new CsvRaw(`"=""${text}"""`) : text;
}

export function csvAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toFixed(2).replace(".", ",");
}

// ---------------------------------------------------------------------------
// XLSX reading (first worksheet; values only)
// ---------------------------------------------------------------------------
export async function readXlsx(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const files = await unzip(bytes);
  const text = name => files.get(name);
  if (!files.size || !files.has("[Content_Types].xml")) throw new Error("Файл не схожий на Excel (.xlsx).");
  const shared = [];
  const sharedXml = await text("xl/sharedStrings.xml")?.();
  if (sharedXml) for (const match of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(xmlText(match[1]));
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await text("xl/workbook.xml")?.();
  const rels = await text("xl/_rels/workbook.xml.rels")?.();
  const firstSheet = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (firstSheet && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(item => item[0]).find(tag => tag.includes(`Id="${firstSheet[1]}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = await text(sheetPath)?.();
  if (!sheet) throw new Error("У файлі Excel не знайдено аркуша.");
  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1]) || rows.length + 1;
    const cells = [];
    for (const cellMatch of (rowMatch[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const reference = attributes.match(/\br="([A-Z]+)\d*"/)?.[1];
      const column = reference ? columnIndex(reference) : cells.length;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "n";
      const body = cellMatch[2] || "";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = xmlText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] || "");
      else if (raw !== undefined) value = decodeXml(raw);
      if (type === "n" && /^-?\d+(\.\d+)?E[+-]?\d+$/i.test(value)) value = String(Number(value));
      while (cells.length < column) cells.push("");
      cells[column] = cleanCell(value);
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return rows;
}

function columnIndex(letters) {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function xmlText(fragment) {
  return [...fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1])).join("");
}

function decodeXml(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, entity) => {
    const named = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[entity.toLowerCase()];
    if (named) return named;
    return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  });
}

// Minimal ZIP reader: central directory + stored/deflated entries. Returns name -> async () => text.
async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) return files;
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder("utf-8");
  for (let entry = 0; entry < count && pointer + 46 <= bytes.length; entry += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    pointer += 46 + nameLength + extraLength + commentLength;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    files.set(name, async () => {
      if (method === 0) return decoder.decode(data);
      if (method !== 8) throw new Error("Непідтримуване стиснення у файлі Excel.");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return decoder.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
    });
  }
  return files;
}

export async function readTableFile(name, buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const isXlsx = /\.xlsx$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
  if (/\.xls$/i.test(name)) throw new Error("Старий формат .xls не підтримується. Збережіть файл як .xlsx або CSV.");
  if (isXlsx) return { format: "xlsx", delimiter: null, rows: await readXlsx(bytes) };
  const parsed = parseCsv(decodeText(bytes));
  return { format: "csv", delimiter: parsed.delimiter, rows: parsed.rows };
}
