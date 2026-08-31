import { expect, test } from "@playwright/test";

/*
 * SEO floor — robots/sitemap/hreflang/manifest/favicon serve correctly from
 * the running app. Runs in every project; the surface is browser-agnostic
 * but the extra coverage costs ~nothing.
 */

test.describe("SEO floor", () => {
  test("robots.txt disallows private areas, keeps storefronts crawlable", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Disallow: /seller/");
    expect(body).toContain("Disallow: /lv/seller/");
    // No entry may prefix-match the public storefront surface.
    expect(body).not.toMatch(/Disallow: \/sellers/);
    expect(body).not.toMatch(/Disallow: \/seller\s*$/m);
    expect(body).toContain("Sitemap:");
  });

  test("sitemap.xml lists only public pages with hreflang clusters", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("funeral-services");
    expect(body).toContain("x-default");
    for (const banned of ["/checkout", "/account", "/cart", "/orders"]) {
      expect(body).not.toContain(banned);
    }
  });

  test("home head carries hreflang alternates, manifest, and icon", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator('link[rel="alternate"][hreflang="lv"]'),
    ).toHaveCount(1, { timeout: 30_000 });
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    expect(await page.locator('link[rel="icon"]').count()).toBeGreaterThan(0);
  });

  test("manifest and icon resolve", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: "JOL Marketplace" });

    const icon = await request.get("/icon.svg");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("svg");
  });

  test("unknown URLs render the localized 404 boundary", async ({ page }) => {
    const response = await page.goto("/no-such-page-anywhere");
    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toBeVisible({ timeout: 30_000 });
  });
});
