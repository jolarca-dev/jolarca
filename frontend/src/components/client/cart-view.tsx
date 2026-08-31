"use client";

/**
 * Full-page cart interactivity island. Layout: table on desktop (lg),
 * stacked cards below. Stock warnings derive from `maxStock`; totals show
 * an estimated included-VAT breakdown (final tax is computed server-side at
 * checkout). "Save for later" ships as a visible placeholder (post-MVP).
 */
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  includedVat,
  isLowStock,
  lineTotal,
  type CartItem,
} from "@/stores/cart-store";
import { formatPrice } from "@/server/catalog";
import {
  useCartItems,
  useCartTotal,
  useRemoveItem,
  useUpdateQuantity,
} from "@/hooks/use-cart";

function QuantityStepper({ item }: { item: CartItem }) {
  const t = useTranslations("cart");
  const updateQuantity = useUpdateQuantity();
  const atMax = item.maxStock !== undefined && item.quantity >= item.maxStock;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void updateQuantity(item.productId, item.quantity - 1)}
        disabled={item.quantity <= 1}
        aria-label={t("decrease")}
        className="h-8 w-8 rounded-md border border-line text-ink transition-dignified hover:border-line-strong disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-8 text-center tabular-nums">{item.quantity}</span>
      <button
        type="button"
        onClick={() => void updateQuantity(item.productId, item.quantity + 1)}
        disabled={atMax}
        aria-label={t("increase")}
        className="h-8 w-8 rounded-md border border-line text-ink transition-dignified hover:border-line-strong disabled:opacity-40"
      >
        +
      </button>
    </span>
  );
}

function StockWarning({ item }: { item: CartItem }) {
  const t = useTranslations("cart");
  if (item.maxStock === undefined) return null;
  if (isLowStock(item)) {
    return (
      <p className="text-sm font-medium text-warning">
        {t("onlyLeft", { count: item.maxStock - item.quantity })}
      </p>
    );
  }
  return null;
}

function Thumbnail({ item }: { item: CartItem }) {
  return item.imageUrl ? (
    <Image
      src={item.imageUrl}
      alt=""
      width={72}
      height={72}
      className="h-18 w-18 rounded-md border border-line object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="block h-18 w-18 rounded-md border border-line bg-gold-soft"
    />
  );
}

export function CartView({ locale }: { locale: string }) {
  const t = useTranslations("cart");
  const items = useCartItems();
  const subtotal = useCartTotal();
  const removeItem = useRemoveItem();
  const currency = items[0]?.currency ?? "EUR";
  const vat = includedVat(subtotal);

  if (items.length === 0) {
    return (
      <div className="card mt-8 flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-lg text-ink">{t("empty")}</p>
        <p className="text-ink-muted">{t("emptyBody")}</p>
        <Link
          href="/"
          className="rounded-md bg-primary px-5 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("browseCatalog")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {/* Desktop: table */}
        <table className="hidden w-full border-collapse lg:table">
          <caption className="sr-only">{t("drawerTitle")}</caption>
          <thead>
            <tr className="border-b border-line text-start text-sm text-ink-muted">
              <th scope="col" className="p-3 text-start font-medium">
                {t("colProduct")}
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                {t("colPrice")}
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                {t("quantityLabel")}
              </th>
              <th scope="col" className="p-3 text-end font-medium">
                {t("colTotal")}
              </th>
              <th scope="col" className="p-3">
                <span className="sr-only">{t("remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.productId}
                className="border-b border-line align-top"
              >
                <td className="p-3">
                  <span className="flex items-center gap-3">
                    <Thumbnail item={item} />
                    <span>
                      <span className="block font-medium text-ink">
                        {item.title}
                      </span>
                      {item.sellerName && (
                        <span className="block text-xs text-ink-faint">
                          {item.sellerName}
                        </span>
                      )}
                      <StockWarning item={item} />
                    </span>
                  </span>
                </td>
                <td className="p-3 tabular-nums">
                  {formatPrice(item.price, item.currency, locale)}
                </td>
                <td className="p-3">
                  <QuantityStepper item={item} />
                </td>
                <td className="p-3 text-end font-medium tabular-nums">
                  {formatPrice(String(lineTotal(item)), item.currency, locale)}
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => void removeItem(item.productId)}
                    aria-label={`${t("remove")} ${item.title}`}
                    className="text-sm text-ink-faint underline-offset-2 transition-dignified hover:text-danger hover:underline"
                  >
                    {t("remove")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile/tablet: cards */}
        <ul className="grid list-none gap-4 p-0 lg:hidden">
          {items.map((item) => (
            <li key={item.productId} className="card flex gap-3 p-4">
              <Thumbnail item={item} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{item.title}</p>
                {item.sellerName && (
                  <p className="text-xs text-ink-faint">{item.sellerName}</p>
                )}
                <p className="text-sm text-ink-muted tabular-nums">
                  {formatPrice(item.price, item.currency, locale)}
                </p>
                <StockWarning item={item} />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <QuantityStepper item={item} />
                  <span className="font-medium tabular-nums">
                    {formatPrice(
                      String(lineTotal(item)),
                      item.currency,
                      locale,
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void removeItem(item.productId)}
                  aria-label={`${t("remove")} ${item.title}`}
                  className="mt-2 text-sm text-ink-faint underline-offset-2 transition-dignified hover:text-danger hover:underline"
                >
                  {t("remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Save for later — visible placeholder, post-MVP feature. */}
        <div className="mt-6">
          <button
            type="button"
            disabled
            title={t("saveForLaterSoon")}
            className="rounded-md border border-dashed border-line px-4 py-2 text-sm text-ink-faint disabled:cursor-not-allowed disabled:opacity-70"
          >
            {t("saveForLater")}
          </button>
          <span className="ms-2 text-xs text-ink-faint">
            {t("saveForLaterSoon")}
          </span>
        </div>
      </div>

      {/* Summary */}
      <aside aria-label={t("total")} className="card h-fit p-5">
        <h2 className="text-lg font-semibold text-primary-deep">
          {t("summaryTitle")}
        </h2>
        <dl className="mt-3 space-y-1 text-sm">
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
        <p className="mt-1 text-xs text-ink-faint">{t("vatDisclaimer")}</p>
        <Link
          href="/checkout"
          className="mt-4 block rounded-md bg-primary px-4 py-2 text-center font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("proceedCheckout")}
        </Link>
      </aside>

      {/* Mobile: prominent sticky checkout bar (the aside scrolls away). */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <span className="font-semibold tabular-nums">
            {formatPrice(String(subtotal), currency, locale)}
          </span>
          <Link
            href="/checkout"
            className="flex-1 rounded-md bg-primary px-4 py-2 text-center font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
          >
            {t("proceedCheckout")}
          </Link>
        </div>
      </div>
    </div>
  );
}
