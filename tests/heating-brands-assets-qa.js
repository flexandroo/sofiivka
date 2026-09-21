"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "heating-brands-products-data.js"), "utf8"), context);

const products = context.window.sofievkaHeatingBrandsProducts;
const imagePaths = [...new Set(products.flatMap(product => product.images))];

(async () => {
  assert.equal(products.length, 864, "official heating-brand product count changed");
  assert.equal(imagePaths.length, 1938, "unique local image count changed");
  assert.equal(products.reduce((total, product) => total + product.images.length, 0), 4506, "image reference count changed");
  assert.equal(products.filter(product => product.images.length > 1).length, 748, "multi-image product count changed");

  const failed = [];
  let cursor = 0;
  async function inspect() {
    while (cursor < imagePaths.length) {
      const imagePath = imagePaths[cursor++];
      const absolutePath = path.join(root, imagePath.replace(/^\//, ""));
      try {
        const metadata = await sharp(absolutePath).metadata();
        if (!metadata.width || !metadata.height || metadata.format !== "webp") {
          failed.push({ imagePath, reason: "invalid WebP metadata" });
        }
      } catch (error) {
        failed.push({ imagePath, reason: error.message });
      }
    }
  }

  await Promise.all(Array.from({ length: 12 }, inspect));
  assert.deepEqual(failed, [], `invalid heating-brand images: ${JSON.stringify(failed)}`);
  const brandFolder = { Altep: "altep", FENIKS: "feniks", FOCUS: "focus" };
  assert.ok(products.every(product => product.images.every(image => image.startsWith(`/assets/products/${brandFolder[product.brand]}/`))), "product images must use the matching local brand folder");
  assert.ok(products.every(product => product.imageSources.length === product.images.length), "every local image must retain its official source URL");

  console.log(JSON.stringify({
    status: "ok",
    products: products.length,
    imageReferences: products.reduce((total, product) => total + product.images.length, 0),
    uniqueImages: imagePaths.length,
    decodedImages: imagePaths.length,
    multiImageProducts: products.filter(product => product.images.length > 1).length
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
