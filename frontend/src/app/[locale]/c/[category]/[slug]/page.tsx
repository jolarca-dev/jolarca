import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CategoryFilters } from "@/components/client/category-filters";
import { Pagination } from "@/components/client/pagination";
import { Breadcrumbs } from "@/components/rsc/breadcrumbs";
import { JsonLd } from "@/components/rsc/json-ld";
import { ProductGrid } from "@/components/rsc/product-grid";
import { isApiError } from "@/lib/api-client";
import { Link } from "@/i18n/navigation";
import {
  getCategoryProducts,
  type CategoryFilters as Filters,
} from "@/server/catalog";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jolarca.example";

const SORTS = ["newest", "price_asc", "price_desc", "name"] as const;
type Sort = (typeof SORTS)[number];

interface RouteParams {
  locale: string;
  category: string;
  slug: string;
}
type SearchParams = Promise<{
  page?: string;
  price_min?: string;
  price_max?: string;
  sellers?: string;
  sort?: string;
}>;

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function parseFilters(sp: {
  price_min?: string;
  price_max?: string;
  sellers?: string;
  sort?: string;
}): Filters {
  const sort = SORTS.includes(sp.sort as Sort) ? (sp.sort as Sort) : undefined;
  return {
    priceMin: sp.price_min || undefined,
    priceMax: sp.price_max || undefined,
    sellers: sp.sellers ? sp.sellers.split(",").filter(Boolean) : undefined,
    sort,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  try {
    const data = await getCategoryProducts(
      slug,
      parsePage(sp.page),
      parseFilters(sp),
    );
    return {
      title: data.category.name,
      ...(data.category.description
        ? { description: data.category.description }
        : {}),
      alternates: { canonical: `${SITE_URL}/c/${slug}/${slug}` },
      robots: { index: true, follow: true },
    };
  } catch {
    // Metadata must never crash the render; the body carries the notice.
    return { title: slug.replace(/-/g, " "), robots: { index: false } };
  }
}

/** Inventory changes constantly — SSR per request, never static. */
export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: SearchParams;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const nav = await getTranslations("nav");

  const page = parsePage(sp.page);
  const filters = parseFilters(sp);

  let data;
  try {
    data = await getCategoryProducts(slug, page, filters);
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

  const totalPages = Math.max(1, Math.ceil(data.count / data.page_size));
  const baseHref = `/c/${slug}/${slug}`;

  const filterParams = new URLSearchParams();
  if (filters.priceMin) filterParams.set("price_min", filters.priceMin);
  if (filters.priceMax) filterParams.set("price_max", filters.priceMax);
  if (filters.sellers?.length) {
    filterParams.set("sellers", filters.sellers.join(","));
  }
  if (filters.sort && filters.sort !== "newest") {
    filterParams.set("sort", filters.sort);
  }

  return (
    <main className="mx-auto max-w-6xl p-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: data.category.name,
          numberOfItems: data.count,
          itemListElement: data.results.map((product, index) => ({
            "@type": "ListItem",
            position: (page - 1) * data.page_size + index + 1,
            url: `${SITE_URL}/p/${product.slug}`,
            name: product.title,
          })),
        }}
      />

      <Breadcrumbs
        items={[
          { href: "/", label: nav("home") },
          { label: data.category.name },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-3xl">{data.category.name}</h1>
        {data.category.description && (
          <p className="mt-2 max-w-3xl text-ink-muted">
            {data.category.description}
          </p>
        )}
        <p className="mt-1 text-sm text-ink-faint" aria-live="polite">
          {t("resultsCount", { count: data.count })}
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-8 md:flex-row">
        <CategoryFilters facets={data.facets.sellers} initial={filters} />

        <div className="min-w-0 flex-1">
          {data.results.length === 0 ? (
            <div className="card p-8 text-center">
              <h2 className="text-xl text-primary-deep">{t("emptyTitle")}</h2>
              <p className="mt-2 text-ink-muted">{t("emptyBody")}</p>
              <Link
                href="/"
                className="mt-4 inline-block font-medium text-primary no-underline hover:underline"
              >
                {t("browseAll")}
              </Link>
            </div>
          ) : (
            <ProductGrid
              products={data.results}
              locale={locale}
              variant="wide"
            />
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            baseHref={baseHref}
            filterQuery={filterParams.toString()}
          />
        </div>
      </div>

      <link
        rel="canonical"
        href={`${SITE_URL}${baseHref}${
          filterParams.toString() ? `?${filterParams.toString()}` : ""
        }`}
      />
    </main>
  );
}
