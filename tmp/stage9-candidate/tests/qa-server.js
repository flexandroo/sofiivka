"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp"
};

function pageFor(urlPath) {
  if (urlPath === "/") return "index.html";
  if (urlPath === "/brands" || /^\/brands\/[^/]+$/.test(urlPath)) return urlPath === "/brands" ? "brands.html" : "brand.html";
  if (urlPath === "/catalog" || urlPath.startsWith("/catalog/")) return "catalog.html";
  const clean = urlPath.replace(/^\//, "").replace(/\/$/, "");
  return clean.includes(".") ? clean : `${clean}.html`;
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const relativePath = pageFor(url.pathname);
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (!absolutePath.startsWith(projectRoot + path.sep) && absolutePath !== path.join(projectRoot, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(absolutePath, (error, body) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(absolutePath).toLowerCase()] || "application/octet-stream" });
    response.end(body);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`QA server: http://127.0.0.1:${port}`);
});
