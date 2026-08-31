import { describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  buildCsp,
  generateNonce,
  STATIC_SECURITY_HEADERS,
} from "@/lib/security";

describe("nonce generation", () => {
  it("produces standard base64 of 16 random bytes", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/); // 16 bytes → 24 chars
    expect(atob(nonce).length).toBe(16);
  });

  it("is unique per request", () => {
    const samples = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(samples.size).toBe(200);
  });
});

describe("CSP builder", () => {
  const csp = buildCsp("TESTNONCE", "http://localhost:8000");

  it("carries the per-request nonce on script and style sources", () => {
    expect(csp).toContain("script-src 'self' 'nonce-TESTNONCE'");
    expect(csp).toContain("style-src 'self' 'nonce-TESTNONCE'");
  });

  it("wires the API origin into connect-src", () => {
    expect(csp).toContain("connect-src 'self' http://localhost:8000");
  });

  it("locks down dangerous sources", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    // unsafe-inline is forbidden everywhere except the documented Stripe
    // style-src-attr carve-out (see src/lib/security.ts buildCsp).
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("frames: Stripe (SAQ-A) plus user-initiated OpenStreetMap only", () => {
    expect(csp).toContain(
      "frame-src https://js.stripe.com https://www.openstreetmap.org",
    );
  });

  it("allowlists the Stripe loader script and API origin for checkout", () => {
    expect(csp).toContain("https://js.stripe.com");
    expect(csp).toContain("https://api.stripe.com");
    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' https:\/\/js\.stripe\.com/,
    );
  });

  it("adds the self-hosted Plausible origin only when configured", () => {
    expect(csp).not.toContain("https://pa.example");
    const withPlausible = buildCsp(
      "N1",
      "http://localhost:8000",
      "https://pa.example",
    );
    expect(withPlausible).toContain("https://pa.example");
    expect(withPlausible).toMatch(
      /script-src 'self' 'nonce-N1' https:\/\/js\.stripe\.com https:\/\/pa\.example/,
    );
  });
});

describe("header application", () => {
  it("sets the full static set plus a per-request CSP", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, "N1", "http://api:8000");

    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toBe(
      "geolocation=(), microphone=(), camera=(), payment=(self)",
    );
    expect(headers.get("Content-Security-Policy")).toContain("'nonce-N1'");
  });

  it("keeps the static list immutable-shaped and header-safe", () => {
    expect(STATIC_SECURITY_HEADERS.length).toBe(5);
    for (const [name, value] of STATIC_SECURITY_HEADERS) {
      expect(name.length).toBeGreaterThan(0);
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
