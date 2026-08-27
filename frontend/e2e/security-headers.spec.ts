import { expect, test } from "@playwright/test";

/**
 * Security header enforcement (ISO 27001 A.8 / SOC 2 CC6) — asserts the
 * middleware-emitted header set on live responses: full static set, a
 * per-request CSP nonce, and the absence of framework fingerprinting.
 * Static-asset fallback coverage lives in the config-level checks; asset
 * filenames are content-hashed and asserted generically.
 */

test.describe("Security headers on page responses", () => {
  test("every hardening header is present with a fresh CSP nonce", async ({
    page,
  }) => {
    const response = await page.goto("/en");
    expect(response?.ok()).toBe(true);
    const headers = response!.headers();

    expect(headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("payment=(self)");

    // No framework fingerprinting.
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("CSP carries a per-request nonce and no unsafe directives", async ({
    page,
  }) => {
    const first = await page.goto("/en");
    const csp1 = first!.headers()["content-security-policy"];
    expect(csp1).toBeTruthy();
    const policy1 = csp1 as string;

    const nonceMatch = policy1.match(/'nonce-([A-Za-z0-9+/=]{24})'/);
    expect(nonceMatch, "CSP must carry a base64 nonce").not.toBeNull();
    expect(policy1).toContain("script-src 'self' 'nonce-");
    expect(policy1).toContain("style-src 'self' 'nonce-");
    expect(policy1).toContain("object-src 'none'");
    expect(policy1).toContain("frame-ancestors 'none'");
    // upgrade-insecure-requests ships only on https deployments (see
    // src/lib/security.ts); local plain-HTTP stacks must omit it.
    if ((process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https")) {
      expect(policy1).toContain("upgrade-insecure-requests");
    } else {
      expect(policy1).not.toContain("upgrade-insecure-requests");
    }
    // The single carve-out is style-src-attr 'unsafe-inline' (Stripe's
    // inline style ATTRIBUTES — see buildCsp); the classic directives must
    // never carry unsafe-inline.
    expect(policy1).not.toContain("script-src 'unsafe-inline'");
    expect(policy1).not.toContain("style-src 'unsafe-inline'");
    // Dev-only: Next's react-refresh HMR runtime needs eval (see buildCsp);
    // the production policy is asserted eval-free in tests/security/csp.test.ts.
    if (process.env.NODE_ENV === "production") {
      expect(policy1).not.toContain("unsafe-eval");
    }

    // Fresh nonce per request — two loads must not share one.
    const second = await page.goto("/en");
    const csp2 = second!.headers()["content-security-policy"];
    expect(csp2).toBeTruthy();
    const nonce2 = (csp2 as string).match(/'nonce-([A-Za-z0-9+/=]{24})'/);
    expect(nonce2?.[1]).not.toBe(nonceMatch?.[1]);
  });
});

test.describe("Security headers on static assets", () => {
  test("hashed JS chunks carry the fallback hardening set", async ({
    request,
    page,
  }) => {
    await page.goto("/en");
    // Discover a real hashed chunk from the rendered page.
    const assetUrl = await page.evaluate(() => {
      const script = Array.from(document.scripts).find((element) =>
        element.src.includes("/_next/static/"),
      );
      return script?.src ?? "";
    });
    expect(assetUrl, "page should reference a hashed static chunk").not.toBe(
      "",
    );

    const response = await request.get(assetUrl);
    expect(response.ok()).toBe(true);
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["content-security-policy"]).toBeTruthy();
    // Fallback policy is nonce-less but strict.
    expect(headers["content-security-policy"]).not.toContain("unsafe-inline");
  });
});
