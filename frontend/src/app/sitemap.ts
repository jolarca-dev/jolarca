import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://jol-marketplace.example";
const LOCALES = ["lt", "lv", "et", "en"] as const;
const ROUTES = ["", "/cart", "/checkout", "/orders", "/seller", "/account"];

// hreflang alternates for every locale × route (Baltic SEO requirement).
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const route of ROUTES) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${BASE_URL}/${locale}${route}`,
        lastModified: new Date(),
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((l) => [l, `${BASE_URL}/${l}${route}`]),
          ),
        },
      });
    }
  }
  return entries;
}
