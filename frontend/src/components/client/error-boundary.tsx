"use client";

/**
 * Client error boundary — the last line of defense for island failures.
 * Reports a SANITIZED record (serializeError + trimmed component stack —
 * never props, never values) through the PII-redacting logger, and shows
 * a calm, localized fallback: friendly copy, home link, support contact.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { serializeError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const SUPPORT_EMAIL = "support@journeyoflife.org";

/** Component stack frames only; capped length; values never reach logs. */
function sanitizeComponentStack(stack?: string | null): string | undefined {
  if (!stack) return undefined;
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("in ") || line.startsWith("at "))
    .slice(0, 25)
    .join("\n")
    .slice(0, 2000);
}

/** Localized fallback shared by the boundary and the route error page. */
export function ErrorFallback({
  title,
  body,
  traceId,
  onRetry,
}: {
  title?: string;
  body?: string;
  traceId?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <h1 className="font-display text-2xl font-semibold text-primary-deep">
        {title ?? t("boundaryTitle")}
      </h1>
      <p className="mt-3 text-ink-muted">{body ?? t("boundaryBody")}</p>
      {traceId && (
        <p className="mt-2 text-sm text-ink-faint">
          {t("trace", { id: traceId })}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
          >
            {t("tryAgain")}
          </button>
        )}
        <Link
          href="/"
          className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong no-underline"
        >
          {t("returnHome")}
        </Link>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong no-underline"
        >
          {t("contactSupport")}
        </a>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; defaults to the localized ErrorFallback. */
  fallback?: ReactNode;
  /** Label logged with the report so sections are traceable. */
  section?: string;
}

interface ErrorBoundaryState {
  failed: boolean;
  traceId?: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const serialized = serializeError(error);
    this.setState({ traceId: serialized.traceId });
    logger.error(`boundary: ${this.props.section ?? "unknown"}`, {
      ...serialized,
      componentStack: sanitizeComponentStack(info.componentStack),
    });
  }

  render(): ReactNode {
    if (this.state.failed) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorFallback
          traceId={this.state.traceId}
          onRetry={() => this.setState({ failed: false })}
        />
      );
    }
    return this.props.children;
  }
}
