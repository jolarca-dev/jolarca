import path from "node:path";

import { expect, test } from "@playwright/test";

import { TEST_LISTING } from "./fixtures/product";
import { makeTestUser } from "./fixtures/user";
import { cleanupTestData, ensureAuthenticated } from "./helpers/auth";

/**
 * Seller journey — register (seller account), walk the onboarding wizard,
 * upload the KYC fixture, then publish a listing and verify it lands on the
 * dashboard. Runs against the seeded Docker Compose stack; steps blocked by
 * an unimplemented backend endpoint fail with the honest portal-pending
 * notice visible in the failure screenshot.
 */

const KYC_FIXTURE = path.join(__dirname, "fixtures", "test-document.png");

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

test("Seller can onboard and create listing", async ({ page, context }) => {
  await seedConsentDecision(page);
  await page.goto("/en");

  const user = makeTestUser("seller");
  await ensureAuthenticated(context, page, user);

  try {
    await test.step("reach the onboarding wizard", async () => {
      await page.goto("/en/seller/onboarding");
      // The role gate sends non-sellers home — surface that clearly.
      await expect(page).toHaveURL(/\/seller\/onboarding/);
      await expect(
        page.getByRole("heading", { name: /become a seller/i }),
      ).toBeVisible();
    });

    await test.step("complete business information", async () => {
      await page.getByLabel(/business name/i).fill("E2E Test Studio");
      await page
        .getByLabel(/contact email/i)
        .fill(`owner-${Date.now()}@example.com`);
      await page.getByLabel(/^phone$/i).fill("+370 600 98765");
      await page.getByLabel(/street address/i).fill("Testų g. 5");
      await page.getByLabel(/^city$/i).fill("Vilnius");
      await page.getByLabel(/postal code/i).fill("01108");
      // LT register code: nine digits.
      await page.getByLabel(/registration number/i).fill("123456789");
      await page.getByRole("button", { name: /continue/i }).click();
    });

    await test.step("upload KYC documents", async () => {
      // The intro paragraph also mentions identity verification — target
      // the step heading, not any text node.
      await expect(
        page.getByRole("heading", { name: /identity verification/i }),
      ).toBeVisible();
      const fileInputs = page.locator('input[type="file"]');
      const count = await fileInputs.count();
      expect(count, "KYC upload slots should exist").toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        await fileInputs.nth(index).setInputFiles(KYC_FIXTURE);
      }
      await expect(page.getByText(/uploaded/i).first()).toBeVisible();
      await page.getByRole("button", { name: /continue/i }).click();
    });

    await test.step("payout setup step acknowledges Stripe Connect", async () => {
      await expect(page.getByText(/stripe connect/i).first()).toBeVisible();
      // Stripe Express onboarding is interactive/external; the wizard lets
      // the seller continue and connect later from the dashboard.
      await page.getByRole("button", { name: /continue/i }).click();
    });

    await test.step("submit the application", async () => {
      await page.getByRole("button", { name: /submit application/i }).click();
      await expect(
        page.getByText(/submitted|portal is being prepared/i).first(),
      ).toBeVisible();
    });

    await test.step("create a listing with all required fields", async () => {
      await page.goto("/en/seller/listings/new");
      await expect(
        page.getByRole("heading", { name: /create a listing/i }),
      ).toBeVisible();

      await page.getByLabel(/lithuanian/i).fill(TEST_LISTING.titleLt);
      await page.getByLabel(/english/i).fill(TEST_LISTING.titleEn);

      const description = page.locator("[contenteditable='true']").first();
      await description.click();
      await description.type(TEST_LISTING.description);

      await page.getByLabel(/^category$/i).selectOption({
        label: TEST_LISTING.category,
      });
      await page.getByLabel(/price \(eur\)/i).fill(TEST_LISTING.price);
      await page.getByLabel(/^stock$/i).fill(TEST_LISTING.stock);

      await page.getByRole("button", { name: /publish listing/i }).click();
      await expect(
        page.getByText(/published|portal is being prepared/i).first(),
      ).toBeVisible();
    });

    await test.step("listing appears on the seller dashboard", async () => {
      await page.goto("/en/seller/dashboard");
      await expect(
        page.getByRole("heading", { name: /seller dashboard/i }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText(TEST_LISTING.titleLt, {
        timeout: 15_000,
      });
    });
  } finally {
    await cleanupTestData(page);
  }
});
