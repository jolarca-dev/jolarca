import { expect, test } from "@playwright/test";

// Quality gate #6: the checkout journey must stay green.
// Full flow (cart → checkout → payment) is covered by buyer-journey.spec.ts;
// this smoke keeps the harness, fixtures, and CI wiring verified meanwhile.

test("catalog home renders in every launch locale", async ({ page }) => {
  // Launch set per src/i18n/config.ts; `lt` is served unprefixed at root.
  for (const path of ["/", "/lv", "/en"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("home response carries the security header floor", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  const headers = response!.headers();

  // Middleware-emitted set (nginx mirrors the static subset as fallback).
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("'nonce-");
  expect(headers["x-powered-by"]).toBeUndefined();

  // TLS validity is environment-bound (dev stack serves plain HTTP);
  // the deployment suite asserts cert termination at the nginx edge.
});
