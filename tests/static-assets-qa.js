"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceFiles = [];
const collect = (directory, relative = "") => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (["assets", "tests", "tools", "tmp", "artifacts", "backups", "reports", "node_modules", ".vercel", ".git", ".agents", ".codex"].includes(entry.name)) continue;
      collect(path.join(directory, entry.name), childRelative);
    } else if (/\.(?:html|css|js)$/i.test(entry.name)) sourceFiles.push(childRelative);
  }
};
collect(root);
const assetPattern = /(?:src|href)=["'](\/[^"'?#]+\.(?:js|css|png|jpe?g|webp|svg|ico))["']|url\(["']?(\/[^)'"?#]+)["']?\)/gi;
const missing = [];
const duplicateScripts = [];
const legacyNavigationLinks = [];
const accountNavigationLinks = [];
let references = 0;

for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  if (["index.html", "script.js", "page-shell.js", "catalog-ui.js"].includes(file) && /catalog\.html\?category=/.test(source)) {
    legacyNavigationLinks.push(file);
  }
  if (["index.html", "brands.html", "script.js", "page-shell.js", "catalog-ui.js"].includes(file) && /(?:href=["']\/?account\.html|data-profile)/.test(source)) {
    accountNavigationLinks.push(file);
  }
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
assert.deepEqual(legacyNavigationLinks, [], `legacy category links remain in active navigation: ${JSON.stringify(legacyNavigationLinks)}`);
assert.deepEqual(accountNavigationLinks, [], `unfinished account remains in active navigation: ${JSON.stringify(accountNavigationLinks)}`);

const shellSource = fs.readFileSync(path.join(root, "page-shell.js"), "utf8");
assert.ok(shellSource.includes("Дані з цієї форми залишаються у браузері й не передаються магазину"), "checkout must disclose that the inactive form does not transmit data");
assert.ok(!shellSource.includes(">Надіслати замовлення</button>"), "inactive checkout must not claim to submit an order");
assert.ok(!shellSource.includes("Що ще не підключено в макеті"), "customer-facing payment copy must not mention a mockup");
assert.ok(!shellSource.includes("Редакційні заготовки"), "blog must not expose editorial placeholder copy");
assert.ok(!shellSource.includes("Майбутній формат кейсу"), "portfolio must not expose a future-case template");
assert.ok(!shellSource.includes("Структура майбутнього портфоліо"), "portfolio must not present placeholder structure as content");

console.log(JSON.stringify({ status: "ok", sourceFiles: sourceFiles.length, references, missingAssets: 0, duplicateScriptLoads: 0, legacyNavigationLinks: 0, accountNavigationLinks: 0 }, null, 2));
