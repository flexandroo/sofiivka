"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const outputDirectory = path.resolve(__dirname, "..", "tmp", "tech-source");
fs.mkdirSync(outputDirectory, { recursive: true });

(async () => {
  const executablePath = process.env.QA_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, executablePath });
  const failures = [];
  const results = {};

  const inspect = async (name, viewport, run) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("console", message => { if (message.type() === "error" && !/Failed to load resource/i.test(message.text())) errors.push(`console: ${message.text()}`); });
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("response", response => {
      if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/i.test(response.url())) errors.push(`http ${response.status()}: ${response.url()}`);
    });
    page.on("requestfailed", request => {
      if (!/google|doubleclick|analytics/i.test(request.url())) errors.push(`request: ${request.url()} ${request.failure()?.errorText || "failed"}`);
    });
    await run(page);
    assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(" | ")}`);
    results[name] = { viewport, errors: 0 };
    await context.close();
  };

  try {
    await inspect("desktop", { width: 1440, height: 1000 }, async page => {
      await page.goto(`${baseUrl}/brands/tech`, { waitUntil: "networkidle" });
      assert.equal(await page.locator("h1").textContent(), "TECH");
      assert.match(await page.locator("main").innerText(), /257 товарів/);
      assert.match(await page.locator("main").innerText(), /Спосіб зв’язку/);
      assert.match(await page.locator("main").innerText(), /Кількість зон/);
      assert.equal(await page.locator(".product-card").count(), 24, "desktop TECH PLP initial batch changed");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "desktop TECH PLP overflows horizontally");
      const desktopImages = page.locator(".product-card img");
      for (let index = 0; index < await desktopImages.count(); index += 1) await desktopImages.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      assert.equal(await desktopImages.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true, "desktop TECH PLP contains broken images");

      await page.goto(`${baseUrl}/product?id=tech-l-5s`, { waitUntil: "networkidle" });
      assert.equal(await page.locator("h1").textContent(), "Контролер TECH L-5s");
      assert.equal(await page.getByRole("button", { name: /^Показати фото/ }).count(), 10, "TECH L-5s gallery must expose all 10 official images");
      const mainImage = page.locator(".pdp__media > img");
      const before = await mainImage.getAttribute("src");
      assert.equal(await mainImage.evaluate(image => getComputedStyle(image).objectFit), "contain", "TECH PDP image must fit its frame");
      await page.getByRole("button", { name: "Показати фото 2", exact: true }).click();
      assert.notEqual(await mainImage.getAttribute("src"), before, "TECH PDP gallery did not switch image");
      assert.match(await page.locator("#specifications").innerText(), /230В 50Гц/);
      assert.equal(await page.locator("#overview h3").count(), 6, "TECH PDP description section count changed");
      assert.ok(await page.locator("#documents a[href*='.pdf']").count() >= 1, "TECH PDP official documents are missing");
      assert.equal(await page.locator("#similar .product-card").count(), 4, "TECH related products count changed");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "desktop TECH PDP overflows horizontally");
      await page.screenshot({ path: path.join(outputDirectory, "qa-desktop-pdp.png"), fullPage: true });

      await page.goto(`${baseUrl}/search?q=TECH%20Sinum`, { waitUntil: "networkidle" });
      assert.ok(await page.locator(".product-card").count() > 0, "TECH Sinum search returned no product cards");
      assert.match(await page.locator("main").innerText(), /110 товарів/);
    });

    await inspect("mobile", { width: 390, height: 844 }, async page => {
      await page.goto(`${baseUrl}/brands/tech`, { waitUntil: "networkidle" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "mobile TECH PLP overflows horizontally");
      const mobileImages = page.locator(".product-card img");
      for (let index = 0; index < await mobileImages.count(); index += 1) await mobileImages.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      assert.equal(await mobileImages.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true, "mobile TECH PLP contains broken images");
      const filterButton = page.locator("[data-filter-toggle]");
      assert.equal(await filterButton.isVisible(), true, "mobile TECH filter button is not visible");
      await filterButton.click();
      assert.equal(await page.locator("[data-filter]").isVisible(), true, "mobile TECH filter drawer did not open");

      await page.goto(`${baseUrl}/product?id=tech-l-5s`, { waitUntil: "networkidle" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "mobile TECH PDP overflows horizontally");
      const fit = await page.evaluate(() => {
        const image = document.querySelector(".pdp__media > img");
        const frame = document.querySelector(".pdp__media");
        const imageBox = image.getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect();
        return { objectFit: getComputedStyle(image).objectFit, inside: imageBox.width <= frameBox.width + 1 && imageBox.height <= frameBox.height + 1, loaded: image.complete && image.naturalWidth > 0 };
      });
      assert.deepEqual(fit, { objectFit: "contain", inside: true, loaded: true }, "mobile TECH PDP image does not fit its frame");
      assert.equal(await page.getByRole("button", { name: /^Показати фото/ }).count(), 10, "mobile TECH PDP gallery image count changed");
      const relatedImages = page.locator("#similar .product-card img");
      for (let index = 0; index < await relatedImages.count(); index += 1) await relatedImages.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      assert.equal(await relatedImages.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true, "mobile TECH related products contain broken images");
      await page.screenshot({ path: path.join(outputDirectory, "qa-mobile-pdp.png"), fullPage: true });
    });
  } catch (error) {
    failures.push(error.stack || String(error));
  } finally {
    await browser.close();
  }

  assert.deepEqual(failures, [], failures.join("\n\n"));
  console.log(JSON.stringify({ status: "ok", ...results, screenshots: ["tmp/tech-source/qa-desktop-pdp.png", "tmp/tech-source/qa-mobile-pdp.png"] }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
