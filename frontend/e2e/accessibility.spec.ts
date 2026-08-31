import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { SEEDED_CATEGORIES } from "./fixtures/product";

/**
 * Accessibility — every public page must pass axe-core against WCAG 2.2 AA.
 * Independent pages run in parallel; the product page test navigates in.
 * A violation list is formatted into the failure message so the audit trail
 * is actionable without re-running the scan.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scanPage(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}) — ${violation.help}: ` +
      violation.nodes.map((node) => node.target.join(" ")).join(" | "),
  );
  expect(
    violations,
    `axe found WCAG 2.2 AA violations:\n${violations.join("\n")}`,
  ).toHaveLength(0);
}

function seedConsentDecision(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      "jol_consent_v1",
      JSON.stringify({
        state: {
          choices: {
            necessary: true,
            analytics: false,
            marketing: false,
            preferences: false,
          },
          timestamp: new Date().toISOString(),
          version: 1,
        },
        version: 1,
      }),
    );
  });
}

test.describe.configure({ mode: "parallel" });

test.describe("All public pages pass axe-core (WCAG 2.2 AA)", () => {
  for (const route of [
    { name: "home", path: "/en" },
    {
      name: "category",
      path: `/en/c/${SEEDED_CATEGORIES[0].slug}/${SEEDED_CATEGORIES[0].slug}`,
    },
    { name: "search", path: "/en/search" },
    { name: "cart", path: "/en/cart" },
    { name: "seller storefront", path: "/en/sellers/vilnius-workshops-uab/" },
    { name: "funeral services", path: "/en/funeral-services" },
  ]) {
    test(`${route.name} has no violations`, async ({ page }) => {
      await seedConsentDecision(page);
      await page.goto(route.path);
      await scanPage(page);
    });
  }

  test("product detail has no violations", async ({ page }) => {
    await seedConsentDecision(page);
    // Category grid is GAP-P02 (loud notice, no cards) — enter the detail
    // page through the home featured rail instead.
    await page.goto("/en");
    await page
      .locator("main article")
      .first()
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/p\//);
    await scanPage(page);
  });

  test("checkout has no violations (lands where the gate sends guests)", async ({
    page,
  }) => {
    await seedConsentDecision(page);
    // Unauthenticated guests may be redirected — the rule is: whatever a
    // guest actually sees must be accessible.
    await page.goto("/en/checkout");
    await scanPage(page);
  });
});
