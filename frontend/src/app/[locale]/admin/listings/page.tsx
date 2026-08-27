import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ListingQueue } from "@/components/client/admin/listing-queue";
import { getSession } from "@/lib/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("listingsTitle"), robots: { index: false } };
}

/** Content moderation queue — flagged listings with preview + decisions. */
export default async function AdminListingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <main className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-deep">
          {t("listingsTitle")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("listingsIntro")}</p>
      </div>
      <Suspense
        fallback={
          <div className="card h-48 animate-pulse" aria-hidden="true" />
        }
      >
        <ListingQueue adminEmail={session?.email ?? "admin"} />
      </Suspense>
    </main>
  );
}
