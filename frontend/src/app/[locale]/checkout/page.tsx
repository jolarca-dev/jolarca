import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CheckoutFlow } from "@/components/client/checkout/checkout-flow";
import { JsonLd } from "@/components/rsc/json-ld";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jolarca.example";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return {
    title: t("checkoutTitle"),
    // Checkout must never be indexed or archived.
    robots: { index: false, follow: false },
  };
}

/**
 * Checkout — RSC shell (metadata + noindex + JSON-LD CheckoutPage) around a
 * single client island: address → delivery → embedded Stripe payment →
 * review. Card data stays inside Stripe's iframe (SAQ-A); guests can check
 * out (route is deliberately not auth-gated).
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "pages" });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("checkoutTitle")}
      </h1>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CheckoutPage",
          name: t("checkoutTitle"),
          url: `${SITE_URL}/${locale}/checkout`,
          inLanguage: locale,
        }}
      />
      <div className="mt-6">
        <CheckoutFlow />
      </div>
    </main>
  );
}
