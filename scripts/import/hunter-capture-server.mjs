import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const output = path.join(root, 'tmp', 'hunter-official-families.jsonl');
const port = Number(process.env.HUNTER_CAPTURE_PORT || 4189);
const page = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Hunter capture</title><form method="post" action="/ingest"><textarea name="payload" aria-label="Hunter data" rows="20" cols="100"></textarea><button type="submit">Save</button></form></html>`;

http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }
  if (request.method !== 'POST' || request.url !== '/ingest') {
    response.writeHead(404);
    response.end();
    return;
  }
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8_000_000) {
      response.writeHead(413);
      response.end('Too large');
      return;
    }
  }
  try {
    const payload = new URLSearchParams(body).get('payload');
    const items = JSON.parse(payload || 'null');
    if (!Array.isArray(items) || !items.every(item => item && typeof item.url === 'string' && Array.isArray(item.models))) {
      throw new Error('Invalid Hunter family batch');
    }
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.appendFile(output, items.map(item => `${JSON.stringify(item)}\n`).join(''), 'utf8');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<p>Saved ${items.length} families.</p><a href="/">Continue</a>`);
  } catch (error) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(String(error));
  }
}).listen(port, '127.0.0.1', () => console.log(`Hunter capture ready on http://127.0.0.1:${port}/`));
