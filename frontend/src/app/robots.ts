import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jolarca.example";

/*
 * Private/authenticated surfaces stay out of the index. Disallow entries are
 * PREFIX matches, so both the unprefixed default locale (lt at root) and the
 * prefixed launch locales must be listed.
 *
 * NOTE the trailing slash on "/seller/": the public seller storefronts live
 * under "/sellers" (GAP-V05/V06) and MUST stay crawlable — "/seller" without
 * the slash would prefix-match and block them too.
 */
const PRIVATE_AREAS = [
  "/account",
  "/admin",
  "/cart",
  "/checkout",
  "/orders",
  "/seller/",
] as const;

const LOCALE_PREFIXES = ["", "/lv", "/en"] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: LOCALE_PREFIXES.flatMap((prefix) =>
          PRIVATE_AREAS.map((area) => `${prefix}${area}`),
        ),
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
