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
  "tekkhaus-products-data.js",
  "tech-products-data.js",
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
  treatment: "water-treatment",
  automation: "smart-home",
  plumbing: "plumbing",
  climate: "climate"
})) add(`/catalog?category=${source}`, routing.getCategoryPath(categoryId));

for (const [source, categoryId] of Object.entries({
  "/catalog/heating/gas-boilers": "gas-boilers",
  "/catalog/heating/hot-water-tanks": "hot-water-tanks",
  "/catalog/heating/solid-fuel-boilers": "solid-fuel-boilers",
  "/catalog/heating/pellet-boilers": "pellet-boilers",
  "/catalog/heating/heat-accumulators": "heat-accumulators",
  "/catalog/heating/pellet-burners": "pellet-burners",
  "/catalog/heating/boiler-accessories": "heating-components",
  "/catalog/heating/industrial-heating": "heat-generation",
  "/catalog/heating/valves": "heating-valves",
  "/catalog/water-supply/water-treatment": "water-treatment",
  "/catalog/water-supply/water-supply-components": "water-supply-components",
  "/catalog/water-supply/water-supply-components/pump-services": "pump-services",
  "/catalog/water-treatment/reverse-osmosis": "reverse-osmosis",
  "/catalog/water-treatment/flow-filters": "flow-filters",
  "/catalog/water-treatment/mainline-filters-housings": "mainline-filters-housings",
  "/catalog/water-treatment/mainline-cartridges": "mainline-cartridges",
  "/catalog/water-treatment/drinking-system-cartridges": "drinking-system-cartridges",
  "/catalog/water-treatment/filter-media": "filter-media",
  "/catalog/water-treatment/complex-treatment": "complex-treatment",
  "/catalog/water-treatment/water-softening": "water-softening",
  "/catalog/water-treatment/chlorine-odor-removal": "chlorine-odor-removal",
  "/catalog/water-treatment/mechanical-treatment": "mechanical-treatment"
})) add(source, routing.getCategoryPath(categoryId));

for (const category of taxonomy.descendantsOf("water-treatment").filter(item => taxonomy.childrenOf(item.id).length === 0)) {
  add(`/catalog/water-supply/water-treatment/${category.slug}`, routing.getCategoryPath(category.id));
}

for (const [type, categoryId] of Object.entries({
  "reverse-osmosis": "reverse-osmosis",
  "flow-filters": "flow-filters",
  "mainline-filters": "mainline-filters-housings",
  "water-filter-cartridges": "drinking-system-cartridges",
  "mainline-cartridges": "mainline-cartridges",
  "filter-media": "filter-media",
  horeca: "reverse-osmosis"
})) add(`/catalog/water-treatment?type=${type}`, routing.getCategoryPath(categoryId));

assert.equal(new Set(matrix.map(test => test.url)).size, matrix.length, "legacy URL matrix must not contain duplicate cases");

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
