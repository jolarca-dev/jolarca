import { expect, test } from "@playwright/test";

/**
 * Category journey (GAP-P02): grid renders, server-side pagination
 * navigates, and the filter island rewrites the URL and re-renders the
 * filtered set. Runs against the seeded dev stack (26 electronics
 * listings → two pages at 24/page).
 */

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

test("category grid, pagination, and filters", async ({ page }) => {
  await seedConsentDecision(page);
  await page.goto("/en/c/electronics/electronics");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Electronics",
  );
  // 26 published electronics → first page capped at 24 cards.
  await expect(page.locator("main article")).toHaveCount(24);

  // Pagination: page 2 carries the remainder and marks page in the URL.
  await page.getByRole("link", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("main article")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "2", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  // Sort: cheapest first is the €11 bulk radio (featured items are €79).
  await page.getByLabel("Sort by").selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(page).not.toHaveURL(/page=/); // filters reset to page 1
  await expect(page.locator("main article").first()).toContainText("€11.00");

  // Seller facet: only the EE seller's featured speaker remains.
  await page.getByRole("checkbox", { name: /Tallinn Design/ }).check();
  await expect(page).toHaveURL(/sellers=tallinn-design-ou/);
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main article").first()).toContainText(
    "Bluetooth speaker",
  );
});
