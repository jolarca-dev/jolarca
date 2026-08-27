import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { SuccessBody } from "@/components/client/checkout/success-body";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return {
    title: t("successTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Order confirmation — reached from Stripe's return URL after a successful
 * payment. RSC shell; the client island clears the cart + recovery snapshot.
 */
export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto max-w-4xl p-8">
      {/* useSearchParams requires a Suspense boundary in static rendering. */}
      <Suspense fallback={null}>
        <SuccessBody />
      </Suspense>
    </main>
  );
}
