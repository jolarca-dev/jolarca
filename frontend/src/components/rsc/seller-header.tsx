import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { ContactSeller } from "@/components/client/contact-seller";
import type { Seller } from "@/server/catalog";

/** ISO "LT" → 🇱 regional-indicator flag emoji. */
function flagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/**
 * Storefront header (RSC): logo, name, verification badge, description,
 * location, member-since, contact island. Verification is the marketplace
 * differentiator — the badge is prominent and gold-accented.
 */
export async function SellerHeader({ seller }: { seller: Seller }) {
  const t = await getTranslations("storefront");
  const sellerNs = await getTranslations("seller");
  const year = seller.member_since ? seller.member_since.slice(0, 4) : "";

  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-start">
      {seller.logo_url ? (
        <Image
          src={seller.logo_url}
          alt={seller.name}
          width={120}
          height={120}
          className="h-[120px] w-[120px] rounded-lg border border-line object-cover"
        />
      ) : (
        // Logo delivery pending media pipeline (MVP-P1): neutral monogram
        // block, never a fake image.
        <div
          aria-hidden="true"
          className="flex h-[120px] w-[120px] items-center justify-center rounded-lg border border-line bg-gold-soft font-display text-4xl text-gold-ink"
        >
          {seller.name.charAt(0)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{seller.name}</h1>
          {seller.verified && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold bg-gold-soft px-3 py-1 text-sm font-medium text-gold-ink">
              {/* Shield icon — trust signal. */}
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-current"
                aria-hidden="true"
              >
                <path d="M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z" />
              </svg>
              {t("verified")}
            </span>
          )}
        </div>

        {seller.description && (
          <p className="mt-3 max-w-2xl text-ink-muted">{seller.description}</p>
        )}

        <p className="mt-3 text-sm text-ink-muted">
          {seller.location && (
            <>
              {seller.location}
              {seller.country ? ", " : ""}
            </>
          )}
          {seller.country && (
            <>
              <span aria-hidden="true">{flagEmoji(seller.country)}</span>{" "}
              {sellerNs(`country_${seller.country}`)}
            </>
          )}
          {year && <span className="ms-3">{t("memberSince", { year })}</span>}
        </p>

        <div className="mt-5">
          <ContactSeller />
        </div>
      </div>
    </header>
  );
}
