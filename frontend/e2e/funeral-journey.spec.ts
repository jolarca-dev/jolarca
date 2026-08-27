import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Funeral services vertical — grief-aware directory and lead generation.
 * The suite guards the ethical contract as hard as the functional flow:
 * muted theme applied, AAA (7:1) contrast, NO commerce vocabulary, NO
 * Stripe/cart machinery touched, consultation reachable and submittable.
 *
 * Backend state drives the consultation branch: once funeral_services_app
 * ships GAP-F01/F02 the full card-based journey runs; until then the suite
 * asserts the sanctioned degradation (ADR-0007) and the quiet human-help
 * path that keeps lead capture reachable in every state.
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

test("Funeral services stay muted, commerce-free, and human-reachable", async ({
  page,
}) => {
  await seedConsentDecision(page);
  await page.goto("/en/funeral-services");

  // The cart badge must never move on this vertical — capture it first.
  const cartButton = page.locator('button[aria-label="Open cart"]');
  const cartBefore = await cartButton.innerText();

  await test.step("muted funeral theme is applied", async () => {
    // Theme class drives the token cascade (--tok-* overrides).
    const themed = page.locator(".theme-funeral").first();
    await expect(themed).toBeAttached();
    const surface = await themed.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--tok-surface").trim(),
    );
    expect(surface, "funeral surface token should be overridden").not.toBe("");
  });

  await test.step("AAA contrast (7:1) holds on the funeral surface", async () => {
    // Scoped to the vertical's own surface (#funeral-content): the shared
    // site header/footer carry the site-wide AA contract (enforced in
    // accessibility.spec.ts) and intentionally keep their own palette.
    const results = await new AxeBuilder({ page })
      .include("#funeral-content")
      .withRules(["color-contrast-enhanced"])
      .analyze();
    const violations = results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}) — ${violation.help}: ` +
        violation.nodes.map((node) => node.target.join(" ")).join(" | "),
    );
    expect(
      violations,
      `axe found WCAG AAA contrast violations:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });

  await test.step("hero is informational only — no CTA buttons", async () => {
    // The site header lives outside <main>; the funeral hero lives inside.
    await expect(page.locator("main header button")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /scroll down to the directory/i }),
      // Generous: a cold dev-stack compile must not read as a regression.
    ).toBeVisible({ timeout: 30_000 });
  });

  await test.step("no payment elements or commerce language anywhere", async () => {
    // No Stripe machinery, no cart CTAs, no urgency — this is lead-gen.
    await expect(page.locator('iframe[src*="js.stripe.com"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /buy now|add to cart|checkout/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/buy now|add to cart|only \d+ left/i),
    ).toHaveCount(0);
  });

  // Wait for the directory to settle: real cards, the sanctioned gap notice
  // (GAP-F02), or a calm load-failure message. Generous timeout — a cold
  // dev-stack compile must not read as a regression.
  const firstCard = page.locator("main article").first();
  const settled = firstCard
    .or(page.getByText("GAP-F02").first())
    .or(page.getByText(/could not load the directory/i).first());
  await expect(settled).toBeVisible({ timeout: 30_000 });
  const directoryLive = (await firstCard.count()) > 0;

  if (directoryLive) {
    await test.step("every card shows a phone above the fold", async () => {
      await expect(
        page.locator("main article a[href^='tel:']").first(),
      ).toBeVisible();
    });

    await test.step("open the consultation form on the first service", async () => {
      await page
        .getByRole("button", { name: /request consultation/i })
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    await test.step("fill the minimal-friction form and submit", async () => {
      await page.getByLabel(/your name/i).fill("Ona Vilkienė");
      await page.getByLabel(/^phone$/i).fill("+370 600 11223");
      await page.getByRole("button", { name: /send request/i }).click();
    });

    await test.step("success honours the 24-hour promise, then closes itself", async () => {
      await expect(
        page.getByText(/contact you within 24 hours/i),
      ).toBeVisible();
      // The modal closes automatically after 5 seconds.
      await expect(page.getByRole("dialog")).not.toBeVisible({
        timeout: 10_000,
      });
    });
  } else {
    await test.step("sanctioned notice shown, human help stays reachable", async () => {
      await expect(
        page
          .getByText("GAP-F02")
          .first()
          .or(page.getByText(/could not load the directory/i).first()),
      ).toBeVisible();
      // Quiet text link — never a loud CTA — opens the same consultation form.
      await page.getByRole("button", { name: /ask us to help/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    await test.step("fill the minimal-friction form and submit", async () => {
      await page.getByLabel(/your name/i).fill("Ona Vilkienė");
      await page.getByLabel(/^phone$/i).fill("+370 600 11223");
      await page.getByRole("button", { name: /send request/i }).click();
    });

    await test.step("outcome is honest in either backend state", async () => {
      // GAP-F01 shipped → 24-hour promise; still pending → the sanctioned
      // "being prepared" notice. Both are grief-aware; neither is technical.
      await expect(
        page.getByText(/contact you within 24 hours|being prepared/i),
      ).toBeVisible();
    });
  }

  await test.step("cart badge is untouched by the funeral journey", async () => {
    expect(await cartButton.innerText()).toBe(cartBefore);
  });
});
