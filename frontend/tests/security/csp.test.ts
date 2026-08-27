import { describe, expect, it, vi } from "vitest";

import {
  applySecurityHeaders,
  buildCsp,
  generateNonce,
  sanitizeRedirectUrl,
  verifyCspNonce,
} from "@/lib/security";

/**
 * Production security hardening suite — ISO 27001 A.8 / SOC 2 CC6 gates.
 * Complements tests/unit/security.test.ts (header set + CSP shape); this
 * file locks the nonce validation contract and the open-redirect defense.
 */

describe("nonce lifecycle", () => {
  it("generated nonces always pass validation", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(verifyCspNonce(generateNonce())).toBe(true);
    }
  });

  it("rejects malformed, short, and injected nonce candidates", () => {
    expect(verifyCspNonce("")).toBe(false);
    expect(verifyCspNonce("short")).toBe(false);
    expect(verifyCspNonce("A".repeat(24))).toBe(false); // wrong padding
    expect(verifyCspNonce("'unsafe-inline'")).toBe(false);
    expect(verifyCspNonce("abc'); drop table x;--")).toBe(false);
    expect(verifyCspNonce(`${"A".repeat(22)}== `)).toBe(false); // trailing
    expect(verifyCspNonce(undefined as unknown as string)).toBe(false);
  });
});

describe("CSP hardening constraints", () => {
  const csp = buildCsp(generateNonce(), "https://api.example");

  it("never contains unsafe-inline or unsafe-eval outside the Stripe carve-out", () => {
    // The ONLY 'unsafe-inline' allowed anywhere is style-src-attr (Stripe
    // Payment Element style attributes); script and <style> blocks stay
    // nonce-gated.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("every script/style execution path is self, nonce, or allowlisted", () => {
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}'/);
    expect(csp).toMatch(/style-src 'self' 'nonce-[A-Za-z0-9+/=]{24}'/);
    // Stripe Payment Element carve-out: style ATTRIBUTES only — <style>
    // blocks stay nonce-gated because style-src itself carries no
    // 'unsafe-inline'.
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toMatch(/style-src 'self' 'nonce-[A-Za-z0-9+/=]{24}';/);
  });

  it("forces HTTPS upgrades on https deployments only", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marketplace.example");
    expect(buildCsp(generateNonce(), "https://api.example")).toContain(
      "upgrade-insecure-requests",
    );
    vi.unstubAllEnvs();
    // Plain-HTTP local stacks: the directive would break strict engines
    // (WebKit upgrades loopback subresources to https).
    expect(buildCsp(generateNonce(), "https://api.example")).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(csp).toContain("object-src 'none'");
  });

  it("carries blob: for client-side image pipelines only", () => {
    expect(csp).toContain("img-src 'self' data: https: blob:");
  });

  it("applies the full header set on a fresh response", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, generateNonce(), "https://api.example");
    for (const name of [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]) {
      expect(headers.get(name), `${name} must be present`).toBeTruthy();
    }
    expect(headers.get("Permissions-Policy")).toContain("payment=(self)");
  });
});

describe("sanitizeRedirectUrl — open redirect defense", () => {
  it("keeps same-site relative paths (including query)", () => {
    expect(sanitizeRedirectUrl("/en/account/orders")).toBe(
      "/en/account/orders",
    );
    expect(sanitizeRedirectUrl("/lt/search?q=rosary")).toBe(
      "/lt/search?q=rosary",
    );
  });

  it("neutralizes protocol-relative and scheme URLs", () => {
    expect(sanitizeRedirectUrl("//evil.example/phish")).toBe("/");
    expect(sanitizeRedirectUrl("https://evil.example")).toBe("/");
    expect(sanitizeRedirectUrl("javascript:alert(1)")).toBe("/");
    expect(sanitizeRedirectUrl("data:text/html,evil")).toBe("/");
  });

  it("rejects backslash smuggling and empty input", () => {
    expect(sanitizeRedirectUrl("/\\evil.example")).toBe("/");
    expect(sanitizeRedirectUrl("")).toBe("/");
    expect(sanitizeRedirectUrl("   ")).toBe("/");
    expect(sanitizeRedirectUrl(undefined as unknown as string)).toBe("/");
  });
});
