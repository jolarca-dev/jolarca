/**
 * Locale & session configuration — JOL Marketplace launch markets.
 *
 * Launch: Lithuanian (default market), Latvian, English. Estonian (et)
 * translations already exist in messages/et.json and re-activate by adding
 * "et" to LAUNCH_LOCALES once human review completes (see ADR-0009).
 *
 * Detection priority (spec): (1) `jol_locale` cookie, (2) Accept-Language,
 * (3) default `lt`. URL scheme: default locale served at root (`/`),
 * non-default locales prefixed (`/lv/…`, `/en/…`) via next-intl
 * `localePrefix: "as-needed"`.
 */

export const LAUNCH_LOCALES = ["lt", "lv", "en"] as const;
export type Locale = (typeof LAUNCH_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "lt";

/** Buyer locale preference — set by the locale switcher, read by middleware. */
export const LOCALE_COOKIE_NAME = "jol_locale";

/**
 * Auth presence check in middleware is cookie-existence only (no decoding,
 * no backend call — Edge-safe). Backend contract (settings/base.py +
 * production.py): httpOnly, Secure, Path=/, SameSite Strict in production
 * under the `__Host-` prefix; plain names in dev (browsers reject
 * `__Host-` cookies on non-secure origins). The gate accepts both names.
 */
export const SESSION_COOKIE_NAME = "jol_session";
export const SESSION_COOKIE_NAMES = [
  "__Host-jol_session", // production (__Host- prefix)
  SESSION_COOKIE_NAME, // dev / pre-prefix backends
] as const;

/** Route segments requiring a session (checked with and without prefix).
 * NOTE: `/checkout` IS protected — the cart API and order creation are
 * authenticated-only, so a guest checkout cannot complete; the middleware
 * bounces anonymous visitors to login with a ?redirect= back to checkout. */
export const PROTECTED_ROUTES = [
  "/account",
  "/seller",
  "/admin",
  "/checkout",
] as const;

export interface LocaleMeta {
  code: Locale;
  /** Native-language label for the switcher UI. */
  label: string;
  flag: string;
  /** All launch locales are LTR; RTL support is architecturally cheap
      because component styles use CSS logical properties only (ADR-0009). */
  rtl: false;
}

export const LOCALE_METADATA: Record<Locale, LocaleMeta> = {
  lt: { code: "lt", label: "Lietuvių", flag: "🇱🇹", rtl: false },
  lv: { code: "lv", label: "Latviešu", flag: "🇱🇻", rtl: false },
  en: { code: "en", label: "English", flag: "🇬🇧", rtl: false },
};

/* -------------------------------------------------------------------------- */
/* Translation loading strategy                                                */
/*                                                                             */
/* NOW:    static JSON (messages/*.json) bundled via next-intl — the lightest  */
/*         option for RSC, zero runtime calls, works offline in builds.        */
/* LATER:  dynamic UI strings per locale from the Django backend               */
/*         (`GET /api/v1/i18n/<locale>` — contract gap GAP-I01). When that     */
/*         lands, src/i18n/request.ts fetches it server-side with the static   */
/*         JSON as the fallback on any failure. No fetch is attempted today.   */
/* -------------------------------------------------------------------------- */

export function isSupportedLocale(
  value: string | null | undefined,
): value is Locale {
  return !!value && (LAUNCH_LOCALES as readonly string[]).includes(value);
}

/**
 * Parse an Accept-Language header into the best supported locale.
 * Honors q-values and region tags (`lt-LT`, `en-GB` → `en`).
 */
export function detectLocaleFromAcceptLanguage(
  header: string | null | undefined,
): Locale | undefined {
  if (!header) return undefined;

  const ranked = header
    .split(",")
    .map((entry) => {
      const [rawTag, ...params] = entry.trim().split(";");
      const qParam = params
        .map((p) => p.trim())
        .find((p) => p.toLowerCase().startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: (rawTag ?? "").trim().toLowerCase(), q };
    })
    .filter((entry) => Number.isFinite(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (isSupportedLocale(tag)) return tag;
    const primary = tag.split("-")[0];
    if (isSupportedLocale(primary)) return primary;
  }
  return undefined;
}

/** Detection priority: cookie → Accept-Language → default (lt). */
export function resolveLocale(input: {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isSupportedLocale(input.cookieLocale)) return input.cookieLocale;
  return detectLocaleFromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

/** Strip a leading locale segment: "/lt/account" → "/account", "/lt" → "/". */
export function stripLocaleSegment(pathname: string): string {
  const segment = pathname.split("/")[1];
  if (!isSupportedLocale(segment)) return pathname;
  const rest = pathname.slice(segment.length + 1);
  return rest === "" ? "/" : rest;
}

/**
 * Session-required check; tolerates prefixed and unprefixed paths.
 * Exact-segment matching — `/seller` protects `/seller/listings` but
 * never a hypothetical `/sellers-public` page.
 */
export function isProtectedRoute(pathname: string): boolean {
  const path = stripLocaleSegment(pathname);
  return PROTECTED_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}
