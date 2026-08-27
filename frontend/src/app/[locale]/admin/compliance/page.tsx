import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ComplianceQueue } from "@/components/client/admin/compliance-queue";
import { getSession } from "@/lib/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("complianceTitle"), robots: { index: false } };
}

/** GDPR request queue — Art. 15/17/20 fulfilment with a full audit trail. */
export default async function AdminCompliancePage({
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
          {t("complianceTitle")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("complianceIntro")}</p>
      </div>
      <Suspense
        fallback={
          <div className="card h-48 animate-pulse" aria-hidden="true" />
        }
      >
        <ComplianceQueue adminEmail={session?.email ?? "admin"} />
      </Suspense>
    </main>
  );
}
