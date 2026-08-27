"use client";

/**
 * Route-segment error boundary (Next.js convention). Renders the shared
 * ErrorFallback with status-aware messaging: 404 (not-found digest),
 * 403, and the generic 500 path. The failure is reported once through
 * the sanitized logger — never with raw stack or response bodies.
 */
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { ErrorFallback } from "@/components/client/error-boundary";
import { isApiError, serializeError } from "@/lib/errors";
import { logger } from "@/lib/logger";

type StatusKind = 403 | 404 | 500;

function detectStatus(error: Error & { digest?: string }): StatusKind {
  if (error.digest === "NEXT_NOT_FOUND") return 404;
  if (isApiError(error)) {
    if (error.status === 403) return 403;
    if (error.status === 404) return 404;
  }
  return 500;
}

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const status = detectStatus(error);
  const serialized = serializeError(error);

  // Report once per failure — sanitized shape only (no stack, no bodies).
  useEffect(() => {
    logger.error(`route error (${status})`, {
      ...serialized,
      digest: error.digest,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title =
    status === 404
      ? t("notFoundTitle")
      : status === 403
        ? t("forbiddenTitle")
        : t("serverErrorTitle");
  const body =
    status === 404
      ? t("notFoundBody")
      : status === 403
        ? t("forbiddenBody")
        : t("serverErrorBody");

  return (
    <main className="min-h-[50vh] py-12">
      <ErrorFallback
        title={title}
        body={body}
        traceId={serialized.traceId}
        onRetry={reset}
      />
    </main>
  );
}
