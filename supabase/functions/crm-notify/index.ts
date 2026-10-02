// Announces a new CRM order or lead in Telegram and by email.
// Called by the database (trigger -> public._crm_notify_enqueue -> pg_net), never by browsers.
// Request: POST {kind: "order" | "lead" | "test", number, logId} with header x-crm-notify-secret.
// The function loads the summary itself with the service role, builds one message (every value
// escaped), sends it to each Telegram chat id (Bot API sendMessage, HTML parse mode) and as one
// email (Resend HTTP API, HTML + plain text) to the "emails" setting, then marks the
// crm_notification_log row. A channel without its secrets or recipients is skipped and named in the
// log; the row is "sent" when at least one channel delivered.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   TELEGRAM_BOT_TOKEN  token from @BotFather (optional when only email is used)
//   RESEND_API_KEY      Resend API key, re_... (optional: without it email is skipped)
//   NOTIFY_EMAIL_FROM   sender, e.g. "Софіївка <orders@your-domain>" on a domain verified in Resend,
//                       or "Софіївка <onboarding@resend.dev>" for tests (delivers only to the Resend
//                       account's own address)
//   CRM_NOTIFY_SECRET   the same value as public.crm_notify_config.secret
//   ADMIN_BASE_URL      optional, default https://sofievka.vercel.app
// Deploy: supabase functions deploy crm-notify --no-verify-jwt
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_ADMIN_BASE_URL = "https://sofievka.vercel.app";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
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

// Subject lines are plain text: one line, no control characters.
function subjectText(value: unknown, max = 80) {
  return clip(String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " "), max);
}

type Service = ReturnType<typeof createClient>;
// body: Telegram-flavoured HTML (<b>, <a href>, newlines), every customer value already escaped.
type Message = { subject: string; body: string };

async function orderMessage(service: Service, number: number, base: string): Promise<Message> {
  const { data: order, error } = await service.from("crm_orders")
    .select("number, source, contact_name, contact_phone, contact_email, delivery_method, delivery_city, delivery_point, customer_comment, items_count, items_total, has_unpriced_items")
    .eq("number", number).maybeSingle();
  if (error) throw new Error(`Не вдалося прочитати замовлення: ${error.message}`);
  if (!order) throw new Error(`Замовлення №${number} не знайдено.`);
  const delivery = order.delivery_method === "pickup"
    ? `Самовивіз${order.delivery_point ? ` — ${html(order.delivery_point)}` : ""}`
    : `Перевізник${[order.delivery_city, order.delivery_point].filter(Boolean).length ? ` — ${html([order.delivery_city, order.delivery_point].filter(Boolean).join(", "))}` : ""}`;
  const total = Number(order.items_total || 0) > 0 ? money(order.items_total) : "ціна за запитом";
  return {
    subject: subjectText(`Нове замовлення №${order.number} — ${order.contact_name}`),
    body: [
      `<b>Нове замовлення №${html(order.number)}</b>${order.source === "manual" ? " (створено вручну)" : ""}`,
      `${html(order.contact_name)}, ${html(order.contact_phone)}${order.contact_email ? `, ${html(order.contact_email)}` : ""}`,
      `Товарів: ${html(order.items_count)} · Сума: ${html(total)}${order.has_unpriced_items && Number(order.items_total || 0) > 0 ? " + позиції за запитом" : ""}`,
      `Отримання: ${delivery}`,
      order.customer_comment ? `Коментар: ${html(clip(order.customer_comment))}` : "",
      `<a href="${html(`${base}/admin/orders/${order.number}`)}">Відкрити в адмінці</a>`
    ].filter(Boolean).join("\n")
  };
}

async function leadMessage(service: Service, number: number, base: string): Promise<Message> {
  const { data: lead, error } = await service.from("crm_leads")
    .select("number, type, contact_name, contact_phone, contact_email, company, subject, message, page_url")
    .eq("number", number).maybeSingle();
  if (error) throw new Error(`Не вдалося прочитати заявку: ${error.message}`);
  if (!lead) throw new Error(`Заявку №${number} не знайдено.`);
  return {
    subject: subjectText(`Нова заявка №${lead.number} · ${LEAD_TYPE[lead.type] || lead.type} — ${lead.contact_name}`),
    body: [
      `<b>Нова заявка №${html(lead.number)}</b> · ${html(LEAD_TYPE[lead.type] || lead.type)}`,
      `${html(lead.contact_name)}, ${html(lead.contact_phone)}${lead.contact_email ? `, ${html(lead.contact_email)}` : ""}`,
      lead.company ? `Компанія: ${html(lead.company)}` : "",
      lead.subject ? `Тема: ${html(clip(lead.subject, 200))}` : "",
      lead.message ? `Повідомлення: ${html(clip(lead.message))}` : "",
      `<a href="${html(`${base}/admin/leads/${lead.number}`)}">Відкрити в адмінці</a>`
    ].filter(Boolean).join("\n")
  };
}

function testMessage(base: string): Message {
  return {
    subject: "Тестове повідомлення — сповіщення сайту",
    body: `<b>Тестове повідомлення</b>\nСповіщення про замовлення й заявки з сайту працюють.\n<a href="${html(`${base}/admin/settings`)}">Налаштування</a>`
  };
}

// Email versions of the same message: the HTML keeps the markup (newlines become <br>), the plain
// text drops it and spells links out as "label: url".
function emailHtml(body: string) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"></head>`
    + `<body style="margin:0;padding:24px 12px;background:#f4f4f1;color:#202020;font-family:Arial,Helvetica,sans-serif">`
    + `<div style="max-width:560px;margin:0 auto;padding:22px 24px;border:1px solid #dedede;border-radius:12px;background:#ffffff;font-size:15px;line-height:1.6">`
    + body.split("\n").join("<br>\n").replace(/<a href=/g, '<a style="color:#202020;font-weight:700" href=')
    + `</div><p style="max-width:560px;margin:12px auto 0;color:#77756f;font-size:12px">Автоматичне сповіщення сайту ТД «Софіївка».</p></body></html>`;
}

function emailText(body: string) {
  return body
    .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
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

// One email to every recipient (they are shop staff). The log id is the idempotency key, so a retried
// request for the same log row never sends a second copy.
async function sendEmail(apiKey: string, from: string, to: string[], message: Message, logId: number | null) {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(logId ? { "Idempotency-Key": `crm-notify-${logId}` } : {})
      },
      body: JSON.stringify({ from, to, subject: message.subject, html: emailHtml(message.body), text: emailText(message.body) })
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body?.id
      ? { ok: true, recipients: to.length, id: String(body.id) }
      : { ok: false, recipients: to.length, error: clip(body?.message || body?.error || `HTTP ${response.status}`, 200) };
  } catch (error) {
    return { ok: false, recipients: to.length, error: clip((error as Error).message, 200) };
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
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const emailFrom = (Deno.env.get("NOTIFY_EMAIL_FROM") || "").trim();
    const base = (Deno.env.get("ADMIN_BASE_URL") || DEFAULT_ADMIN_BASE_URL).replace(/\/+$/, "");
    const { data: setting } = await service.from("site_settings").select("value").eq("key", "notifications").maybeSingle();
    const chatIds: string[] = Array.isArray(setting?.value?.telegramChatIds) ? setting.value.telegramChatIds.map(String) : [];
    const emails: string[] = (Array.isArray(setting?.value?.emails) ? setting.value.emails.map(String) : [])
      .filter((address: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address));

    // Which channels can run; a channel with recipients but no secrets is skipped and explained.
    const skipped: string[] = [];
    if (chatIds.length && !token) skipped.push("Telegram пропущено: не задано секрет TELEGRAM_BOT_TOKEN.");
    if (emails.length && !(resendKey && emailFrom)) skipped.push("Email пропущено: не задано секрети RESEND_API_KEY і NOTIFY_EMAIL_FROM.");
    const useTelegram = Boolean(token && chatIds.length);
    const useEmail = Boolean(resendKey && emailFrom && emails.length);
    const channelState = (recipients: number, active: boolean) => (recipients ? (active ? "pending" : "skipped") : "none");
    if (!useTelegram && !useEmail) {
      return finish("error", skipped.join(" ") || "Немає отримувачів у налаштуваннях.", {
        telegram: channelState(chatIds.length, false), email: channelState(emails.length, false)
      });
    }

    const message = kind === "test" ? testMessage(base)
      : kind === "order" ? await orderMessage(service, number, base) : await leadMessage(service, number, base);
    const [telegram, email] = await Promise.all([
      useTelegram ? Promise.all(chatIds.map(chatId => sendTelegram(token, chatId, message.body))) : Promise.resolve(null),
      useEmail ? sendEmail(resendKey, emailFrom, emails, message, logId) : Promise.resolve(null)
    ]);
    const details = {
      telegram: telegram ?? channelState(chatIds.length, false),
      email: email ?? channelState(emails.length, false)
    };
    const failedChats = (telegram || []).filter(result => !result.ok);
    const delivered = (telegram || []).length - failedChats.length + (email?.ok ? 1 : 0);
    const problems = [
      ...failedChats.map(result => `Telegram ${result.chatId}: ${result.error}`),
      ...(email && !email.ok ? [`Email: ${email.error}`] : []),
      ...skipped
    ];
    if (!delivered) return finish("error", problems.join("; "), details);
    return finish("sent", problems.length ? `Не доставлено: ${problems.join("; ")}` : "", details);
  } catch (error) {
    return finish("error", (error as Error).message || "Невідома помилка.", {});
  }
});
