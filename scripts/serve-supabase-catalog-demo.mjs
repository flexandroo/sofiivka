import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  PROJECT_ROOT,
  resolveLinkedDevProject,
  resolveProjectPublishableKey,
} from './catalog-db-utils.mjs';

const projectRef = process.argv.find(argument => argument.startsWith('--project-ref='))?.split('=').at(1) || '';
const port = Number(process.argv.find(argument => argument.startsWith('--port='))?.split('=').at(1) || 4174);
const configuredSource = process.argv.find(argument => argument.startsWith('--source='))?.split('=').at(1) || 'local';
const failureMode = process.argv.find(argument => argument.startsWith('--failure='))?.split('=').at(1) || '';
if (projectRef !== 'wfxcklglujgramasdzyr') throw new Error('The demo server only accepts the confirmed Sofievka DEV project.');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid demo server port.');
if (!['local', 'supabase'].includes(configuredSource)) throw new Error('Demo source must be local or supabase.');
if (failureMode && failureMode !== 'network') throw new Error('Supported failure mode: network.');
resolveLinkedDevProject(projectRef);
const publishableKey = resolveProjectPublishableKey(projectRef);
const supabaseUrl = failureMode === 'network' ? 'https://catalog-network-failure.invalid' : `https://${projectRef}.supabase.co`;
const publicConfigScript = `<script>window.SOFIEVKA_DEV_CATALOG_SOURCE=true;window.SOFIEVKA_CATALOG_CONFIG=Object.freeze(${JSON.stringify({
  source: configuredSource,
  environment: 'local-preview',
  supabase: { url: supabaseUrl, publishableKey, projectRef },
})});</script>`;
const supplierFeedPattern = /<script\b(?=[^>]*\bsrc=["'](?:[^"']*\/)?(?:products-data|termojet-products-data|wilo-products-data|grundfos-products-data|tekkhaus-products-data|tech-products-data|heating-brands-products-data|baxi-buderus-products-data)\.js[^"']*["'])[^>]*>\s*<\/script>\s*/gim;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webp': 'image/webp',
};

function pageFor(urlPath) {
  if (urlPath === '/') return 'index.html';
  if (urlPath === '/admin' || (urlPath.startsWith('/admin/') && !path.extname(urlPath))) return 'admin/index.html';
  let clean = urlPath.replace(/^\//, '').replace(/\/$/, '');
  if (clean === 'catalog/water-treatment' || clean.startsWith('catalog/water-treatment/')) {
    clean = clean.replace(/^catalog\/water-treatment/, 'catalog/water-supply/water-treatment');
  }
  const directoryIndex = path.join(clean, 'index.html');
  if (clean && fs.existsSync(path.join(PROJECT_ROOT, directoryIndex))) return directoryIndex;
  const legacyDirectoryIndex = clean.endsWith('.html') ? path.join(clean.slice(0, -5), 'index.html') : '';
  if (legacyDirectoryIndex && fs.existsSync(path.join(PROJECT_ROOT, legacyDirectoryIndex))) return legacyDirectoryIndex;
  if (clean.includes('.')) return clean;
  if (urlPath === '/brands') return 'brands.html';
  if (urlPath === '/catalog' || urlPath.startsWith('/catalog/')) return 'catalog.html';
  if (urlPath.startsWith('/brands/')) return 'brand.html';
  return `${clean}.html`;
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/catalog-runtime-config.js') {
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Sofievka-Catalog-Demo': 'supabase-scoped-dev',
    });
    response.end(publicConfigScript.replace(/^<script>|<\/script>$/g, ''));
    return;
  }
  const relativePath = pageFor(url.pathname);
  const absolutePath = path.resolve(PROJECT_ROOT, relativePath);
  if (!absolutePath.startsWith(`${PROJECT_ROOT}${path.sep}`) && absolutePath !== path.join(PROJECT_ROOT, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(absolutePath, (error, body) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const extension = path.extname(absolutePath).toLowerCase();
    const debugSource = url.searchParams.get('dataSource') || '';
    const scopedPreview = configuredSource === 'supabase' || debugSource === 'supabase' || debugSource === 'supabase-full';
    let html = extension === '.html' ? body.toString('utf8') : '';
    if (scopedPreview) html = html.replace(supplierFeedPattern, '');
    const output = extension === '.html'
      ? Buffer.from(html.replace(/<head>/i, `<head>${publicConfigScript}`))
      : body;
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Sofievka-Catalog-Demo': scopedPreview ? 'supabase-scoped-dev' : 'local-dev',
    });
    response.end(output);
  });
}).listen(port, '127.0.0.1', () => {
  const suffix = configuredSource === 'supabase' ? '' : '?dataSource=supabase';
  console.log(`Supabase catalogue demo: http://127.0.0.1:${port}/${suffix}`);
});
