import { expect, test, type Page } from "@playwright/test";

/**
 * Error handling & observability e2e — proves the user-facing contract:
 * failures render calm, actionable, NON-technical copy, and nothing PII
 * ever leaks through console output. 500s are simulated by intercepting
 * the client-side search API (RSC server fetches are exercised by the
 * backend test suites — browsers cannot observe them directly).
 */

/** PII patterns that must never appear in browser console output. */
const PII_PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /\+?\d[\d\s\-().]{8,}\d/, // phone
  /\b[1-6]\d{10}\b/, // Lithuanian personal code
];

function collectConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => lines.push(message.text()));
  page.on("pageerror", (error) => lines.push(error.message));
  return lines;
}

function expectNoPii(lines: string[]): void {
  for (const line of lines) {
    for (const pattern of PII_PATTERNS) {
      expect(line, `console line leaked PII: ${line}`).not.toMatch(pattern);
    }
  }
}

test.describe("Error handling — user-facing safety", () => {
  test("404 renders calm, non-technical messaging", async ({ page }) => {
    const consoleLines = collectConsole(page);
    const response = await page.goto("/en/definitely-not-a-page");
    expect(response?.status()).toBe(404);

    const body = await page.textContent("body");
    // Either the localized not-found copy or Next's neutral default —
    // never stack traces, never internals.
    expect(body).toMatch(/not be found|Page not found/i);
    expect(body).not.toMatch(/Traceback|at Object\.|Error: \w+Error/);
    expectNoPii(consoleLines);
  });

  test("search network failure degrades to a safe notice", async ({ page }) => {
    const consoleLines = collectConsole(page);
    await page.route("**/api/v1/search/**", (route) => route.abort());

    await page.goto("/en/search");
    await page.getByPlaceholder(/Search products/).fill("candle");
    // Debounced query (300ms) → aborted fetch → degradation notice.
    await expect(
      page.getByText("Search is temporarily unavailable"),
    ).toBeVisible({ timeout: 10_000 });

    const body = await page.textContent("body");
    expect(body).not.toMatch(/TypeError|fetch failed|stack/);
    expectNoPii(consoleLines);
  });

  test("search 500 keeps the message generic — no internals exposed", async ({
    page,
  }) => {
    const consoleLines = collectConsole(page);
    await page.route("**/api/v1/search/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "internal db traceback SECRET" }),
      }),
    );

    await page.goto("/en/search");
    await page.getByPlaceholder(/Search products/).fill("rosary");
    await expect(
      page.getByText("Search is temporarily unavailable"),
    ).toBeVisible({ timeout: 10_000 });

    const body = await page.textContent("body");
    // Backend error details must never reach the DOM.
    expect(body).not.toContain("SECRET");
    expect(body).not.toContain("traceback");
    expectNoPii(consoleLines);
  });
});
