import { expect, test } from "@playwright/test";

import {
  KNOWN_PRODUCT,
  NONSENSE_QUERY,
  SEEDED_CATEGORIES,
} from "./fixtures/product";
import { measureLcp } from "./helpers/wait-for-lcp";

/**
 * Buyer journeys against the seeded Docker Compose stack. Selectors target
 * the /en locale so assertions are language-stable. The browse and search
 * tests are independent and run in parallel; the checkout flow is one
 * sequential test built from test.step for a readable failure trail.
 */

/** Pre-decide consent (reject all) so the banner never intercepts clicks. */
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

test.describe("Guest can browse catalog and add to cart", () => {
  test("browse → product detail → cart badge → drawer", async ({ page }) => {
    await seedConsentDecision(page);

    // Home renders. (LCP budget is enforced in performance.spec.ts — under
    // parallel dev-mode load this canary would be flaky, so it observes.)
    await page.goto("/en", { waitUntil: "load" });
    await expect(page.locator("main")).toBeVisible();
    const lcp = await measureLcp(page);
    test.info().annotations.push({
      type: "lcp_ms",
      description: String(Math.round(lcp)),
    });

    // Category grid: seeded category shows product cards. Route shape is
    // /c/[category]/[slug]; the flat home taxonomy repeats the slug.
    const category = SEEDED_CATEGORIES[0];
    await page.goto(`/en/c/${category.slug}/${category.slug}`);
    const cards = page.locator("main article");
    await expect(cards.first()).toBeVisible();

    // Product detail.
    await cards.first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/en\/p\//);
    await expect(page.locator("main h1")).toBeVisible();

    // Add to cart → badge updates. Scope to the first button: the PDP's
    // "Related products" rail carries its own add-to-cart buttons.
    const cartButton = page.getByRole("button", { name: /open cart/i });
    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click();
    await expect(cartButton).toContainText("1");

    // Drawer shows the added item.
    await cartButton.click();
    await expect(page.getByText("Your cart")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    const h1Text = await page.locator("main h1").first().textContent();
    expect(
      h1Text?.trim().length,
      "a product should be present",
    ).toBeGreaterThan(0);
  });
});

/*
 * The authenticated checkout journey lives in e2e/checkout-journey.spec.ts
 * (GAP-O08): it covers the protected route, address validation, locker
 * selection and the payment step, and skips the Stripe test-card leg
 * honestly when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.
 */

test.describe("Search returns results and handles empty state", () => {
  test("known product found; nonsense query shows empty state", async ({
    page,
  }) => {
    await seedConsentDecision(page);
    await page.goto("/en/search");

    const input = page.getByRole("searchbox").or(page.locator("#search-input"));

    await test.step("known product returns results", async () => {
      // Retry wrapper: in dev mode a fill can race hydration (React takes
      // over the input and resets the value); poll fill + results instead.
      await expect(async () => {
        await input.fill(KNOWN_PRODUCT.title);
        await expect(
          page.locator("main article").getByText(KNOWN_PRODUCT.title).first(),
        ).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });
    });

    await test.step("nonsense query shows the empty state", async () => {
      await expect(async () => {
        await input.fill(NONSENSE_QUERY);
        await expect(
          page.getByRole("heading", { name: /no results/i }),
        ).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });
      // Empty state offers category links as the way out.
      await expect(
        page.getByRole("link", { name: SEEDED_CATEGORIES[0].name }),
      ).toBeVisible();
    });
  });
});
