"use client";

/**
 * Funeral home directory card. Enforced omissions (ADR-0008/0009): no
 * pricing, no add-to-cart, no countdowns, no scarcity. Calm information,
 * generous spacing, 20px-base typography, muted palette. Phone stays above
 * the fold; imagery (when GAP-F02 supplies it) never zooms on hover.
 */
import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { FuneralHome } from "@/lib/funeral";
import { GriefButton } from "./grief-aware-elements";

interface ServiceCardProps {
  home: FuneralHome;
  onConsult: (home: FuneralHome) => void;
}

export function ServiceCard({ home, onConsult }: ServiceCardProps) {
  const t = useTranslations("funeral");

  return (
    <article
      aria-label={home.name}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-raised"
    >
      {home.photo && (
        <Image
          src={home.photo}
          alt={home.photoAlt || t("cardPhotoAlt", { name: home.name })}
          width={640}
          height={400}
          className="h-48 w-full border-b border-line object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-xl leading-(--tok-leading-tight) text-ink">
          {home.name}
        </h3>
        <p className="mt-1 text-base text-ink-muted">
          {[home.city, home.region].filter(Boolean).join(", ")}
        </p>

        {home.address && (
          <p className="mt-3 text-base leading-(--tok-leading) text-ink-muted">
            {home.address}
          </p>
        )}

        <dl className="mt-3 space-y-1 text-base leading-(--tok-leading)">
          {home.phone && (
            <div className="flex gap-2">
              <dt className="text-ink-faint">{t("cardPhone")}</dt>
              <dd>
                <a
                  href={`tel:${home.phone.replace(/\s/g, "")}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {home.phone}
                </a>
              </dd>
            </div>
          )}
          {home.email && (
            <div className="flex gap-2">
              <dt className="text-ink-faint">{t("cardEmail")}</dt>
              <dd>
                <a
                  href={`mailto:${home.email}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {home.email}
                </a>
              </dd>
            </div>
          )}
          {home.hours && (
            <div className="flex gap-2">
              <dt className="text-ink-faint">{t("cardHours")}</dt>
              <dd className="text-ink-muted">{home.hours}</dd>
            </div>
          )}
        </dl>

        {home.services.length > 0 && (
          <ul
            className="mt-4 flex flex-wrap gap-2"
            aria-label={t("cardServices")}
          >
            {home.services.map((service) => (
              <li
                key={service}
                className="rounded-full border border-line px-3 py-1 text-base text-ink-muted"
              >
                {t(`service_${service}`, { default: service })}
              </li>
            ))}
          </ul>
        )}

        {home.languages.length > 0 && (
          <p className="mt-3 text-base leading-(--tok-leading) text-ink-muted">
            <span className="text-ink-faint">{t("cardLanguages")}: </span>
            {home.languages
              .map((code) => t(`language_${code}`, { default: code }))
              .join(", ")}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 pt-2">
          {home.phone && (
            <GriefButton
              variant="primary"
              href={`tel:${home.phone.replace(/\s/g, "")}`}
              ariaLabel={t("cardCallAria", { name: home.name })}
            >
              {t("cardCall")}
            </GriefButton>
          )}
          <GriefButton variant="secondary" onClick={() => onConsult(home)}>
            {t("cardConsult")}
          </GriefButton>
          <Link
            href={`/funeral-services/${home.slug}`}
            className="text-base text-primary underline-offset-4 hover:underline"
          >
            {t("cardProfile")}
          </Link>
        </div>
      </div>
    </article>
  );
}
