import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261002000800_staff_admin_v1.sql");
const edge = read("supabase/functions/admin-staff/index.ts");
const api = read("admin/admin-api.mjs");
const app = read("admin/admin.mjs");
const view = read("admin/admin-staff.mjs");

// Database: RPC-only, owner/admin only, no profile deletion, audit closed to clients.
assert.match(migration, /revoke all on table public\.admin_staff_audit from public, anon, authenticated/);
for (const fn of ["admin_list_staff()", "admin_add_staff(text, text, text)", "admin_update_staff(uuid, jsonb, timestamptz)"]) {
  const escaped = fn.replace(/[()]/g, "\\$&");
  assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon`));
  assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated`));
}
assert.doesNotMatch(migration, /delete from public\.admin_profiles/i, "access is switched off, never deleted");
assert.match(migration, /Власну роль і доступ/, "nobody changes their own role or access");

// Edge function: caller's token runs the SQL rules; service role only creates the account.
assert.match(edge, /caller\.rpc\("admin_add_staff"/);
assert.match(edge, /auth\.admin\.createUser/);
assert.match(edge, /auth\.admin\.deleteUser/, "a half-created account is removed again");
assert.doesNotMatch(api + view, /service_role|SERVICE_ROLE/i, "no service role in the browser");

// UI wiring.
assert.match(api, /"admin_list_staff"/);
assert.match(api, /\/functions\/v1\/admin-staff/);
assert.match(api, /\/auth\/v1\/user", \{ method: "PUT"/);
assert.match(app, /"\/admin\/users": \{[^}]*roles: \["owner", "admin"\]/);
assert.match(app, /"\/admin\/account": \{[^}]*roles: \[\.\.\.ROLES\]/);
assert.doesNotMatch(view, /innerHTML\s*=/);

console.log(JSON.stringify({ status: "ok", suite: "staff-qa" }));

// Merged stylesheets: every block closed (an unclosed @media silently swallows later rules).
for (const sheet of ["admin/admin.css", "pages.css", "homepage.css"]) {
  const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `${sheet}: unbalanced braces`);
}
