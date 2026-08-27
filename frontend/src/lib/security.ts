/**
 * Security primitives for the Edge middleware — pure, typed, unit-tested.
 *
 * Middleware OWNS response security headers (per-request CSP nonce makes
 * static next.config.js headers unsuitable). The nginx edge mirrors the
 * static subset as a defense-in-depth fallback (nginx/nginx.conf).
 */

/** Static header set — identical names/values mirrored at the nginx edge
 * and in next.config.js's static-asset fallback (defense in depth,
 * ISO 27001 A.8 / SOC 2 CC6). `payment=(self)` keeps the Payment Request
 * API confined to our origin. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> =
  [
    [
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    ],
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    [
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=(self)",
    ],
  ];

/**
 * Fresh CSP nonce per request — 16 random bytes, standard base64.
 * Edge-safe: `crypto.getRandomValues` + `btoa` exist on both the Edge
 * runtime and Node 18+.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Content-Security-Policy for this request. `apiUrl` feeds connect-src.
 * Stripe origins are allowlisted explicitly (SAQ-A, ADR-0009): the loader
 * script from js.stripe.com and confirmations against api.stripe.com; the
 * Payment Element itself renders in a js.stripe.com frame. The funeral
 * vertical may embed an OpenStreetMap frame — but only after an explicit
 * visitor click mounts the iframe (no third-party request by default).
 * `plausibleApi` (self-hosted analytics) is added ONLY when configured —
 * and analytics still loads only after explicit consent (ConsentGate).
 * Nonces are the inline-execution path for OUR code — no 'unsafe-eval';
 * the single 'unsafe-inline' carve-out is style-src-attr, scoped to style
 * ATTRIBUTES only, required by Stripe's Payment Element (see buildCsp).
 */
export function buildCsp(
  nonce: string,
  apiUrl: string,
  plausibleApi?: string,
): string {
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, "https://js.stripe.com"];
  if (process.env.NODE_ENV === "development") {
    // Next's dev-only react-refresh HMR runtime evaluates code strings;
    // without this the dev client bundle dies mid-hydration and islands
    // (programmatic router.push) never work. Production stays strict —
    // tests/unit + tests/security assert the prod policy has no eval.
    scriptSrc.push("'unsafe-eval'");
  }
  const connectSrc = [`'self'`, apiUrl, "https://api.stripe.com"];
  if (plausibleApi) {
    scriptSrc.push(plausibleApi);
    connectSrc.push(plausibleApi);
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Stripe's Payment Element applies inline STYLE ATTRIBUTES to its own
    // DOM from js.stripe.com; with a nonce present, 'unsafe-inline' inside
    // style-src is ignored by CSP2+ browsers, so the scoped style-src-attr
    // directive is the sanctioned carve-out (no <style> blocks are unlocked).
    "style-src-attr 'unsafe-inline'",
    // blob: covers client-side WebP conversion and KYC preview URLs only.
    "img-src 'self' data: https: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src https://js.stripe.com https://www.openstreetmap.org",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // HTTPS-upgrade is only meaningful behind TLS; on plain-HTTP local
    // stacks it makes strict engines (WebKit) upgrade loopback subresource
    // loads to https and break every asset request.
    ...((process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https")
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
}

/* -------------------------------------------------------------------------- */
/* Nonce + redirect validation                                                 */
/* -------------------------------------------------------------------------- */

/** Exactly what generateNonce() emits: standard base64 of 16 bytes. */
const NONCE_PATTERN = /^[A-Za-z0-9+/]{22}==$/;

/**
 * Validate a nonce before trusting it (defense in depth for any nonce
 * round-tripped through headers or storage). Rejects wrong length,
 * non-base64 charset, and injection attempts.
 */
export function verifyCspNonce(nonce: string): boolean {
  return typeof nonce === "string" && NONCE_PATTERN.test(nonce);
}

/**
 * Open-redirect defense for post-login/return flows. Only SAME-SITE paths
 * survive: a leading single slash, never protocol-relative (`//evil`),
 * never a scheme (`javascript:`, `https://evil`). Absolute URLs to the
 * current origin are reduced to their path; everything else lands on "/".
 */
export function sanitizeRedirectUrl(url: string): string {
  if (typeof url !== "string") return "/";
  const trimmed = url.trim();
  if (!trimmed) return "/";

  // Protocol-relative or anything with a scheme/host is not a local path.
  if (trimmed.startsWith("//")) return "/";

  if (trimmed.startsWith("/")) {
    // Reject backslash tricks (\/evil parses as a host in some browsers).
    return trimmed.includes("\\") ? "/" : trimmed;
  }

  // Absolute URL: keep it only when it points at the current origin.
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search;
      }
    } catch {
      return "/";
    }
  }
  return "/";
}

/** Apply the full security header set (static + per-request CSP). */
export function applySecurityHeaders(
  headers: Headers,
  nonce: string,
  apiUrl: string,
  plausibleApi?: string,
): void {
  for (const [name, value] of STATIC_SECURITY_HEADERS) {
    headers.set(name, value);
  }
  headers.set("Content-Security-Policy", buildCsp(nonce, apiUrl, plausibleApi));
}
