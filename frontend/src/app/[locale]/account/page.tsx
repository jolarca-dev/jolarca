import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { OrderHistory } from "@/components/client/account/order-history";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return { title: t("accountTitle"), robots: { index: false } };
}

/**
 * Account hub: orders (GAP-O03/O04 until the backend ships them) plus the
 * GDPR self-service entries — consent management, Art. 20 export, Art. 17
 * erasure (compliance_app).
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "account" });

  const links = [
    {
      href: "/account/consent",
      title: t("consentTitle"),
      body: t("consentTeaser"),
    },
    {
      href: "/account/data-export",
      title: t("exportTitle"),
      body: t("exportTeaser"),
    },
    {
      href: "/account/data-erasure",
      title: t("erasureTitle"),
      body: t("erasureTeaser"),
    },
  ] as const;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">{t("title")}</h1>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="card block h-full p-4 no-underline transition-dignified hover:border-line-strong"
            >
              <span className="block font-medium text-primary-deep">
                {link.title}
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                {link.body}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Order history — GAP-O03 closed; server-scoped to this buyer. */}
      <section aria-label={t("ordersHeading")} className="mt-10">
        <h2 className="text-xl font-semibold text-primary-deep">
          {t("ordersHeading")}
        </h2>
        <OrderHistory />
      </section>
    </main>
  );
}
