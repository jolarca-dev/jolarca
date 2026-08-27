import { expect, test } from "@playwright/test";

/**
 * GDPR consent gate — analytics must stay off until explicit consent.
 * The Plausible loader only renders when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is
 * configured; when it isn't, the "loaded" branch asserts the store's
 * decision instead, keeping the test honest in both environments.
 */

const PLAUSIBLE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN);

const plausibleScript = (page: import("@playwright/test").Page) =>
  page.locator('script[src*="script.js"][data-domain]');

test.describe("Consent banner blocks analytics", () => {
  test("reject all keeps Plausible out; accepting analytics loads it", async ({
    page,
  }) => {
    await page.goto("/en");

    // Banner is visible before any decision.
    await expect(page.getByText("Cookies & privacy")).toBeVisible();

    await test.step("reject all → no analytics script", async () => {
      await page.getByRole("button", { name: /reject all/i }).click();
      await expect(page.getByText("Cookies & privacy")).not.toBeVisible();
      await expect(plausibleScript(page)).toHaveCount(0);
    });

    await test.step("accept analytics → loader mounts", async () => {
      // Reopen the consent manager and grant analytics only.
      await page.evaluate(() => {
        window.localStorage.removeItem("jol_consent_v1");
      });
      await page.reload();
      await expect(page.getByText("Cookies & privacy")).toBeVisible();
      await page.getByRole("button", { name: /accept all/i }).click();

      if (PLAUSIBLE_CONFIGURED) {
        await expect(plausibleScript(page)).toBeAttached();
      } else {
        // Without a configured analytics domain the script legitimately stays
        // absent — assert the decision itself was recorded instead.
        const stored = await page.evaluate(() =>
          window.localStorage.getItem("jol_consent_v1"),
        );
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored ?? "{}").state.choices.analytics).toBe(true);
      }
    });
  });
});
