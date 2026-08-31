import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FuneralDetailView } from "@/components/client/funeral/funeral-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "funeral" });
  return { title: t("metaDetailTitle") };
}

/**
 * Funeral home profile — muted palette wrapper, skip link, human contact
 * first. The profile data comes from GAP-F03; sanctioned notices render
 * until the backend ships it (never invented providers).
 */
export default async function FuneralHomeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "funeral" });

  return (
    <div className="theme-funeral min-h-screen bg-surface">
      <a
        href="#funeral-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-base text-surface-raised focus:not-sr-only focus:absolute focus:z-50 focus:m-4"
      >
        {t("skipToContent")}
      </a>
      <main id="funeral-content" className="mx-auto max-w-5xl px-4 py-16">
        <Suspense
          fallback={
            <div
              className="h-96 animate-pulse rounded-lg bg-surface"
              aria-hidden="true"
            />
          }
        >
          <FuneralDetailView slug={slug} />
        </Suspense>
      </main>
    </div>
  );
}
