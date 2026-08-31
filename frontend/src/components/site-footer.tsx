import { getTranslations } from "next-intl/server";

/**
 * Site footer — brand close + rights line. Visual floor identical to the
 * header (raised surface, 1px border); no tracking, no external links.
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-16 border-t border-line bg-surface-raised">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 p-8 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="font-display text-lg text-primary-deep">
          JOL Marketplace
        </p>
        <p className="text-sm text-ink-muted">{t("tagline")}</p>
        <p className="text-sm text-ink-faint">{t("rights")}</p>
      </div>
    </footer>
  );
}
