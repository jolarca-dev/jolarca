import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";

import { JsonLd } from "@/components/rsc/json-ld";
import {
  FeaturedProducts,
  HomeCategories,
  HomeHero,
} from "@/components/rsc/home-sections";
import {
  HeroSkeleton,
  SkeletonGrid,
  SkeletonTiles,
} from "@/components/rsc/skeleton-grid";
import { localeAlternates } from "@/lib/seo";

// The home rails are live catalog content: render at request time so a
// build-time fetch failure (no backend in the builder stage) never gets
// baked into static HTML as an error/empty state.
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jolarca.example";

const OG_LOCALES: Record<string, string> = {
  lt: "lt_LT",
  lv: "lv_LV",
  en: "en_US",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  const title = t("title");
  const description = t("subtitle");
  return {
    title,
    description,
    alternates: localeAlternates("/"),
    openGraph: {
      type: "website",
      url: SITE_URL,
      siteName: "JOL Marketplace",
      title,
      description,
      locale: OG_LOCALES[locale] ?? "en_US",
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <main className="mx-auto max-w-6xl p-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "JOL Marketplace",
          url: SITE_URL,
          inLanguage: locale,
        }}
      />

      {/* Single H1 per page; hero streams below as H2 banner content. */}
      <h1 className="text-3xl font-semibold text-primary-deep">{t("title")}</h1>
      <p className="mt-2 text-ink-muted">{t("subtitle")}</p>

      {/* Independent Suspense boundaries — each section streams on its own
          timeline; no await blocks the whole page (parallel fetching). */}
      <div className="mt-8 space-y-4">
        <Suspense fallback={<HeroSkeleton />}>
          <HomeHero />
        </Suspense>
        <Suspense fallback={<SkeletonTiles count={4} />}>
          <HomeCategories />
        </Suspense>
        <Suspense fallback={<SkeletonGrid count={8} />}>
          <FeaturedProducts locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
