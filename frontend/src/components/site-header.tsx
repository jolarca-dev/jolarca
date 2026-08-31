import { useTranslations } from "next-intl";

import { CartController } from "@/components/client/cart-controller";
import { SearchCombobox } from "@/components/client/search/search-combobox";
import { UserMenu } from "@/components/client/user-menu";
import { Link } from "@/i18n/navigation";

/**
 * Storefront header (RSC). All links are locale-aware. Client JS is limited
 * to the UserMenu (session-aware), CartController (badge + drawer) and the
 * search palette islands; no tracking — zero-cookie-first-load (ADR-0009).
 */
export function SiteHeader({ locale }: { locale: string }) {
  const t = useTranslations();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface-raised/95 backdrop-blur-sm">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 p-4"
      >
        <Link
          href="/"
          className="font-display text-xl font-semibold text-primary-deep no-underline"
        >
          {t("common.appName")}
        </Link>
        <Link
          href="/search"
          className="text-ink-muted no-underline transition-dignified hover:text-primary"
        >
          {t("nav.search")}
        </Link>
        {/* Command palette (Cmd/Ctrl+K) — quick search without leaving the page. */}
        <SearchCombobox />
        <Link
          href="/funeral-services"
          className="text-ink-muted no-underline transition-dignified hover:text-primary"
        >
          {t("nav.funeralServices")}
        </Link>
        <span className="ms-auto flex items-center gap-x-4 text-sm text-ink-faint">
          <CartController locale={locale} />
          <UserMenu />
        </span>
      </nav>
    </header>
  );
}
