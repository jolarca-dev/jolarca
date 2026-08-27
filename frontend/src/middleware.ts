/**
 * JOL Marketplace middleware — Edge runtime, fully typed, unit-tested logic
 * lives in src/i18n/config.ts and src/lib/security.ts (no DB calls, no
 * heavy imports; cookie lookups happen once per request and are reused).
 *
 * Responsibilities, in order:
 *  1. Security headers — per-request CSP nonce, static hardening set.
 *  2. Trailing-slash normalization: /en → /en/ (lt|lv|en roots).
 *  3. Auth gate — protected routes require the `jol_session` cookie;
 *     missing → redirect to /<locale>/login?redirect=<original_path>.
 *  4. Locale detection — jol_locale cookie → Accept-Language → lt;
 *     bridged into next-intl via NEXT_LOCALE, then delegated.
 *  5. Nonce forwarding — `x-nonce` request header lets RSC/components
 *     read it via `headers()` from "next/headers" (App Router replaces
 *     _document.tsx).
 */
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import {
  isProtectedRoute,
  LOCALE_COOKIE_NAME,
  resolveLocale,
  SESSION_COOKIE_NAMES,
} from "@/i18n/config";
import { routing } from "@/i18n/routing";
import { applySecurityHeaders, generateNonce } from "@/lib/security";

const nextIntlMiddleware = createMiddleware(routing);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";
/** Self-hosted analytics origin (CSP allowlist only — the script itself
 * still loads exclusively behind explicit consent, see script-loader). */
const PLAUSIBLE_API = process.env.NEXT_PUBLIC_PLAUSIBLE_API || undefined;

/** Header the RSC layer reads for nonce injection. */
export const NONCE_REQUEST_HEADER = "x-nonce";

function secured(response: NextResponse, nonce: string): NextResponse {
  applySecurityHeaders(response.headers, nonce, API_URL, PLAUSIBLE_API);
  return response;
}

export default function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();

  // Forward the nonce to the render pass (RSC reads request headers).
  request.headers.set(NONCE_REQUEST_HEADER, nonce);

  const { pathname } = request.nextUrl;

  // 2. Trailing-slash normalization for bare locale roots: /en → /en/.
  // (Requires `skipTrailingSlashRedirect` in next.config.js, otherwise Next
  // core strips the slash again and loops.)
  const localeRoot = pathname.match(/^\/(lt|lv|en)$/);
  if (localeRoot) {
    return secured(
      NextResponse.redirect(`${request.nextUrl.origin}${pathname}/`),
      nonce,
    );
  }

  // Locale preference — read once (performance: single cookie lookup),
  // reused by the auth redirect and the next-intl bridge.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;

  // 3. Auth gate — presence check only; validation is the backend's job.
  // Accepts the production __Host- prefixed cookie and the dev name.
  const hasSession = SESSION_COOKIE_NAMES.some(
    (name) => request.cookies.get(name)?.value,
  );
  if (isProtectedRoute(pathname) && !hasSession) {
    const locale = resolveLocale({
      cookieLocale,
      acceptLanguage: request.headers.get("accept-language"),
    });
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = "";
    // Preserve the full original target (path + query) for post-login return.
    url.searchParams.set("redirect", pathname + request.nextUrl.search);
    return secured(NextResponse.redirect(url), nonce);
  }

  // 4. Bridge the resolved locale into NEXT_LOCALE so the root layout can
  //    emit the correct <html lang> (and root-boundary 404 documents too).
  //    A URL locale prefix is authoritative for prefixed paths; unprefixed
  //    paths fall back to cookie → Accept-Language → default.
  const pathLocale = routing.locales.find(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  request.cookies.set(
    "NEXT_LOCALE",
    pathLocale ??
      resolveLocale({
        cookieLocale,
        acceptLanguage: request.headers.get("accept-language"),
      }),
  );

  return secured(nextIntlMiddleware(request), nonce);
}

export const config = {
  // Skip API, static assets, and Next internals.
  matcher: ["/", "/(lt|lv|en)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
