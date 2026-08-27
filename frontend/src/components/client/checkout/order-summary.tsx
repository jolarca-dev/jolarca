"use client";

/**
 * Order summary block — shared by the payment and review steps.
 * Totals: cart subtotal (gross) + selected shipping; VAT shown as an
 * included-in-gross ESTIMATE — authoritative tax is computed by the backend
 * (Stripe Tax) when the order is created. Client never decides VAT.
 */
import { useTranslations } from "next-intl";

import { includedVat } from "@/stores/cart-store";
import { formatPrice } from "@/server/catalog";
import { useCartItems, useCartTotal } from "@/hooks/use-cart";
import { parseMoney } from "@/stores/cart-store";
import { useCheckout } from "./checkout-provider";

export function OrderSummary() {
  const t = useTranslations("checkout");
  const items = useCartItems();
  const subtotal = useCartTotal();
  const { shippingPrice } = useCheckout();

  const shipping = shippingPrice ? parseMoney(shippingPrice.price) : 0;
  const currency = shippingPrice?.currency ?? items[0]?.currency ?? "EUR";
  const total = subtotal + shipping;
  const vat = includedVat(total);
  const locale =
    typeof window === "undefined"
      ? "lt"
      : document.documentElement.lang || "lt";

  return (
    <aside aria-label={t("summaryTitle")} className="card h-fit p-5">
      <h2 className="text-lg font-semibold text-primary-deep">
        {t("summaryTitle")}
      </h2>

      <ul className="mt-3 space-y-2 border-b border-line pb-3 text-sm">
        {items.map((item) => (
          <li key={item.productId} className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-ink">
              {item.title}{" "}
              <span className="text-ink-faint">× {item.quantity}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatPrice(
                String(parseMoney(item.price) * item.quantity),
                item.currency,
                locale,
              )}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("summarySubtotal")}</dt>
          <dd className="tabular-nums">
            {formatPrice(String(subtotal), currency, locale)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("summaryShipping")}</dt>
          <dd className="tabular-nums">
            {shippingPrice
              ? formatPrice(shippingPrice.price, currency, locale)
              : t("summaryShippingPending")}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("summaryVat")}</dt>
          <dd className="tabular-nums">
            {formatPrice(String(vat), currency, locale)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <dt>{t("summaryTotal")}</dt>
          <dd className="tabular-nums">
            {formatPrice(String(total), currency, locale)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-ink-faint">{t("vatDisclaimer")}</p>
    </aside>
  );
}
