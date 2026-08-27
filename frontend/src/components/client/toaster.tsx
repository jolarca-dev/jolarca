"use client";

/**
 * Toast renderer — subscribes to the "jol:toast" bus (src/lib/api-client.ts)
 * and renders localized, accessible notifications. No tracking, no
 * persistence. Announcements use role="alert" (errors) / role="status".
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { ToastDetail } from "@/lib/api-client";

interface ToastEntry extends ToastDetail {
  id: number;
}

/** Machine code → i18n key (namespace "toasts"). Unknown codes fall back to
 * the event message, then to `toasts.generic`. */
const CODE_KEYS: Record<string, string> = {
  forbidden: "forbidden",
  server_error: "serverError",
  cart_add_failed: "cartAddFailed",
  cart_update_failed: "cartUpdateFailed",
  cart_remove_failed: "cartRemoveFailed",
  cart_sync_failed: "cartSyncFailed",
  cart_sync_pending: "cartSyncPending",
  consent_record_failed: "consentRecordFailed",
  consent_saved: "consentSaved",
  consent_sync_pending: "consentSyncPending",
};

const AUTO_DISMISS_MS = 6000;

export function Toaster() {
  const t = useTranslations("toasts");
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { ...detail, id }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, AUTO_DISMISS_MS);
    }
    window.addEventListener("jol:toast", onToast);
    return () => window.removeEventListener("jol:toast", onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:end-4 sm:w-96">
      {toasts.map((toast) => {
        const key = CODE_KEYS[toast.code];
        const text = key ? t(key) : (toast.message ?? t("generic"));
        const isError = toast.variant === "error";
        return (
          <div
            key={toast.id}
            role={isError ? "alert" : "status"}
            className={
              "pointer-events-auto flex items-start justify-between gap-3 rounded-md border p-3 text-sm shadow-md " +
              (isError
                ? "border-danger bg-danger-soft text-danger"
                : "border-line bg-surface-raised text-ink")
            }
          >
            <span>{text}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t("dismiss")}
              className="shrink-0 text-ink-faint transition-dignified hover:text-ink"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
