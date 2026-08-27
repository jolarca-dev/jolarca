/**
 * Typed API client — infrastructure layer only (no business logic).
 *
 * Stack: openapi-fetch bound to the generated `paths` types
 * (src/generated/api.ts). Auth rides on httpOnly Django session cookies
 * (credentials: "include") — no tokens in localStorage, ever (ADR-0009).
 *
 * Cross-cutting behaviors implemented as openapi-fetch middleware:
 *  - request:  credentials + locale-aware Accept-Language
 *  - response: 401 → locale-aware redirect to /login
 *              403 → toast event (UI subscribes to "jol:toast")
 *              5xx → pluggable error reporter + generic toast event
 *
 * Error contract: every failed request surfaces as a typed `ApiError`
 * (status, code, message, details) so error boundaries can branch safely.
 */
import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "@/generated/api";
import { ApiError, isApiError } from "@/lib/errors";
import { captureRequestId, logger } from "@/lib/logger";

// Canonical error classes live in lib/errors; re-exported here so existing
// imports (`import { ApiError } from "@/lib/api-client"`) keep working.
export { ApiError, isApiError };

export const SUPPORTED_LOCALES = ["lt", "lv", "et", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/* -------------------------------------------------------------------------- */
/* Extension points (wired by higher layers, not here)                          */
/* -------------------------------------------------------------------------- */

export interface ErrorContext {
  url: string;
  status: number;
  method?: string;
}

type ErrorReporter = (error: ApiError, context: ErrorContext) => void;

/**
 * Default reporter logs through the PII-redacting structured logger
 * (batched transport to GAP-L01). Production wiring may additionally
 * attach Sentry/OTEL via setErrorReporter.
 */
let errorReporter: ErrorReporter = (error, context) => {
  logger.error(`api ${context.status} ${context.method ?? ""}`.trim(), {
    status: error.status,
    code: error.code,
    traceId: error.traceId,
  });
};

export function setErrorReporter(reporter: ErrorReporter): void {
  errorReporter = reporter;
}

export interface ToastDetail {
  variant: "error" | "warning" | "info";
  /** Machine-readable; the UI layer localizes and styles. */
  code: string;
  message?: string;
}

/**
 * Toast bus: the UI layer subscribes via
 * `window.addEventListener("jol:toast", handler)`. Emitted only
 * client-side; SSR-safe by construction.
 */
export function emitToast(detail: ToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("jol:toast", { detail }));
}

/* -------------------------------------------------------------------------- */
/* Locale + auth navigation helpers                                             */
/* -------------------------------------------------------------------------- */

export function currentLocale(): Locale | undefined {
  if (typeof window === "undefined") return undefined;
  const segment = window.location.pathname.split("/")[1];
  if (!segment) return undefined;
  return (SUPPORTED_LOCALES as readonly string[]).includes(segment)
    ? (segment as Locale)
    : undefined;
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const locale = currentLocale() ?? "en";
  window.location.assign(`/${locale}/login`);
}

/* -------------------------------------------------------------------------- */
/* Client singleton + middleware                                                */
/* -------------------------------------------------------------------------- */

export const apiClient = createClient<paths>({
  // RSC fetches run inside the container where the browser-facing URL
  // (localhost) is unreachable; INTERNAL_API_URL carries the compose-
  // internal address (e.g. http://backend:8000). Browser calls always
  // keep the public URL.
  baseUrl:
    typeof window === "undefined"
      ? (process.env.INTERNAL_API_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        "http://localhost:8010")
      : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010"),
  credentials: "include", // httpOnly session cookies cross this boundary only
});

const middleware: Middleware = {
  onRequest({ request }) {
    // credentials: "include" is set once in createClient config; here we
    // only attach the locale negotiated by middleware (URL first segment).
    const locale = currentLocale();
    if (locale) {
      request.headers.set("Accept-Language", locale);
    }
    // RSC fetches travel the compose-internal network as plain HTTP; prod
    // Django's SECURE_SSL_REDIRECT would 301 them into a dead TLS hop. The
    // edge terminates TLS for real traffic, so internal calls are marked
    // forwarded-https (SECURE_PROXY_SSL_HEADER honours exactly this).
    if (typeof window === "undefined") {
      request.headers.set("X-Forwarded-Proto", "https");
    }
    // CSRF double-submit: echo Django's JS-readable CSRF cookie as a header
    // on mutating requests. Candidate names: the framework default plus the
    // app's renamed cookies (settings CSRF_COOKIE_NAME; __Host- in prod).
    // Browser-only; RSC mutations are internal.
    if (
      typeof window !== "undefined" &&
      !["GET", "HEAD"].includes(request.method.toUpperCase())
    ) {
      const pairs = document.cookie.split(";").map((pair) => pair.trim());
      const hit = pairs.find(
        (pair) =>
          pair.startsWith("csrftoken=") ||
          pair.startsWith("jol_csrf=") ||
          pair.startsWith("__Host-jol_csrf="),
      );
      const token = hit?.slice(hit.indexOf("=") + 1);
      if (token) {
        request.headers.set("X-CSRFToken", decodeURIComponent(token));
      }
    }
    return request;
  },
  onResponse({ response, request }) {
    // Adopt the backend correlation ID so client + server logs are
    // searchable under one x-request-id (charset/length validated).
    captureRequestId(response.headers);
    if (response.status === 401) {
      // The session PROBE is expected to answer 401 for guests — never
      // bounce anonymous visitors to /login because of it.
      if (!(response.url ?? "").includes("/api/v1/auth/session/")) {
        redirectToLogin();
      }
    } else if (response.status === 403) {
      emitToast({ variant: "warning", code: "forbidden" });
    } else if (response.status >= 500) {
      // Report asynchronously; never block the response path.
      void ApiError.fromResponse(response).then((error) => {
        errorReporter(error, {
          url: response.url,
          status: response.status,
          method: request?.method,
        });
      });
      emitToast({ variant: "error", code: "server_error" });
    }
    return response;
  },
};

apiClient.use(middleware);

/* -------------------------------------------------------------------------- */
/* Type-safe unwrap — turns openapi-fetch results into throw-based contracts    */
/* -------------------------------------------------------------------------- */

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Use with every client call: resolves with typed data or throws `ApiError`.
 * Integration point for React error boundaries (isApiError discrimination).
 */
export async function unwrap<T>(result: FetchResult<T>): Promise<T> {
  if (result.response.ok) {
    // 204-style empty bodies.
    return result.data as T;
  }
  throw await ApiError.fromResponse(result.response, result.error);
}
