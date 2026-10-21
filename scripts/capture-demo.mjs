// Records a short demo session of the public UI and saves screenshots.
//
//   DEMO_URL=https://demo.example.com OUT_DIR=docs node capture-demo.mjs
//
// Used by scripts/make-gif.sh and the "Demo capture" GitHub workflow.
// Every step is wrapped so one failed interaction never kills the capture.
// The pacing is deliberately slow so the GIF is easy to follow.

import { chromium } from "playwright";

const BASE = (process.env.DEMO_URL || "http://localhost:5173").replace(/\/$/, "");
const OUT = process.env.OUT_DIR || "docs";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(label, fn) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await fn();
      console.log("✓", label);
      return;
    } catch (err) {
      if (attempt === 2) {
        console.warn("✗", label, "-", err.message.split("\n")[0]);
      } else {
        console.warn("… retrying", label);
        await pause(3000);
      }
    }
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
    await pause(3000);
    await page.screenshot({ path: `${OUT}/01-listings.png` });
    // Show the content: slowly scroll through the feed and back.
    await page.mouse.wheel(0, 700);
    await pause(2500);
    await page.mouse.wheel(0, 700);
    await pause(2500);
    await page.mouse.wheel(0, -1400);
    await pause(2000);
  });

  await step("sort by profit", async () => {
    await page.locator("th", { hasText: "Profit €" }).first().click();
    // Wait for the sorted rows - a screenshot during loading shows nothing.
    await page.waitForFunction(
      () => {
        const row = document.querySelector("tbody tr");
        return row && !row.textContent.includes("Loading");
      },
      { timeout: 30000 },
    );
    await pause(3000);
    await page.screenshot({ path: `${OUT}/02-sorted.png` });
    await page.mouse.wheel(0, 600);
    await pause(2500);
    await page.mouse.wheel(0, -600);
    await pause(1500);
  });

  await step("filter makes", async () => {
    await page.locator("button", { hasText: "Make" }).first().click();
    await pause(1500);
    await page.locator("input[placeholder*='Search make']").fill("škoda");
    await pause(1500);
    await page.locator("input[type=checkbox]").first().check();
    await pause(1000);
    await page.locator("input[placeholder*='Search make']").fill("volkswagen");
    await pause(1500);
    await page.locator("input[type=checkbox]").first().check();
    await pause(1000);
    await page.keyboard.press("Escape"); // close the dropdown
    await pause(800);
    // Exact match: "Smart filter" also contains "Filter" and comes first.
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    // The filtered rows are only the selected makes.
    await page.waitForFunction(
      () => {
        const row = document.querySelector("tbody tr");
        return row && /koda|olkswagen/.test(row.textContent);
      },
      { timeout: 30000 },
    );
    await pause(3000);
    await page.screenshot({ path: `${OUT}/03-filtered.png` });
  });

  await step("car detail", async () => {
    await page.locator("tbody tr").first().click();
    await page.waitForSelector("text=Price analysis", { timeout: 15000 });
    await pause(4000);
    await page.screenshot({ path: `${OUT}/04-detail.png` });
    // Show the price breakdown and similar offers.
    await page.mouse.wheel(0, 600);
    await pause(3000);
    await page.mouse.wheel(0, 700);
    await pause(3000);
    await page.mouse.wheel(0, -1300);
    await pause(1500);
  });

  await step("calculator", async () => {
    await page.goto(`${BASE}/calculator`, { waitUntil: "networkidle" });
    await pause(2500);
    await page.locator("button", { hasText: "Estimate fair price" }).click();
    // First prediction after a deploy can be slow (model loads lazily).
    await page.waitForSelector("text=typical range", { timeout: 60000 });
    await pause(4000);
    await page.screenshot({ path: `${OUT}/05-calculator.png` });
    await page.mouse.wheel(0, 400);
    await pause(2500);
    await page.mouse.wheel(0, -400);
    await pause(1500);
  });
} finally {
  await context.close();
  await browser.close();
}

console.log("Demo captured to", OUT);
