import { useTranslations } from "next-intl";

import { contractGap } from "@/lib/api/contract-gaps";

/**
 * Sanctioned "not available yet" surface (ADR-0007). Renders the registered
 * contract gap(s) a page is blocked on — never fake data, never silent blanks.
 */
export function ContractGapNotice({ gapIds }: { gapIds: string[] }) {
  const t = useTranslations("stub");
  return (
    <section aria-live="polite" className="card mt-8 p-6">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mt-2 text-ink-muted">{t("body")}</p>
      <ul className="mt-4 space-y-1 text-sm text-ink-faint">
        {gapIds.map((id) => {
          const gap = contractGap(id);
          return (
            <li key={id}>
              <code>{gap.id}</code> · {gap.method} <code>{gap.path}</code> ·{" "}
              {gap.ownerApp} — {gap.neededFor}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
