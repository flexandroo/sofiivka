import fs from "node:fs";
// Browser QA against tests/db-local/qa-server.mjs (local only).
import { createRequire } from "node:module";
const require = createRequire("/opt/npm-tools/node_modules/");
const { chromium } = require("playwright");

const base = "http://localhost:4300";
const out = process.env.QA_SHOTS || "tmp/qa-shots";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const log = [];

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", message => { if (message.type() === "error") errors.push(`${page.url()} :: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`${page.url()} :: ${error.message}`));
  return page;
}

const desktop = { width: 1366, height: 900 };
const mobile = { width: 390, height: 844 };
const page = await newPage(desktop);

// Seed cart from local catalogue data.
await page.goto(`${base}/catalog`, { waitUntil: "networkidle" });
const picks = await page.evaluate(async () => {
  const all = window.sofievkaProducts || [];
  const priced = all.filter(p => Number(p.price) > 0).slice(0, 2);
  const unpriced = all.filter(p => !(Number(p.price) > 0)).slice(0, 1);
  const chosen = [...priced, ...unpriced].map(p => ({ id: p.id, sku: p.sku, title: p.title, price: p.price }));
  await fetch("/__qa/seed-products", { method: "POST", body: JSON.stringify(chosen) });
  localStorage.setItem("sofievka-cart", JSON.stringify(Object.fromEntries(chosen.map((p, i) => [p.id, i + 1]))));
  return chosen;
});
log.push({ picks });

await page.goto(`${base}/cart`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/01-cart.png`, fullPage: true });
await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/02-checkout.png`, fullPage: true });

// Validation: bad phone blocks submit.
await page.fill('input[name="name"]', "Тарас Шевченко");
await page.fill('input[name="phone"]', "12");
await page.click("[data-checkout-submit]");
log.push({ invalidPhoneBlocked: await page.$eval('input[name="phone"]', input => !input.checkValidity()) });

await page.fill('input[name="phone"]', "067 555 44 33");
await page.fill('input[name="email"]', "taras@example.com");
await page.fill('input[name="city"]', "Житомир");
await page.fill('input[name="deliveryPoint"]', "НП №5");
await page.fill('textarea[name="comment"]', "Потрібен рахунок на ФОП");
await page.click("[data-checkout-submit]");
await page.waitForSelector(".checkout-success", { timeout: 15000 });
log.push({ orderSuccess: await page.textContent(".checkout-success h2"), cartAfter: await page.evaluate(() => localStorage.getItem("sofievka-cart")) });
await page.screenshot({ path: `${out}/03-checkout-success.png`, fullPage: true });

// Contact form.
await page.goto(`${base}/contact`, { waitUntil: "networkidle" });
await page.fill('[data-lead-form="contact"] input[name="name"]', "Оксана");
await page.fill('[data-lead-form="contact"] input[name="phone"]', "+380931112233");
await page.fill('[data-lead-form="contact"] textarea[name="message"]', "Чи сумісний насос UPS з моїм котлом?");
await page.click('[data-lead-form="contact"] button[type="submit"]');
await page.waitForSelector('[data-lead-form="contact"] .lead-success', { timeout: 15000 });
log.push({ contactLead: await page.textContent('[data-lead-form="contact"] .lead-success .page-kicker') });
await page.screenshot({ path: `${out}/04-contact.png`, fullPage: true });

// Partner specification.
await page.goto(`${base}/partnership`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/05-partnership-form.png`, fullPage: true });
await page.fill('[data-lead-form="partner_spec"] input[name="name"]', "Микола");
await page.fill('[data-lead-form="partner_spec"] input[name="phone"]', "0501234500");
await page.fill('[data-lead-form="partner_spec"] input[name="company"]', "ТОВ Теплобуд");
await page.fill('[data-lead-form="partner_spec"] input[name="subject"]', "Котельня школи №3");
await page.fill('[data-lead-form="partner_spec"] textarea[name="spec"]', "UPS-25-60 4\nMO550MECOSTD 2 шт термін 2 тижні\nBAXI-ECO5 1");
await page.click('[data-lead-form="partner_spec"] button[type="submit"]');
await page.waitForSelector('[data-lead-form="partner_spec"] .lead-success', { timeout: 15000 });
log.push({ specLead: await page.textContent('[data-lead-form="partner_spec"] .lead-success .page-kicker') });

// Homepage callback.
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.fill('[data-home-contact-form] input[name="name"]', "Петро");
await page.fill('[data-home-contact-form] input[name="phone"]', "0671234599");
await page.click('[data-home-contact-form] button[type="submit"]');
await page.waitForFunction(() => document.querySelector("[data-home-contact-status]")?.textContent.includes("№"), null, { timeout: 15000 });
log.push({ homeCallback: await page.textContent("[data-home-contact-status]") });

// Mobile checkout rendering.
const phone = await newPage(mobile);
await phone.goto(`${base}/catalog`, { waitUntil: "networkidle" });
await phone.evaluate(ids => localStorage.setItem("sofievka-cart", JSON.stringify(Object.fromEntries(ids.map(id => [id, 1])))), picks.map(p => p.id));
await phone.goto(`${base}/checkout`, { waitUntil: "networkidle" });
await phone.screenshot({ path: `${out}/06-checkout-mobile.png`, fullPage: true });
log.push({ mobileOverflow: await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });

// Admin as manager.
const admin = await newPage(desktop);
await admin.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
await admin.fill('input[name="email"]', "manager@qa.test");
await admin.fill('input[name="password"]', "qa-local-password");
await admin.click("[data-login-submit]");
await admin.waitForSelector(".admin-crm-overview", { timeout: 15000 });
await admin.screenshot({ path: `${out}/10-admin-dashboard.png`, fullPage: true });
log.push({ nav: await admin.$$eval(".admin-nav a span", spans => spans.map(span => span.textContent)) });

await admin.click('.admin-nav a[href="/admin/orders"]');
await admin.waitForSelector(".admin-crm-table--orders");
await admin.screenshot({ path: `${out}/11-admin-orders.png`, fullPage: true });
await admin.click(".admin-crm-table--orders .admin-crm-id");
await admin.waitForSelector("[data-crm-form]");
await admin.screenshot({ path: `${out}/12-admin-order.png`, fullPage: true });
log.push({ saveDisabledInitially: await admin.$eval('[data-crm-form] [type="submit"]', button => button.disabled) });
await admin.selectOption('[data-crm-form] select[name="status"]', "confirmed");
await admin.selectOption('[data-crm-form] select[name="assignedTo"]', { label: "Андрій Менеджер" });
await admin.fill('[data-crm-form] textarea[name="managerComment"]', "Погоджено телефоном, відправка завтра");
await admin.click('[data-crm-form] [type="submit"]');
await admin.waitForFunction(() => document.querySelector(".admin-status")?.textContent.includes("Підтверджено"), null, { timeout: 15000 });
await admin.fill("[data-crm-note] textarea", "Клієнт просить рахунок на ФОП");
await admin.click("[data-crm-note] button");
await admin.waitForFunction(() => document.querySelector("[data-crm-timeline]")?.textContent.includes("рахунок на ФОП"), null, { timeout: 15000 });
await admin.screenshot({ path: `${out}/13-admin-order-updated.png`, fullPage: true });
log.push({ timeline: await admin.$$eval("[data-crm-timeline] li header strong", items => items.map(item => item.textContent)) });

await admin.click('.admin-nav a[href="/admin/leads"]');
await admin.waitForSelector(".admin-crm-table--leads");
await admin.screenshot({ path: `${out}/14-admin-leads.png`, fullPage: true });
await admin.selectOption('[data-crm-filters] select[name="type"]', "partner_spec");
await admin.waitForFunction(() => location.search.includes("type=partner_spec"));
await admin.waitForSelector(".admin-crm-table--leads");
log.push({ specFilterRows: await admin.$$eval(".admin-crm-table--leads tbody tr", rows => rows.length) });
await admin.click(".admin-crm-table--leads .admin-crm-id");
await admin.waitForSelector("[data-copy-spec]");
await admin.screenshot({ path: `${out}/15-admin-lead.png`, fullPage: true });

await admin.click('.admin-nav a[href="/admin/customers"]');
await admin.waitForSelector(".admin-crm-table--customers");
await admin.screenshot({ path: `${out}/16-admin-customers.png`, fullPage: true });
await admin.click(".admin-crm-table--customers .admin-crm-id");
await admin.waitForSelector("[data-crm-form]");
await admin.screenshot({ path: `${out}/17-admin-customer.png`, fullPage: true });

// Mobile admin order view.
const adminPhone = await browser.newContext({ viewport: mobile });
const mobilePage = await adminPhone.newPage();
mobilePage.on("pageerror", error => errors.push(`mobile admin :: ${error.message}`));
await mobilePage.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
await mobilePage.fill('input[name="email"]', "owner@qa.test");
await mobilePage.fill('input[name="password"]', "qa-local-password");
await mobilePage.click("[data-login-submit]");
await mobilePage.waitForSelector(".admin-crm-overview");
await mobilePage.screenshot({ path: `${out}/20-admin-mobile-dashboard.png`, fullPage: true });
await mobilePage.goto(`${base}/admin/orders/1001`, { waitUntil: "networkidle" });
await mobilePage.waitForSelector("[data-crm-form]");
await mobilePage.screenshot({ path: `${out}/21-admin-mobile-order.png`, fullPage: true });
await mobilePage.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
await mobilePage.waitForSelector(".admin-crm-table--orders");
await mobilePage.screenshot({ path: `${out}/22-admin-mobile-orders.png`, fullPage: true });
log.push({ adminMobileOverflow: await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });

// Content manager must not see CRM.
const contentContext = await browser.newContext({ viewport: desktop });
const contentPage = await contentContext.newPage();
await contentPage.goto(`${base}/admin/login`, { waitUntil: "networkidle" });
await contentPage.fill('input[name="email"]', "content@qa.test");
await contentPage.fill('input[name="password"]', "qa-local-password");
await contentPage.click("[data-login-submit]");
await contentPage.waitForSelector(".admin-metrics");
log.push({ contentNav: await contentPage.$$eval(".admin-nav a span", spans => spans.map(span => span.textContent)) });
await contentPage.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
await contentPage.waitForSelector(".admin-state-panel");
log.push({ contentOrders: await contentPage.textContent(".admin-state-panel h1") });

console.log(JSON.stringify({ log, errors }, null, 2));
await browser.close();
