"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceFiles = fs.readdirSync(root)
  .filter(file => /\.(?:html|css|js)$/i.test(file))
  .filter(file => !file.startsWith("tests"));
const assetPattern = /(?:src|href)=["'](\/[^"'?#]+\.(?:js|css|png|jpe?g|webp|svg|ico))["']|url\(["']?(\/[^)'"?#]+)["']?\)/gi;
const missing = [];
const duplicateScripts = [];
let references = 0;

for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const seenScripts = new Set();
  for (const match of source.matchAll(assetPattern)) {
    const reference = match[1] || match[2];
    if (!reference || reference.startsWith("//")) continue;
    references += 1;
    const target = path.join(root, reference.replace(/^\//, "").replaceAll("/", path.sep));
    if (!fs.existsSync(target)) missing.push({ file, reference });
    if (/\.html$/i.test(file) && /\.js$/i.test(reference)) {
      if (seenScripts.has(reference)) duplicateScripts.push({ file, reference });
      seenScripts.add(reference);
    }
  }
}

assert.deepEqual(missing, [], `missing local assets: ${JSON.stringify(missing)}`);
assert.deepEqual(duplicateScripts, [], `duplicate script loads: ${JSON.stringify(duplicateScripts)}`);

console.log(JSON.stringify({ status: "ok", sourceFiles: sourceFiles.length, references, missingAssets: 0, duplicateScriptLoads: 0 }, null, 2));
