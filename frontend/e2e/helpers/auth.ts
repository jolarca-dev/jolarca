/**
 * API-based auth helpers — journeys register/login through the backend
 * directly (bypassing the UI) so UI tests stay focused. All calls are
 * honest: if an endpoint is still a registered contract gap the helper
 * throws with the gap id, and the journey test fails for the right reason.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";

import type { TestUser } from "../fixtures/user";

const GAP_STATUSES = [404, 405, 501];

/**
 * API origin for direct backend calls. On the compose test stack /api is
 * same-origin (nginx proxies to the backend), so the default stays relative.
 * Host-development stacks run the frontend and backend on separate ports —
 * set PLAYWRIGHT_API_URL (e.g. http://localhost:8010) there.
 */
export const API_ORIGIN = process.env.PLAYWRIGHT_API_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

function assertNotGap(
  response: { status: () => number },
  endpoint: string,
  gapId: string,
): void {
  if (GAP_STATUSES.includes(response.status())) {
    throw new Error(
      `${endpoint} is not implemented yet (${gapId}) — journey blocked by contract gap.`,
    );
  }
}

/** POST /api/v1/auth/register/ — the live registration endpoint. */
export async function registerUser(page: Page, user: TestUser): Promise<void> {
  const response = await page.request.post(apiUrl("/api/v1/auth/register/"), {
    data: {
      email: user.email,
      password: user.password,
      language: "en",
      // Best-effort role hint; the backend contract decides the real role.
      account_type: user.role,
    },
  });
  assertNotGap(response, "POST /api/v1/auth/register/", "—");
  expect(response.status(), "registration should succeed").toBeLessThan(300);
}

/**
 * POST /api/v1/auth/login/ — logs in via API and copies the
 * session cookies from the response into the browser context, so the next
 * page load is authenticated without clicking through the login form.
 */
export async function loginViaApi(
  context: BrowserContext,
  page: Page,
  user: TestUser,
): Promise<void> {
  const response = await page.request.post(apiUrl("/api/v1/auth/login/"), {
    data: { email: user.email, password: user.password },
  });
  assertNotGap(response, "POST /api/v1/auth/login/", "—");
  expect(response.status(), "login should succeed").toBeLessThan(300);

  const host = new URL(page.url() || "http://localhost").hostname;
  const cookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => {
      const [pair, ...attrs] = header.value.split(";");
      if (!pair) return null;
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const secure = attrs.some((a) => a.trim().toLowerCase() === "secure");
      const httpOnly = attrs.some((a) => a.trim().toLowerCase() === "httponly");
      const pathAttr = attrs.find((a) =>
        a.trim().toLowerCase().startsWith("path="),
      );
      return {
        name,
        value,
        domain: host,
        path: pathAttr ? (pathAttr.split("=")[1] ?? "/") : "/",
        httpOnly,
        secure,
        sameSite: "Lax" as const,
      };
    })
    .filter(
      (
        cookie,
      ): cookie is {
        name: string;
        value: string;
        domain: string;
        path: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: "Lax";
      } => cookie !== null,
    );
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }
}

/** Register + login in one step; returns a ready authenticated context. */
export async function ensureAuthenticated(
  context: BrowserContext,
  page: Page,
  user: TestUser,
): Promise<void> {
  await registerUser(page, user);
  await loginViaApi(context, page, user);
}

/**
 * Best-effort cleanup — account deletion is not in the live contract yet,
 * so cleanup erases local traces and leaves uniquely-stamped server rows
 * for the admin moderation queue (they are clearly marked `e2e-`). Never
 * throws: a cleanup failure must not mask the real test outcome.
 */
export async function cleanupTestData(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Page may already be closed — acceptable during teardown.
  }
}
