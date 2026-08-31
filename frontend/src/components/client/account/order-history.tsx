"use client";

/**
 * Order history island (GAP-O03) — the authenticated buyer's orders,
 * newest first. Calm states: loading notice, empty pointer to the catalog,
 * and a single actionable error line (never a stack trace).
 */
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  fetchOrderHistory,
  type OrderHistoryEntry,
} from "@/components/client/checkout/checkout-provider";
import { formatPrice } from "@/server/catalog";

type State =
  | { kind: "loading" }
  | { kind: "ready"; orders: OrderHistoryEntry[] }
  | { kind: "error" };

export function OrderHistory() {
  const t = useTranslations("account");
  const locale = useLocale();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchOrderHistory()
      .then((orders) => {
        if (!cancelled) setState({ kind: "ready", orders });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p className="mt-6 text-ink-muted">{t("ordersLoading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="mt-6 text-sm text-danger">
        {t("ordersError")}
      </p>
    );
  }
  if (state.orders.length === 0) {
    return (
      <div className="mt-6 rounded-md border border-line bg-surface-raised p-6">
        <p className="text-ink-muted">{t("ordersEmpty")}</p>
        <Link
          href="/"
          className="mt-3 inline-block rounded-md bg-primary px-4 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("ordersEmptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 grid list-none gap-3 p-0">
      {state.orders.map((order) => (
        <li
          key={order.orderId}
          className="card flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <span>
            <span className="block font-medium text-ink">
              {order.orderNumber}
            </span>
            <span className="block text-sm text-ink-faint">
              {order.createdAt
                ? new Date(order.createdAt).toLocaleDateString(locale)
                : ""}{" "}
              ·{" "}
              {t.has(`orderStatus_${order.status}`)
                ? t(`orderStatus_${order.status}`)
                : t("orderStatus_unknown")}
            </span>
          </span>
          <span className="font-semibold tabular-nums">
            {formatPrice(order.totalGross, order.currency, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
