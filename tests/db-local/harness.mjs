// Local migration test (npm run db:local:test): applies every repo migration to PGlite,
// then runs the CRM / write-consistency scenarios against real SQL.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./database.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const db = await createDatabase({ log: message => process.env.VERBOSE && console.log(message) });
if (process.argv[2] === "--migrate-only") {
  console.log(JSON.stringify({ status: "ok", migrations: "applied" }));
  process.exit(0);
}
const scenario = await import(path.resolve(here, process.argv[2] || "scenarios.mjs"));
await scenario.run(db);
