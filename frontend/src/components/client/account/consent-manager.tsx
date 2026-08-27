"use client";

/**
 * Consent management island (account area). Shows the current decision,
 * allows modification (each save appends an immutable audit record via
 * GAP-C01), consent withdrawal (re-prompts), and the backend history
 * (GAP-C04) when available.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { emitToast, isApiError } from "@/lib/api-client";
import { isContractPending } from "@/stores/cart-store";
import {
  fetchConsentHistory,
  recordConsent,
  useConsentStore,
  CONSENT_VERSION,
  type ConsentCategory,
  type ConsentRecord,
} from "@/stores/consent-store";

const TOGGLEABLE: Exclude<ConsentCategory, "necessary">[] = [
  "analytics",
  "marketing",
  "preferences",
];

export function ConsentManager() {
  const t = useTranslations("consent");
  const choices = useConsentStore((s) => s.choices);
  const decided = useConsentStore((s) => s.decided);
  const timestamp = useConsentStore((s) => s.timestamp);
  const setCategory = useConsentStore((s) => s.setCategory);
  const resetConsent = useConsentStore((s) => s.resetConsent);

  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ConsentRecord[] | null>(null);
  const [historyPending, setHistoryPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConsentHistory()
      .then((records) => {
        if (!cancelled) setHistory(records);
      })
      .catch((error) => {
        if (!cancelled && isContractPending(error)) {
          setHistoryPending(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const current = useConsentStore.getState().choices;
    try {
      await recordConsent(current, now);
      useConsentStore.setState({ decided: true, timestamp: now });
      emitToast({ variant: "info", code: "consent_saved" });
    } catch (error) {
      if (isContractPending(error)) {
        // Local decision stays effective; audit recording ships with GAP-C01.
        useConsentStore.setState({ decided: true, timestamp: now });
        emitToast({ variant: "info", code: "consent_sync_pending" });
      } else {
        emitToast({
          variant: "error",
          code: isApiError(error) ? error.code : "consent_record_failed",
        });
      }
    } finally {
      setSaving(false);
    }
  }, []);

  function handleReset() {
    resetConsent();
    // The banner reappears on the next page — an explicit re-consent is
    // required before any optional processing resumes.
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-primary-deep">
          {t("currentChoices")}
        </h2>
        {decided && timestamp && (
          <p className="mt-1 text-sm text-ink-faint">
            {t("lastDecision")}{" "}
            <time dateTime={timestamp}>
              {new Date(timestamp).toLocaleString()}
            </time>{" "}
            · {t("policyVersion")} {CONSENT_VERSION}
          </p>
        )}
        {!decided && (
          <p className="mt-1 text-sm text-ink-faint">{t("noDecisionYet")}</p>
        )}

        <ul className="mt-4 space-y-3">
          <li className="flex items-center justify-between rounded-md border border-line p-3 text-sm">
            <span className="font-medium text-ink">{t("necessary")}</span>
            <input
              type="checkbox"
              checked
              disabled
              aria-label={t("necessary")}
              className="h-4 w-4 accent-[var(--tok-primary)]"
            />
          </li>
          {TOGGLEABLE.map((category) => (
            <li
              key={category}
              className="flex items-center justify-between rounded-md border border-line p-3 text-sm"
            >
              <span className="font-medium text-ink">{t(category)}</span>
              <input
                type="checkbox"
                checked={choices[category]}
                onChange={(e) => setCategory(category, e.target.checked)}
                aria-label={t(category)}
                className="h-4 w-4 accent-[var(--tok-primary)]"
              />
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
          >
            {saving ? t("saving") : t("savePreferences")}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-line px-5 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
          >
            {t("resetConsent")}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">{t("resetHint")}</p>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-primary-deep">
          {t("historyTitle")}
        </h2>
        {historyPending && (
          <p className="mt-2 text-sm text-ink-muted">{t("historyPending")}</p>
        )}
        {history && history.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">{t("historyEmpty")}</p>
        )}
        {history && history.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((record) => (
              <li
                key={record.timestamp}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line p-3"
              >
                <time dateTime={record.timestamp} className="text-ink-muted">
                  {new Date(record.timestamp).toLocaleString()}
                </time>
                <span className="text-ink">
                  {TOGGLEABLE.filter((c) => record.choices[c])
                    .map((c) => t(c))
                    .join(", ") || t("onlyNecessary")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!history && !historyPending && (
          <p role="status" className="mt-2 text-sm text-ink-muted">
            {t("loadingHistory")}
          </p>
        )}
      </section>
    </div>
  );
}
