import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireRuntime = process.argv.includes("--require-runtime");

const commandExists = command => {
  const probe = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(probe, [command], { cwd: root, stdio: "ignore" }).status === 0;
};

const checks = [
  "tests/supabase-schema-qa.js",
  "tests/supabase-client-qa.mjs",
  "tests/product-identity-audit.js"
];

for (const check of checks) {
  execFileSync(process.execPath, [path.join(root, check)], {
    cwd: root,
    stdio: "inherit"
  });
}

const runtime = {
  docker: commandExists("docker"),
  supabaseCli: commandExists("supabase"),
  psql: commandExists("psql")
};
const blockers = [];
if (!runtime.docker) blockers.push("Docker is unavailable for the preferred local Supabase stack");
if (!runtime.supabaseCli) blockers.push("Supabase CLI is not installed (npx may be used after network access is available)");

console.log(JSON.stringify({
  status: blockers.length ? "static-ready-runtime-blocked" : "runtime-prerequisites-present",
  runtime,
  blockers
}, null, 2));

if (requireRuntime && blockers.length) process.exitCode = 2;
