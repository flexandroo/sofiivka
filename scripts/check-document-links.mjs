// Checks every product document link (manufacturer PDFs, local /assets files) and writes a
// Markdown report plus a CSV of the broken ones.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//     node scripts/check-document-links.mjs [--out=tmp/document-links-report.md]
//
// Reads product_documents through the public REST API (what the storefront can see), so it needs
// only the publishable key. Local paths are checked against the repository checkout.
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const SUPABASE_URL = String(args.url || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = args.key || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const OUT = path.resolve(ROOT, args.out || "tmp/document-links-report.md");
const CSV_OUT = OUT.replace(/\.md$/i, "") + "-broken.csv";
const SITE = "https://sofievka.vercel.app";
const TIMEOUT_MS = 30000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

if (!SUPABASE_URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or --url= --key=).");
  process.exit(1);
}

async function loadDocuments() {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const query = "select=url,title,active,products(legacy_id,slug,title,publication_status,brands(name))"
      + `&order=internal_id&limit=${pageSize}&offset=${offset}`;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/product_documents?${query}`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` }
    });
    if (!response.ok) throw new Error(`product_documents: HTTP ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.filter(row => row.active !== false && row.url);
}

function hostOf(url) {
  if (url.startsWith("/")) return "local (/assets)";
  try { return new URL(url).host; } catch { return "invalid"; }
}

async function request(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "*/*", ...(method === "GET" ? { range: "bytes=0-1023" } : {}) }
    });
    const result = {
      status: response.status,
      type: response.headers.get("content-type") || "",
      finalUrl: response.url
    };
    if (method === "GET") {
      const reader = response.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        result.head = value ? Buffer.from(value).subarray(0, 8).toString("latin1") : "";
        await reader.cancel().catch(() => {});
      }
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function checkLocal(url) {
  const file = path.join(ROOT, decodeURIComponent(url.split(/[?#]/)[0]));
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size > 0
      ? { ok: true, status: "file" }
      : { ok: false, status: "empty file" };
  } catch {
    return { ok: false, status: "missing in repo" };
  }
}

async function checkRemote(url) {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // GET with a small range: many manufacturer CDNs reject HEAD.
      const result = await request(url, "GET");
      const ok = result.status >= 200 && result.status < 300 || result.status === 206;
      const isHtml = /text\/html/i.test(result.type) && !/^%PDF/.test(result.head || "");
      if (ok && isHtml && /\.pdf(?:$|\?)/i.test(url)) {
        return { ok: false, status: `${result.status} HTML instead of a file`, type: result.type, finalUrl: result.finalUrl };
      }
      if (ok) return { ok: true, status: String(result.status), type: result.type, finalUrl: result.finalUrl };
      if (result.status >= 500 || result.status === 429) {
        lastError = String(result.status);
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        continue;
      }
      return { ok: false, status: String(result.status), type: result.type, finalUrl: result.finalUrl };
    } catch (error) {
      lastError = error.name === "AbortError" ? "timeout" : (error.cause?.code || error.message);
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
    }
  }
  return { ok: false, status: lastError || "error" };
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

function productLink(product) {
  return product?.slug ? `${SITE}/product/${product.slug}` : "";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const documents = await loadDocuments();
const byUrl = new Map();
for (const row of documents) {
  if (!byUrl.has(row.url)) byUrl.set(row.url, { url: row.url, host: hostOf(row.url), titles: new Set(), products: [] });
  const entry = byUrl.get(row.url);
  entry.titles.add(row.title || "");
  if (row.products) entry.products.push(row.products);
}
const entries = [...byUrl.values()];
console.log(`Documents: ${documents.length} links, ${entries.length} unique URLs`);

// Per host at most 3 requests at a time, so no single manufacturer site gets hammered.
const byHost = new Map();
for (const entry of entries) {
  if (!byHost.has(entry.host)) byHost.set(entry.host, []);
  byHost.get(entry.host).push(entry);
}
await Promise.all([...byHost.entries()].map(([host, list]) => mapLimit(list, host.startsWith("local") ? 20 : 3, async entry => {
  Object.assign(entry, entry.url.startsWith("/") ? await checkLocal(entry.url) : await checkRemote(entry.url));
})));

const broken = entries.filter(entry => !entry.ok);
const brokenLinks = broken.reduce((sum, entry) => sum + entry.products.length, 0);
const hostRows = [...byHost.entries()].map(([host, list]) => {
  const bad = list.filter(entry => !entry.ok);
  return { host, urls: list.length, links: list.reduce((s, e) => s + e.products.length, 0), bad: bad.length, badLinks: bad.reduce((s, e) => s + e.products.length, 0) };
}).sort((a, b) => b.links - a.links);

const lines = [];
lines.push(`# Перевірка посилань на документи товарів`);
lines.push("");
lines.push(`Дата: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Джерело: product_documents (PROD), лише ті, що бачить сайт.`);
lines.push("");
lines.push(`- Посилань на документи: **${documents.length}** (унікальних адрес: ${entries.length}).`);
lines.push(`- Битих адрес: **${broken.length}**, на них посилається **${brokenLinks}** записів у товарах.`);
lines.push("");
lines.push(`## За джерелами`);
lines.push("");
lines.push(`| Джерело | Адрес | Посилань | Битих адрес | Битих посилань |`);
lines.push(`| --- | ---: | ---: | ---: | ---: |`);
for (const row of hostRows) lines.push(`| ${row.host} | ${row.urls} | ${row.links} | ${row.bad} | ${row.badLinks} |`);
lines.push("");
if (broken.length) {
  lines.push(`## Биті адреси`);
  lines.push("");
  const grouped = new Map();
  for (const entry of broken) {
    if (!grouped.has(entry.host)) grouped.set(entry.host, []);
    grouped.get(entry.host).push(entry);
  }
  for (const [host, list] of grouped) {
    lines.push(`### ${host} (${list.length})`);
    lines.push("");
    lines.push(`| Статус | Документ | Товарів | Приклад товару |`);
    lines.push(`| --- | --- | ---: | --- |`);
    for (const entry of list.sort((a, b) => b.products.length - a.products.length)) {
      const sample = entry.products[0];
      const title = [...entry.titles][0] || "документ";
      const sampleText = sample ? `[${(sample.title || sample.legacy_id).replace(/\|/g, "/")}](${productLink(sample)})` : "";
      lines.push(`| ${entry.status} | [${title.replace(/\|/g, "/")}](${entry.url.startsWith("/") ? SITE + entry.url : entry.url}) | ${entry.products.length} | ${sampleText} |`);
    }
    lines.push("");
  }
}
if (broken.length) {
  lines.push(`Повний список битих посилань по кожному товару: ${path.basename(CSV_OUT)}.`);
  lines.push("");
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, lines.join("\n"));
const csv = ["status,host,document_url,document_title,product_legacy_id,product_title,brand,publication_status,product_url"];
for (const entry of broken) {
  for (const product of entry.products.length ? entry.products : [null]) {
    csv.push([entry.status, entry.host, entry.url, [...entry.titles][0], product?.legacy_id, product?.title,
      product?.brands?.name, product?.publication_status, productLink(product)].map(csvCell).join(","));
  }
}
await fs.writeFile(CSV_OUT, `${csv.join("\n")}\n`);
console.log(`Broken: ${broken.length} URLs / ${brokenLinks} links`);
for (const row of hostRows) console.log(`  ${row.host}: ${row.bad}/${row.urls} broken`);
console.log(`Report: ${path.relative(ROOT, OUT)}\nCSV: ${path.relative(ROOT, CSV_OUT)}`);
