"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "hunter-products-data.js"), "utf8"), context, { filename: "hunter-products-data.js" });

const products = context.window.sofievkaHunterProducts;
assert.equal(products.length, 962, "Hunter catalog must contain 962 unique manufacturer articles");
assert.equal(new Set(products.map(product => product.id)).size, products.length, "Hunter product IDs must be unique");
assert.equal(new Set(products.map(product => product.slug).filter(Boolean)).size, products.filter(product => product.slug).length, "Hunter slugs must be unique");
assert.equal(new Set(products.map(product => product.sku)).size, products.length, "Hunter manufacturer articles must be unique");
assert.ok(products.every(product => product.images.length > 0), "Every Hunter article must have a local image");
assert.ok(products.every(product => product.manufacturerCode === product.sku), "Hunter manufacturer codes must match article IDs");
assert.ok(products.every(product => product.brand === "Hunter"), "Hunter feed contains another brand");
assert.ok(products.every(product => product.price === 0 && product.availability === "unknown"), "Hunter price or stock must not be invented");
assert.ok(products.every(product => /^https:\/\/www\.hunterirrigation\.com\/en-metric\/(irrigation-product\/|products\/Tools)/.test(product.manufacturerUrl)), "Hunter provenance must stay on the official product catalogue");
assert.ok(products.every(product => product.sourceUrls.length === 1 && product.sourceUrls[0] === product.manufacturerUrl), "Hunter source URLs must be deterministic");
assert.ok(products.every(product => product.images.every(image => image.startsWith("/assets/products/hunter/"))), "Hunter product images must be local");
assert.ok(products.every(product => !/Water-Sense|SmartWaterMark/i.test(product.imageSourceUrl)), "Certification logos must not be used as product photos");

const source = JSON.parse(fs.readFileSync(path.join(root, "catalog", "hunter-official-source.json"), "utf8"));
assert.equal(source.families.length, 119, "Hunter manufacturer family inventory changed");
assert.equal(new Set(source.families.flatMap(family => family.models.map(model => model.sku))).size, products.length, "SKU feed differs from the official source capture");

const imagePaths = [...new Set(products.flatMap(product => product.images))];
assert.equal(imagePaths.length, 117, "Hunter series photo coverage changed");

const redirects = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"))
  .redirects.filter(redirect => redirect.source.startsWith("/product/hunter-"));
const productPaths = new Set(products.map(product => `/product/${product.id}`));
assert.equal(redirects.length, 0, "Obsolete Hunter family links must not be redirected");
assert.ok(productPaths.has("/product/hunter-pgp-04"), "Hunter SKU links must stay available");

for (const image of imagePaths) {
  const filePath = path.join(root, image.replace(/^\//, ""));
  assert.ok(fs.existsSync(filePath), `${image}: local Hunter image is missing`);
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length >= 30, `${image}: Hunter image is empty or truncated`);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", `${image}: Hunter image lacks RIFF header`);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${image}: Hunter image must be WebP`);
  const format = bytes.toString("ascii", 12, 16);
  let width = 0;
  let height = 0;
  if (format === "VP8X") {
    width = 1 + bytes.readUIntLE(24, 3);
    height = 1 + bytes.readUIntLE(27, 3);
  } else if (format === "VP8 ") {
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (format === "VP8L") {
    const dimensions = bytes.readUInt32LE(21);
    width = 1 + (dimensions & 0x3fff);
    height = 1 + ((dimensions >>> 14) & 0x3fff);
  } else {
    assert.fail(`${image}: unsupported WebP format ${format}`);
  }
  assert.ok(width > 0 && height > 0, `${image}: Hunter image dimensions are invalid`);
}

console.log(JSON.stringify({ status: "ok", products: products.length, images: imagePaths.length, officialSources: products.length }, null, 2));
