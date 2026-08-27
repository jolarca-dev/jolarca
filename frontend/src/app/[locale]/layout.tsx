import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { Announcer } from "@/components/client/a11y/announcer";
import { SkipLink } from "@/components/client/a11y/skip-link";
import { ConsentBanner } from "@/components/client/consent-banner";
import { QueryProvider } from "@/components/client/query-provider";
import {
  MarketingPixels,
  PlausibleScript,
} from "@/components/client/script-loader";
import { Toaster } from "@/components/client/toaster";
import { WebVitals } from "@/components/client/web-vitals";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { routing } from "@/i18n/routing";

/*
 * CSP NONCE CONSUMPTION CONTRACT (ISO 27001 A.8):
 *  - Middleware generates a per-request nonce and forwards it as the
 *    `x-nonce` request header (src/middleware.ts). Next.js applies that
 *    nonce automatically to every inline <script>/<style> it injects —
 *    the documented mechanism.
 *  - This layout emits NO inline styles (Tailwind compiles to linked
 *    stylesheets), so there is no <style> tag needing a manual nonce.
 *  - Stripe (@stripe/stripe-js) injects an EXTERNAL script from
 *    js.stripe.com — allowed by script-src origin, no nonce required.
 *    Card fields render inside the Stripe frame (SAQ-A preserved).
 *
 * The document shell (<html lang>, fonts, metadata, globals.css) lives in
 * the root layout (src/app/layout.tsx) so root-boundary documents (404)
 * keep lang/title; this layout contributes the locale-scoped chrome only.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();

  // Resource hints — origins only, never page content. React hoists these
  // <link> elements into <head>. The API origin may be same-origin in dev
  // (preconnect to self is skipped); the media host arrives with MVP-P1.
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL
    ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
    : null;
  const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOSTNAME ?? null;

  return (
    <>
      {apiOrigin && apiOrigin !== "http://localhost:8000" && (
        <link rel="preconnect" href={apiOrigin} crossOrigin="use-credentials" />
      )}
      {mediaHost && (
        <link
          rel="preconnect"
          href={`https://${mediaHost}`}
          crossOrigin="anonymous"
        />
      )}
      {/* Stripe loader origin — DNS only until checkout actually mounts it. */}
      <link rel="dns-prefetch" href="https://js.stripe.com" />
      <NextIntlClientProvider messages={messages}>
        {/* The provider adds NO DOM, so SkipLink remains the first
            focusable element while getting its messages from context. */}
        <SkipLink />
        <QueryProvider>
          <SiteHeader locale={locale} />
          {children}
          <SiteFooter />
          <Toaster />
          {/* App-wide aria-live announcements, sequenced to avoid collisions. */}
          <Announcer />
          {/* GDPR gate: nothing optional mounts before explicit consent. */}
          <ConsentBanner />
          <PlausibleScript />
          <MarketingPixels />
          {/* CWV monitoring loads only with analytics consent. */}
          <WebVitals />
        </QueryProvider>
      </NextIntlClientProvider>
    </>
  );
}
