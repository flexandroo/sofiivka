import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["index.html", "brands.html", "page-shell.js", "script.js"];

for (const filename of files) {
  const target = path.join(root, filename);
  const before = fs.readFileSync(target, "utf8");
  const after = before
    .replace(/href="\/?([a-z0-9-]+)\.html(?=([?#"])) /gi, (match, route, suffix) => `href="/${route}${suffix} `)
    .replace(/href="\/?([a-z0-9-]+)\.html([?#][^"]*)?"/gi, (match, route, suffix = "") => `href="/${route}${suffix}"`)
    .replace(/\["([a-z0-9-]+)\.html"\s*,/gi, '["$1",')
    .replace(/window\.location\.href = "([a-z0-9-]+)\.html"/gi, 'window.location.href = "/$1"');
  fs.writeFileSync(target, after, "utf8");
}

console.log(JSON.stringify({ status: "ok", files: files.length }));
