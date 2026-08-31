import { expect, test } from "@playwright/test";

import { makeTestUser } from "./fixtures/user";
import { apiUrl, cleanupTestData, ensureAuthenticated } from "./helpers/auth";

/**
 * Cart journey (GAP-O01 closed): add from PDP, quantity stepper, remove,
 * guest persistence across reloads (localStorage draft), and guest→server
 * sync on login. Selectors target /en for language-stable assertions.
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

/** Find a real published listing via the search API — never invent data. */
async function findSeededProduct(
  page: import("@playwright/test").Page,
): Promise<{
  slug: string;
  title: string;
}> {
  const res = await page.request.post(apiUrl("/api/v1/search/"), {
    data: { q: "Amber" },
  });
  expect(res.status(), "search endpoint must be live").toBe(200);
  const body = (await res.json()) as {
    results: Array<{ slug: string; title: string }>;
  };
  expect(
    body.results.length,
    "seeded catalog must return hits",
  ).toBeGreaterThan(0);
  const first = body.results[0];
  expect(first).toBeDefined();
  return { slug: first!.slug, title: first!.title };
}

test.describe("guest cart lifecycle", () => {
  test("add → stepper → persist across reload → remove", async ({ page }) => {
    await seedConsentDecision(page);
    await page.goto("/en", { waitUntil: "load" });
    const product = await findSeededProduct(page);

    await test.step("add from the PDP and see the badge increment", async () => {
      await page.goto(`/en/p/${product.slug}`);
      await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
      await page
        .getByRole("button", { name: /add to cart/i })
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: /open cart/i }),
      ).toContainText("1", { timeout: 15_000 });
    });

    await test.step("drawer shows the line; stepper increases quantity", async () => {
      await page.getByRole("button", { name: /open cart/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog).toContainText(product.title);
      await dialog.getByRole("button", { name: /increase quantity/i }).click();
      await expect(
        page.getByRole("button", { name: /open cart/i }),
      ).toContainText("2", { timeout: 15_000 });
    });

    await test.step("guest draft survives a reload", async () => {
      await page.reload();
      await expect(
        page.getByRole("button", { name: /open cart/i }),
      ).toContainText("2", { timeout: 30_000 });
    });

    await test.step("remove empties the cart", async () => {
      await page.getByRole("button", { name: /open cart/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: /^remove/i })
        .first()
        .click();
      await expect(dialog).toContainText(/empty/i, { timeout: 15_000 });
    });
  });
});

test.describe("cart sync on login", () => {
  test("guest draft merges into the server cart after authentication", async ({
    page,
    context,
  }) => {
    await seedConsentDecision(page);
    await page.goto("/en", { waitUntil: "load" });
    const product = await findSeededProduct(page);
    const user = makeTestUser("buyer");

    try {
      await test.step("guest adds a product", async () => {
        await page.goto(`/en/p/${product.slug}`);
        await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
        await page
          .getByRole("button", { name: /add to cart/i })
          .first()
          .click();
        await expect(
          page.getByRole("button", { name: /open cart/i }),
        ).toContainText("1", { timeout: 15_000 });
      });

      await test.step("login triggers draft→server sync", async () => {
        await ensureAuthenticated(context, page, user);
        await page.goto(`/en/p/${product.slug}`);
        // The badge keeps its count once the merged server cart lands.
        await expect(
          page.getByRole("button", { name: /open cart/i }),
        ).toContainText("1", { timeout: 30_000 });
      });

      await test.step("server cart holds the synced line", async () => {
        await expect
          .poll(
            async () => {
              const res = await page.request.get(apiUrl("/api/v1/cart/"));
              if (res.status() !== 200) return 0;
              const body = (await res.json()) as {
                items: Array<{ product_id: string }>;
              };
              return body.items.filter((l) => l.product_id === product.slug)
                .length;
            },
            { timeout: 30_000 },
          )
          .toBe(1);
      });
    } finally {
      await cleanupTestData(page);
    }
  });
});
