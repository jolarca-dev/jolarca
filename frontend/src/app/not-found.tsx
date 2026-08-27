import { cookies } from "next/headers";
// Plain next/link: root-boundary documents render OUTSIDE the
// NextIntlClientProvider, so the locale-aware Link from @/i18n/navigation
// would crash with "No intl context found".
import Link from "next/link";

import en from "../../messages/en.json";
import et from "../../messages/et.json";
import lt from "../../messages/lt.json";
import lv from "../../messages/lv.json";

/**
 * Root 404 — unmatched URLs and notFound() calls resolve to the root
 * boundary, which renders OUTSIDE the [locale] layout; without this file
 * Next serves its built-in bare document (no lang/title → axe failures).
 * The document shell (html/lang/title) comes from the root layout; this
 * component contributes the localized, on-brand body only. Inline styles
 * keep it presentable even before stylesheets resolve; all colors meet
 * the 4.5:1 AA floor on the stone surface.
 */
const MESSAGES = { en, et, lt, lv } as const;
type Locale = keyof typeof MESSAGES;

export default async function RootNotFound() {
  const store = await cookies();
  const raw = store.get("NEXT_LOCALE")?.value ?? "lt";
  const locale: Locale = (raw in MESSAGES ? raw : "lt") as Locale;
  const t = MESSAGES[locale].errors;

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 2rem" }}>
      <h1
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          color: "#12332a",
          fontSize: "1.9rem",
          fontWeight: 600,
        }}
      >
        {t.notFoundTitle}
      </h1>
      <p style={{ color: "#5c574e", maxWidth: "42rem" }}>{t.notFoundBody}</p>
      <Link href="/" style={{ color: "#1b4332", fontWeight: 500 }}>
        {t.returnHome}
      </Link>
    </main>
  );
}
