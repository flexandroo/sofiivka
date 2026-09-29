import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, ".cutover-test");
const buildScript = path.join(root, "scripts", "build-static-site.mjs");
const devRef = "wfxcklglujgramasdzyr";
const fakePublishableKey = "sb_publishable_cutover_qa_only";
const feedNames = [
  "products-data.js", "termojet-products-data.js", "wilo-products-data.js", "grundfos-products-data.js",
  "tekkhaus-products-data.js", "tech-products-data.js", "heating-brands-products-data.js", "baxi-buderus-products-data.js"
];

fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
fs.mkdirSync(testRoot, { recursive: true });

try {
  const local = runBuild(".cutover-test/local", {
    SOFIEVKA_CATALOG_SOURCE: "local",
    VERCEL_ENV: "production"
  });
  assert.equal(local.status, 0, local.stderr || local.stdout);
  const localManifest = json(".cutover-test/local/catalog-build-manifest.json");
  assert.equal(localManifest.source, "local");
  assert.equal(localManifest.removedFeedTags, 0);
  assert.equal(localManifest.supplierFeedFilesIncluded, true);
  feedNames.forEach(name => assert.equal(fs.existsSync(path.join(testRoot, "local", name)), true, `${name} missing from local build`));

  const preview = runBuild(".cutover-test/preview", {
    SOFIEVKA_CATALOG_SOURCE: "supabase",
    SUPABASE_URL: `https://${devRef}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: fakePublishableKey,
    SOFIEVKA_SUPABASE_PROJECT_REF: devRef,
    VERCEL_ENV: "preview"
  });
  assert.equal(preview.status, 0, preview.stderr || preview.stdout);
  const previewManifest = json(".cutover-test/preview/catalog-build-manifest.json");
  assert.equal(previewManifest.source, "supabase");
  assert.equal(previewManifest.projectRef, devRef);
  assert.ok(previewManifest.removedFeedTags > 0);
  assert.equal(previewManifest.supplierFeedFilesIncluded, false);
  feedNames.forEach(name => assert.equal(fs.existsSync(path.join(testRoot, "preview", name)), false, `${name} leaked into Supabase build`));

  const htmlFiles = fs.readdirSync(path.join(testRoot, "preview")).filter(name => name.endsWith(".html"));
  assert.equal(htmlFiles.length, previewManifest.htmlFiles);
  for (const name of htmlFiles) {
    const html = read(`.cutover-test/preview/${name}`);
    assert.match(html, /catalog-runtime-config\.js/);
    assert.doesNotMatch(html, /(?:products-data|termojet-products-data|wilo-products-data|grundfos-products-data|tekkhaus-products-data|tech-products-data|heating-brands-products-data|baxi-buderus-products-data)\.js/i);
    const configIndex = html.indexOf("catalog-runtime-config.js");
    const firstRuntimeIndex = [html.indexOf("catalog-data.js"), html.indexOf("page-shell.js"), html.indexOf("script.js")].filter(index => index >= 0).sort((a, b) => a - b)[0];
    if (firstRuntimeIndex != null) assert.ok(configIndex >= 0 && configIndex < firstRuntimeIndex, `${name} selects the source after runtime loading`);
  }

  const runtimeConfig = read(".cutover-test/preview/catalog-runtime-config.js");
  assert.match(runtimeConfig, /"source":"supabase"/);
  assert.match(runtimeConfig, new RegExp(devRef));
  assert.match(runtimeConfig, new RegExp(fakePublishableKey));
  assert.doesNotMatch(runtimeConfig, /sb_secret_|service[_-]?role|database[_-]?password/i);

  const missingConfig = runBuild(".cutover-test/missing", {
    SOFIEVKA_CATALOG_SOURCE: "supabase",
    VERCEL_ENV: "preview"
  }, ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SOFIEVKA_SUPABASE_PROJECT_REF"]);
  assert.notEqual(missingConfig.status, 0);
  assert.match(`${missingConfig.stderr}${missingConfig.stdout}`, /SUPABASE_URL is required/);

  const productionDev = runBuild(".cutover-test/production-dev", {
    SOFIEVKA_CATALOG_SOURCE: "supabase",
    SUPABASE_URL: `https://${devRef}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: fakePublishableKey,
    SOFIEVKA_SUPABASE_PROJECT_REF: devRef,
    SOFIEVKA_ALLOW_PRODUCTION_SUPABASE: "true",
    VERCEL_ENV: "production"
  });
  assert.notEqual(productionDev.status, 0);
  assert.match(`${productionDev.stderr}${productionDev.stdout}`, /DEV Supabase project is forbidden/);

  const bootstrap = read("catalog/data-source-bootstrap.js");
  assert.match(bootstrap, /SOFIEVKA_CATALOG_CONFIG/);
  assert.match(bootstrap, /sofievkaCatalogRemoteRequested/);
  assert.match(bootstrap, /configuration-error/);
  const dataSourceContract = read("catalog/data-source.mjs");
  const supabaseSource = read("catalog/supabase-data-source.mjs");
  const pageShell = read("page-shell.js");
  assert.match(dataSourceContract, /getProductsByIds/);
  assert.match(supabaseSource, /getProductsByIds/);
  assert.match(pageShell, /source\.getProductsByIds\(ids\)/);
  assert.match(pageShell, /stateIds\.length/);
  assert.match(pageShell, /sofievkaRegisterScopedProducts/);
  assert.match(read("catalog-ui.js"), /sofievkaRegisterScopedProducts\?\.\(currentProducts\)/);
  assert.doesNotMatch(pageShell, /source\.listProducts\(\{ productIds: ids/);

  console.log(JSON.stringify({
    status: "ok",
    localBuild: localManifest,
    previewBuild: previewManifest,
    htmlFilesChecked: htmlFiles.length,
    missingConfigRejected: true,
    productionDevProjectRejected: true,
    bulkLookupContract: true,
    stateHydrationContract: true,
    privilegedCredentialLeaks: 0
  }, null, 2));
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function runBuild(outputDirectory, extraEnvironment, unset = []) {
  const environment = { ...process.env, ...extraEnvironment };
  for (const name of unset) delete environment[name];
  return childProcess.spawnSync(process.execPath, [buildScript, `--output-dir=${outputDirectory}`, "--skip-assets"], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}
