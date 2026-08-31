"use client";

/**
 * Seller dashboard island — Connect return banner, four stats cards, quick
 * actions and the paginated recent-orders table. Every number comes from
 * sellers_app (GAP-V09/V11); while the backend portal is pending we show
 * sanctioned notices instead of invented figures (ADR-0007).
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { Link } from "@/i18n/navigation";
import {
  fetchSellerOrders,
  fetchSellerStats,
  type SellerOrderRow,
  type SellerStats,
} from "@/lib/seller";
import { isContractPending } from "@/stores/cart-store";
import { PayoutStatus } from "./payout-status";

type LoadState = "loading" | "gap" | "error" | "ready";

function ConnectReturnBanner() {
  const t = useTranslations("seller");
  const searchParams = useSearchParams();
  if (searchParams.get("connect_return") !== "1") return null;
  const failed = searchParams.get("success") === "false";
  return (
    <p
      role={failed ? "alert" : "status"}
      className={`mb-6 rounded-md p-3 text-sm text-ink ${
        failed ? "bg-danger-soft" : "bg-success-soft"
      }`}
    >
      {failed ? t("connectError") : t("connectReturnSuccess")}
    </p>
  );
}

function StatsCards() {
  const t = useTranslations("seller");
  const [state, setState] = useState<LoadState>("loading");
  const [stats, setStats] = useState<SellerStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSellerStats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setState("ready");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState(isContractPending(error) ? "gap" : "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "gap") return <ContractGapNotice gapIds={["GAP-V09"]} />;
  if (state === "error") {
    return (
      <p
        role="alert"
        className="rounded-md bg-danger-soft p-3 text-sm text-ink"
      >
        {t("statsLoadFailed")}
      </p>
    );
  }

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value / 100);

  const cards: Array<{ label: string; value: string }> = [
    {
      label: t("statTotalSales"),
      value:
        state === "ready" && stats
          ? money(stats.totalSales, stats.currency)
          : "…",
    },
    {
      label: t("statPendingOrders"),
      value: state === "ready" && stats ? String(stats.pendingOrders) : "…",
    },
    {
      label: t("statActiveListings"),
      value: state === "ready" && stats ? String(stats.activeListings) : "…",
    },
    {
      label: t("statPayoutBalance"),
      value:
        state === "ready" && stats
          ? money(stats.payoutBalance, stats.currency)
          : "…",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="card p-4">
          <p className="text-sm text-ink-faint">{card.label}</p>
          <p className="mt-1 text-xl font-semibold text-primary-deep">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecentOrders() {
  const t = useTranslations("seller");
  const [state, setState] = useState<LoadState>("loading");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rows, setRows] = useState<SellerOrderRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchSellerOrders(page)
      .then((data) => {
        if (!cancelled) {
          setRows(data.results);
          setTotalPages(data.totalPages);
          setState("ready");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState(isContractPending(error) ? "gap" : "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <section aria-label={t("ordersTitle")} className="card p-6">
      <h2 className="text-lg font-semibold text-primary-deep">
        {t("ordersTitle")}
      </h2>

      {state === "loading" && (
        <div
          className="mt-4 h-32 animate-pulse rounded-md bg-surface"
          aria-hidden="true"
        />
      )}
      {state === "gap" && <ContractGapNotice gapIds={["GAP-V11"]} />}
      {state === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-ink"
        >
          {t("ordersLoadFailed")}
        </p>
      )}
      {state === "ready" &&
        (rows.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{t("ordersEmpty")}</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">{t("ordersTitle")}</caption>
                <thead>
                  <tr className="border-b border-line text-start text-ink-faint">
                    <th scope="col" className="py-2 pe-4 text-start">
                      {t("orderId")}
                    </th>
                    <th scope="col" className="py-2 pe-4 text-start">
                      {t("orderDate")}
                    </th>
                    <th scope="col" className="py-2 pe-4 text-start">
                      {t("orderBuyer")}
                    </th>
                    <th scope="col" className="py-2 pe-4 text-start">
                      {t("orderTotal")}
                    </th>
                    <th scope="col" className="py-2 text-start">
                      {t("orderStatus")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line/60">
                      <td className="py-2 pe-4 font-medium text-ink">
                        {row.id}
                      </td>
                      <td className="py-2 pe-4 text-ink-muted">
                        {row.placedAt}
                      </td>
                      <td className="py-2 pe-4 text-ink-muted">
                        {row.buyerName}
                      </td>
                      <td className="py-2 pe-4 text-ink">{row.total}</td>
                      <td className="py-2 text-ink-muted">
                        {t(`orderStatus_${row.status}`, {
                          default: row.status,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <nav
                aria-label={t("ordersPagination")}
                className="mt-4 flex items-center justify-between"
              >
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-line px-4 py-1.5 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
                >
                  {t("pagePrev")}
                </button>
                <span className="text-sm text-ink-faint">
                  {t("pageInfo", { page, totalPages })}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-line px-4 py-1.5 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
                >
                  {t("pageNext")}
                </button>
              </nav>
            )}
          </>
        ))}
    </section>
  );
}

export function SellerDashboard({ sellerSlug }: { sellerSlug: string | null }) {
  const t = useTranslations("seller");

  return (
    <div className="space-y-6">
      <ConnectReturnBanner />
      <StatsCards />

      <section aria-label={t("quickActions")} className="flex flex-wrap gap-3">
        <Link
          href="/seller/listings/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("actionAddListing")}
        </Link>
        <Link
          href={sellerSlug ? `/sellers/${sellerSlug}` : "/seller/onboarding"}
          className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
        >
          {t("actionViewStore")}
        </Link>
        <a
          href="#payouts"
          className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
        >
          {t("actionPayoutHistory")}
        </a>
      </section>

      <div id="payouts">
        <PayoutStatus />
      </div>

      <RecentOrders />
    </div>
  );
}
