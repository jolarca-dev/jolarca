/**
 * Visual smoke test — headless Chromium audit of the home page styling.
 * Measures the checklist items (hero/header/grids/footer, fonts, CSS
 * payload) and captures desktop + mobile screenshots. Run from frontend/:
 *   node scripts/visual-smoke.mjs [url]
 */
import { chromium } from "@playwright/test";

const URL = process.argv[2] ?? "http://localhost:3000/en/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const css = [];
page.on("response", (r) => {
  if (r.url().includes("/_next/static/css")) {
    css.push({
      url: r.url().split("?")[0].split("/").pop(),
      status: r.status(),
    });
  }
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const measure = () =>
  page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const style = (el) => (el ? getComputedStyle(el) : null);
    const header = q("header");
    const hero = q('section[aria-label="Hero"]');
    const heroTitle = hero?.querySelector("h2");
    const catSection = q("#home-categories")?.closest("section");
    const catGrid = catSection?.querySelector("ul");
    const prodSection = q("#home-featured")?.closest("section");
    const prodGrid = prodSection?.querySelector("[class*='grid']");
    const btn = [...document.querySelectorAll("button, a")].find((el) =>
      /add to cart/i.test(el.textContent ?? ""),
    );
    return {
      htmlClass: document.documentElement.className,
      bodyFont: style(document.body)?.fontFamily,
      header: header
        ? {
            bg: style(header)?.backgroundColor,
            borderBottom: style(header)?.borderBottomWidth,
          }
        : null,
      logoFont: style(q("header a"))?.fontFamily,
      hero: hero
        ? {
            bg: style(hero)?.backgroundColor,
            title: heroTitle?.textContent,
            titleFont: style(heroTitle)?.fontFamily,
            subtitleColor: style(hero.querySelector("p"))?.color,
          }
        : null,
      catColumns: style(catGrid)?.gridTemplateColumns,
      prodColumns: style(prodGrid)?.gridTemplateColumns,
      addBtn: btn
        ? {
            bg: style(btn)?.backgroundColor,
            radius: style(btn)?.borderRadius,
            border: style(btn)?.borderTopWidth,
          }
        : null,
      footer: !!q("footer"),
      cssBytes: performance
        .getEntriesByType("resource")
        .filter((e) => e.name.includes(".css"))
        .reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0),
    };
  });

const desktop = await measure();
await page.screenshot({ path: "/tmp/home-desktop.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
const mobile = await measure();
await page.screenshot({ path: "/tmp/home-mobile.png", fullPage: true });

console.log(JSON.stringify({ css, desktop, mobile }, null, 2));
await browser.close();
