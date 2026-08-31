"use client";

/**
 * Consent banner — fixed bottom region (NOT a blocking modal): the page
 * stays operable while it is visible. Shown until an explicit decision
 * exists; hidden forever once `decided` (unless consent is reset or the
 * policy version bumps).
 *
 * Compliance: no optional script loads while this banner is visible —
 * gating happens in ConsentGate/script-loader, keyed off the same store.
 * Every decision is pushed to compliance_app as an immutable audit record
 * (GAP-C01); while that gap is open the local decision still governs
 * script loading and nothing is faked server-side.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { emitToast, isApiError } from "@/lib/api-client";
import { isContractPending } from "@/stores/cart-store";
import {
  recordConsent,
  useConsentStore,
  type ConsentCategory,
  type ConsentChoices,
} from "@/stores/consent-store";

const TOGGLEABLE: Exclude<ConsentCategory, "necessary">[] = [
  "analytics",
  "marketing",
  "preferences",
];

/** Fire-and-forget audit push; contract-pending gaps stay silent. */
function pushToBackend(choices: ConsentChoices, timestamp: string): void {
  recordConsent(choices, timestamp).catch((error) => {
    if (!isContractPending(error)) {
      emitToast({
        variant: "warning",
        code: isApiError(error) ? error.code : "consent_record_failed",
      });
    }
  });
}

export function ConsentBanner() {
  const t = useTranslations("consent");
  const decided = useConsentStore((s) => s.decided);
  const choices = useConsentStore((s) => s.choices);
  const setCategory = useConsentStore((s) => s.setCategory);
  const acceptAll = useConsentStore((s) => s.acceptAll);
  const rejectAll = useConsentStore((s) => s.rejectAll);

  // SSR + hydration: the banner only renders client-side once the persisted
  // decision state is known — avoids flash/mismatch for consenting users.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || decided) return null;

  function handleAcceptAll() {
    const next = acceptAll();
    pushToBackend(
      next,
      useConsentStore.getState().timestamp ?? new Date().toISOString(),
    );
  }

  function handleRejectAll() {
    const next = rejectAll();
    pushToBackend(
      next,
      useConsentStore.getState().timestamp ?? new Date().toISOString(),
    );
  }

  function handleSave() {
    // Saving counts as an explicit decision with the current toggle state.
    const now = new Date().toISOString();
    const { choices: currentChoices } = useConsentStore.getState();
    useConsentStore.setState({ decided: true, timestamp: now });
    pushToBackend(currentChoices, now);
  }

  return (
    <section
      role="region"
      aria-label={t("bannerLabel")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface-raised shadow-lg"
    >
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-primary-deep">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          {t("body")}{" "}
          <Link
            href="/privacy"
            className="text-info underline underline-offset-2"
          >
            {t("privacyLink")}
          </Link>{" "}
          {t("and")}{" "}
          <Link
            href="/cookie-policy"
            className="text-info underline underline-offset-2"
          >
            {t("cookieLink")}
          </Link>
          .
        </p>

        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="sr-only">{t("categoriesLabel")}</legend>

          {/* Necessary — always on, never toggleable */}
          <label className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
            <span>
              <span className="block font-medium text-ink">
                {t("necessary")}
              </span>
              <span className="text-xs text-ink-faint">
                {t("necessaryHint")}
              </span>
            </span>
            <input
              type="checkbox"
              checked
              disabled
              aria-label={t("necessary")}
              className="h-4 w-4 accent-[var(--tok-primary)]"
            />
          </label>

          {TOGGLEABLE.map((category) => (
            <label
              key={category}
              className="flex items-center justify-between gap-2 rounded-md border border-line p-3 text-sm transition-dignified hover:border-line-strong"
            >
              <span>
                <span className="block font-medium text-ink">
                  {t(category)}
                </span>
                <span className="text-xs text-ink-faint">
                  {t(`${category}Hint`)}
                </span>
              </span>
              <input
                type="checkbox"
                checked={choices[category]}
                onChange={(e) => setCategory(category, e.target.checked)}
                aria-label={t(category)}
                className="h-4 w-4 accent-[var(--tok-primary)]"
              />
            </label>
          ))}
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAcceptAll}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
          >
            {t("acceptAll")}
          </button>
          <button
            type="button"
            onClick={handleRejectAll}
            className="rounded-md border border-line px-5 py-2 text-sm font-medium text-ink transition-dignified hover:border-line-strong"
          >
            {t("rejectAll")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md border border-line px-5 py-2 text-sm font-medium text-ink transition-dignified hover:border-line-strong"
          >
            {t("savePreferences")}
          </button>
        </div>
      </div>
    </section>
  );
}
