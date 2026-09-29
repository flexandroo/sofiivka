"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
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
  "heating-brands-products-data.js",
  "baxi-buderus-products-data.js",
  "catalog-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const products = context.window.sofievkaCanonicalProducts;
const duplicateGroups = (values, normalize = value => value) => {
  const groups = new Map();
  values.forEach((value, index) => {
    const key = normalize(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index, value });
  });
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, values: items.map(item => item.value) }));
};
const normalized = value => String(value).normalize("NFKC").trim().toLocaleLowerCase("en-US");
const audit = field => {
  const values = products.map(product => product[field]);
  return {
    total: values.length,
    null: values.filter(value => value === null || value === undefined).length,
    empty: values.filter(value => typeof value === "string" && value.trim() === "").length,
    exactDuplicateGroups: duplicateGroups(values).length,
    caseInsensitiveCollisionGroups: duplicateGroups(values, value => String(value).toLocaleLowerCase("en-US")).length,
    trimCollisionGroups: duplicateGroups(values, value => String(value).trim()).length,
    normalizedCollisionGroups: duplicateGroups(values, normalized).length,
    leadingOrTrailingWhitespace: values.filter(value => typeof value === "string" && value !== value.trim()).length
  };
};

const result = {
  products: products.length,
  legacyId: audit("id"),
  sku: audit("sku"),
  slug: audit("slug")
};

assert.equal(products.length, 3215, "canonical product count changed");
for (const field of ["legacyId", "sku", "slug"]) {
  assert.equal(result[field].null, 0, `${field} contains null values`);
  assert.equal(result[field].empty, 0, `${field} contains empty values`);
  assert.equal(result[field].exactDuplicateGroups, 0, `${field} contains exact duplicates`);
  assert.equal(result[field].normalizedCollisionGroups, 0, `${field} contains case/trim/NFKC collisions`);
  assert.equal(result[field].leadingOrTrailingWhitespace, 0, `${field} contains surrounding whitespace`);
}

console.log(JSON.stringify(result, null, 2));
