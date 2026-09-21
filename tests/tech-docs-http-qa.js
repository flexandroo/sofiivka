"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "tech-products-data.js"), "utf8"), context);
const products = context.window.sofievkaTechProducts;
const urls = [...new Set(products.flatMap(product => product.documents.map(document => document.url)))];

(async () => {
  const results = new Array(urls.length);
  let cursor = 0;
  async function inspect() {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];
      try {
        let response = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "Mozilla/5.0 TD-Sofiivka-QA/1.0" } });
        if (!response.ok || !/pdf/i.test(response.headers.get("content-type") || "")) {
          response = await fetch(url, { method: "GET", redirect: "follow", headers: { range: "bytes=0-31", "user-agent": "Mozilla/5.0 TD-Sofiivka-QA/1.0" } });
        }
        results[index] = { url, status: response.status, ok: response.ok, contentType: response.headers.get("content-type") || "" };
      } catch (error) {
        results[index] = { url, status: 0, ok: false, contentType: "", error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, inspect));
  const failed = results.filter(result => !result.ok || !/pdf|octet-stream/i.test(result.contentType));
  assert.deepEqual(failed, [], `unavailable TECH documents: ${JSON.stringify(failed)}`);
  console.log(JSON.stringify({ status: "ok", documents: results.length, working: results.length, failed: 0, contentTypes: [...new Set(results.map(result => result.contentType))] }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
