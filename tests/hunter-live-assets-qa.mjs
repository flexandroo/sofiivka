import assert from 'node:assert/strict';
import { loadCatalogRuntime } from '../scripts/catalog-db-utils.mjs';

const baseUrl = String(process.env.HUNTER_LIVE_BASE_URL || 'https://sofievka.vercel.app').replace(/\/+$/, '');
const products = loadCatalogRuntime().sofievkaCatalogSnapshot.products.filter((product) => product.brandId === 'hunter');
assert.equal(products.length, 962, 'Expected 962 Hunter articles');
assert.ok(products.every((product) => product.images.length), 'Every Hunter article needs an image');
const images = [...new Set(products.flatMap((product) => product.images))];
assert.equal(images.length, 117, 'Expected 117 distinct Hunter product photos');

let next = 0;
const failures = [];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < images.length) {
    const image = images[next++];
    try {
      const response = await fetch(`${baseUrl}${image}`, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (!response.ok || !String(response.headers.get('content-type')).includes('image/webp')) {
        failures.push({ image, status: response.status, contentType: response.headers.get('content-type') });
      }
    } catch (error) {
      failures.push({ image, error: String(error) });
    }
  }
}));
assert.deepEqual(failures, [], 'Hunter production photos must return HTTP 200 image/webp');
console.log(JSON.stringify({ status: 'ok', baseUrl, products: products.length, images: images.length }, null, 2));
