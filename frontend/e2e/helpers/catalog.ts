/**
 * Catalog e2e helpers — data always comes from the live backend (seeded
 * stack); helpers never fabricate records.
 */
import { expect, type Page } from "@playwright/test";

import { apiUrl } from "./auth";

/** Pre-decide consent (reject all) so the banner never intercepts clicks. */
export function seedConsentDecision(page: Page) {
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
export async function findSeededProduct(page: Page): Promise<{
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
