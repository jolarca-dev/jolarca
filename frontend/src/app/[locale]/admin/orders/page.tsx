import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ContractGapNotice } from "@/components/contract-gap-notice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("ordersTitle"), robots: { index: false } };
}

export default async function AdminOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Body />;
}

function Body() {
  const t = useTranslations("admin");
  return (
    <main className="space-y-4">
      <h2 className="text-lg font-semibold text-primary-deep">
        {t("ordersTitle")}
      </h2>
      <ContractGapNotice gapIds={["GAP-M11"]} />
    </main>
  );
}
