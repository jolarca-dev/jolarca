import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("forbiddenTitle"), robots: { index: false } };
}

/** 403 — authenticated but not permitted here. Honest, calm, no details. */
export default async function ForbiddenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-sm font-medium tracking-wide text-gold-ink">403</p>
      <h1 className="mt-2 text-2xl font-semibold text-primary-deep">
        {t("forbiddenTitle")}
      </h1>
      <p className="mt-3 text-ink-muted">{t("forbiddenBody")}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
      >
        {t("backHome")}
      </Link>
    </main>
  );
}
