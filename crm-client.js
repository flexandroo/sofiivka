/* Storefront → CRM submissions.
 * Uses only the browser-safe publishable key and two public RPCs:
 *   crm_submit_order, crm_submit_lead.
 * A signed-in customer's order is sent with their access token (customer-account.js) so it lands in the
 * account history; if that token is rejected the order is sent anonymously instead of failing.
 * The server recalculates prices and validates everything; the browser sends ids and quantities only. */
(function () {
  "use strict";

  const config = window.SOFIEVKA_CATALOG_CONFIG;
  const supabase = config && config.supabase && config.supabase.url ? config.supabase : null;

  class CrmSubmitError extends Error {
    constructor(message, code) {
      super(message);
      this.name = "CrmSubmitError";
      this.code = code || "submit_error";
    }
  }

  async function call(name, payload, accessToken) {
    if (!supabase || !supabase.url || !supabase.publishableKey) {
      throw new CrmSubmitError("Онлайн-відправлення зараз недоступне. Зателефонуйте нам, будь ласка.", "unavailable");
    }
    let response;
    try {
      response = await fetch(`${supabase.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: supabase.publishableKey,
          Authorization: `Bearer ${accessToken || supabase.publishableKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ payload }),
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      throw new CrmSubmitError("Немає з’єднання. Перевірте інтернет і спробуйте ще раз.", "network");
    }
    // A rejected customer token (expired, signed out elsewhere) never blocks checkout: the request did not run.
    if (accessToken && response.status === 401) return call(name, payload, null);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // Validation messages from the database are written for customers (Ukrainian, no internals).
      const known = body && ["22023", "54000"].includes(body.code);
      throw new CrmSubmitError(known ? body.message : "Не вдалося надіслати. Спробуйте ще раз або зателефонуйте нам.", body && body.code);
    }
    return body;
  }

  window.sofievkaCrm = Object.freeze({
    available: Boolean(supabase),
    CrmSubmitError,
    submitOrder: async payload => {
      const account = window.sofievkaAccount;
      const accessToken = account && account.currentUser() ? await account.getFreshAccessToken().catch(() => null) : null;
      return call("crm_submit_order", payload, accessToken);
    },
    submitLead: payload => call("crm_submit_lead", payload),
    // "КОД 10 примітка" → { code, quantity, note }; one position per line.
    parseSpecLines(text) {
      return String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 200).map(line => {
        const match = line.match(/^(\S+)(?:\s+[x×*]?\s*(\d{1,6})(?:\s*(?:шт\.?|pcs)?)?)?(?:\s+(.*))?$/i);
        if (!match) return { code: line.slice(0, 120), quantity: null, note: null };
        return { code: match[1].slice(0, 120), quantity: match[2] ? Number(match[2]) : null, note: match[3] ? match[3].slice(0, 240) : null };
      });
    }
  });
})();
