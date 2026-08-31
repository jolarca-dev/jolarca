"use client";

/**
 * Success body — reads the order id from the Stripe return URL, clears the
 * cart draft and the checkout recovery snapshot ONCE, then loads the order
 * confirmation details (GAP-O04). The clear happens even if the detail
 * fetch fails: the order is placed, the draft is consumed, no residue.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  fetchOrderDetail,
  resetCheckoutRecovery,
  type OrderDetail,
} from "@/components/client/checkout/checkout-provider";
import { useCartStore } from "@/stores/cart-store";

export function SuccessBody() {
  const t = useTranslations("checkout");
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const clearedRef = useRef(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  useEffect(() => {
    if (!clearedRef.current) {
      clearedRef.current = true;
      // The order is placed: the draft is consumed. No cross-order residue.
      useCartStore.getState().clearCart();
      resetCheckoutRecovery();
    }
    if (!orderId) return;
    let cancelled = false;
    fetchOrderDetail(orderId)
      .then((loaded) => {
        if (!cancelled) setDetail(loaded);
      })
      .catch(() => {
        // Confirmation details are best-effort here — the order exists;
        // the account history remains the authoritative fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="card mx-auto mt-10 max-w-xl p-10 text-center">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("successTitle")}
      </h1>
      <p className="mt-3 text-ink-muted">{t("successBody")}</p>
      {orderId && (
        <p className="mt-4 text-lg">
          <span className="text-ink-muted">{t("orderNumber")}</span>{" "}
          <strong className="font-semibold text-ink">
            {detail?.orderNumber || orderId}
          </strong>
        </p>
      )}
      {detail?.etaDays && (
        <p className="mt-2 text-sm text-ink-muted">
          {t("etaDays", { days: detail.etaDays })}
        </p>
      )}
      <p className="mt-2 text-sm text-ink-muted">{t("emailNotice")}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
      >
        {t("backToCatalog")}
      </Link>
    </div>
  );
}
