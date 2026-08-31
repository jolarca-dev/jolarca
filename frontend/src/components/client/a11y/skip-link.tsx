"use client";

/**
 * Skip link — MUST be the first focusable element in the document
 * (mounted first inside <body> in the locale layout). Hidden until
 * focused; Enter/Space moves focus and scroll to the main landmark.
 * Targets #main-content, falling back to the first <main> (WCAG 2.4.1).
 */
import { useTranslations } from "next-intl";

import { MAIN_CONTENT_ID, skipToContent } from "@/lib/a11y";

export function SkipLink() {
  const t = useTranslations("a11y");
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        event.preventDefault();
        skipToContent();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-surface-raised focus:outline-2 focus:outline-offset-2 focus:outline-primary-deep"
    >
      {t("skipToMain")}
    </a>
  );
}
