"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import type { CategoryFilters, FacetSeller } from "@/server/catalog";

/**
 * Faceted filters for the category grid (GAP-P02), client island.
 *
 * Filters are non-PII commerce state (price range, seller set, sort) and
 * travel in the URL query string: shareable, back-button-safe, and the
 * RSC re-renders server-side with the filtered set (ADR-0009 forbids PII
 * in URLs — none of these qualify). Availability ("in stock only") is
 * deliberately absent until the inventory model lands (MVP-P2): a toggle
 * that filters nothing would be fake UX (ADR-0007).
 */

const INPUT_CLASS =
  "w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink transition-dignified hover:border-line-strong focus:outline-2 focus:outline-primary";

export function CategoryFilters({
  facets,
  initial,
}: {
  facets: FacetSeller[];
  initial: CategoryFilters;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [priceMin, setPriceMin] = useState(initial.priceMin ?? "");
  const [priceMax, setPriceMax] = useState(initial.priceMax ?? "");
  const [sellers, setSellers] = useState<string[]>(initial.sellers ?? []);
  const [sort, setSort] = useState<string>(initial.sort ?? "newest");

  const navigate = (next: {
    priceMin?: string;
    priceMax?: string;
    sellers: string[];
    sort: string;
  }) => {
    const params = new URLSearchParams();
    if (next.priceMin) params.set("price_min", next.priceMin);
    if (next.priceMax) params.set("price_max", next.priceMax);
    if (next.sellers.length > 0) params.set("sellers", next.sellers.join(","));
    if (next.sort !== "newest") params.set("sort", next.sort);
    // Filters reset to the first page — page N of a changed set is
    // meaningless.
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const applyPrice = (event: React.FormEvent) => {
    event.preventDefault();
    navigate({ priceMin, priceMax, sellers, sort });
  };

  const toggleSeller = (slug: string) => {
    const nextSellers = sellers.includes(slug)
      ? sellers.filter((s) => s !== slug)
      : [...sellers, slug];
    setSellers(nextSellers);
    navigate({ priceMin, priceMax, sellers: nextSellers, sort });
  };

  const changeSort = (value: string) => {
    setSort(value);
    navigate({ priceMin, priceMax, sellers, sort: value });
  };

  const panel = (
    <div className="space-y-6">
      <form onSubmit={applyPrice} className="space-y-2">
        <label
          className="block text-sm font-medium text-ink"
          htmlFor="price-min"
        >
          {t("priceMin")}
        </label>
        <input
          id="price-min"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          className={INPUT_CLASS}
        />
        <label
          className="block text-sm font-medium text-ink"
          htmlFor="price-max"
        >
          {t("priceMax")}
        </label>
        <input
          id="price-max"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          className={INPUT_CLASS}
        />
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("apply")}
        </button>
      </form>

      {facets.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-ink">
            {t("sellers")}
          </legend>
          <div className="mt-2 space-y-2">
            {facets.map((facet) => (
              <label
                key={facet.slug}
                className="flex items-center gap-2 text-sm text-ink-muted"
              >
                <input
                  type="checkbox"
                  checked={sellers.includes(facet.slug)}
                  onChange={() => toggleSeller(facet.slug)}
                  className="h-4 w-4 accent-primary"
                />
                {facet.name}
                <span className="ms-auto text-ink-faint">({facet.count})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label className="block text-sm font-medium text-ink" htmlFor="sort">
          {t("sortBy")}
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => changeSort(e.target.value)}
          className={`${INPUT_CLASS} mt-2`}
        >
          <option value="newest">{t("sortNewest")}</option>
          <option value="price_asc">{t("sortPriceAsc")}</option>
          <option value="price_desc">{t("sortPriceDesc")}</option>
          <option value="name">{t("sortName")}</option>
        </select>
      </div>
    </div>
  );

  return (
    <aside aria-label={t("filters")} className="md:w-56 md:shrink-0">
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="category-filters-panel"
        onClick={() => setMobileOpen((open) => !open)}
        className="w-full rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink transition-dignified hover:border-line-strong md:hidden"
      >
        {t("filters")}
      </button>
      <div
        id="category-filters-panel"
        className={`${mobileOpen ? "block" : "hidden"} card mt-2 p-4 md:mt-0 md:block md:p-5`}
      >
        {panel}
      </div>
    </aside>
  );
}
