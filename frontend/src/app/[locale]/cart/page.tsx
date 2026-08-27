import { getTranslations, setRequestLocale } from "next-intl/server";

import { CartView } from "@/components/client/cart-view";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("cartTitle") };
}

/**
 * Full-page cart: RSC shell (metadata + heading) with a single client
 * island for all interactivity. Cart state hydrates from the localStorage
 * draft (`jol_cart_draft`, non-PII only) and merges with the server cart
 * for authenticated sessions (GAP-O01/O07).
 */
export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "pages" });

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("cartTitle")}
      </h1>
      <CartView locale={locale} />
    </main>
  );
}
