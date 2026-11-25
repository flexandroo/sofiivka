// Reproducible manufacturer catalogue capture for General Fittings.
// Read-only source API; output and cache are kept under ignored imports/.
// node scripts/import/general-fittings-catalog.mjs --crawl
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const OUT = path.join(ROOT, "imports");
const CACHE = path.join(OUT, "general-fittings-cache");
const ORIGIN = "https://www.generalfittings.it";
const DATE = "2026-11-25";
let nextRequestAt = 0;
export const clean = value => String(value ?? "")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n)))
  .replace(/&(?:quot|amp|lt|gt|nbsp|apos|ndash|mdash|deg|times);/g, x => ({ "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&apos;": "'", "&ndash;": "–", "&mdash;": "—", "&deg;": "°", "&times;": "×" })[x])
  .replace(/\s+/g, " ").trim();

const keyOf = value => crypto.createHash("sha256").update(value).digest("hex");
export async function request(url, fields) {
  await fs.mkdir(CACHE, { recursive: true });
  const cache = path.join(CACHE, keyOf(url + JSON.stringify(fields ?? {})) + ".txt");
  try { return await fs.readFile(cache, "utf8"); } catch {}
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const scheduled = Math.max(Date.now(), nextRequestAt); nextRequestAt = scheduled + 800;
      if (scheduled > Date.now()) await new Promise(resolve => setTimeout(resolve, scheduled - Date.now()));
      const response = await fetch(url, { method: fields ? "POST" : "GET", body: fields ? new URLSearchParams(fields) : undefined, signal: AbortSignal.timeout(60000) });
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after")) || 5 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, Math.min(seconds, 45) * 1000));
        throw Error(`HTTP 429 ${url}`);
      }
      if (!response.ok) throw Error(`HTTP ${response.status} ${url}`);
      const text = await response.text();
      await fs.writeFile(cache, text);
      return text;
    } catch (error) { last = error; }
  }
  throw last;
}

export async function pool(items, limit, worker) {
  const result = Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const index = next++; result[index] = await worker(items[index], index); } }));
  return result;
}

function gridArgs(html) {
  const match = html.match(/x-data="gridLoad\(([^]*?)\)"/);
  if (!match) return null;
  return JSON.parse(clean(match[1]));
}

async function apiItems(type, filters) {
  const result = []; let expected = null;
  for (let offset = 0; expected === null || result.length < expected; offset += 250) {
    const json = JSON.parse(await request(`${ORIGIN}/wp-admin/admin-ajax.php`, { action: `get_${type}`, lang: "en", limit: "250", offset: String(offset), ...filters }));
    expected = json.count ?? 0;
    if (!Array.isArray(json.items)) throw Error(`Invalid API result ${type}`);
    result.push(...json.items);
    if (!json.items.length) break;
  }
  if (expected !== result.length) throw Error(`Incomplete API coverage ${type}: ${result.length}/${expected}`);
  return result;
}

function pdfs(html) {
  return [...new Set([...html.matchAll(/href="([^"]+\.pdf(?:\?[^"]*)?)"/gi)].map(m => clean(m[1])))];
}

function parseTables(main) {
  return [...main.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match => {
    const rows = [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => clean(cell[1]))).filter(row => row.length);
    return { headings: rows[0] ?? [], rows: rows.slice(1) };
  });
}

function imageUrls(main) {
  const block = main.slice(main.indexOf('class="sn_main_product__images"'), main.indexOf("<h1"));
  const originals = [...block.matchAll(/(?:data-)?srcset="([^"]+)"/g)].map(m => clean(m[1])).filter(x => x.startsWith(ORIGIN) && !x.includes(" "));
  const normalized = new Map();
  for (const url of originals) { const key = url.replace(/\.webp$/, ""); if (!normalized.has(key) || url.endsWith(".webp")) normalized.set(key, url); }
  return [...normalized.values()];
}

function properties(main) {
  return [...main.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/g)].map(m => ({ label: clean(m[1].match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/)?.[1]), value: clean(m[1].match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/)?.[1]) })).filter(x => x.label && x.value);
}

const SCOPE = [
  "fittings/fittings-for-copper-pipe", "fittings/fittings-for-iron-pipe", "fittings/fittings-for-pe-x-pipe", "fittings/fittings-for-polyethylene-pipe", "fittings/fittings-for-multilayer-pipe",
  "valves/valves-and-taps", "valves/radiator-valves"
];

async function crawl() {
  const sections = await pool(SCOPE, 2, async scope => {
    const url = `${ORIGIN}/en/products/${scope}/`;
    const html = await request(url); const args = gridArgs(html);
    if (!args) throw Error(`Missing category API arguments: ${url}`);
    const families = await apiItems(args.type, args.filters);
    console.error(`${scope}: ${families.length} families`);
    return { scope, url, families };
  });
  const families = await pool(sections.flatMap(section => section.families.map(family => ({ ...family, scope: section.scope, scopeUrl: section.url }))), 2, async family => {
    const html = await request(family.link); const main = html.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? ""; const args = gridArgs(main);
    const forms = args ? await apiItems(args.type, args.filters) : [];
    const intro = main.split(/<h3[^>]*>\s*Product range/i)[0];
    return { ...family, sourceText: clean(intro), properties: properties(intro), documents: pdfs(html), forms };
  });
  const forms = await pool(families.flatMap(family => family.forms.map(form => ({ ...form, familyId: family.id, familyTitle: family.title, familyUrl: family.link, scope: family.scope }))), 2, async (form, index) => {
    const html = await request(form.link); const main = html.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? "";
    if (index % 25 === 0) console.error(`Product forms captured: ${index}`);
    return { ...form, tables: parseTables(main), images: imageUrls(main), documents: pdfs(html), sourceText: clean(main), properties: properties(main), htmlSha256: keyOf(html) };
  });
  const capture = { brand: "general-fittings", manufacturer: "General Fittings S.p.A.", sourceSite: ORIGIN, collectedAt: DATE, capturedAt: new Date().toISOString(), scope: SCOPE, sections, families, forms };
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "general-fittings-source.json"), JSON.stringify(capture, null, 2));
  console.error(JSON.stringify({ families: families.length, forms: forms.length, variants: forms.reduce((n, form) => n + (form.tables[0]?.rows.length ?? 0), 0), descriptions: [...new Set(forms.map(f => clean(f.content)))].length }));
}

if (process.argv.includes("--crawl")) await crawl();
