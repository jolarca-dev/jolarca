"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Link } from "@/i18n/navigation";

/**
 * Accessible server-side pagination (GAP-P02). Page links are real
 * locale-aware <Link> hrefs (?page=n) so crawlers and no-JS users keep
 * full navigation; arrow/Home/End move focus between page links (roving
 * tabindex), aria-current marks the active page. No infinite scroll —
 * predictable for assistive tech (WCAG 2.2).
 */

type PageItem = number | "gap-start" | "gap-end";

function pageItems(page: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: PageItem[] = [1];
  if (page > 3) items.push("gap-start");
  for (
    let p = Math.max(2, page - 1);
    p <= Math.min(total - 1, page + 1);
    p += 1
  ) {
    items.push(p);
  }
  if (page < total - 2) items.push("gap-end");
  items.push(total);
  return items;
}

const LINK_CLASS =
  "min-w-10 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm no-underline text-ink transition-dignified hover:border-line-strong";

export function Pagination({
  page,
  totalPages,
  baseHref,
  filterQuery = "",
}: {
  page: number;
  totalPages: number;
  baseHref: string;
  /** Serialized non-page filter params (e.g. "sort=price_asc"). */
  filterQuery?: string;
}) {
  const t = useTranslations("catalog");
  const navRef = useRef<HTMLElement>(null);
  if (totalPages <= 1) return null;

  const buildHref = (target: number) => {
    const qs = new URLSearchParams(filterQuery);
    qs.set("page", String(target));
    return `${baseHref}?${qs.toString()}`;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const links = Array.from(
      navRef.current?.querySelectorAll<HTMLAnchorElement>(
        "a[data-page-link]",
      ) ?? [],
    );
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (links.length === 0 || index === -1) return;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % links.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + links.length) % links.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = links.length - 1;
    }
    if (next >= 0) {
      event.preventDefault();
      links[next]?.focus();
    }
  };

  return (
    <nav
      ref={navRef}
      aria-label={t("paginationLabel")}
      onKeyDown={onKeyDown}
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 && (
        <Link href={buildHref(page - 1)} className={LINK_CLASS}>
          ← {t("previous")}
        </Link>
      )}
      {pageItems(page, totalPages).map((item) =>
        typeof item === "number" ? (
          <Link
            key={item}
            href={buildHref(item)}
            data-page-link
            aria-current={item === page ? "page" : undefined}
            tabIndex={item === page ? 0 : -1}
            className={`${LINK_CLASS} text-center ${
              item === page
                ? "border-primary bg-primary text-surface-raised"
                : ""
            }`}
          >
            {item}
          </Link>
        ) : (
          <span key={item} aria-hidden="true" className="px-1 text-ink-faint">
            …
          </span>
        ),
      )}
      {page < totalPages && (
        <Link href={buildHref(page + 1)} className={LINK_CLASS}>
          {t("next")} →
        </Link>
      )}
    </nav>
  );
}
