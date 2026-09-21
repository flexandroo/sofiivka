import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const API = "https://shop.tekk.haus/wp-json/wc/store/v1/products";
const OUT_DIR = path.join(ROOT, "tmp", "tekkhaus-source");
const OUT_FILE = path.join(OUT_DIR, "products.json");

async function fetchPage(page) {
  const url = `${API}?per_page=100&page=${page}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Tekkhaus API ${response.status}: ${url}`);
  return {
    products: await response.json(),
    total: Number(response.headers.get("x-wp-total") || 0),
    pages: Number(response.headers.get("x-wp-totalpages") || 1)
  };
}

const first = await fetchPage(1);
const remaining = await Promise.all(
  Array.from({ length: Math.max(0, first.pages - 1) }, (_, index) => fetchPage(index + 2))
);
const products = [first, ...remaining].flatMap(page => page.products);

if (products.length !== first.total) {
  throw new Error(`Expected ${first.total} products, received ${products.length}`);
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(OUT_FILE, JSON.stringify({
  sourceUrl: API,
  fetchedAt: new Date().toISOString(),
  total: products.length,
  products
}, null, 2));

console.log(JSON.stringify({ source: API, total: products.length, pages: first.pages, output: OUT_FILE }, null, 2));
