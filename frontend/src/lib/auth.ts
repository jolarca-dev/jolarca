/**
 * Auth API layer — cookie-session discipline (ADR-0009):
 *  - the backend sets httpOnly / Secure / SameSite=Strict session cookies;
 *  - the frontend stores NO tokens anywhere JS can read;
 *  - every state-changing call carries Django's CSRF token in a header
 *    (attached globally by the api-client middleware);
 *  - `getSession()` forwards the browser cookie when called from RSC so
 *    server components can render auth-aware UI.
 *
 * Contract reality: register/login/logout/session are live; password reset
 * and 2FA remain registered gaps (GAP-U04/U05+); calls to those throw
 * ApiError until the backend ships them.
 */
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";

/* -------------------------------------------------------------------------- */
/* Session model                                                               */
/* -------------------------------------------------------------------------- */

export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["buyer", "seller", "admin"]),
  language: z.string().optional(),
  is_verified: z.boolean().optional(),
  seller_slug: z.string().nullish(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/* -------------------------------------------------------------------------- */
/* CSRF — Django double-submit: the JS-readable CSRF cookie is echoed back    */
/* as a header on mutating requests. Candidate names: framework default       */
/* (`csrftoken`) plus this app's renamed cookies (settings CSRF_COOKIE_NAME;  */
/* `__Host-` prefixed in production).                                         */
/* -------------------------------------------------------------------------- */

const CSRF_COOKIE_NAMES = ["csrftoken", "jol_csrf", "__Host-jol_csrf"];

/** Pure parser (unit-tested); defaults to the browser cookie jar. */
export function readCsrfToken(cookieJar?: string): string | undefined {
  const jar =
    cookieJar ?? (typeof window === "undefined" ? "" : document.cookie);
  const pairs = jar.split(";").map((pair) => pair.trim());
  for (const name of CSRF_COOKIE_NAMES) {
    const hit = pairs.find((pair) => pair.startsWith(`${name}=`));
    if (hit) {
      const value = hit.slice(name.length + 1);
      if (value) return decodeURIComponent(value);
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/v1/auth/login/ (GAP-U01). Credentials ride the httpOnly cookie
 * set by the backend response; nothing is stored client-side. Resolves with
 * the canonical session user fetched after login succeeds.
 */
export async function login(
  email: string,
  password: string,
  remember: boolean,
): Promise<SessionUser> {
  const res = await apiClient.POST(
    "/api/v1/auth/login/" as never,
    {
      body: { email, password, remember },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const session = await getSession();
  if (!session) {
    // Login succeeded but session probe failed — surface loudly, never fake.
    throw new ApiError(
      500,
      "session_unavailable",
      "Session could not be loaded",
    );
  }
  return session;
}

/**
 * POST /api/v1/auth/logout/ (GAP-U02), then clears client-side state.
 * The backend expires the httpOnly cookie; we drop zustand caches here.
 */
export async function logout(): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/auth/logout/" as never,
    {} as never,
  );
  if (!res.response.ok && res.response.status !== 401) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  // Client-side cleanup: dynamic import keeps this module RSC-friendly.
  // Identity change → the local cart draft is dropped (no cross-user leak).
  const { useCartStore } = await import("@/stores/cart-store");
  useCartStore.getState().clearCart();
}

export interface RegisterInput {
  email: string;
  password: string;
  /** Active locale at registration time — matches the backend LanguageEnum. */
  language: "lt" | "lv" | "et" | "en";
}

/**
 * POST /api/v1/auth/register/ — the one auth endpoint in the live contract,
 * fully typed through the generated client (no casts).
 * GDPR note: consent evidence must be recorded server-side (compliance_app,
 * GAP-C01); the UI gates submission on explicit checkboxes but does not
 * trust the client as the ledger.
 */
export async function register(data: RegisterInput): Promise<void> {
  const res = await apiClient.POST("/api/v1/auth/register/", {
    body: data,
  });
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/**
 * GET /api/v1/auth/session/ (GAP-U03) — user object or null when anonymous.
 * In RSC the browser cookie is forwarded explicitly (fetch does not inherit
 * it server-side); in the browser credentials: "include" handles it.
 */
export async function getSession(): Promise<SessionUser | null> {
  let init: { headers?: Record<string, string> } | undefined;
  if (typeof window === "undefined") {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    const cookie = requestHeaders.get("cookie");
    if (cookie) {
      init = { headers: { cookie } };
    }
  }

  const res = await apiClient.GET(
    "/api/v1/auth/session/" as never,
    init as never,
  );
  if (res.response.status === 401 || res.response.status === 403) {
    return null;
  }
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  return SessionUserSchema.parse(res.data);
}

/**
 * POST /api/v1/auth/password-reset/ (GAP-U05). The backend MUST respond
 * identically for unknown addresses (no user enumeration); the UI always
 * shows the same "if the address exists" confirmation.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/auth/password-reset/" as never,
    {
      body: { email },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/* -------------------------------------------------------------------------- */
/* Open-redirect guard for post-login `?redirect=` targets                     */
/* -------------------------------------------------------------------------- */

/** Only same-origin relative paths pass; everything else → /account. */
export function safeRedirectTarget(target: string | null | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return "/account";
  }
  return target;
}
