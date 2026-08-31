import { expect, test } from "@playwright/test";

import { makeTestUser } from "./fixtures/user";
import { cleanupTestData, ensureAuthenticated } from "./helpers/auth";
import { findSeededProduct, seedConsentDecision } from "./helpers/catalog";

/**
 * Checkout journey (GAP-O08 closed): protected route → address → Omniva
 * locker → payment step → confirmation → order in history.
 *
 * Honesty gate: the Stripe TEST-CARD leg runs only when a publishable key
 * is configured (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Without it the spec
 * asserts the flow up to the payment step and its honest "payments being
 * prepared" degradation — never a faked payment.
 */
const STRIPE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
);

test.describe("checkout journey", () => {
  // Longest journey in the suite (bounce + registration + 4 steps); the
  // default 60s budget can starve on a cold dev compile.
  test.setTimeout(180_000);

  test("guest bounce, address, Omniva locker, payment step", async ({
    page,
    context,
  }) => {
    await seedConsentDecision(page);
    await page.goto("/en", { waitUntil: "load" });

    await test.step("unauthenticated visitors are redirected to login", async () => {
      await page.goto("/en/checkout");
      await expect(page).toHaveURL(/\/en\/login\?redirect=/, {
        timeout: 30_000,
      });
    });

    const user = makeTestUser("buyer");
    await ensureAuthenticated(context, page, user);

    try {
      const product = await findSeededProduct(page);

      await test.step("add a seeded product to the cart", async () => {
        await page.goto(`/en/p/${product.slug}`);
        await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
        await page
          .getByRole("button", { name: /add to cart/i })
          .first()
          .click();
        await expect(
          page.getByRole("button", { name: /open cart/i }),
        ).toContainText("1", { timeout: 15_000 });
        await page.goto("/en/checkout");
        await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
      });

      await test.step("step 1 — Lithuanian address validates", async () => {
        await page.getByLabel(/full name/i).fill("Ona Testauskienė");
        await page.getByLabel(/street address/i).fill("Gedimino pr. 1");
        await page.getByLabel(/city/i).fill("Vilnius");
        // Wrong format first: the form must refuse a non-LT postal code.
        await page.getByLabel(/postal code/i).fill("12345");
        await page.getByLabel(/phone/i).fill("+370 600 12345");
        await page.getByRole("button", { name: /continue/i }).click();
        // The form must refuse a non-LT postal code with an actionable hint.
        await expect(page.locator("#co-postal-err")).toContainText(/LT-/, {
          timeout: 10_000,
        });
        await page.getByLabel(/postal code/i).fill("LT-01103");
        await page.getByRole("button", { name: /continue/i }).click();
      });

      await test.step("step 2 — Omniva locker selection", async () => {
        await page.getByRole("radio", { name: /omniva/i }).check();
        await page
          .getByRole("radio", { name: /Vilnius/i })
          .first()
          .check();
        await page.getByRole("button", { name: /continue/i }).click();
      });

      await test.step("step 3 — payment element or honest degradation", async () => {
        if (STRIPE_CONFIGURED) {
          await expect(
            page.locator('iframe[src*="js.stripe.com"]').first(),
          ).toBeVisible({ timeout: 30_000 });
        } else {
          // No publishable key in this environment: the step must degrade
          // loudly instead of rendering a dead form.
          await expect(
            page.getByText(/being prepared|not configured/i),
          ).toBeVisible({
            timeout: 15_000,
          });
        }
      });
    } finally {
      await cleanupTestData(page);
    }
  });

  test("Stripe test card completes the order end-to-end", async ({
    page,
    context,
  }) => {
    test.skip(
      !STRIPE_CONFIGURED,
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set — real Stripe leg skipped.",
    );
    // Real Stripe round-trips (js.stripe.com + api.stripe.com) under
    // parallel workers need more than the describe budget.
    test.setTimeout(300_000);

    await seedConsentDecision(page);
    await page.goto("/en", { waitUntil: "load" });
    const user = makeTestUser("buyer");
    await ensureAuthenticated(context, page, user);

    try {
      const product = await findSeededProduct(page);

      await test.step("add to cart and open checkout", async () => {
        await page.goto(`/en/p/${product.slug}`);
        await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
        await page
          .getByRole("button", { name: /add to cart/i })
          .first()
          .click();
        await expect(
          page.getByRole("button", { name: /open cart/i }),
        ).toContainText("1", { timeout: 15_000 });
        await page.goto("/en/checkout");
      });

      await test.step("address → courier", async () => {
        await page.getByLabel(/full name/i).fill("Ona Testauskienė");
        await page.getByLabel(/street address/i).fill("Gedimino pr. 1");
        await page.getByLabel(/city/i).fill("Vilnius");
        await page.getByLabel(/postal code/i).fill("LT-01103");
        await page.getByLabel(/phone/i).fill("+370 600 12345");
        await page.getByRole("button", { name: /continue/i }).click();
        await page.getByRole("radio", { name: /courier/i }).check();
        await page.getByRole("button", { name: /continue/i }).click();
      });

      await test.step("test card 4242 in the Stripe iframe", async () => {
        const stripe = page
          .frameLocator('iframe[src*="js.stripe.com"]')
          .first();
        // Accessible field labels — stable across Stripe Elements versions
        // (internal data-elements-* attributes are not part of any contract).
        await stripe
          .getByRole("textbox", { name: /card number/i })
          .fill("4242424242424242", { timeout: 30_000 });
        await stripe.getByRole("textbox", { name: /expir/i }).fill("12/39");
        await stripe
          .getByRole("textbox", { name: /cvc|security/i })
          .fill("424");
        // Stripe sometimes requires a billing country (account-adaptive
        // layout); defaultValues prefill it, select as a fallback.
        const billingCountry = stripe.getByRole("combobox", {
          name: /country/i,
        });
        if (await billingCountry.isVisible().catch(() => false)) {
          await billingCountry.selectOption({ label: "Lithuania" });
        }
        // Stripe's iframe reflows right after field interaction; a click
        // landing mid-reflow can be swallowed by the iframe overlay. Click,
        // verify the step advanced, retry once — deterministic either way.
        const continueBtn = page.getByRole("button", { name: /continue/i });
        await continueBtn.scrollIntoViewIfNeeded();
        await continueBtn.click();
        const advanced = await page
          .getByRole("heading", { name: /review/i })
          .waitFor({ timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
        if (!advanced) {
          await continueBtn.click();
          await page
            .getByRole("heading", { name: /review/i })
            .waitFor({ timeout: 15_000 });
        }
      });

      await test.step("review, accept terms, place order", async () => {
        // By name, not .first(): the collapsed (but still mounted) Stripe
        // Payment Element also exposes checkboxes in DOM order.
        await page
          .getByRole("checkbox", { name: /terms and conditions/i })
          .check();
        await page.getByRole("button", { name: /place order/i }).click();
        await expect(page).toHaveURL(/\/en\/checkout\/success/, {
          timeout: 120_000,
        });
        await expect(page.getByText(/JOL-\d{4}-\d{6}/)).toBeVisible({
          timeout: 30_000,
        });
      });

      await test.step("the order appears in account history", async () => {
        await page.goto("/en/account");
        await expect(page.getByText(/JOL-\d{4}-\d{6}/).first()).toBeVisible({
          timeout: 30_000,
        });
      });
    } finally {
      await cleanupTestData(page);
    }
  });
});
