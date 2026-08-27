"use client";

/**
 * GDPR Art. 17 self-service erasure. Deliberately high-friction: explicit
 * consequences list, typed confirmation ("DELETE"), single submission.
 * The backend applies the erasure SLA (GDPR_ERASURE_SLA_DAYS) and keeps the
 * legally-mandated retention set (financial records per
 * RETENTION_FINANCIAL_YEARS) — both explained before confirmation.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";

import { requestDataErasure } from "@/stores/consent-store";
import { isContractPending } from "@/stores/cart-store";

const CONFIRM_WORD = "DELETE";

type ErasureState = "idle" | "requesting" | "submitted" | "pending" | "error";

export function DataErasureRequest() {
  const t = useTranslations("consent");
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<ErasureState>("idle");
  const confirmed = typed.trim() === CONFIRM_WORD;

  async function handleRequest() {
    if (!confirmed || state === "requesting") return;
    setState("requesting");
    try {
      await requestDataErasure();
      setState("submitted");
    } catch (error) {
      setState(isContractPending(error) ? "pending" : "error");
    }
  }

  if (state === "submitted") {
    return (
      <div className="card mt-6 p-5" role="status">
        <p className="font-medium text-ink">{t("erasureSubmitted")}</p>
        <p className="mt-2 text-sm text-ink-muted">{t("erasureFollowUp")}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="card border-warning p-5">
        <h2 className="font-semibold text-ink">{t("erasureWillDelete")}</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-muted">
          <li>{t("erasureItem1")}</li>
          <li>{t("erasureItem2")}</li>
          <li>{t("erasureItem3")}</li>
        </ul>
        <h2 className="mt-4 font-semibold text-ink">{t("erasureRetained")}</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-muted">
          <li>{t("retainedItem1")}</li>
          <li>{t("retainedItem2")}</li>
        </ul>
      </section>

      <section className="card p-5">
        <label htmlFor="erasure-confirm" className="block text-sm font-medium">
          {t("erasureConfirmLabel", { word: CONFIRM_WORD })}
        </label>
        <input
          id="erasure-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="erasure-confirm-hint"
          className="mt-2 w-full max-w-xs rounded-md border border-line bg-surface-raised px-3 py-2 text-ink transition-dignified focus:border-danger focus:outline-2 focus:outline-danger/40"
        />
        <p id="erasure-confirm-hint" className="mt-1 text-xs text-ink-faint">
          {t("erasureConfirmHint")}
        </p>

        <button
          type="button"
          onClick={() => void handleRequest()}
          disabled={!confirmed || state === "requesting"}
          className="mt-4 rounded-md bg-danger px-5 py-2 text-sm font-medium text-surface-raised transition-dignified disabled:opacity-50"
        >
          {state === "requesting" ? t("erasureRequesting") : t("erasureButton")}
        </button>

        <div aria-live="polite">
          {state === "pending" && (
            <p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-ink-muted">
              {t("erasurePendingNotice")}
            </p>
          )}
          {state === "error" && (
            <p className="mt-3 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
              {t("erasureError")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
