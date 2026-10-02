// Creates a Supabase Auth account for a new staff member and attaches the admin profile.
// The caller's own token runs admin_add_staff, so every permission rule stays in SQL; the service
// role is used only to create the missing account (and to remove it again if attaching fails).
// Returns a one-time temporary password the owner passes to the new employee.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ message: "Сесію завершено. Увійдіть знову." }, 401);

  let payload: { email?: string; name?: string; role?: string };
  try { payload = await request.json(); } catch { return json({ message: "Некоректний запит." }, 400); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const args = { email: String(payload.email || ""), name: String(payload.name || ""), role: String(payload.role || "") };

  const first = await caller.rpc("admin_add_staff", args);
  if (first.error) return json({ message: first.error.message }, 400);
  if (first.data?.status !== "needs_account") return json(first.data);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const password = temporaryPassword();
  const created = await service.auth.admin.createUser({ email: first.data.email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    return json({ message: `Не вдалося створити обліковий запис: ${created.error?.message || "невідома помилка"}` }, 400);
  }

  const second = await caller.rpc("admin_add_staff", args);
  if (second.error || second.data?.status !== "added") {
    await service.auth.admin.deleteUser(created.data.user.id);
    return json({ message: second.error?.message || "Не вдалося додати працівника." }, 400);
  }
  return json({ status: "created", staff: second.data.staff, temporaryPassword: password });
});
