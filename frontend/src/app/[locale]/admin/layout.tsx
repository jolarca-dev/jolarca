import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { AdminSidebar } from "@/components/client/admin/admin-sidebar";
import { ThemeToggle } from "@/components/client/admin/theme-toggle";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";

// Session + role gated: the redirect must be evaluated per request, never
// baked into a static shell.
export const dynamic = "force-dynamic";

/**
 * Admin backoffice layout — role-based access control (non-admins land on
 * the 403 page), persistent sidebar, dark-mode toggle. ADR-0006 keeps
 * Django admin edge-restricted for ops; this is the purpose-built UI
 * (ADR-0008). Every mutation inside emits audit events (GAP-M09).
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect({ href: "/403", locale });
  }

  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-primary-deep">
          {t("backofficeTitle")}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-faint">
            {t("signedInAs", { email: session?.email ?? "" })}
          </span>
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
