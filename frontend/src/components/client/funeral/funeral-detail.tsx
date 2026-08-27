"use client";

/**
 * Funeral home profile — human contact first (prominent phone), services,
 * respectful gallery, team, testimonials, and a user-initiated OpenStreetMap
 * embed (nothing loads until the visitor asks — no third-party requests by
 * default, no Google Maps). Degradation per ADR-0007.
 */
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { fetchFuneralHome, type FuneralHomeDetail } from "@/lib/funeral";
import { isContractPending } from "@/stores/cart-store";
import { ConsultationForm } from "./consultation-form";
import { GriefButton, GriefHeading } from "./grief-aware-elements";

const MAP_DELTA = 0.01;

function mapEmbedUrl(home: FuneralHomeDetail): string {
  const lat = home.latitude ?? 0;
  const lon = home.longitude ?? 0;
  const bbox = [
    lon - MAP_DELTA,
    lat - MAP_DELTA,
    lon + MAP_DELTA,
    lat + MAP_DELTA,
  ]
    .map((value) => value.toFixed(5))
    .join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
}

export function FuneralDetailView({ slug }: { slug: string }) {
  const t = useTranslations("funeral");
  const [home, setHome] = useState<FuneralHomeDetail | null>(null);
  const [state, setState] = useState<"loading" | "gap" | "error" | "ready">(
    "loading",
  );
  const [consultOpen, setConsultOpen] = useState(false);
  const [mapRequested, setMapRequested] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await fetchFuneralHome(slug);
      setHome(data);
      setState("ready");
    } catch (error) {
      setState(isContractPending(error) ? "gap" : "error");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div
        className="h-96 animate-pulse rounded-lg bg-surface"
        aria-hidden="true"
      />
    );
  }
  if (state === "gap") return <ContractGapNotice gapIds={["GAP-F03"]} />;
  if (state === "error" || !home) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-danger-soft p-4 text-base text-ink"
      >
        {t("detailLoadFailed")}
      </p>
    );
  }

  const osmLink = `https://www.openstreetmap.org/search?query=${encodeURIComponent(
    `${home.name}, ${home.city}`,
  )}`;

  return (
    <div className="space-y-12">
      {/* Header — name, location, human contact above all else. */}
      <header className="rounded-lg border border-line bg-surface-raised p-8">
        <h1 className="font-display text-3xl leading-(--tok-leading-tight) text-ink">
          {home.name}
        </h1>
        <p className="mt-2 text-lg text-ink-muted">
          {[home.address, home.city, home.region].filter(Boolean).join(", ")}
        </p>
        {home.hours && (
          <p className="mt-1 text-base text-ink-muted">{home.hours}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {home.phone && (
            <a
              href={`tel:${home.phone.replace(/\s/g, "")}`}
              className="rounded-lg bg-primary px-6 py-3 text-lg font-medium text-surface-raised transition-dignified hover:bg-primary-deep focus:outline-2 focus:outline-offset-2 focus:outline-primary/60"
            >
              {t("detailCall")} {home.phone}
            </a>
          )}
          <GriefButton variant="secondary" onClick={() => setConsultOpen(true)}>
            {t("cardConsult")}
          </GriefButton>
          {home.email && (
            <a
              href={`mailto:${home.email}`}
              className="text-base text-primary underline-offset-4 hover:underline"
            >
              {home.email}
            </a>
          )}
        </div>
        <p className="mt-4 text-base leading-(--tok-leading) text-ink-faint">
          {t("detailHumanNote")}
        </p>
      </header>

      {home.description && (
        <p className="max-w-3xl text-base leading-(--tok-leading) text-ink-muted">
          {home.description}
        </p>
      )}

      {/* Services with descriptions */}
      {home.services.length > 0 && (
        <section aria-label={t("detailServices")} className="space-y-4">
          <GriefHeading>{t("detailServices")}</GriefHeading>
          <ul className="grid gap-4 sm:grid-cols-2">
            {home.services.map((service) => (
              <li
                key={service}
                className="rounded-lg border border-line bg-surface-raised p-5"
              >
                <h3 className="font-display text-lg text-ink">
                  {t(`service_${service}`, { default: service })}
                </h3>
                <p className="mt-2 text-base leading-(--tok-leading) text-ink-muted">
                  {t(`serviceDesc_${service}`, {
                    default: t("serviceDescGeneric"),
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Gallery — respectful imagery supplied by the provider only. */}
      <section aria-label={t("detailGallery")} className="space-y-4">
        <GriefHeading>{t("detailGallery")}</GriefHeading>
        {home.gallery.length === 0 ? (
          <p className="text-base text-ink-muted">{t("galleryEmpty")}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {home.gallery.map((image) => (
              <li key={image.url}>
                <Image
                  src={image.url}
                  alt={image.alt || t("galleryAlt", { name: home.name })}
                  width={480}
                  height={360}
                  className="h-56 w-full rounded-lg border border-line object-cover"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Team — names and faces build trust. */}
      {home.team.length > 0 && (
        <section aria-label={t("detailTeam")} className="space-y-4">
          <GriefHeading>{t("detailTeam")}</GriefHeading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {home.team.map((member) => (
              <li
                key={member.name}
                className="flex items-center gap-4 rounded-lg border border-line bg-surface-raised p-4"
              >
                {member.imageUrl ? (
                  <Image
                    src={member.imageUrl}
                    alt={t("teamPhotoAlt", { name: member.name })}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full border border-line object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface font-display text-lg text-ink-muted"
                  >
                    {member.name.charAt(0)}
                  </span>
                )}
                <div>
                  <p className="text-base font-medium text-ink">
                    {member.name}
                  </p>
                  {member.role && (
                    <p className="text-base text-ink-muted">{member.role}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Testimonials — only when the provider supplied them. */}
      {home.reviews.length > 0 && (
        <section aria-label={t("detailReviews")} className="space-y-4">
          <GriefHeading>{t("detailReviews")}</GriefHeading>
          <ul className="space-y-4">
            {home.reviews.map((review, index) => (
              <li
                key={`${review.at}-${index}`}
                className="rounded-lg border border-line bg-surface-raised p-5"
              >
                <blockquote className="text-base leading-(--tok-leading) text-ink">
                  “{review.text}”
                </blockquote>
                {review.author && (
                  <p className="mt-2 text-base text-ink-faint">
                    — {review.author}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Map — OpenStreetMap, loaded only on explicit request. */}
      <section aria-label={t("detailMap")} className="space-y-4">
        <GriefHeading>{t("detailMap")}</GriefHeading>
        {mapRequested && home.latitude !== null && home.longitude !== null ? (
          <iframe
            title={t("mapFrameTitle", { name: home.name })}
            src={mapEmbedUrl(home)}
            className="h-80 w-full rounded-lg border border-line"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            {home.latitude !== null && home.longitude !== null ? (
              <GriefButton
                variant="secondary"
                onClick={() => setMapRequested(true)}
              >
                {t("mapLoad")}
              </GriefButton>
            ) : null}
            <a
              href={osmLink}
              target="_blank"
              rel="noreferrer"
              className="text-base text-primary underline-offset-4 hover:underline"
            >
              {t("mapOpenExternal")}
            </a>
          </div>
        )}
        <p className="text-base text-ink-faint">{t("mapPrivacyNote")}</p>
      </section>

      <ConsultationForm
        open={consultOpen}
        providerName={home.name}
        providerSlug={home.slug}
        onClose={() => setConsultOpen(false)}
      />
    </div>
  );
}
