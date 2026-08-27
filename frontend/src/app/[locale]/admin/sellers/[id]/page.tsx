import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SellerDetailView } from "@/components/client/admin/seller-detail";
import { getSession } from "@/lib/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("sellerDetailTitle"), robots: { index: false } };
}

/** Seller verification detail — business info, documents, history, actions. */
export default async function AdminSellerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <main>
      <h2 className="sr-only">{t("sellerDetailTitle")}</h2>
      <Suspense
        fallback={
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        }
      >
        <SellerDetailView
          sellerId={id}
          adminEmail={session?.email ?? "admin"}
        />
      </Suspense>
    </main>
  );
}
