"use client";

/**
 * Dashboard stats — fetched from GAP-M03 and auto-refreshed every 60
 * seconds (admin consoles expect near-live queue counts). Refresh failures
 * keep the last good values rather than blanking the cards.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { fetchAdminStats, type AdminStats } from "@/lib/admin";
import { isContractPending } from "@/stores/cart-store";

const REFRESH_MS = 60_000;

export function StatsCards() {
  const t = useTranslations("admin");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [state, setState] = useState<"loading" | "gap" | "error" | "ready">(
    "loading",
  );
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchAdminStats();
        if (cancelled) return;
        setStats(data);
        setState("ready");
        setRefreshedAt(new Date());
      } catch (error) {
        if (cancelled) return;
        if (isContractPending(error)) {
          setState("gap");
        } else {
          // Keep last good values on transient refresh failures.
          setState((current) => (current === "ready" ? "ready" : "error"));
        }
      }
    }

    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (state === "gap") return <ContractGapNotice gapIds={["GAP-M03"]} />;
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

  const cards = [
    {
      label: t("statPendingVerifications"),
      value: stats?.pendingVerifications,
    },
    { label: t("statActiveSellers"), value: stats?.activeSellers },
    { label: t("statFlaggedListings"), value: stats?.flaggedListings },
    { label: t("statOpenCompliance"), value: stats?.openComplianceRequests },
  ];

  return (
    <section aria-label={t("statsAria")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card p-4">
            <p className="text-sm text-ink-faint">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-primary-deep">
              {card.value ?? "…"}
            </p>
          </div>
        ))}
      </div>
      {refreshedAt && (
        <p className="mt-2 text-xs text-ink-faint">
          {t("statsRefreshed", {
            time: refreshedAt.toLocaleTimeString(),
          })}
        </p>
      )}
    </section>
  );
}
