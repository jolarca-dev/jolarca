"use client";

/**
 * Command-palette search (Cmd/Ctrl+K). Grouped results (Products /
 * Sellers / Categories), recent searches from localStorage (query text
 * only), and full keyboard operation: arrows move, Enter selects, Escape
 * closes. Selected queries hand off to /search via sessionStorage —
 * nothing typed ever lands in a URL.
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  fetchSuggestions,
  readRecentSearches,
  SEARCH_DEBOUNCE_MS,
  writeRecentSearch,
  type SearchSuggestions,
} from "@/lib/search";
import { isContractPending } from "@/stores/cart-store";

export const SEARCH_HANDOFF_KEY = "jol_search_handoff";

interface PaletteItem {
  id: string;
  group: "recent" | "products" | "sellers" | "categories";
  label: string;
  sublabel?: string;
  href?: string;
  /** When set, Enter hands the query off to the search page. */
  query?: string;
}

export function SearchCombobox() {
  const t = useTranslations("search");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(
    null,
  );
  const [suggestionsUnavailable, setSuggestionsUnavailable] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const requestId = useRef(0);

  /* ------------------------- open / close / hotkey ----------------------- */

  const close = useCallback(() => {
    setOpen(false);
    setValue("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecentSearches());
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Close on navigation.
  useEffect(() => {
    close();
  }, [pathname, close]);

  /* ---------------------------- suggestions ------------------------------ */

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      fetchSuggestions(value)
        .then((data) => {
          if (requestId.current !== id) return;
          setSuggestions(data);
          setSuggestionsUnavailable(false);
        })
        .catch((error) => {
          if (requestId.current !== id) return;
          setSuggestions(null);
          setSuggestionsUnavailable(!isContractPending(error));
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, open]);

  // Flat, ordered item list: recents → products → sellers → categories.
  useEffect(() => {
    const next: PaletteItem[] = [];
    if (!value.trim()) {
      recent.forEach((term, index) =>
        next.push({
          id: `recent-${index}`,
          group: "recent",
          label: term,
          query: term,
        }),
      );
    }
    if (value.trim()) {
      next.push({
        id: "run-search",
        group: "recent",
        label: t("paletteRunSearch", { query: value.trim() }),
        query: value.trim(),
      });
    }
    suggestions?.products.forEach((product) =>
      next.push({
        id: `product-${product.id}`,
        group: "products",
        label: product.title,
        sublabel: product.seller?.name,
        href: `/p/${product.slug}`,
      }),
    );
    suggestions?.sellers.forEach((seller) =>
      next.push({
        id: `seller-${seller.slug}`,
        group: "sellers",
        label: seller.name,
        href: `/sellers/${seller.slug}`,
      }),
    );
    suggestions?.categories.forEach((category) =>
      next.push({
        id: `category-${category.slug}`,
        group: "categories",
        label: category.name,
        href: `/c/${category.slug}`,
      }),
    );
    setItems(next);
    setActiveIndex(0);
  }, [suggestions, recent, value, t]);

  /* ------------------------------ activate ------------------------------- */

  function activate(item: PaletteItem | undefined) {
    if (!item) return;
    if (item.query) {
      writeRecentSearch(item.query);
      try {
        window.sessionStorage.setItem(SEARCH_HANDOFF_KEY, item.query);
      } catch {
        // Handoff degrades to a plain /search visit.
      }
      router.push("/search");
    } else if (item.href) {
      router.push(item.href);
    }
    close();
  }

  function onInputKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(items[activeIndex]);
    }
  }

  // Keep the active row in view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const groupLabel: Record<PaletteItem["group"], string> = {
    recent: t("groupRecent"),
    products: t("groupProducts"),
    sellers: t("groupSellers"),
    categories: t("groupCategories"),
  };

  const visibleGroups = useMemo(() => {
    const seen = new Set<PaletteItem["group"]>();
    return items.filter((item) => {
      if (seen.has(item.group)) return false;
      seen.add(item.group);
      return true;
    });
  }, [items]);

  return (
    <>
      {/* Header trigger — icon + kbd hint. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("paletteOpen")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-muted transition-dignified hover:border-line-strong hover:text-ink"
      >
        <span aria-hidden="true">⌕</span>
        <kbd className="hidden rounded border border-line px-1 text-xs text-ink-faint sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-24"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("paletteTitle")}
            className="w-full max-w-xl rounded-lg border border-line bg-surface-raised shadow-lg"
          >
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-listbox"
              aria-activedescendant={
                items[activeIndex] ? `palette-item-${activeIndex}` : undefined
              }
              aria-label={t("paletteTitle")}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={t("palettePlaceholder")}
              autoComplete="off"
              className="w-full rounded-t-lg border-b border-line bg-surface-raised px-4 py-3 text-base text-ink focus:outline-2 focus:-outline-offset-2 focus:outline-primary/40"
            />

            <ul
              ref={listRef}
              id="palette-listbox"
              role="listbox"
              aria-label={t("paletteTitle")}
              className="max-h-80 overflow-y-auto p-2"
            >
              {items.length === 0 && value.trim() === "" && (
                <li className="px-3 py-6 text-center text-sm text-ink-faint">
                  {t("paletteHint")}
                </li>
              )}
              {items.length === 0 &&
                value.trim() !== "" &&
                suggestionsUnavailable && (
                  <li className="px-3 py-6 text-center text-sm text-ink-faint">
                    {t("paletteSuggestionsDown")}
                  </li>
                )}
              {items.length === 0 &&
                value.trim() !== "" &&
                !suggestionsUnavailable &&
                suggestions !== null && (
                  <li className="px-3 py-6 text-center text-sm text-ink-faint">
                    {t("paletteNoMatches")}
                  </li>
                )}

              {visibleGroups.map((groupItem) => (
                <li key={groupItem.group} role="presentation">
                  <p
                    role="presentation"
                    className="px-3 pb-1 pt-3 text-xs font-medium tracking-wide text-ink-faint"
                  >
                    {groupLabel[groupItem.group]}
                  </p>
                  <ul role="group" aria-label={groupLabel[groupItem.group]}>
                    {items.map((item, index) =>
                      item.group !== groupItem.group ? null : (
                        <li
                          key={item.id}
                          id={`palette-item-${index}`}
                          data-index={index}
                          role="option"
                          aria-selected={index === activeIndex}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => activate(item)}
                          className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                            index === activeIndex
                              ? "bg-primary-soft text-primary-deep"
                              : "text-ink"
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.sublabel && (
                            <span className="shrink-0 text-xs text-ink-faint">
                              {item.sublabel}
                            </span>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                </li>
              ))}
            </ul>

            <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
              {t("paletteKeys")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
