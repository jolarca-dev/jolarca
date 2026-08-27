"use client";

/**
 * Slide-out cart drawer (right side). Accessibility contract:
 *  - role="dialog" + aria-modal, labelled by its heading;
 *  - focus moves to the close button on open and returns to the trigger
 *    on close;
 *  - focus trap: Tab/Shift+Tab cycle within the panel;
 *  - ESC closes; overlay click closes;
 *  - body scroll locked while open.
 * Item add/remove/update announcements live in the always-mounted
 * CartAnnouncer (cart-controller), not here.
 */
import Image from "next/image";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { includedVat, isLowStock, lineTotal } from "@/stores/cart-store";
import { formatPrice } from "@/server/catalog";
import {
  useCartItems,
  useCartTotal,
  useRemoveItem,
  useUpdateQuantity,
} from "@/hooks/use-cart";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function CartDrawer({
  id,
  open,
  onClose,
  locale,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  locale: string;
}) {
  const t = useTranslations("cart");
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const items = useCartItems();
  const subtotal = useCartTotal();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const updateQuantity = useUpdateQuantity();
  const removeItem = useRemoveItem();
  const currency = items[0]?.currency ?? "EUR";
  const vat = includedVat(subtotal);

  /* Focus management + keyboard behavior ------------------------------ */
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-cart-close]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="absolute inset-y-0 end-0 flex w-full max-w-md flex-col border-s border-line bg-surface shadow-lg sm:w-96 sm:max-w-none"
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2
            id="cart-drawer-title"
            className="text-lg font-semibold text-primary-deep"
          >
            {t("drawerTitle")}
            {itemCount > 0 && (
              <span className="ms-2 text-sm font-normal text-ink-muted">
                {t("itemsCount", { count: itemCount })}
              </span>
            )}
          </h2>
          <button
            type="button"
            data-cart-close
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-md border border-line p-2 text-ink-muted transition-dignified hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-ink-muted">{t("empty")}</p>
            <p className="text-sm text-ink-faint">{t("emptyBody")}</p>
            <Link
              href="/"
              onClick={onClose}
              className="rounded-md bg-primary px-4 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
            >
              {t("browseCatalog")}
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto p-4">
              {items.map((item) => {
                const atMax =
                  item.maxStock !== undefined && item.quantity >= item.maxStock;
                return (
                  <li key={item.productId} className="flex gap-3 py-4">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        width={64}
                        height={64}
                        className="h-16 w-16 shrink-0 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-16 w-16 shrink-0 rounded-md border border-line bg-gold-soft"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {item.title}
                      </p>
                      {item.sellerName && (
                        <p className="truncate text-xs text-ink-faint">
                          {item.sellerName}
                        </p>
                      )}
                      <p className="text-sm text-ink-muted">
                        {formatPrice(item.price, item.currency, locale)}
                      </p>
                      {isLowStock(item) && item.maxStock !== undefined && (
                        <p className="mt-1 text-sm font-medium text-warning">
                          {t("onlyLeft", {
                            count: item.maxStock - item.quantity,
                          })}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void updateQuantity(
                              item.productId,
                              item.quantity - 1,
                            )
                          }
                          disabled={item.quantity <= 1}
                          aria-label={t("decrease")}
                          className="h-8 w-8 rounded-md border border-line text-ink transition-dignified hover:border-line-strong disabled:opacity-40"
                        >
                          −
                        </button>
                        <span
                          aria-live="polite"
                          aria-label={t("quantityLabel")}
                          className="min-w-8 text-center tabular-nums"
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void updateQuantity(
                              item.productId,
                              item.quantity + 1,
                            )
                          }
                          disabled={atMax}
                          aria-label={t("increase")}
                          className="h-8 w-8 rounded-md border border-line text-ink transition-dignified hover:border-line-strong disabled:opacity-40"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeItem(item.productId)}
                          aria-label={t("removeItem")}
                          className="ms-auto text-sm text-ink-faint underline-offset-2 transition-dignified hover:text-danger hover:underline"
                        >
                          {t("remove")}
                        </button>
                      </div>
                    </div>
                    <p className="shrink-0 text-end font-medium tabular-nums">
                      {formatPrice(
                        String(lineTotal(item)),
                        item.currency,
                        locale,
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-line p-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("subtotal")}</dt>
                  <dd className="tabular-nums">
                    {formatPrice(String(subtotal), currency, locale)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("shipping")}</dt>
                  <dd className="text-ink-faint">{t("shippingAtCheckout")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("vatIncluded")}</dt>
                  <dd className="tabular-nums">
                    {formatPrice(String(vat), currency, locale)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                  <dt>{t("total")}</dt>
                  <dd className="tabular-nums">
                    {formatPrice(String(subtotal), currency, locale)}
                  </dd>
                </div>
              </dl>
              <p className="mt-1 text-xs text-ink-faint">
                {t("vatDisclaimer")}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="/checkout"
                  onClick={onClose}
                  aria-disabled={items.length === 0}
                  className="rounded-md bg-primary px-4 py-2 text-center font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
                >
                  {t("proceedCheckout")}
                </Link>
                <Link
                  href="/"
                  onClick={onClose}
                  className="rounded-md border border-line px-4 py-2 text-center text-ink transition-dignified hover:border-line-strong"
                >
                  {t("continueShopping")}
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
