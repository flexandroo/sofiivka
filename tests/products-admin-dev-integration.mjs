import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  resolveLinkedDevProject,
  resolveProjectApiKeys,
  SupabaseRestClient
} from "../scripts/catalog-db-utils.mjs";

const projectRef = "wfxcklglujgramasdzyr";
const expectedLegacyHash = "215e59e333ecf48b89e0a75971c3a6743cb05fa9a9f85dced9f9cb4e65e85733";
const project = resolveLinkedDevProject(projectRef);
const { publishableKey, serviceRoleKey } = resolveProjectApiKeys(projectRef);
const baseUrl = `https://${projectRef}.supabase.co`;
const service = new SupabaseRestClient({ projectRef, apiKey: serviceRoleKey });
const fixtures = [];
let testProduct = null;
let uploadedAsset = null;
const metrics = {};

async function timed(label, action) {
  const startedAt = performance.now();
  const result = await action();
  metrics[label] = Number((performance.now() - startedAt).toFixed(1));
  return result;
}

async function request(pathname, { method = "GET", token = publishableKey, key = publishableKey, body, allowFailure = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowFailure) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${payload?.message || JSON.stringify(payload)}`);
  }
  return { response, payload };
}

const rpc = (name, token, body = {}, allowFailure = false) => request(`/rest/v1/rpc/${name}`, {
  method: "POST", token, body, allowFailure
});

async function createUser(role = null) {
  const id = crypto.randomUUID();
  const email = `products-admin-${role || "unprofiled"}-${id}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString("base64url")}!Aa9`;
  const created = await request("/auth/v1/admin/users", {
    method: "POST", key: serviceRoleKey, token: serviceRoleKey,
    body: { email, password, email_confirm: true, user_metadata: { purpose: "products-admin-v1-integration" } }
  });
  const userId = created.payload?.id;
  assert.match(userId || "", /^[0-9a-f-]{36}$/i);
  fixtures.push(userId);
  if (role) await service.insert("admin_profiles", { user_id: userId, name: `QA ${role}`, role, active: true });
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  assert.ok(login.payload?.access_token);
  return { userId, token: login.payload.access_token };
}

async function storageRequest(pathname, { method = "POST", token, contentType, body, allowFailure = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(method === "POST" ? { "x-upsert": "false" } : {})
    },
    body,
    signal: AbortSignal.timeout(45_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowFailure) {
    throw new Error(`${method} ${pathname} failed (${response.status}): ${payload?.message || JSON.stringify(payload)}`);
  }
  return { response, payload };
}

function listParams(overrides = {}) {
  return {
    query_text: null,
    filter_category_id: null,
    filter_brand_id: null,
    filter_publication: null,
    filter_inventory: null,
    filter_price: null,
    sort_mode: "updated-desc",
    page_number: 1,
    page_size: 50,
    ...overrides
  };
}

async function cleanup() {
  if (uploadedAsset) {
    await storageRequest(`/storage/v1/object/${uploadedAsset.bucket}/${uploadedAsset.path}`, {
      method: "DELETE", token: serviceRoleKey, allowFailure: true
    });
  }
  if (testProduct?.internalId) {
    await service.deleteByValues("product_admin_audit", "product_id", [testProduct.internalId]).catch(() => {});
    await service.deleteByValues("products", "internal_id", [testProduct.internalId]).catch(() => {});
    const pointer = (await service.fetchAll("catalog_snapshot_pointer", { select: "snapshot_version", pageSize: 10 }))[0];
    if (pointer?.snapshot_version) {
      await service.patch("catalog_snapshot_releases", { snapshot_version: `eq.${pointer.snapshot_version}` }, {
        product_count: 3215,
        public_product_count: 3214,
        product_id_hash: expectedLegacyHash,
        updated_at: new Date().toISOString()
      });
    }
  }
  for (const userId of fixtures.reverse()) {
    await request(`/auth/v1/admin/users/${userId}`, {
      method: "DELETE", key: serviceRoleKey, token: serviceRoleKey, allowFailure: true
    });
  }
}

try {
  assert.equal(project.name, "sofievka");
  assert.equal(project.ref, projectRef);
  assert.equal(project.status, "ACTIVE_HEALTHY");

  const admin = await createUser("admin");
  const manager = await createUser("manager");
  const content = await createUser("content_manager");
  const unprofiled = await createUser();

  const anonDenied = await rpc("admin_list_products", publishableKey, listParams(), true);
  assert.ok([401, 403].includes(anonDenied.response.status));
  const unprofiledDenied = await rpc("admin_list_products", unprofiled.token, listParams(), true);
  assert.equal(unprofiledDenied.response.status, 403);

  const references = (await timed("referenceDataMs", () => rpc("admin_product_reference_data", admin.token))).payload;
  assert.equal(references.role, "admin");
  assert.equal(references.brands.length, 36);
  assert.equal(references.categories.length, 87);
  assert.equal(references.attributes.length, 64);
  assert.equal(references.categoryAttributes.length, 648);
  assert.ok(references.attributes.every(item => typeof item.filterable === "boolean"));
  for (const brand of ["Wilo", "Grundfos", "Ecosoft", "BAXI", "Buderus", "Termojet", "Altep", "TECH", "TEKK HAUS"]) {
    assert.ok(references.brands.some(item => item.name.toLowerCase() === brand.toLowerCase()), `Missing representative brand ${brand}`);
  }

  const page = (await timed("listPageMs", () => rpc("admin_list_products", admin.token, listParams()))).payload;
  assert.equal(page.total, 3215);
  assert.equal(page.pageSize, 50);
  assert.equal(page.products.length, 50);
  assert.equal(page.hasMore, true);
  const hidden = (await rpc("admin_list_products", admin.token, listParams({ filter_publication: "hidden" }))).payload;
  assert.equal(hidden.total, 1);
  const wilo = (await timed("searchWiloMs", () => rpc("admin_list_products", admin.token, listParams({ query_text: "Wilo", sort_mode: "title-asc" })))).payload;
  assert.ok(wilo.total > 0);
  const exactSku = (await rpc("admin_list_products", admin.token, listParams({ query_text: wilo.products[0].sku }))).payload;
  assert.ok(exactSku.products.some(product => product.sku === wilo.products[0].sku));

  const brandId = references.brands.find(item => item.name.toLowerCase() === "wilo").id;
  const seriesId = references.series.find(item => item.brandId === brandId)?.id;
  assert.ok(seriesId, "Wilo test fixture needs a normalized series");
  const incompatibleBrandId = references.brands.find(item => item.id !== brandId).id;
  const categoryId = references.categories.find(item => item.status === "active" && item.visibility !== "hidden").id;
  const sku = `QA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const created = (await rpc("admin_create_product", admin.token, {
    payload: { title: "QA Products Admin v1", sku, model: "QA-ADMIN-1", brandId, categoryId }
  })).payload;
  testProduct = { internalId: created.internalId, legacyId: created.legacyId };
  assert.match(created.legacyId, /^manual_[0-9a-f]{20}$/);

  let editor = (await timed("editorLoadMs", () => rpc("admin_get_product", admin.token, { target_legacy_id: testProduct.legacyId }))).payload;
  assert.equal(editor.product.publicationStatus, "draft");
  assert.equal(editor.product.legacyId, testProduct.legacyId);

  const managerRoleWrite = await request(`/rest/v1/admin_profiles?user_id=eq.${manager.userId}`, {
    method: "PATCH", token: manager.token, body: { role: "owner" }, allowFailure: true
  });
  assert.ok([204, 403].includes(managerRoleWrite.response.status));
  const managerProfile = await request(`/rest/v1/admin_profiles?select=role&user_id=eq.${manager.userId}`, { token: manager.token });
  assert.equal(managerProfile.payload?.[0]?.role, "manager");

  const immutableDenied = await rpc("admin_save_product", admin.token, {
    payload: { legacyId: testProduct.legacyId, newLegacyId: "changed-id", expectedUpdatedAt: editor.product.updatedAt,
      content: { description: "x", shortDescription: "x", fullDescription: "x", descriptionSections: [], badges: [], seoTitle: "x", seoDescription: "x" } }
  }, true);
  assert.ok(immutableDenied.response.status >= 400);
  assert.match(immutableDenied.payload?.message || "", /immutable/i);

  const contentPriceDenied = await rpc("admin_save_product", content.token, {
    payload: { legacyId: testProduct.legacyId, expectedUpdatedAt: editor.product.updatedAt,
      commercial: { amount: 100, oldAmount: null, currency: "UAH", priceStatus: "known", inventoryStatus: "in_stock" } }
  }, true);
  assert.equal(contentPriceDenied.response.status, 403);

  const attribute = references.attributes.find(item => ["string", "number", "boolean"].includes(item.valueType));
  const attributeValue = attribute.valueType === "number" ? 42 : attribute.valueType === "boolean" ? true : "QA value";
  const managerSave = (await rpc("admin_save_product", manager.token, {
    payload: {
      legacyId: testProduct.legacyId,
      expectedUpdatedAt: editor.product.updatedAt,
      core: {
        sku, slug: editor.product.slug, title: "QA Products Admin v1 · Published",
        shortTitle: "QA Products Admin v1", model: "QA-ADMIN-1", brandId, categoryId,
        seriesId, publicationStatus: "published"
      },
      commercial: { amount: 1999, oldAmount: 2499, currency: "UAH", priceStatus: "known", inventoryStatus: "in_stock" },
      attributes: [{ attributeId: attribute.id, value: attributeValue }]
    }
  })).payload;
  assert.match(managerSave.catalogVersion, /:admin:\d+$/);

  editor = (await rpc("admin_get_product", content.token, { target_legacy_id: testProduct.legacyId })).payload;
  const uploadedPath = `${testProduct.internalId}/qa-${crypto.randomUUID()}.png`;
  const pngPixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const uploaded = await storageRequest(`/storage/v1/object/product-media/${uploadedPath}`, {
    token: content.token, contentType: "image/png", body: pngPixel
  });
  assert.equal(uploaded.response.status, 200);
  uploadedAsset = { bucket: "product-media", path: uploadedPath };
  const uploadedUrl = `${baseUrl}/storage/v1/object/public/product-media/${uploadedPath}`;
  const contentSave = (await rpc("admin_save_product", content.token, {
    payload: {
      legacyId: testProduct.legacyId,
      expectedUpdatedAt: editor.product.updatedAt,
      content: {
        description: "Контрольований опис QA.", shortDescription: "Короткий опис QA.",
        fullDescription: "Повний опис QA Products Admin v1.", descriptionSections: [], badges: ["QA"],
        seoTitle: "QA Products Admin v1", seoDescription: "Перевірка редактора товару."
      },
      media: [
        { mediaType: "image", role: "primary", url: uploadedUrl, storagePath: uploadedPath, sourceUrl: null, altText: "QA uploaded product", sortOrder: 0, active: true },
        { mediaType: "image", role: "gallery", url: "https://example.com/qa-product.webp", storagePath: null, sourceUrl: "https://example.com/qa-product.webp", altText: "QA external product", sortOrder: 1, active: true }
      ],
      documents: [{ title: "QA datasheet", documentType: "datasheet", url: "https://example.com/qa-product.pdf", storagePath: null, sourceUrl: "https://example.com/qa-product.pdf", sortOrder: 0, active: true }]
    }
  })).payload;
  assert.notEqual(contentSave.catalogVersion, managerSave.catalogVersion);

  const publicProduct = (await rpc("get_catalog_product", publishableKey, { legacy_id: testProduct.legacyId })).payload;
  assert.equal(publicProduct.product.id, testProduct.legacyId);
  assert.equal(publicProduct.product.pricing.amount, 1999);
  assert.equal(publicProduct.product.description, "Контрольований опис QA.");
  assert.deepEqual(publicProduct.product.images, [uploadedUrl, "https://example.com/qa-product.webp"]);
  assert.equal(publicProduct.product.documents[0].title, "QA datasheet");
  const publicSearch = (await rpc("search_catalog", publishableKey, {
    query_text: sku, product_limit: 12, category_limit: 6, brand_limit: 6, series_limit: 6
  })).payload;
  assert.ok(publicSearch.products.some(product => product.id === testProduct.legacyId));

  const bulkCategory = (await rpc("admin_bulk_products", manager.token, {
    target_legacy_ids: [testProduct.legacyId], action_name: "category", action_value: categoryId
  })).payload;
  assert.equal(bulkCategory.affected, 1);
  editor = (await rpc("admin_get_product", manager.token, { target_legacy_id: testProduct.legacyId })).payload;
  assert.equal(editor.product.seriesId, seriesId, "Bulk category must preserve series");
  const incompatibleBulkBrand = await rpc("admin_bulk_products", manager.token, {
    target_legacy_ids: [testProduct.legacyId], action_name: "brand", action_value: incompatibleBrandId
  }, true);
  assert.ok(incompatibleBulkBrand.response.status >= 400);
  assert.match(incompatibleBulkBrand.payload?.message || "", /requires clearing or choosing series/i);
  editor = (await rpc("admin_get_product", manager.token, { target_legacy_id: testProduct.legacyId })).payload;
  assert.equal(editor.product.brandId, brandId);
  assert.equal(editor.product.seriesId, seriesId);
  const bulkBrand = (await rpc("admin_bulk_products", manager.token, {
    target_legacy_ids: [testProduct.legacyId], action_name: "brand", action_value: brandId
  })).payload;
  assert.equal(bulkBrand.affected, 1);
  await rpc("admin_bulk_products", manager.token, {
    target_legacy_ids: [testProduct.legacyId], action_name: "hide", action_value: null
  });
  assert.equal((await rpc("get_catalog_product", publishableKey, { legacy_id: testProduct.legacyId })).payload, null);
  await rpc("admin_bulk_products", manager.token, {
    target_legacy_ids: [testProduct.legacyId], action_name: "publish", action_value: null
  });
  assert.ok((await rpc("get_catalog_product", publishableKey, { legacy_id: testProduct.legacyId })).payload?.product);
  await rpc("admin_bulk_products", manager.token, {
    target_legacy_ids: [testProduct.legacyId], action_name: "archive", action_value: null
  });
  assert.equal((await rpc("get_catalog_product", publishableKey, { legacy_id: testProduct.legacyId })).payload, null);

  console.log(JSON.stringify({
    status: "ok",
    project: { name: project.name, ref: project.ref, status: project.status },
    list: { total: page.total, pageSize: page.pageSize, hidden: hidden.total, wiloResults: wilo.total },
    mutationFlows: ["create-draft", "manager-core-commercial-attributes", "content-media-documents-seo", "storage-upload", "external-media-preserved", "publish", "hide", "bulk-category", "bulk-brand", "archive"],
    security: ["anon-denied", "unprofiled-denied", "content-price-denied", "manager-role-denied", "legacy-id-immutable", "bulk-brand-series-guard"],
    publicProof: ["pdp", "search", "catalog-version"],
    performance: metrics,
    credentialsPersisted: false,
    productionChanged: false
  }, null, 2));
} finally {
  await cleanup();
  assert.equal(await service.count("products"), 3215);
  assert.equal(await service.count("products", { publication_status: "eq.published" }), 3214);
  assert.equal(await service.count("admin_profiles"), 0);
}
