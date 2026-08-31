"use client";

/** Admin sidebar — locale-aware links with aria-current on the active item. */
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const NAV_ITEMS = [
  { href: "/admin", key: "navDashboard" },
  { href: "/admin/sellers", key: "navSellers" },
  { href: "/admin/listings", key: "navListings" },
  { href: "/admin/orders", key: "navOrders" },
  { href: "/admin/users", key: "navUsers" },
  { href: "/admin/compliance", key: "navCompliance" },
  { href: "/admin/analytics", key: "navAnalytics" },
] as const;

export function AdminSidebar() {
  const t = useTranslations("admin");
  const pathname = usePathname();

  return (
    <nav aria-label={t("sidebarAria")} className="lg:w-56 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-dignified focus:outline-2 focus:outline-primary/40 ${
                  active
                    ? "bg-primary-soft font-medium text-primary-deep"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
