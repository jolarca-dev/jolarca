import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ListingForm } from "@/components/client/seller/listing-form";
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
    title: t("sellerNewListingTitle"),
    robots: { index: false, follow: false },
  };
}

/** New listing — role-gated RSC shell around the ListingForm island. */
export default async function NewListingPage({
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-primary-deep">
        {t("newListingTitle")}
      </h1>
      <p className="mb-8 text-sm text-ink-muted">{t("newListingIntro")}</p>
      <ListingForm />
    </main>
  );
}
