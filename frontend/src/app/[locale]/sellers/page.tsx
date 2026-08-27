import { setRequestLocale } from "next-intl/server";

import { ContractGapNotice } from "@/components/contract-gap-notice";

interface RouteParams {
  locale: string;
}

/**
 * Seller directory is GAP-V13 (backend endpoint pending). The sanctioned
 * degradation is a loud notice — never a fake directory (ADR-0007).
 */
export default async function SellersIndexPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-3xl text-primary-deep">Sellers</h1>
      <div className="mt-6">
        <ContractGapNotice gapIds={["GAP-V13"]} />
      </div>
    </main>
  );
}
