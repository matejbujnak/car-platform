// Records a short demo session of the public UI and saves screenshots.
//
//   DEMO_URL=https://demo.example.com OUT_DIR=docs node capture-demo.mjs
//
// Used by scripts/make-gif.sh and the "Demo capture" GitHub workflow.
// Every step is wrapped so one failed interaction never kills the capture.

import { chromium } from "playwright";

const BASE = (process.env.DEMO_URL || "http://localhost:5173").replace(/\/$/, "");
const OUT = process.env.OUT_DIR || "docs";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(label, fn) {
  try {
    await fn();
    console.log("✓", label);
  } catch (err) {
    console.warn("✗", label, "-", err.message.split("\n")[0]);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

try {
  await step("listings", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("tbody tr", { timeout: 20000 });
    await pause(1500);
    await page.screenshot({ path: `${OUT}/01-listings.png` });
  });

  await step("sort by profit", async () => {
    await page.locator("th", { hasText: "Profit €" }).first().click();
    await pause(1500);
    await page.screenshot({ path: `${OUT}/02-sorted.png` });
  });

  await step("filter makes", async () => {
    await page.locator("button", { hasText: "Make" }).first().click();
    await page.locator("input[placeholder*='Search']").fill("škoda");
    await pause(400);
    await page.locator("input[type=checkbox]").first().check();
    await page.locator("input[placeholder*='Search']").fill("volkswagen");
    await pause(400);
    await page.locator("input[type=checkbox]").first().check();
    await pause(300);
    await page.mouse.click(700, 60); // close the dropdown
    await page.locator("button", { hasText: "Filter" }).first().click();
    await pause(1500);
    await page.screenshot({ path: `${OUT}/03-filtered.png` });
  });

  await step("car detail", async () => {
    await page.locator("tbody tr").first().click();
    await page.waitForSelector("text=Price analysis", { timeout: 15000 });
    await pause(1500);
    await page.screenshot({ path: `${OUT}/04-detail.png` });
  });

  await step("calculator", async () => {
    await page.goto(`${BASE}/calculator`, { waitUntil: "networkidle" });
    await pause(800);
    await page.locator("button", { hasText: "Estimate fair price" }).click();
    // First prediction after a deploy can be slow (model loads lazily).
    await page.waitForSelector("text=typical range", { timeout: 60000 });
    await pause(1500);
    await page.screenshot({ path: `${OUT}/05-calculator.png` });
  });
} finally {
  await context.close();
  await browser.close();
}

console.log("Demo captured to", OUT);
