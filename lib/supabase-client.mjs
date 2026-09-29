/**
 * Create the single browser Supabase client without coupling the current storefront
 * to Supabase yet. Pass `createClient` from @supabase/supabase-js at the future
 * integration boundary; never pass a secret/service-role key to browser code.
 */
export function createSofievkaSupabaseClient(createClient, config) {
  if (typeof createClient !== "function") {
    throw new TypeError("createClient must be provided by @supabase/supabase-js");
  }

  const url = String(config?.url || "").trim();
  const publishableKey = String(config?.publishableKey || "").trim();

  if (!isValidSupabaseUrl(url)) {
    throw new Error("A valid HTTPS Supabase URL (or local HTTP URL) is required");
  }
  if (!publishableKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is required");
  }
  if (isPrivilegedKey(publishableKey)) {
    throw new Error("A secret/service-role key must never be used in browser code");
  }

  return createClient(url, publishableKey, {
    db: { schema: "public" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

/**
 * Minimal browser-safe PostgREST client for the public catalogue adapter.
 * It deliberately exposes RPC only: the storefront cannot use it to wander
 * through private catalogue/import tables, and no auth session is required.
 */
export function createSofievkaSupabasePublicClient(config, fetchImplementation = globalThis.fetch) {
  const { url, publishableKey } = validatePublicConfig(config);
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A fetch implementation is required for the Supabase public client");
  }

  return Object.freeze({
    async rpc(functionName, parameters = {}, options = {}) {
      const name = String(functionName || "").trim();
      if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid Supabase RPC name");
      const startedAt = performanceNow();
      let response;
      try {
        response = await fetchImplementation(`${url}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${publishableKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "Accept-Encoding": "gzip, br"
          },
          body: JSON.stringify(parameters),
          signal: options.signal
        });
      } catch (error) {
        throw new Error(`Supabase catalogue request failed: ${error?.message || error}`, { cause: error });
      }

      const headersAt = performanceNow();
      const text = await response.text();
      const bodyAt = performanceNow();
      let payload = null;
      if (text) {
        try { payload = JSON.parse(text); }
        catch { payload = text; }
      }
      const parsedAt = performanceNow();
      if (!response.ok) {
        const detail = typeof payload === "object" && payload
          ? payload.message || payload.details || payload.hint
          : String(payload || response.statusText);
        throw new Error(`Supabase catalogue RPC ${name} failed (${response.status}): ${detail}`);
      }
      return Object.freeze({
        data: payload,
        metrics: Object.freeze({
          requestCount: 1,
          responseBytes: byteLength(text),
          contentLength: numericHeader(response.headers?.get?.("content-length")),
          contentEncoding: response.headers?.get?.("content-encoding") || "identity",
          headersMs: headersAt - startedAt,
          bodyReadMs: bodyAt - headersAt,
          parseMs: parsedAt - bodyAt,
          durationMs: parsedAt - startedAt
        })
      });
    }
  });
}

export function validatePublicConfig(config) {
  const url = String(config?.url || "").trim().replace(/\/+$/, "");
  const publishableKey = String(config?.publishableKey || "").trim();
  if (!isValidSupabaseUrl(url)) {
    throw new Error("A valid HTTPS Supabase URL (or local HTTP URL) is required");
  }
  if (!publishableKey) throw new Error("SUPABASE_PUBLISHABLE_KEY is required");
  if (isPrivilegedKey(publishableKey)) {
    throw new Error("A secret/service-role key must never be used in browser code");
  }
  return Object.freeze({ url, publishableKey });
}

const performanceNow = () => globalThis.performance?.now?.() ?? Date.now();
const byteLength = value => typeof TextEncoder === "function"
  ? new TextEncoder().encode(value).byteLength
  : String(value).length;
const numericHeader = value => value && Number.isFinite(Number(value)) ? Number(value) : null;

function isValidSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      || (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname));
  } catch {
    return false;
  }
}

function isPrivilegedKey(key) {
  if (key.startsWith("sb_secret_") || /service[_-]?role/i.test(key)) return true;

  const segments = key.split(".");
  if (segments.length !== 3) return false;
  try {
    const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}
