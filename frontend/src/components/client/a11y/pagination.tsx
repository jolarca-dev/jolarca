"use client";

/**
 * Accessible client pagination — the interactive twin of the RSC
 * link-based Pagination in product-grid. For client-driven result sets
 * (search, admin queues):
 *  - nav landmark with a labelled purpose;
 *  - current page marked aria-current="page";
 *  - arrow keys move between page buttons, Enter/Space activates
 *    (native buttons); Home/End jump to the edges;
 *  - no infinite scroll anywhere in the product (ADR-0009).
 */
import { useRef } from "react";
import { useTranslations } from "next-intl";

interface AccessiblePaginationProps {
  page: number; // 1-based
  totalPages: number;
  onPageChange: (page: number) => void;
  /** aria-label override for the nav landmark. */
  label?: string;
}

/** Windowed page list: 1 … p-1 p p+1 … last (max 7 entries). */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) pages.add(2).add(3).add(4);
  if (page >= totalPages - 2) {
    pages
      .add(totalPages - 1)
      .add(totalPages - 2)
      .add(totalPages - 3);
  }
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

export function AccessiblePagination({
  page,
  totalPages,
  onPageChange,
  label,
}: AccessiblePaginationProps) {
  const t = useTranslations("a11y");
  const listRef = useRef<HTMLUListElement>(null);

  if (totalPages <= 1) return null;

  function focusPageButton(target: number): void {
    const button = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-page="${target}"]`,
    );
    button?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    let target: number | null = null;
    if (event.key === "ArrowRight") target = Math.min(totalPages, page + 1);
    else if (event.key === "ArrowLeft") target = Math.max(1, page - 1);
    else if (event.key === "Home") target = 1;
    else if (event.key === "End") target = totalPages;
    if (target === null) return;
    event.preventDefault();
    if (target !== page) onPageChange(target);
    focusPageButton(target);
  }

  const itemClass =
    "min-w-10 rounded-md border border-line px-3 py-2 text-sm text-ink transition-dignified hover:border-line-strong focus:outline-2 focus:outline-offset-2 focus:outline-primary disabled:opacity-50";

  return (
    <nav aria-label={label ?? t("paginationAria")} onKeyDown={onKeyDown}>
      <ul ref={listRef} className="flex list-none items-center gap-2 p-0">
        <li>
          <button
            type="button"
            className={itemClass}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <span aria-hidden="true">←</span> {t("previousPage")}
          </button>
        </li>
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-sm text-ink-faint"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                data-page={entry}
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={t("pageNumber", { page: entry })}
                className={`${itemClass} ${
                  entry === page
                    ? "border-primary bg-primary-soft font-semibold text-primary-deep"
                    : ""
                }`}
              >
                {entry}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={itemClass}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            {t("nextPage")} <span aria-hidden="true">→</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
