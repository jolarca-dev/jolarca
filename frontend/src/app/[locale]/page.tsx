import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CatalogHome />;
}

function CatalogHome() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-neutral-600">{t("subtitle")}</p>
      {/* Catalog grid: MVP-P3 (see docs/MVP_REMAINING_WORK.md) */}
    </main>
  );
}
