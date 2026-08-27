"use client";

/**
 * Centralized mutation error handling — one entry point for every client
 * mutation:
 *  - critical errors → localized toast with the technical trace ID;
 *  - non-critical errors → silent sanitized logging only;
 *  - everything is classified through `classifyError`, so callers never
 *    branch on error shapes themselves.
 *
 * Usage:
 *   const handleError = useErrorHandler();
 *   try { await createListing(draft); } catch (e) { handleError(e); }
 */
import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { emitToast, redirectToLogin } from "@/lib/api-client";
import { classifyError, serializeError } from "@/lib/errors";
import { logger } from "@/lib/logger";

interface HandleErrorOptions {
  /** False = silent logging only (default true for mutations). */
  notify?: boolean;
  /** Override the toast code (the Toaster localizes known codes). */
  toastCode?: string;
  /** Context label attached to the log record. */
  context?: string;
  /** Variant override; defaults by classification. */
  variant?: "error" | "warning" | "info";
}

export function useErrorHandler() {
  const t = useTranslations("errors");

  return useCallback(
    (error: unknown, options: HandleErrorOptions = {}) => {
      const { notify = true, toastCode, context, variant } = options;
      const classified = classifyError(error);

      // Silent, sanitized record — always.
      const record = {
        ...serializeError(error),
        context,
      };
      if (classified.kind === "validation") {
        // Validation failures are UI field problems, not incidents.
        logger.warn(`validation: ${context ?? "form"}`, record);
      } else if (notify) {
        logger.error(
          `mutation failed: ${context ?? "unknown"}`,
          record,
          classified.traceId,
        );
      } else {
        logger.warn(`mutation degraded: ${context ?? "unknown"}`, record);
      }

      // Auth discrimination: expired/absent sessions go back to login
      // (API-layer 401s are already redirected by api-client middleware;
      // this covers AuthErrors thrown outside the transport).
      if (
        classified.kind === "auth" &&
        classified.messageKey === "unauthorized"
      ) {
        redirectToLogin();
        return;
      }

      if (!notify) return;

      // User-facing copy: friendly message + trace ID, never internals.
      const message = `${t(classified.messageKey)} · ${t("trace", {
        id: classified.traceId,
      })}`;
      const defaultVariant =
        classified.kind === "auth" || classified.kind === "validation"
          ? "warning"
          : "error";
      emitToast({
        variant: variant ?? defaultVariant,
        code: toastCode ?? classified.code ?? "generic_error",
        message,
      });
    },
    [t],
  );
}
