import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";

import { RegisterForm } from "@/components/client/register-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("registerTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("registerTitle")}
      </h1>
      <div className="card mt-6 p-6">
        {/* params.locale is loosely typed by Next; routing guarantees the
            launch-locale union (et only via legacy links). */}
        <RegisterForm locale={locale as "lt" | "lv" | "et" | "en"} />
      </div>
    </main>
  );
}
