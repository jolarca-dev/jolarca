import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { cookies } from "next/headers";

import "../styles/globals.css";

/*
 * Root layout — owns the document shell (<html lang>, fonts, metadata) so
 * that root-boundary documents (the built-in 404 shell, root not-found.tsx)
 * also carry lang/title and pass axe html-has-lang / document-title.
 *
 * Trade-off accepted (amends the "no headers() in layouts" note in
 * [locale]/layout.tsx): reading the middleware-bridged locale here opts
 * pages into dynamic rendering. On the self-hosted target there is no CDN
 * SSG benefit to sacrifice, and the CSP nonce mechanism is unaffected
 * (Next still applies the middleware nonce to injected tags).
 *
 * Self-hosted via next/font: fonts are fetched at BUILD time and served
 * from our origin — no runtime requests to third parties (GDPR; ADR-0009).
 * latin-ext is required for Lithuanian/Latvian/Estonian diacritics.
 */
const display = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "JOL Marketplace", template: "%s | JOL Marketplace" },
  description: "Baltic marketplace — Lithuania, Latvia, Estonia.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  // Middleware bridges the resolved locale (URL prefix → cookie →
  // Accept-Language → default) into NEXT_LOCALE.
  const locale = store.get("NEXT_LOCALE")?.value ?? "lt";
  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
