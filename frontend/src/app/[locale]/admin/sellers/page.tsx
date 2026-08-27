import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SellerQueue } from "@/components/client/admin/seller-queue";
import { getSession } from "@/lib/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("sellersTitle"), robots: { index: false } };
}

/** Seller verification queue — the admin layout owns the role gate. */
export default async function AdminSellersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Layout already redirected non-admins; the email feeds audit details.
  const session = await getSession();
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <main className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-deep">
          {t("sellersTitle")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("sellersIntro")}</p>
      </div>
      <Suspense
        fallback={
          <div className="card h-48 animate-pulse" aria-hidden="true" />
        }
      >
        <SellerQueue adminEmail={session?.email ?? "admin"} />
      </Suspense>
    </main>
  );
}
