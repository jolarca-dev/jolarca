"use client";

/**
 * Login-specific error boundary.
 * Distinguishes auth-service unavailability (503/504) from generic errors
 * so the login page can show actionable copy instead of the generic 500
 * fallback.
 */
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { ErrorFallback } from "@/components/client/error-boundary";
import { isApiError, serializeError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const serialized = serializeError(error);

  useEffect(() => {
    logger.error("login boundary", {
      ...serialized,
      digest: error.digest,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAuthUnavailable =
    isApiError(error) && (error.status === 503 || error.status === 504);

  const title = isAuthUnavailable ? t("serverErrorTitle") : t("boundaryTitle");
  const body = isAuthUnavailable ? t("serverErrorBody") : t("boundaryBody");

  return (
    <main className="mx-auto max-w-md p-8">
      <ErrorFallback
        title={title}
        body={body}
        traceId={serialized.traceId}
        onRetry={reset}
      />
    </main>
  );
}
