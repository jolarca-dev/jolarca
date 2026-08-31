import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SearchInterface } from "@/components/client/search/search-interface";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  return { title: t("pageTitle") };
}

/**
 * Search — RSC shell around the SearchInterface island. The `q` param is
 * read once for deep links only; live queries stay in client state and are
 * never written back to the URL (privacy posture).
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { q } = await searchParams;
  const t = await getTranslations({ locale, namespace: "search" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary-deep">
        {t("pageTitle")}
      </h1>
      <SearchInterface
        initialQuery={typeof q === "string" ? q : ""}
        locale={locale}
      />
    </main>
  );
}
