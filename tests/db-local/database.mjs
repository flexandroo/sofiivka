// Creates an in-process Postgres (PGlite) with minimal Supabase stubs and applies the repo migrations.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");
// Storage policies need Supabase's storage schema; they are covered by the remote pgTAP suites.
const SKIP = new Set(["20260928000400_storage.sql"]);

export async function createDatabase({ log = () => {} } = {}) {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema extensions;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith(".sql") && !SKIP.has(name)).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      log(`applied ${file}`);
    } catch (error) {
      const position = Number(error.position);
      const context = position ? `\n${sql.slice(Math.max(0, position - 300), position + 200)}` : "";
      throw new Error(`Migration ${file} failed: ${error.message}${context}`);
    }
  }
  return db;
}
