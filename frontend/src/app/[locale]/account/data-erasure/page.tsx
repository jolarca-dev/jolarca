import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataErasureRequest } from "@/components/client/account/data-erasure";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "consent" });
  return { title: t("erasureTitle"), robots: { index: false } };
}

/**
 * Account → GDPR Art. 17 right to erasure. Typed confirmation flow; the
 * backend honors the erasure SLA and statutory retention set (GAP-C03).
 */
export default async function AccountDataErasurePage({
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
        {t("erasureTitle")}
      </h1>
      <p className="mt-2 text-ink-muted">{t("erasureBody")}</p>
      <DataErasureRequest />
    </main>
  );
}
