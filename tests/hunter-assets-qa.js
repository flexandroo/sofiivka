"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

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

Promise.all(imagePaths.map(async image => {
  const filePath = path.join(root, image.replace(/^\//, ""));
  assert.ok(fs.existsSync(filePath), `${image}: local Hunter image is missing`);
  const metadata = await sharp(filePath).metadata();
  assert.equal(metadata.format, "webp", `${image}: Hunter image must be WebP`);
  assert.ok(metadata.width > 0 && metadata.height > 0, `${image}: Hunter image dimensions are invalid`);
})).then(() => {
  console.log(JSON.stringify({ status: "ok", products: products.length, images: imagePaths.length, officialSources: products.length }, null, 2));
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
