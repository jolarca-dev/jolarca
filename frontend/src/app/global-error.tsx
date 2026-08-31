"use client";

import Link from "next/link";
import { useEffect } from "react";

import { logger } from "@/lib/logger";

import en from "../../messages/en.json";
import et from "../../messages/et.json";
import lt from "../../messages/lt.json";
import lv from "../../messages/lv.json";

/**
 * Root error boundary — catches failures in the ROOT layout itself, which
 * [locale]/error.tsx cannot (it renders inside the root layout). Must
 * provide its own <html>/<body>. No next-intl here (outside the provider):
 * messages are imported statically and the locale is read from the
 * middleware-bridged cookie. Inline styles only — the stylesheet pipeline
 * may be part of what failed. Colors meet the 4.5:1 AA floor on stone.
 */
const MESSAGES = { en, et, lt, lv } as const;
type Locale = keyof typeof MESSAGES;

function readLocale(): Locale {
  if (typeof document === "undefined") return "lt";
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const raw = match?.[1];
  return raw && raw in MESSAGES ? (raw as Locale) : "lt";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = MESSAGES[readLocale()].errors;

  // Sanitized report only — digest, never stack or bodies.
  useEffect(() => {
    logger.error("global error boundary", { digest: error.digest });
  }, [error.digest]);

  return (
    <html lang={readLocale()}>
      <body
        style={{
          margin: 0,
          backgroundColor: "#faf9f6",
          color: "#2b2822",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <main
          style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 2rem" }}
        >
          <h1
            style={{
              color: "#12332a",
              fontSize: "1.9rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            {t.serverErrorTitle}
          </h1>
          <p style={{ color: "#5c574e", maxWidth: "42rem" }}>
            {t.serverErrorBody}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "2rem" }}>
            <button
              onClick={() => reset()}
              style={{
                backgroundColor: "#12332a",
                border: "none",
                borderRadius: "6px",
                color: "#faf9f6",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "1rem",
                padding: "0.6rem 1.4rem",
              }}
            >
              {t.tryAgain}
            </button>
            <Link href="/" style={{ color: "#1b4332", fontWeight: 500 }}>
              {t.returnHome}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
