"use client";

/**
 * GDPR Art. 20 self-service export. The request POSTs to compliance_app
 * (GAP-C02); the backend prepares the archive asynchronously and delivers
 * the download link out-of-band (account + email) — the client never holds
 * the export itself. While the gap is open, the UI says so plainly instead
 * of pretending a request was recorded.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";

import { isContractPending } from "@/stores/cart-store";
import { requestDataExport } from "@/stores/consent-store";

type ExportState = "idle" | "requesting" | "submitted" | "pending" | "error";

export function DataExportRequest() {
  const t = useTranslations("consent");
  const [state, setState] = useState<ExportState>("idle");

  async function handleRequest() {
    setState("requesting");
    try {
      await requestDataExport();
      setState("submitted");
    } catch (error) {
      setState(isContractPending(error) ? "pending" : "error");
    }
  }

  return (
    <div className="card mt-6 p-5">
      <p className="text-sm text-ink-muted">{t("exportBody")}</p>
      <button
        type="button"
        onClick={() => void handleRequest()}
        disabled={state === "requesting" || state === "submitted"}
        className="mt-4 rounded-md bg-primary px-5 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
      >
        {state === "requesting" ? t("exportRequesting") : t("exportButton")}
      </button>

      <div aria-live="polite">
        {state === "submitted" && (
          <p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-ink">
            {t("exportSubmitted")}
          </p>
        )}
        {state === "pending" && (
          <p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-ink-muted">
            {t("exportPendingNotice")}
          </p>
        )}
        {state === "error" && (
          <p className="mt-3 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
            {t("exportError")}
          </p>
        )}
      </div>
    </div>
  );
}
