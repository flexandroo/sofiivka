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
assert.equal(products.length, 65, "Hunter catalog must retain 65 verified product families");
assert.equal(new Set(products.map(product => product.id)).size, products.length, "Hunter product IDs must be unique");
assert.equal(new Set(products.map(product => product.slug).filter(Boolean)).size, products.filter(product => product.slug).length, "Hunter slugs must be unique");
assert.equal(products.filter(product => product.images.length).length, 63, "Hunter local image coverage changed");
assert.equal(products.filter(product => product.images.length === 0).length, 2, "Hunter source pages without a bundled image changed");
assert.ok(products.every(product => product.brand === "Hunter"), "Hunter feed contains another brand");
assert.ok(products.every(product => product.price === 0 && product.availability === "unknown"), "Hunter price or stock must not be invented");
assert.ok(products.every(product => /^https:\/\/www\.hunterirrigation\.com\/en-metric\/irrigation-product\//.test(product.manufacturerUrl)), "Hunter provenance must stay on the official product catalogue");
assert.ok(products.every(product => product.sourceUrls.length === 1 && product.sourceUrls[0] === product.manufacturerUrl), "Hunter source URLs must be deterministic");
assert.ok(products.every(product => product.images.every(image => image.startsWith("/assets/products/hunter/"))), "Hunter product images must be local");

const imagePaths = [...new Set(products.flatMap(product => product.images))];
assert.equal(imagePaths.length, 63, "Hunter product images must not be reused between unrelated families");

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
