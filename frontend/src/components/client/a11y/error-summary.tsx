"use client";

/**
 * Form-level error summary (GOV.UK pattern) — appears at the top of a
 * failed form, takes focus, lists every issue as a link into the field.
 * Pairs with fieldAriaProps(): field ids resolve to the same elements the
 * summary links to.
 */
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { errorSummaryEntries, type FieldErrors } from "@/lib/validation";

export function ErrorSummary({ errors }: { errors: FieldErrors }) {
  const t = useTranslations("a11y");
  const entries = errorSummaryEntries(errors);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Focus the summary on mount so assistive tech meets the problems first
  // (WCAG 3.3.1 error identification). tabIndex -1 = focusable by script,
  // never part of the tab order.
  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  if (entries.length === 0) return null;

  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      aria-labelledby="error-summary-title"
      className="rounded-md border-2 border-danger bg-danger-soft p-4"
    >
      <h2
        id="error-summary-title"
        className="text-base font-semibold text-danger"
      >
        {t("errorSummaryTitle")}
      </h2>
      <p className="mt-1 text-sm text-ink">{t("errorSummaryBody")}</p>
      <ul className="mt-3 list-disc space-y-1 ps-5">
        {entries.map((entry) => (
          <li key={entry.fieldId}>
            <a
              href={`#${entry.fieldId}`}
              onClick={(event) => {
                event.preventDefault();
                const field = document.getElementById(entry.fieldId);
                field?.focus();
              }}
              className="text-danger underline focus:outline-2 focus:outline-offset-2 focus:outline-danger"
            >
              {entry.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
