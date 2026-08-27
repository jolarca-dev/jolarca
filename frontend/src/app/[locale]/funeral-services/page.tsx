import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FuneralDirectory } from "@/components/client/funeral/funeral-directory";
import {
  GriefHeading,
  GriefNotice,
} from "@/components/client/funeral/grief-aware-elements";
import { localeAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "funeral" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates("/funeral-services"),
  };
}

/**
 * Funeral services landing — a directory and lead-generation surface,
 * NOT e-commerce (ADR-0008). `.theme-funeral` switches the raw tokens to
 * the muted slate/pewter palette for everything inside the wrapper: larger
 * type (20px base), calmer leading (1.7), desaturated gold. No pricing, no
 * urgency, no scarcity, no auto-playing media, no pop-ups.
 *
 * Hero deliberately carries NO CTA buttons — informational text and a
 * gentle scroll indicator only. Human contact lives on the cards (phone
 * above the fold) and in the consultation modal (ADR-0009). No JSON-LD
 * Product/Offer markup may ever be added here.
 */
export default async function FuneralServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "funeral" });

  return (
    <div className="theme-funeral min-h-screen bg-surface">
      {/* Skip link — visible on focus, jumps past the hero. */}
      <a
        href="#funeral-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-base text-surface-raised focus:not-sr-only focus:absolute focus:z-50 focus:m-4"
      >
        {t("skipToContent")}
      </a>

      <main id="funeral-content" className="mx-auto max-w-5xl px-4 py-16">
        {/* Hero — empathetic, unhurried, no CTA buttons. */}
        <header className="max-w-3xl">
          <h1 className="font-display text-3xl font-normal leading-(--tok-leading-tight) text-ink">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 text-lg leading-(--tok-leading) text-ink-muted">
            {t("heroSubtitle")}
          </p>
          <p className="mt-4 text-base leading-(--tok-leading) text-ink-muted">
            {t("heroReassurance")}
          </p>
          {/* Gentle scroll indicator — a quiet link, never a button. */}
          <a
            href="#directory"
            aria-label={t("heroScrollAria")}
            className="mt-10 inline-flex rounded-md p-2 text-ink-faint transition-dignified hover:text-ink-muted focus:outline-2 focus:outline-offset-2 focus:outline-primary/60"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-6 w-6"
            >
              <path
                d="m6 9 6 6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </header>

        {/* What to expect — gentle orientation, no commitments. */}
        <div className="mt-16 space-y-6">
          <GriefNotice title={t("expectTitle")}>
            <p>{t("expectBody1")}</p>
            <p>{t("expectBody2")}</p>
            <p>{t("expectBody3")}</p>
          </GriefNotice>
        </div>

        {/* Directory */}
        <section id="directory" className="mt-16">
          <GriefHeading id="directory-heading">
            {t("directoryTitle")}
          </GriefHeading>
          <p className="mt-2 max-w-2xl text-base leading-(--tok-leading) text-ink-muted">
            {t("directoryIntro")}
          </p>
          <div className="mt-8">
            <Suspense
              fallback={
                <div
                  className="h-64 animate-pulse rounded-lg bg-surface"
                  aria-hidden="true"
                />
              }
            >
              <FuneralDirectory />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
