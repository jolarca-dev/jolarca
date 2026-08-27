import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { StatsCards } from "@/components/client/admin/stats-cards";
import { Link } from "@/i18n/navigation";

/**
 * Admin dashboard — live queue counters (60s refresh) plus entry points to
 * each moderation surface. Role gating lives in the admin layout.
 */
export default async function AdminPage({
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
    <main className="space-y-6">
      <StatsCards />
      <section
        aria-label={t("quickEntryAria")}
        className="flex flex-wrap gap-3"
      >
        <Link
          href="/admin/sellers"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("goSellerQueue")}
        </Link>
        <Link
          href="/admin/listings"
          className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
        >
          {t("goListingQueue")}
        </Link>
        <Link
          href="/admin/compliance"
          className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
        >
          {t("goComplianceQueue")}
        </Link>
      </section>
    </main>
  );
}
