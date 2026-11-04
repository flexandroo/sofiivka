// Checks the live site in a real browser after a deploy: pages render, products load, the cart works, phones have no
// sideways scroll. The cart lives in this browser's own storage and no order or form is sent, so nothing reaches the shop.
// Needs Playwright: npm install --no-save playwright && npx playwright install chromium
import { chromium } from "playwright";

const BASE = String(process.env.SMOKE_BASE_URL || "https://sofievka.vercel.app").replace(/\/+$/, "");
const failures = [];
let checks = 0;
const check = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
};

const browser = await chromium.launch();

async function withPage({ width, height, isMobile = false }, name, run) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const scriptErrors = [];
  page.on("pageerror", error => scriptErrors.push(error.message));
  try {
    await run(page);
    check(scriptErrors.length === 0, `${name}: script errors: ${scriptErrors.slice(0, 3).join(" | ")}`);
  } catch (error) {
    check(false, `${name}: ${String(error.message).split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

const open = (page, path) => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
const cards = page => page.locator("[data-catalog-products] .product-card");
const noSidewaysScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const desktop = { width: 1366, height: 900 };
const phone = { width: 375, height: 812, isMobile: true };

for (const [size, label] of [[desktop, "desktop"], [phone, "phone"]]) {
  await withPage(size, `${label} home`, async page => {
    await open(page, "/");
    await page.locator("#home-sale-title").waitFor({ timeout: 20000 });
    check(await noSidewaysScroll(page), `${label} home: sideways scroll`);
  });

  await withPage(size, `${label} category`, async page => {
    await open(page, "/catalog/heating/heat-generation");
    await cards(page).first().waitFor({ timeout: 20000 });
    check(await cards(page).count() > 0, `${label} category: no products`);
    check(await page.locator(".ssr-page").count() === 0, `${label} category: the client did not replace the server content`);
    const heading = (await page.locator("h1").first().innerText()).trim();
    check(heading === "Котли та теплогенератори", `${label} category: heading is "${heading}"`);
    check(await page.locator("header").count() > 0, `${label} category: no header`);
    check(await noSidewaysScroll(page), `${label} category: sideways scroll`);
  });
}

await withPage(desktop, "catalog", async page => {
  await open(page, "/catalog");
  await cards(page).first().waitFor({ timeout: 20000 });
});

await withPage(desktop, "brand", async page => {
  await open(page, "/brands/grundfos");
  await cards(page).first().waitFor({ timeout: 20000 });
});

await withPage(desktop, "old catalogue address", async page => {
  await open(page, "/catalog/heating/gas-boilers");
  await page.waitForURL(/\/catalog\/heating\/heat-generation\/gas-boilers/, { timeout: 20000 });
});

await withPage(desktop, "search", async page => {
  await open(page, "/search?q=grundfos");
  await page.locator(".product-card").first().waitFor({ timeout: 20000 });
});

await withPage(desktop, "missing page", async page => {
  const response = await open(page, "/product/live-smoke-missing");
  check(response?.status() === 404, `missing page: status ${response?.status()}`);
  await page.locator(".not-found").waitFor({ timeout: 20000 });
});

// Product page and cart. The default order starts with products that have a price and are in stock, the only ones with
// a buy button, and taking the first one means a price change or a hidden product cannot fail this.
await withPage(desktop, "product and cart", async page => {
  await open(page, "/catalog");
  await cards(page).first().waitFor({ timeout: 20000 });
  await cards(page).first().locator('a[href^="/product/"]').first().click();
  await page.waitForURL(/\/product\//, { timeout: 20000 });
  const buy = page.locator("button.pdp-buy[data-add]").first();
  await buy.waitFor({ timeout: 20000 });
  check(await page.locator(".ssr-page").count() === 0, "product: the client did not replace the server content");
  await buy.click();
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("sofievka-cart")) || {}).length > 0, null, { timeout: 10000 });
  await open(page, "/cart");
  await page.locator("[data-page-root] main, [data-page-root]").first().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => /грн/.test(document.querySelector("main")?.innerText || ""), null, { timeout: 20000 });
});

// A product with a price and an unconfirmed stock status can be ordered, up to the checkout form. Nothing is submitted.
await withPage(desktop, "unconfirmed stock", async page => {
  await open(page, "/catalog/heating/heat-generation?sort=price-asc");
  const card = page.locator('[data-catalog-products] .product-card:has-text("Наявність уточнюйте"):has(button[data-add])').first();
  await card.waitFor({ timeout: 20000 });
  await card.locator("button[data-add]").click();
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("sofievka-cart")) || {}).length > 0, null, { timeout: 10000 });
  await open(page, "/checkout");
  await page.waitForFunction(() => /грн/.test(document.querySelector("main")?.innerText || ""), null, { timeout: 20000 });
  check(await page.locator("form").count() > 0, "unconfirmed stock: checkout has no form");
});

await browser.close();

if (failures.length) {
  console.error(`Live browser check failed on ${BASE}: ${failures.length} of ${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", suite: "live-browser-smoke", base: BASE, checks }));
