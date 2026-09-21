"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "baxi-buderus-products-data.js"), "utf8"), context);

const products = context.window.sofievkaBaxiBuderusProducts;
const baxi = products.filter(product => product.brand === "BAXI");
const buderus = products.filter(product => product.brand === "Buderus");
const imagePaths = [...new Set(products.flatMap(product => product.images))];

(async () => {
  assert.equal(products.length, 130, "BAXI/Buderus catalog product count changed");
  assert.equal(baxi.length, 93, "BAXI catalog must retain 93 official positions");
  assert.equal(buderus.length, 37, "Buderus domestic catalog must retain 37 official positions");
  assert.equal(imagePaths.length, 132, "unique local image count changed");
  assert.equal(products.reduce((total, product) => total + product.images.length, 0), 206, "image reference count changed");
  assert.equal(products.filter(product => product.images.length > 1).length, 47, "multi-image product coverage changed");
  assert.equal(baxi.filter(product => product.availability === "discontinued").length, 29, "BAXI discontinued labeling changed");
  assert.equal(buderus.filter(product => product.domestic === true).length, 37, "Buderus domestic scope marker is incomplete");
  assert.equal(baxi.filter(product => product.manufacturerCode).length, 0, "BAXI manufacturer codes must remain empty when the official source does not publish them");
  assert.equal(buderus.filter(product => product.manufacturerCode).length, 12, "confirmed Buderus article coverage changed");
  assert.equal(products.filter(product => product.ean).length, 0, "EAN values must remain empty when official sources do not publish them");
  assert.ok(products.every(product => product.images.length >= 1), "every product must have an official local image");
  assert.ok(products.every(product => product.imageSources.length === product.images.length), "every local image must retain one official source URL");
  assert.ok(baxi.every(product => product.images.every(image => image.startsWith("/assets/products/baxi/"))), "BAXI images must be local");
  assert.ok(buderus.every(product => product.images.every(image => image.startsWith("/assets/products/buderus/"))), "Buderus images must be local");
  assert.ok(baxi.every(product => product.imageSources.every(image => /^https:\/\/baxi\.ua\//.test(image.source))), "BAXI image provenance must use the official domain");
  assert.ok(buderus.every(product => product.imageSources.every(image => /^https:\/\/www\.buderus\.com\//.test(image.source))), "Buderus image provenance must use the official domain");
  assert.ok(baxi.every(product => /^https:\/\/baxi\.ua\//.test(product.manufacturerUrl)), "BAXI manufacturer URLs must stay official");
  assert.ok(buderus.every(product => /^https:\/\/www\.buderus\.com\/ua\/uk\/ocs\//.test(product.manufacturerUrl)), "Buderus manufacturer URLs must stay official");
  assert.ok(products.every(product => product.dateVerified === "2026-09-21" && product.sourceUrls.includes(product.manufacturerUrl)), "source provenance is incomplete");
  assert.ok(products.every(product => product.keyFeatures.length >= 5 && product.keyFeatures.length <= 8), "products must retain 5–8 confirmed key features");
  assert.ok(products.every(product => product.descriptionSections.length === 5 && product.fullDescription.length >= 500), "descriptions must be complete and structured");
  assert.ok(products.every(product => !/…$|\.\.\.$/.test(product.shortDescription) && !/…$|\.\.\.$/.test(product.fullDescription)), "descriptions must not end with ellipses");

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
  await Promise.all(Array.from({ length: 8 }, inspect));
  assert.deepEqual(failed, [], `invalid BAXI/Buderus images: ${JSON.stringify(failed)}`);

  console.log(JSON.stringify({
    status: "ok",
    products: products.length,
    baxi: baxi.length,
    buderusDomestic: buderus.length,
    imageReferences: products.reduce((total, product) => total + product.images.length, 0),
    uniqueImages: imagePaths.length,
    decodedImages: imagePaths.length,
    multiImageProducts: products.filter(product => product.images.length > 1).length
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
