import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OnboardingWizard } from "@/components/client/seller/onboarding-wizard";
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
    title: t("sellerOnboardingTitle"),
    // Identity-collection flows must never be indexed or archived.
    robots: { index: false, follow: false },
  };
}

/**
 * Seller onboarding — RSC shell with a hard role gate: non-sellers go home.
 * The wizard itself is a single client island; KYC documents flow straight
 * to the backend (no client processing), Stripe Connect is backend-mediated.
 */
export default async function SellerOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // /seller is auth-gated by middleware; here the role routing: the wizard
  // is for BUYERS becoming sellers (a fresh account is role=buyer until a
  // SellerProfile exists), existing sellers go to their dashboard, and
  // admins have no business onboarding.
  const session = await getSession();
  const role = session?.role;
  if (!session || role === "admin") {
    redirect({ href: "/", locale });
  }
  if (role === "seller") {
    redirect({ href: "/seller", locale });
  }

  const t = await getTranslations({ locale, namespace: "seller" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-primary-deep">
        {t("onboardingTitle")}
      </h1>
      <p className="mb-8 text-sm text-ink-muted">{t("onboardingIntro")}</p>
      <Suspense
        fallback={
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        }
      >
        <OnboardingWizard />
      </Suspense>
    </main>
  );
}
