import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ConsentManager } from "@/components/client/account/consent-manager";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "consent" });
  return { title: t("managerTitle"), robots: { index: false } };
}

/**
 * Account → consent management. Auth-gated by the /account protection.
 * Local decision state is effective immediately; the immutable audit trail
 * lives in compliance_app (GAP-C01/C04).
 */
export default async function AccountConsentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "consent" });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("managerTitle")}
      </h1>
      <p className="mt-2 text-ink-muted">{t("managerBody")}</p>
      <ConsentManager />
    </main>
  );
}
