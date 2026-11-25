import assert from 'node:assert/strict';
import {
  SupabaseRestClient,
  resolveLinkedProject,
  resolveProjectApiKeys,
} from '../scripts/catalog-db-utils.mjs';

const projectRef = process.argv.find((argument) => argument.startsWith('--project-ref='))?.slice('--project-ref='.length);
if (!projectRef) throw new Error('--project-ref is required.');

const project = resolveLinkedProject(projectRef);
const keys = resolveProjectApiKeys(projectRef);
const service = new SupabaseRestClient({ projectRef, apiKey: keys.serviceRoleKey });
const publicClient = new SupabaseRestClient({ projectRef, apiKey: keys.publishableKey });

const [hunterBrand] = await service.fetchAll('brands', {
  select: 'internal_id,stable_id,name',
  query: { stable_id: 'eq.hunter' },
});
assert.equal(hunterBrand?.name, 'Hunter');

const hunterProducts = await service.fetchAll('products', {
  select: 'internal_id,legacy_id,publication_status,price_status,inventory_status',
  query: { brand_id: `eq.${hunterBrand.internal_id}` },
});
assert.equal(hunterProducts.length, 65);
assert.ok(hunterProducts.every((product) => product.publication_status === 'published'));
assert.ok(hunterProducts.every((product) => product.price_status === 'unknown'));
assert.ok(hunterProducts.every((product) => product.inventory_status === 'unknown'));

const productIds = hunterProducts.map((product) => product.internal_id);
const media = await service.fetchAll('product_media', {
  select: 'product_id,url,media_type,active',
  query: { product_id: `in.(${productIds.join(',')})` },
});
assert.equal(media.length, 63);
assert.ok(media.every((item) => item.media_type === 'image' && item.active));

const rpc = async (name, body) => (await publicClient.request(`/rest/v1/rpc/${name}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
})).payload;

const bootstrap = await rpc('get_catalog_bootstrap', {});
assert.equal(bootstrap.brandCounts.hunter, 65);
assert.equal(bootstrap.categoryCounts.irrigation, 65);
assert.equal(bootstrap.categoryCounts['irrigation-rotors'], 10);

const irrigation = await rpc('get_catalog_products', { scope_category: 'irrigation', page_size: 96 });
assert.equal(irrigation.total, 65);
assert.equal(irrigation.products.length, 65);
assert.ok(irrigation.products.every((product) => product.brandId === 'hunter'));

const rotors = await rpc('get_catalog_products', { scope_category: 'irrigation-rotors', page_size: 96 });
assert.equal(rotors.total, 10);

const pdp = await rpc('get_catalog_product', { legacy_id: 'hunter-pgp-ultra' });
assert.equal(pdp?.product?.id, 'hunter-pgp-ultra');
assert.equal(pdp.product.brandId, 'hunter');

const search = await rpc('search_catalog', {
  query_text: 'Hunter PGP Ultra',
  product_limit: 12,
  category_limit: 6,
  brand_limit: 6,
  series_limit: 6,
});
assert.ok(search.products.some((product) => product.id === 'hunter-pgp-ultra'));

console.log(JSON.stringify({
  status: 'ok',
  project: { ref: project.ref, name: project.name, environment: project.environment },
  products: hunterProducts.length,
  media: media.length,
  irrigationProducts: irrigation.total,
  rotorProducts: rotors.total,
  bootstrapTotalProducts: bootstrap.totalProducts,
  pdp: pdp.product.id,
  searchHit: 'hunter-pgp-ultra',
}, null, 2));
