import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SellerDashboard } from "@/components/client/seller/seller-dashboard";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";

// Session-gated: the role redirect must be evaluated per request, never
// baked into a static shell (a prerendered null session would send every
// seller home).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return {
    title: t("sellerDashboardTitle"),
    // Private dashboards are never indexed.
    robots: { index: false, follow: false },
  };
}

/**
 * Seller dashboard — RSC shell with the same role gate as onboarding.
 * The island fetches stats/orders/payouts from sellers_app; sanctioned
 * gap notices render until those endpoints ship (ADR-0007).
 */
export default async function SellerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session || session.role !== "seller") {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations({ locale, namespace: "seller" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary-deep">
        {t("dashboardTitle")}
      </h1>
      <Suspense
        fallback={
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        }
      >
        <SellerDashboard sellerSlug={session?.seller_slug ?? null} />
      </Suspense>
    </main>
  );
}
