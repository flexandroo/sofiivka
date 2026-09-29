import assert from "node:assert/strict";
import crypto from "node:crypto";
import { resolveLinkedDevProject, resolveProjectApiKeys, SupabaseRestClient } from "../scripts/catalog-db-utils.mjs";

const projectRef = "wfxcklglujgramasdzyr";
const project = resolveLinkedDevProject(projectRef);
const { publishableKey, serviceRoleKey } = resolveProjectApiKeys(projectRef);
const baseUrl = `https://${projectRef}.supabase.co`;
const runId = crypto.randomUUID();
const email = `admin-foundation-${runId}@example.invalid`;
const password = `${crypto.randomBytes(24).toString("base64url")}!Aa9`;
const serviceClient = new SupabaseRestClient({ projectRef, apiKey: serviceRoleKey });
let userId = null;
let accessToken = null;

async function authRequest(pathname, { method = "GET", key = publishableKey, token = key, body, allowFailure = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowFailure) throw new Error(`${method} ${pathname.split("?")[0]} failed (${response.status})`);
  return { response, payload };
}

async function authenticatedCount(table, filters = {}) {
  const query = new URLSearchParams({ select: "*", ...filters });
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: "HEAD",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "count=exact",
      Range: "0-0"
    },
    signal: AbortSignal.timeout(30_000)
  });
  assert.ok([200, 206].includes(response.status), `${table} count must be available to an active admin`);
  return Number((response.headers.get("content-range") || "").split("/").at(-1));
}

try {
  assert.equal(project.name, "sofievka");
  assert.equal(project.status, "ACTIVE_HEALTHY");

  const created = await authRequest("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: { email, password, email_confirm: true, user_metadata: { purpose: "admin-foundation-integration" } }
  });
  userId = created.payload?.id;
  assert.match(userId || "", /^[0-9a-f-]{36}$/i);

  await serviceClient.insert("admin_profiles", {
    user_id: userId,
    name: "Admin Foundation QA",
    role: "admin",
    active: true
  });

  const login = await authRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
  accessToken = login.payload?.access_token;
  assert.ok(accessToken);
  assert.ok(login.payload?.refresh_token);

  const restored = await authRequest("/auth/v1/user", { token: accessToken });
  assert.equal(restored.payload?.id, userId);

  const profileQuery = new URLSearchParams({ select: "user_id,name,role,active", user_id: `eq.${userId}`, limit: "1" });
  const profileResponse = await fetch(`${baseUrl}/rest/v1/admin_profiles?${profileQuery}`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000)
  });
  assert.equal(profileResponse.status, 200);
  const profiles = await profileResponse.json();
  assert.deepEqual(profiles.map(({ role, active }) => ({ role, active })), [{ role: "admin", active: true }]);

  const counts = {
    products: await authenticatedCount("products"),
    published: await authenticatedCount("products", { publication_status: "eq.published" }),
    noPrice: await authenticatedCount("products", { price_status: "eq.unknown" }),
    unknownInventory: await authenticatedCount("products", { inventory_status: "eq.unknown" }),
    categoryReviews: await authenticatedCount("category_mapping_reviews", { status: "eq.review" }),
    brands: await authenticatedCount("brands")
  };
  assert.deepEqual(counts, { products: 3215, published: 3214, noPrice: 2584, unknownInventory: 2555, categoryReviews: 29, brands: 36 });

  const logout = await authRequest("/auth/v1/logout", { method: "POST", token: accessToken });
  assert.ok([200, 204].includes(logout.response.status));
  const expired = await authRequest("/auth/v1/user", { token: accessToken, allowFailure: true });
  assert.ok([401, 403].includes(expired.response.status));

  console.log(JSON.stringify({
    status: "ok",
    project: { name: project.name, ref: project.ref, status: project.status },
    flows: ["password-login", "session-restore", "active-profile", "rls-dashboard", "logout", "expired-session"],
    counts,
    credentialsPersisted: false,
    productionChanged: false
  }));
} finally {
  if (userId) {
    await authRequest(`/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      key: serviceRoleKey,
      token: serviceRoleKey,
      allowFailure: true
    });
  }
}
