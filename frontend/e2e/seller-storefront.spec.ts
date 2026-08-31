import { expect, test } from "@playwright/test";

/**
 * Seller storefront journey (GAP-V05/V06): profile header with the
 * verification badge, Organization JSON-LD, paginated grid, contact
 * island, and 404 for unknown sellers. Runs against the seeded dev stack
 * (Vilnius Workshops UAB has 26 published listings → two pages).
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

test("seller storefront: header, JSON-LD, pagination, contact", async ({
  page,
}) => {
  await seedConsentDecision(page);
  await page.goto("/en/sellers/vilnius-workshops-uab/");

  // Profile header + verification badge.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vilnius Workshops UAB",
  );
  // The badge renders twice by design (header pill + status stat) — assert
  // presence, not uniqueness.
  await expect(page.getByText("Verified seller").first()).toBeVisible();
  await expect(page.getByText(/Vilnius/).first()).toBeVisible();

  // Organization JSON-LD in the document.
  const html = await page.content();
  expect(html).toContain('"@type":"Organization"');
  expect(html).toContain('"addressCountry":"LT"');

  // Grid: 24 of 26 on page one, pagination to page two.
  await expect(page.locator("main article")).toHaveCount(24);
  await page.getByRole("link", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("main article")).toHaveCount(2);

  // Contact island opens a dialog (anonymous → sign-in path).
  await page.goto("/en/sellers/vilnius-workshops-uab/");
  await page.getByRole("button", { name: "Contact seller" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // The header also carries a Sign in link — assert the dialog's own.
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Sign in" }),
  ).toBeVisible();
});

test("unknown seller is a localized 404", async ({ page }) => {
  await seedConsentDecision(page);
  const response = await page.goto("/en/sellers/does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: /not found/i }),
  ).toBeVisible();
});
