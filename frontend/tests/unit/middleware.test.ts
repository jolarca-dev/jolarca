import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  detectLocaleFromAcceptLanguage,
  isProtectedRoute,
  isSupportedLocale,
  LOCALE_METADATA,
  PROTECTED_ROUTES,
  resolveLocale,
  stripLocaleSegment,
} from "@/i18n/config";

describe("locale support set", () => {
  it("launches lt/lv/en with lt as the default market", () => {
    expect(DEFAULT_LOCALE).toBe("lt");
    expect(isSupportedLocale("lt")).toBe(true);
    expect(isSupportedLocale("lv")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("et")).toBe(false); // dormant until re-added
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
  });

  it("metadata covers every launch locale and is LTR-only", () => {
    for (const code of ["lt", "lv", "en"] as const) {
      const meta = LOCALE_METADATA[code];
      expect(meta.code).toBe(code);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.flag.length).toBeGreaterThan(0);
      expect(meta.rtl).toBe(false);
    }
  });
});

describe("Accept-Language detection", () => {
  it("returns undefined for missing/empty headers", () => {
    expect(detectLocaleFromAcceptLanguage(null)).toBeUndefined();
    expect(detectLocaleFromAcceptLanguage("")).toBeUndefined();
  });

  it("honors q-value ranking", () => {
    expect(detectLocaleFromAcceptLanguage("en;q=0.5, lv;q=0.9")).toBe("lv");
    expect(detectLocaleFromAcceptLanguage("lt, en;q=0.8")).toBe("lt");
  });

  it("maps region tags to their primary locale", () => {
    expect(detectLocaleFromAcceptLanguage("lt-LT")).toBe("lt");
    expect(detectLocaleFromAcceptLanguage("en-GB,en;q=0.9")).toBe("en");
    expect(detectLocaleFromAcceptLanguage("lv-LV;q=0.9, ru;q=0.8")).toBe("lv");
  });

  it("skips unsupported languages and falls through", () => {
    expect(detectLocaleFromAcceptLanguage("ru, de;q=0.9, en;q=0.5")).toBe("en");
    expect(detectLocaleFromAcceptLanguage("ru, de")).toBeUndefined();
  });

  it("ignores malformed q-values", () => {
    expect(detectLocaleFromAcceptLanguage("lv;q=abc, en")).toBe("en");
  });
});

describe("resolveLocale priority order", () => {
  it("(1) cookie beats Accept-Language and default", () => {
    expect(resolveLocale({ cookieLocale: "lv", acceptLanguage: "en" })).toBe(
      "lv",
    );
  });

  it("(2) Accept-Language beats the default when cookie is absent/invalid", () => {
    expect(
      resolveLocale({ cookieLocale: undefined, acceptLanguage: "en" }),
    ).toBe("en");
    expect(resolveLocale({ cookieLocale: "fr", acceptLanguage: "lv" })).toBe(
      "lv",
    );
  });

  it("(3) default lt when nothing else matches", () => {
    expect(resolveLocale({})).toBe("lt");
    expect(resolveLocale({ cookieLocale: "fr", acceptLanguage: "ru" })).toBe(
      "lt",
    );
  });
});

describe("locale segment stripping", () => {
  it("strips a leading locale segment", () => {
    expect(stripLocaleSegment("/lt/account")).toBe("/account");
    expect(stripLocaleSegment("/en")).toBe("/");
  });

  it("leaves non-locale paths untouched", () => {
    expect(stripLocaleSegment("/account")).toBe("/account");
    expect(stripLocaleSegment("/et/cart")).toBe("/et/cart"); // et dormant
    expect(stripLocaleSegment("/")).toBe("/");
  });
});

describe("protected routes", () => {
  it("protects the spec list, prefixed and unprefixed", () => {
    for (const route of PROTECTED_ROUTES) {
      expect(isProtectedRoute(route)).toBe(true);
      expect(isProtectedRoute(`/en${route}`)).toBe(true);
      expect(isProtectedRoute(`${route}/deeper`)).toBe(true);
    }
  });

  it("does not over-match lookalikes or public routes", () => {
    expect(isProtectedRoute("/accounting")).toBe(false);
    expect(isProtectedRoute("/seller-public")).toBe(false);
    expect(isProtectedRoute("/")).toBe(false);
    expect(isProtectedRoute("/search")).toBe(false);
    expect(isProtectedRoute("/funeral-services")).toBe(false);
  });
});
