"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "tech-products-data.js"), "utf8"), context);
const products = context.window.sofievkaTechProducts;
const imagePaths = [...new Set(products.flatMap(product => product.images))];

(async () => {
  assert.equal(products.length, 257, "TECH product count changed");
  assert.equal(imagePaths.length, 1521, "TECH unique local image count changed");
  const failed = [];
  let cursor = 0;
  async function inspect() {
    while (cursor < imagePaths.length) {
      const imagePath = imagePaths[cursor++];
      const absolutePath = path.join(root, imagePath.replace(/^\//, ""));
      try {
        const metadata = await sharp(absolutePath).metadata();
        if (!metadata.width || !metadata.height || metadata.format !== "webp") failed.push({ imagePath, reason: "invalid metadata" });
      } catch (error) {
        failed.push({ imagePath, reason: error.message });
      }
    }
  }
  await Promise.all(Array.from({ length: 12 }, inspect));
  assert.deepEqual(failed, [], `invalid TECH images: ${JSON.stringify(failed)}`);
  const documents = [...new Set(products.flatMap(product => product.documents.map(document => document.url)))];
  assert.ok(documents.every(url => /^https:\/\/tech-controllers\.com\//.test(url)), "TECH documents must stay on the official domain");
  console.log(JSON.stringify({ status: "ok", products: products.length, imageReferences: products.reduce((total, product) => total + product.images.length, 0), uniqueImages: imagePaths.length, decodedImages: imagePaths.length, uniqueDocuments: documents.length }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
