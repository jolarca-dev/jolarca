import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Pagination } from "@/components/client/pagination";
import { SellerHeader } from "@/components/rsc/seller-header";
import { JsonLd } from "@/components/rsc/json-ld";
import { ProductGrid } from "@/components/rsc/product-grid";
import { isApiError } from "@/lib/api-client";
import { localeAlternates } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import { getSeller, getSellerProducts } from "@/server/catalog";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://jol-marketplace.example";

interface RouteParams {
  locale: string;
  slug: string;
}

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const seller = await getSeller(slug);
    return {
      title: `${seller.name} — JOL Marketplace Seller`,
      ...(seller.description
        ? { description: seller.description.slice(0, 160) }
        : {}),
      alternates: localeAlternates(`/sellers/${slug}`),
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: slug, robots: { index: false } };
  }
}

/** Seller inventory changes with listings — SSR per request. */
export const dynamic = "force-dynamic";

export default async function SellerStorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  const { page: rawPage } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("storefront");
  const sellerNs = await getTranslations("seller");

  const page = parsePage(rawPage);

  let seller;
  let products;
  try {
    seller = await getSeller(slug);
    products = await getSellerProducts(slug, page);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    const te = await getTranslations("errors");
    return (
      <main className="mx-auto max-w-6xl p-8">
        <p role="status" className="card p-6 text-ink-muted">
          {te("serverError")}
        </p>
      </main>
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(products.count / products.page_size),
  );
  const baseHref = `/sellers/${slug}`;
  const year = seller.member_since ? seller.member_since.slice(0, 4) : "";

  const stats = [
    { label: t("activeListings"), value: String(products.count) },
    { label: t("memberSinceLabel"), value: year || "—" },
    {
      label: t("location"),
      value:
        seller.location ||
        (seller.country ? `${sellerNs(`country_${seller.country}`)}` : "—"),
    },
    { label: t("status"), value: seller.verified ? t("verified") : "—" },
  ];

  return (
    <main className="mx-auto max-w-6xl p-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: seller.name,
          url: `${SITE_URL}/sellers/${slug}`,
          ...(seller.description ? { description: seller.description } : {}),
          ...(seller.logo_url ? { logo: seller.logo_url } : {}),
          address: {
            "@type": "PostalAddress",
            addressCountry: seller.country,
            ...(seller.location ? { addressLocality: seller.location } : {}),
          },
        }}
      />

      <SellerHeader seller={seller} />

      <section
        aria-label={t("status")}
        className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-line bg-surface-raised p-4"
          >
            <p className="text-sm text-ink-muted">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold text-primary-deep">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="seller-listings" className="mt-12">
        <h2 id="seller-listings" className="text-2xl text-primary-deep">
          {t("activeListings")}
        </h2>
        {products.results.length === 0 ? (
          <p className="card mt-6 p-8 text-center text-ink-muted">
            {t("emptyListings")}
          </p>
        ) : (
          <div className="mt-6">
            <ProductGrid
              products={products.results}
              locale={locale}
              variant="wide"
            />
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} baseHref={baseHref} />
      </section>

      <p className="mt-12">
        <Link
          href="/sellers"
          className="font-medium text-primary no-underline hover:underline"
        >
          {t("viewAllSellers")}
        </Link>
      </p>
    </main>
  );
}
