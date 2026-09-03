/**
 * SEO helpers — canonical + hreflang alternates reflecting the next-intl
 * `localePrefix: "as-needed"` scheme: the default locale (lt) is served
 * unprefixed at root; launch locales lv/en are prefixed. Every indexable
 * page emits the full alternate set + x-default so crawlers can map the
 * locale cluster instead of treating prefixed copies as duplicates.
 */
import { DEFAULT_LOCALE, LAUNCH_LOCALES } from "@/i18n/config";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://jolarca.example";

/** Absolute URL for a site path in a given locale. */
export function localizedUrl(path: string, locale: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const body = clean === "/" ? "" : clean;
  return locale === DEFAULT_LOCALE
    ? `${SITE_URL}${body}`
    : `${SITE_URL}/${locale}${body}`;
}

/**
 * Metadata `alternates` block: canonical pinned to the default-locale URL
 * (one canonical per cluster) + hreflang for every launch locale + x-default.
 */
export function localeAlternates(path: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  return {
    canonical: localizedUrl(path, DEFAULT_LOCALE),
    languages: {
      ...Object.fromEntries(
        LAUNCH_LOCALES.map((locale) => [locale, localizedUrl(path, locale)]),
      ),
      "x-default": localizedUrl(path, DEFAULT_LOCALE),
    },
  };
}
