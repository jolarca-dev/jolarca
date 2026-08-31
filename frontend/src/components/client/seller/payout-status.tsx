"use client";

/**
 * Payout status card — Stripe Connect account state sourced from the
 * backend (payments_app is the only Stripe surface; GAP-V10). Shows
 * status, available balance, next payout, totals and the Express
 * dashboard link when the account is active.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { fetchPayoutInfo } from "@/lib/seller";
import { isContractPending } from "@/stores/cart-store";

type PayoutInfo = Awaited<ReturnType<typeof fetchPayoutInfo>>;

export function PayoutStatus() {
  const t = useTranslations("seller");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "gap" }
    | { kind: "error" }
    | { kind: "ready"; info: PayoutInfo }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const info = await fetchPayoutInfo();
        if (!cancelled) setState({ kind: "ready", info });
      } catch (error) {
        if (!cancelled) {
          setState(
            isContractPending(error) ? { kind: "gap" } : { kind: "error" },
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusStyles: Record<PayoutInfo["status"], string> = {
    active: "bg-success-soft text-success",
    pending: "bg-warning-soft text-warning",
    restricted: "bg-danger-soft text-danger",
  };

  return (
    <section aria-label={t("payoutCardTitle")} className="card p-6">
      <h2 className="text-lg font-semibold text-primary-deep">
        {t("payoutCardTitle")}
      </h2>
      {state.kind === "loading" && (
        <div
          className="mt-4 h-24 animate-pulse rounded-md bg-surface"
          aria-hidden="true"
        />
      )}
      {state.kind === "gap" && <ContractGapNotice gapIds={["GAP-V10"]} />}
      {state.kind === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-ink"
        >
          {t("payoutLoadFailed")}
        </p>
      )}
      {state.kind === "ready" && (
        <div className="mt-4 space-y-3">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${statusStyles[state.info.status]}`}
          >
            {t(`connect_${state.info.status}`)}
          </span>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-ink-faint">
                {t("availableBalance")}
              </dt>
              <dd className="font-medium text-ink">
                {state.info.availableBalance}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-faint">{t("nextPayout")}</dt>
              <dd className="font-medium text-ink">
                {state.info.nextPayoutDate || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-faint">{t("totalPaid")}</dt>
              <dd className="font-medium text-ink">{state.info.totalPaid}</dd>
            </div>
          </dl>
          {state.info.expressDashboardUrl && (
            <a
              href={state.info.expressDashboardUrl}
              rel="noreferrer"
              className="inline-block text-sm text-primary underline-offset-2 hover:underline"
            >
              {t("expressDashboardLink")}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
