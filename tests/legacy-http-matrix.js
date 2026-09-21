"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const context = { window: {}, console, URLSearchParams, Intl };
context.window.window = context.window;
vm.createContext(context);

for (const file of [
  "brands-data.js",
  "products-data.js",
  "water-catalog-data.js",
  "termojet-products-data.js",
  "wilo-products-data.js",
  "grundfos-products-data.js",
  "catalog-data.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), "utf8"), context, { filename: file });
}

const { sofievkaTaxonomy: taxonomy, sofievkaCatalogRouting: routing } = context.window;
const matrix = [];
const add = (url, expected) => matrix.push({ url, expected });

add("/catalog.html", "/catalog");
for (const category of taxonomy.nodes) {
  const canonical = routing.getCategoryPath(category.id);
  add(`${canonical}.html`, canonical);
}

for (const [source, categoryId] of Object.entries({
  "/heating": "heating",
  "/water-supply": "water-supply",
  "/plumbing": "plumbing",
  "/climate": "climate"
})) add(source, routing.getCategoryPath(categoryId));

for (const [source, categoryId] of Object.entries({
  heating: "heating",
  water: "water-supply",
  plumbing: "plumbing",
  climate: "climate"
})) add(`/catalog?category=${source}`, routing.getCategoryPath(categoryId));

add("/catalog/water-treatment", routing.getCategoryPath("water-treatment"));
for (const category of taxonomy.childrenOf("water-treatment")) {
  add(`/catalog/water-treatment/${category.slug}`, routing.getCategoryPath(category.id));
}

assert.equal(matrix.length, 49, "legacy URL matrix must retain 49 cases");

(async () => {
  const results = [];
  for (const test of matrix) {
    const parsed = new URL(test.url, baseUrl);
    const response = await fetch(parsed, { redirect: "manual" });
    assert.ok(response.status >= 200 && response.status < 400, `${test.url}: HTTP ${response.status}`);

    const resolved = routing.resolveLocation(parsed.pathname, parsed.search, "catalog");
    assert.equal(resolved.redirectTo, test.expected, `${test.url}: wrong canonical target`);
    const canonical = routing.resolveLocation(test.expected, "", "catalog");
    assert.equal(canonical.legacy, false, `${test.url}: canonical target must not redirect again`);
    assert.equal(canonical.notFound, false, `${test.url}: canonical target must resolve`);
    results.push({ source: test.url, target: test.expected, status: response.status });
  }

  console.log(JSON.stringify({ status: "ok", cases: results.length, loops: 0, doubleRedirects: 0 }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
