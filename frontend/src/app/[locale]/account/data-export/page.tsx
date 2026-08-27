import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataExportRequest } from "@/components/client/account/data-export";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "consent" });
  return { title: t("exportTitle"), robots: { index: false } };
}

/**
 * Account → GDPR Art. 20 data portability. Self-service request; the
 * archive is prepared server-side and delivered out-of-band (GAP-C02).
 */
export default async function AccountDataExportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "consent" });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("exportTitle")}
      </h1>
      <DataExportRequest />
    </main>
  );
}
