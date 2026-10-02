// Announces a new CRM order or lead in Telegram.
// Called by the database (trigger -> public._crm_notify_enqueue -> pg_net), never by browsers.
// Request: POST {kind: "order" | "lead" | "test", number, logId} with header x-crm-notify-secret.
// The function loads the summary itself with the service role, sends one Telegram message per chat id
// (Bot API sendMessage, HTML parse mode, every value escaped) and marks the crm_notification_log row.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   TELEGRAM_BOT_TOKEN  token from @BotFather
//   CRM_NOTIFY_SECRET   the same value as public.crm_notify_config.secret
//   ADMIN_BASE_URL      optional, default https://sofievka.vercel.app
// Deploy: supabase functions deploy crm-notify --no-verify-jwt
//
// Email is not sent: Supabase has no transactional mail for arbitrary messages and a mail provider
// would be a new service. The branch below stays disabled (EMAIL_ENABLED = false); recipients from
// the "emails" setting are reported as skipped in the log.
import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL_ENABLED = false;
const DEFAULT_ADMIN_BASE_URL = "https://sofievka.vercel.app";
const LEAD_TYPE: Record<string, string> = { contact: "Звернення", partner_spec: "Специфікація", callback: "Дзвінок" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function html(value: unknown) {
  return String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
}

function sameSecret(given: string, expected: string) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(amount)} грн`;
}

function clip(value: unknown, max = 300) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type Service = ReturnType<typeof createClient>;

async function orderMessage(service: Service, number: number, base: string) {
  const { data: order, error } = await service.from("crm_orders")
    .select("number, source, contact_name, contact_phone, contact_email, delivery_method, delivery_city, delivery_point, customer_comment, items_count, items_total, has_unpriced_items")
    .eq("number", number).maybeSingle();
  if (error) throw new Error(`Не вдалося прочитати замовлення: ${error.message}`);
  if (!order) throw new Error(`Замовлення №${number} не знайдено.`);
  const delivery = order.delivery_method === "pickup"
    ? `Самовивіз${order.delivery_point ? ` — ${html(order.delivery_point)}` : ""}`
    : `Перевізник${[order.delivery_city, order.delivery_point].filter(Boolean).length ? ` — ${html([order.delivery_city, order.delivery_point].filter(Boolean).join(", "))}` : ""}`;
  const total = Number(order.items_total || 0) > 0 ? money(order.items_total) : "ціна за запитом";
  return [
    `<b>Нове замовлення №${html(order.number)}</b>${order.source === "manual" ? " (створено вручну)" : ""}`,
    `${html(order.contact_name)}, ${html(order.contact_phone)}${order.contact_email ? `, ${html(order.contact_email)}` : ""}`,
    `Товарів: ${html(order.items_count)} · Сума: ${html(total)}${order.has_unpriced_items && Number(order.items_total || 0) > 0 ? " + позиції за запитом" : ""}`,
    `Отримання: ${delivery}`,
    order.customer_comment ? `Коментар: ${html(clip(order.customer_comment))}` : "",
    `<a href="${html(`${base}/admin/orders/${order.number}`)}">Відкрити в адмінці</a>`
  ].filter(Boolean).join("\n");
}

async function leadMessage(service: Service, number: number, base: string) {
  const { data: lead, error } = await service.from("crm_leads")
    .select("number, type, contact_name, contact_phone, contact_email, company, subject, message, page_url")
    .eq("number", number).maybeSingle();
  if (error) throw new Error(`Не вдалося прочитати заявку: ${error.message}`);
  if (!lead) throw new Error(`Заявку №${number} не знайдено.`);
  return [
    `<b>Нова заявка №${html(lead.number)}</b> · ${html(LEAD_TYPE[lead.type] || lead.type)}`,
    `${html(lead.contact_name)}, ${html(lead.contact_phone)}${lead.contact_email ? `, ${html(lead.contact_email)}` : ""}`,
    lead.company ? `Компанія: ${html(lead.company)}` : "",
    lead.subject ? `Тема: ${html(clip(lead.subject, 200))}` : "",
    lead.message ? `Повідомлення: ${html(clip(lead.message))}` : "",
    `<a href="${html(`${base}/admin/leads/${lead.number}`)}">Відкрити в адмінці</a>`
  ].filter(Boolean).join("\n");
}

async function sendTelegram(token: string, chatId: string, text: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    const body = await response.json().catch(() => ({}));
    return body?.ok ? { chatId, ok: true } : { chatId, ok: false, error: clip(body?.description || `HTTP ${response.status}`, 200) };
  } catch (error) {
    return { chatId, ok: false, error: clip((error as Error).message, 200) };
  }
}

Deno.serve(async request => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);
  const expected = Deno.env.get("CRM_NOTIFY_SECRET") || "";
  if (expected.length < 16 || !sameSecret(request.headers.get("x-crm-notify-secret") || "", expected)) {
    return json({ message: "Forbidden" }, 403);
  }

  let payload: { kind?: string; number?: number; logId?: number };
  try { payload = await request.json(); } catch { return json({ message: "Bad request" }, 400); }
  const kind = String(payload.kind || "");
  const number = Number(payload.number);
  const logId = Number(payload.logId) || null;
  if (!["order", "lead", "test"].includes(kind) || (kind !== "test" && !(Number.isInteger(number) && number > 0))) {
    return json({ message: "Bad request" }, 400);
  }

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const finish = async (status: "sent" | "error", reason: string, details: Record<string, unknown>) => {
    if (logId) {
      await service.from("crm_notification_log")
        .update({ status, reason: clip(reason, 500), details, updated_at: new Date().toISOString() })
        .eq("id", logId);
    }
    return json({ status, reason, ...details }, status === "sent" ? 200 : 500);
  };

  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const base = (Deno.env.get("ADMIN_BASE_URL") || DEFAULT_ADMIN_BASE_URL).replace(/\/+$/, "");
    const { data: setting } = await service.from("site_settings").select("value").eq("key", "notifications").maybeSingle();
    const chatIds: string[] = Array.isArray(setting?.value?.telegramChatIds) ? setting.value.telegramChatIds.map(String) : [];
    const emails: string[] = Array.isArray(setting?.value?.emails) ? setting.value.emails.map(String) : [];
    const email = EMAIL_ENABLED ? "not implemented" : (emails.length ? "disabled" : "none");

    if (!token) return finish("error", "Не задано секрет TELEGRAM_BOT_TOKEN.", { email });
    if (!chatIds.length) return finish("error", "Немає Telegram chat id в налаштуваннях.", { email });

    const text = kind === "test"
      ? `<b>Тестове повідомлення</b>\nСповіщення про замовлення й заявки з сайту працюють.\n<a href="${html(`${base}/admin/settings`)}">Налаштування</a>`
      : kind === "order" ? await orderMessage(service, number, base) : await leadMessage(service, number, base);
    const telegram = await Promise.all(chatIds.map(chatId => sendTelegram(token, chatId, text)));
    const failed = telegram.filter(result => !result.ok);
    if (failed.length === telegram.length) {
      return finish("error", `Telegram: ${failed.map(result => `${result.chatId}: ${result.error}`).join("; ")}`, { telegram, email });
    }
    return finish("sent", failed.length ? `Не доставлено: ${failed.map(result => result.chatId).join(", ")}` : "", { telegram, email });
  } catch (error) {
    return finish("error", (error as Error).message || "Невідома помилка.", {});
  }
});
