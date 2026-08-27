import { useTranslations } from "next-intl";

import { ProductCard } from "@/components/rsc/product-card";
import { Link } from "@/i18n/navigation";
import type { Paginated, Product } from "@/server/catalog";

/**
 * Shared product grid (category listing + seller storefront).
 * Responsive: 3 columns desktop, 2 tablet, 1 mobile.
 */
export function ProductGrid({
  products,
  locale,
  variant = "home",
}: {
  products: Product[];
  locale: string;
  /** home rail: 4-up at lg; category pages: 3-up at lg, 4-up at xl. */
  variant?: "home" | "wide";
}) {
  return (
    <ul
      className={`grid list-none gap-6 p-0 ${
        variant === "wide"
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      }`}
    >
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Server-side pagination — plain links with `?page=`, no client-side
 * infinite scroll (predictable for assistive tech and crawlers).
 */
export function Pagination({
  baseHref,
  data,
}: {
  baseHref: string;
  data: Paginated<Product>;
}) {
  const t = useTranslations("catalog");
  const totalPages = Math.max(1, Math.ceil(data.count / data.page_size));
  if (totalPages <= 1) return null;

  const pageHref = (page: number) => `${baseHref}?page=${page}`;

  return (
    <nav
      aria-label={t("paginationLabel")}
      className="mt-8 flex items-center justify-between gap-4"
    >
      {data.page > 1 ? (
        <Link
          href={pageHref(data.page - 1)}
          className="rounded-md border border-line bg-surface-raised px-4 py-2 no-underline text-ink transition-dignified hover:border-line-strong"
        >
          ← {t("previous")}
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <p className="text-sm text-ink-muted" aria-live="polite">
        {t.rich("pageOf", {
          page: data.page,
          totalPages,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      {data.page < totalPages ? (
        <Link
          href={pageHref(data.page + 1)}
          className="rounded-md border border-line bg-surface-raised px-4 py-2 no-underline text-ink transition-dignified hover:border-line-strong"
        >
          {t("next")} →
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
