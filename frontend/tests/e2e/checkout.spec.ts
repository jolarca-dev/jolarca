import { test, expect } from "@playwright/test";

// Quality gate #6: the checkout journey must stay green.
// Full flow (cart → checkout → payment mock) lands with MVP-E1; this smoke
// keeps the harness, fixtures, and CI wiring verified meanwhile.

test("catalog home renders in every locale", async ({ page }) => {
  for (const locale of ["en", "lt", "lv", "et"]) {
    await page.goto(`/${locale}`);
    await expect(page.locator("main")).toBeVisible();
  }
});
