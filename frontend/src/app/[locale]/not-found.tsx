import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/**
 * Localized 404 — renders inside the [locale] layout so the document keeps
 * its lang attribute, styling, and header/footer (the default Next 404
 * document bypasses all three and fails axe html-has-lang).
 */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-3xl text-primary-deep">{t("notFoundTitle")}</h1>
      <p className="mt-4 max-w-2xl text-ink-muted">{t("notFoundBody")}</p>
      <Link
        href="/"
        className="mt-8 inline-block font-medium text-primary no-underline hover:underline"
      >
        {t("returnHome")}
      </Link>
    </main>
  );
}
