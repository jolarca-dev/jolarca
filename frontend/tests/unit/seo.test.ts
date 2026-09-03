import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { localizedUrl, localeAlternates } from "@/lib/seo";

/* NEXT_PUBLIC_SITE_URL is unset under vitest → the documented fallback. */
const BASE = "https://jolarca.example";

describe("localizedUrl — localePrefix as-needed scheme", () => {
  it("serves the default locale unprefixed at root", () => {
    expect(localizedUrl("/", "lt")).toBe(BASE);
    expect(localizedUrl("/funeral-services", "lt")).toBe(
      `${BASE}/funeral-services`,
    );
  });

  it("prefixes non-default launch locales", () => {
    expect(localizedUrl("/", "lv")).toBe(`${BASE}/lv`);
    expect(localizedUrl("/funeral-services", "en")).toBe(
      `${BASE}/en/funeral-services`,
    );
  });

  it("tolerates missing leading slashes", () => {
    expect(localizedUrl("search", "en")).toBe(`${BASE}/en/search`);
  });
});

describe("localeAlternates — hreflang cluster", () => {
  it("pins canonical to the default locale and covers every locale + x-default", () => {
    const alt = localeAlternates("/funeral-services");
    expect(alt.canonical).toBe(`${BASE}/funeral-services`);
    expect(alt.languages).toEqual({
      lt: `${BASE}/funeral-services`,
      lv: `${BASE}/lv/funeral-services`,
      en: `${BASE}/en/funeral-services`,
      "x-default": `${BASE}/funeral-services`,
    });
  });
});

describe("robots — private surfaces out, public storefronts in", () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = Array.isArray(rule?.disallow)
    ? (rule?.disallow as string[])
    : [];

  it("disallows authenticated areas for every locale prefix", () => {
    for (const prefix of ["", "/lv", "/en"]) {
      expect(disallow).toContain(`${prefix}/account`);
      expect(disallow).toContain(`${prefix}/admin`);
      expect(disallow).toContain(`${prefix}/seller/`);
    }
  });

  it("never prefix-blocks the public /sellers storefronts", () => {
    /* robots disallow is PREFIX matching — "/seller" would swallow
     * "/sellers/<storefront>", so the rule must use "/seller/" and no
     * entry may prefix-match a storefront URL. */
    expect(disallow).not.toContain("/seller");
    for (const probe of [
      "/sellers",
      "/sellers/vilnius-workshops",
      "/en/sellers/x",
    ]) {
      expect(disallow.some((entry) => probe.startsWith(entry))).toBe(false);
    }
  });

  it("points crawlers at the sitemap", () => {
    expect(robots().sitemap).toBe(`${BASE}/sitemap.xml`);
  });
});

describe("sitemap — public indexable surface only", () => {
  const entries = sitemap();

  it("covers home + funeral-services across the three launch locales", () => {
    expect(entries).toHaveLength(6);
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(BASE);
    expect(urls).toContain(`${BASE}/lv`);
    expect(urls).toContain(`${BASE}/en/funeral-services`);
  });

  it("never lists disallowed or unrenderable routes", () => {
    for (const entry of entries) {
      expect(entry.url).not.toMatch(
        /\/(checkout|account|seller|cart|orders|search)/,
      );
    }
  });

  it("every entry carries the full hreflang cluster incl. x-default", () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages as Record<string, string>;
      expect(Object.keys(languages).sort()).toEqual(
        ["en", "lt", "lv", "x-default"].sort(),
      );
    }
  });
});
