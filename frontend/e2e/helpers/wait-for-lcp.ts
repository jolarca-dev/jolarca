/**
 * LCP measurement via PerformanceObserver — evaluated inside the page so
 * it works on the self-hosted stack without any Vercel/CDN tooling.
 * Resolves with the last reported LCP value once the page settles.
 */
import type { Page } from "@playwright/test";

export async function measureLcp(page: Page, settleMs = 2500): Promise<number> {
  return page.evaluate((settle) => {
    return new Promise<number>((resolve, reject) => {
      try {
        let lcp = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            lcp = Math.max(lcp, entry.startTime);
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        // LCP finalizes on user interaction or when rendering settles;
        // this is a measurement window, not a hardcoded UI wait.
        window.setTimeout(() => {
          observer.disconnect();
          resolve(lcp);
        }, settle);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, settleMs);
}

/** Navigate then measure — the standard pattern for budget assertions. */
export async function lcpForUrl(page: Page, url: string): Promise<number> {
  await page.goto(url, { waitUntil: "load" });
  return measureLcp(page);
}
