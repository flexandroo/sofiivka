import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLinkedProject, resolveProjectPublishableKey } from "./catalog-db-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedEnvironment = process.argv.find(argument => argument.startsWith("--environment="))?.split("=").slice(1).join("=") || "preview";
if (!["preview", "production"].includes(requestedEnvironment)) throw new Error("--environment must be preview or production.");
const expectedProjectRef = requestedEnvironment === "production" ? "fkjarsouuchjiedrrblc" : "wfxcklglujgramasdzyr";
const requestedSource = process.argv.find(argument => argument.startsWith("--source="))?.split("=").slice(1).join("=") || "supabase";
if (!["local", "supabase"].includes(requestedSource)) throw new Error("--source must be local or supabase.");
const vercelProject = JSON.parse(fs.readFileSync(path.join(root, ".vercel", "project.json"), "utf8"));

if (vercelProject.projectName !== "sofievka") {
  throw new Error(`Refusing to configure Vercel project ${vercelProject.projectName || "(unknown)"}.`);
}

const supabaseProject = requestedSource === "supabase" ? resolveLinkedProject(expectedProjectRef) : null;
const values = new Map([["SOFIEVKA_CATALOG_SOURCE", requestedSource]]);
if (requestedSource === "supabase") {
  const publishableKey = resolveProjectPublishableKey(expectedProjectRef);
  values.set("SUPABASE_URL", `https://${expectedProjectRef}.supabase.co`);
  values.set("SUPABASE_PUBLISHABLE_KEY", publishableKey);
  values.set("SOFIEVKA_SUPABASE_PROJECT_REF", expectedProjectRef);
  if (requestedEnvironment === "production") values.set("SOFIEVKA_ALLOW_PRODUCTION_SUPABASE", "true");
}

function setVercelVariable(name, value) {
  if (!/^[A-Z0-9_]+$/.test(name)) throw new Error(`Unsafe environment variable name: ${name}`);
  const executable = process.platform === "win32" ? (process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe") : "npx";
  const argumentsList = process.platform === "win32"
    ? ["/d", "/s", "/c", `npx --yes vercel@latest env add ${name} ${requestedEnvironment} --force --yes --no-sensitive --no-color`]
    : ["--yes", "vercel@latest", "env", "add", name, requestedEnvironment, "--force", "--yes", "--no-sensitive", "--no-color"];
  const result = childProcess.spawnSync(executable, argumentsList, {
    cwd: root,
    input: `${value}\n`,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Could not set ${requestedEnvironment} variable ${name}; Vercel CLI output suppressed.`);
  }
}

for (const [name, value] of values) setVercelVariable(name, value);

console.log(JSON.stringify({
  status: "ok",
  vercelProject: vercelProject.projectName,
  environment: requestedEnvironment,
  source: requestedSource,
  supabaseProject: supabaseProject && {
    name: supabaseProject.name,
    ref: supabaseProject.ref,
    status: supabaseProject.status,
  },
  variables: [...values.keys()],
  productionChanged: requestedEnvironment === "production",
}, null, 2));
