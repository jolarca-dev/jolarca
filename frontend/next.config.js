// JOL Marketplace — Next.js production configuration (self-hosted standalone).
//
// SECURITY HEADERS: owned by src/middleware.ts — the per-request CSP nonce
// makes a page-level static CSP here unsuitable. The headers() fallback
// below covers ONLY routes the middleware matcher skips (hashed static
// assets), so every response carries the hardening set (ISO 27001 A.8 /
// SOC 2 CC6). The nginx edge mirrors the same static subset.
//
// NEVER add a CSP here for page routes: browsers enforce multiple CSP
// headers conjunctively, and a nonce-less policy would block the
// nonce-bearing inline scripts the middleware policy allows.

const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone server for the Docker runner stage (.next/standalone).
  output: "standalone",

  // The compose dev target bind-mounts the repo and runs next dev; host
  // `next build` runs would otherwise overwrite its cache mid-serve
  // (MODULE_NOT_FOUND 500s / white screen). Dev uses its own distDir.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Source maps never ship to production browsers.
  productionBrowserSourceMaps: false,
  // Locale roots normalize WITH the slash (/en → /en/) in middleware;
  // without this flag Next core strips trailing slashes and loops.
  skipTrailingSlashRedirect: true,

  images: {
    // Optimized via Next's built-in optimizer (works in standalone; no CDN).
    // AVIF is served first (smallest), WebP fallback; sharp is a declared
    // dependency so the standalone Docker image can transcode both.
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    // Device ladder + small asset ladder (thumbs in cart/palette).
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Media origins: MinIO in dev (localhost:9000); production media host
    // arrives via NEXT_PUBLIC_MEDIA_HOSTNAME once MVP-P1 lands.
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/**",
      },
      ...(process.env.NEXT_PUBLIC_MEDIA_HOSTNAME
        ? [
            {
              protocol: "https",
              hostname: process.env.NEXT_PUBLIC_MEDIA_HOSTNAME,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },

  // Static-asset header fallback — see the file-header warning. Mirrors
  // STATIC_SECURITY_HEADERS in src/lib/security.ts with a strict,
  // nonce-less CSP (assets are immutable hashed files; no inline code).
  async headers() {
    const staticSecurity = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "geolocation=(), microphone=(), camera=(), payment=(self)",
      },
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'self'; script-src 'self'; style-src 'self'; " +
          "img-src 'self' data: https: blob:; font-src 'self'; " +
          "connect-src 'self'; frame-ancestors 'none'; object-src 'none'; " +
          "base-uri 'self'; form-action 'self'" +
          // See src/lib/security.ts: upgrade-insecure-requests only behind TLS.
          ((process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https")
            ? "; upgrade-insecure-requests"
            : ""),
      },
    ];
    return [
      {
        // Immutable hashed assets only — page security headers live in
        // middleware (per-request nonce).
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          ...staticSecurity,
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
