import { expect, test } from "@playwright/test";

import { SEEDED_CATEGORIES } from "./fixtures/product";
import { lcpForUrl } from "./helpers/wait-for-lcp";

/**
 * Performance budget — LCP stays under 2000ms on the catalog grid, the
 * heaviest public page. This is deliberately STRICTER than the 2500ms
 * "Good" threshold so simulated-4G Lighthouse runs (1500ms budget in
 * lighthouse-budget.json) keep headroom. Mirrors scripts/lighthouse-budget.json
 * so CI and the runtime suite enforce the same numbers.
 */

const LCP_BUDGET_MS = 2000;

test.describe("Catalog page meets LCP budget", () => {
  test("category grid paints under 2000ms", async ({ page }) => {
    const lcp = await lcpForUrl(page, `/en/c/${SEEDED_CATEGORIES[0].slug}`);
    expect(
      lcp,
      `LCP ${Math.round(lcp)}ms exceeds the ${LCP_BUDGET_MS}ms budget`,
    ).toBeGreaterThan(0);
    expect(lcp).toBeLessThan(LCP_BUDGET_MS);
  });
});
