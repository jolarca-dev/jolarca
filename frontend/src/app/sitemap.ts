import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jolarca.example";

/*
 * PUBLIC indexable routes only. Private/authenticated surfaces (/account,
 * /seller, /checkout, /cart, /orders, /admin) are robots-disallowed and
 * must never appear here — a sitemap entry for a disallowed URL is a mixed
 * signal to crawlers. Dynamic catalog URLs (products/categories/storefronts)
 * join once a backend-driven sitemap lands; today the frontend has no
 * build-time catalog access.
 *
 * Launch locales (src/i18n/config.ts): lt is the default market and served
 * unprefixed at root; lv/en are prefixed (localePrefix: "as-needed").
 */
const DEFAULT_LOCALE = "lt";
const LOCALES = ["lt", "lv", "en"] as const;
/* /sellers index is a GAP-V13 stub and /search is an unrenderable client
 * shell — never send crawlers at surfaces without server-rendered content. */
const ROUTES = ["", "/funeral-services"] as const;

function localizedUrl(locale: (typeof LOCALES)[number], route: string): string {
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return `${BASE_URL}${prefix}${route}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const route of ROUTES) {
    for (const locale of LOCALES) {
      entries.push({
        url: localizedUrl(locale, route),
        lastModified: new Date(),
        alternates: {
          languages: {
            ...Object.fromEntries(
              LOCALES.map((l) => [l, localizedUrl(l, route)]),
            ),
            // Canonical discovery for crawlers: the launch-market URL.
            "x-default": localizedUrl(DEFAULT_LOCALE, route),
          },
        },
      });
    }
  }
  return entries;
}
