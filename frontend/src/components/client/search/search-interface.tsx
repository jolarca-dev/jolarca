"use client";

/**
 * Full search experience: debounced input (300ms), faceted filters,
 * keyboard-navigable results grid (reuses the catalog ProductCard), and
 * explicit pagination — no infinite scroll (ADR-0009). Query text lives
 * in client state only and travels as a POST body; it never lands in the
 * page URL or server access logs.
 *
 * Degradation (graceful by design): any failure — backend down, contract
 * still stubbed (MVP-Q1 ranking), network hiccup — falls back to "browse
 * the catalog" with category links. Search is a convenience layer; the
 * catalog is always reachable.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ProductCard } from "@/components/rsc/product-card";
import { Link } from "@/i18n/navigation";
import {
  EMPTY_FILTERS,
  fetchSearch,
  SEARCH_DEBOUNCE_MS,
  writeRecentSearch,
  type SearchFilters,
  type SearchResults,
} from "@/lib/search";
import { fetchCategories, type CategoryOption } from "@/lib/seller";

type Status = "idle" | "loading" | "ready" | "error";

interface SearchInterfaceProps {
  initialQuery: string;
  locale: string;
}

const FALLBACK_CATEGORIES: Array<{ slug: string; name: string }> = [
  { slug: "candles", name: "Candles" },
  { slug: "rosaries", name: "Rosaries" },
  { slug: "icons", name: "Icons" },
];

export function SearchInterface({
  initialQuery,
  locale,
}: SearchInterfaceProps) {
  const t = useTranslations("search");
  const [q, setQ] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesPending, setCategoriesPending] = useState(false);
  const requestId = useRef(0);

  // Palette handoff: a query chosen in the command palette arrives via
  // sessionStorage (never via URL params). Consume it once on mount.
  useEffect(() => {
    try {
      const handoff = window.sessionStorage.getItem("jol_search_handoff");
      if (handoff) {
        window.sessionStorage.removeItem("jol_search_handoff");
        setQ(handoff);
        setPage(1);
      }
    } catch {
      // No handoff — keep the initial query.
    }
  }, []);

  // Facet options for the category filter (GAP-P05 endpoint:
  // GET /api/v1/categories/). Until it answers, the facet degrades to the
  // curated fallback list below.
  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((options) => {
        if (!cancelled) setCategories(options);
      })
      .catch(() => {
        if (!cancelled) setCategoriesPending(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced search: 300ms after the visitor stops typing.
  useEffect(() => {
    const id = ++requestId.current;
    // Empty query is idle, not a failure — the backend answers 400 for
    // blank queries and that must never render as "search is down".
    if (!q.trim()) {
      setStatus("idle");
      setResults(null);
      return;
    }
    setStatus("loading");
    const timer = setTimeout(() => {
      fetchSearch({ q, page, filters })
        .then((data) => {
          if (requestId.current !== id) return;
          setResults(data);
          setStatus("ready");
          if (q.trim()) writeRecentSearch(q);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          // Every failure mode degrades to the catalog fallback below.
          setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, page, filters]);

  function updateFilter(name: keyof SearchFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  const browseCategories =
    categories.length > 0
      ? categories.map((category) => ({
          slug: category.slug,
          name: category.name,
        }))
      : FALLBACK_CATEGORIES;

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      {/* Facets */}
      <form
        aria-label={t("facetsAria")}
        onSubmit={(e) => e.preventDefault()}
        className="space-y-4 lg:sticky lg:top-4 lg:self-start"
      >
        <h2 className="text-base font-semibold text-primary-deep">
          {t("facetsTitle")}
        </h2>

        <div>
          <label htmlFor="sf-category" className={labelClass}>
            {t("facetCategory")}
          </label>
          <select
            id="sf-category"
            value={filters.category}
            onChange={(e) => updateFilter("category", e.target.value)}
            disabled={categoriesPending}
            className={inputClass}
          >
            <option value="">{t("facetAny")}</option>
            {browseCategories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          {categoriesPending && (
            <p className="mt-1 text-xs text-ink-faint">{t("facetsPending")}</p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>{t("facetPrice")}</legend>
          <div className="flex items-center gap-2">
            <input
              aria-label={t("facetPriceMin")}
              inputMode="decimal"
              placeholder={t("facetPriceMin")}
              value={filters.priceMin}
              onChange={(e) => updateFilter("priceMin", e.target.value)}
              className={inputClass}
            />
            <span aria-hidden="true" className="text-ink-faint">
              –
            </span>
            <input
              aria-label={t("facetPriceMax")}
              inputMode="decimal"
              placeholder={t("facetPriceMax")}
              value={filters.priceMax}
              onChange={(e) => updateFilter("priceMax", e.target.value)}
              className={inputClass}
            />
          </div>
        </fieldset>

        <div>
          <label htmlFor="sf-seller" className={labelClass}>
            {t("facetSeller")}
          </label>
          <input
            id="sf-seller"
            value={filters.seller}
            onChange={(e) => updateFilter("seller", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="sf-availability" className={labelClass}>
            {t("facetAvailability")}
          </label>
          <select
            id="sf-availability"
            value={filters.availability}
            onChange={(e) => updateFilter("availability", e.target.value)}
            className={inputClass}
          >
            <option value="">{t("facetAny")}</option>
            <option value="in_stock">{t("availInStock")}</option>
          </select>
        </div>

        <div>
          <label htmlFor="sf-delivery" className={labelClass}>
            {t("facetDelivery")}
          </label>
          <select
            id="sf-delivery"
            value={filters.delivery}
            onChange={(e) => updateFilter("delivery", e.target.value)}
            className={inputClass}
          >
            <option value="">{t("facetAny")}</option>
            <option value="courier">{t("deliveryCourier")}</option>
            <option value="locker">{t("deliveryLocker")}</option>
          </select>
        </div>
      </form>

      {/* Results */}
      <section aria-label={t("resultsAria")}>
        <label htmlFor="search-input" className="sr-only">
          {t("inputLabel")}
        </label>
        <input
          id="search-input"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t("inputPlaceholder")}
          className="w-full rounded-md border border-line bg-surface-raised px-4 py-3 text-base text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40"
        />

        {status === "loading" && (
          <p role="status" className="mt-6 text-sm text-ink-muted">
            {t("loading")}
          </p>
        )}

        {status === "error" && (
          <div className="mt-6 rounded-md border border-line bg-surface-raised p-6">
            <h2 className="text-lg font-semibold text-primary-deep">
              {t("unavailableTitle")}
            </h2>
            <p className="mt-2 text-ink-muted">{t("unavailableBody")}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {browseCategories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/c/${category.slug}/${category.slug}`}
                    className="rounded-full border border-line px-3 py-1 text-sm text-ink-muted transition-dignified hover:border-line-strong hover:text-ink"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === "ready" && results && (
          <>
            <p className="mt-4 text-sm text-ink-faint" aria-live="polite">
              {results.products.length === 0
                ? t("resultsZero")
                : t("resultsCount", { count: results.products.length })}
            </p>

            {results.products.length === 0 ? (
              <div className="mt-4 rounded-md border border-line bg-surface-raised p-6">
                <h2 className="text-lg font-semibold text-primary-deep">
                  {t("emptyTitle", { query: q.trim() })}
                </h2>
                <p className="mt-2 text-ink-muted">{t("emptyBody")}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {browseCategories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={`/c/${category.slug}/${category.slug}`}
                        className="rounded-full border border-line px-3 py-1 text-sm text-ink-muted transition-dignified hover:border-line-strong hover:text-ink"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <ul className="mt-4 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {results.products.map((product, index) => (
                    <li key={product.id}>
                      <ProductCard
                        product={product}
                        locale={locale}
                        priority={index < 3}
                      />
                    </li>
                  ))}
                </ul>

                {results.totalPages > 1 && (
                  <nav
                    aria-label={t("paginationAria")}
                    className="mt-8 flex items-center justify-between"
                  >
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
                    >
                      {t("pagePrev")}
                    </button>
                    <span className="text-sm text-ink-faint">
                      {t("pageInfo", {
                        page: results.page,
                        totalPages: results.totalPages,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(results.totalPages, p + 1))
                      }
                      disabled={page >= results.totalPages}
                      className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
                    >
                      {t("pageNext")}
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
