"use client";

/**
 * Funeral services directory — filters (location, service type, language)
 * applied on explicit submit (calm UX: nothing refetches while typing),
 * card grid, and the shared consultation modal. Degradation follows
 * ADR-0007: while GAP-F02 is pending we show a sanctioned notice — never
 * invented funeral homes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import {
  fetchFuneralDirectory,
  FUNERAL_LANGUAGES,
  SERVICE_TYPES,
  type DirectoryFilters,
  type FuneralHome,
} from "@/lib/funeral";
import { isContractPending } from "@/stores/cart-store";
import { ConsultationForm } from "./consultation-form";
import { ServiceCard } from "./service-card";

export function FuneralDirectory() {
  const t = useTranslations("funeral");
  const [filters, setFilters] = useState<DirectoryFilters>({
    location: "",
    serviceType: "",
    language: "",
  });
  const [homes, setHomes] = useState<FuneralHome[]>([]);
  const [state, setState] = useState<
    "idle" | "loading" | "gap" | "error" | "ready"
  >("idle");
  const [consultFor, setConsultFor] = useState<FuneralHome | null>(null);
  const [generalConsultOpen, setGeneralConsultOpen] = useState(false);

  const load = useCallback(async (active: DirectoryFilters) => {
    setState("loading");
    try {
      const data = await fetchFuneralDirectory(active);
      setHomes(data);
      setState("ready");
    } catch (error) {
      setState(isContractPending(error) ? "gap" : "error");
    }
  }, []);

  // First load shows the full directory (or the sanctioned pending notice).
  useEffect(() => {
    void load({ location: "", serviceType: "", language: "" });
  }, [load]);

  // City/region suggestions derived from listings already returned by the
  // API — no extra endpoint, nothing invented (GAP-F02 owns the real data).
  const citySuggestions = useMemo(() => {
    const values = new Set<string>();
    for (const home of homes) {
      if (home.city) values.add(home.city);
      if (home.region) values.add(home.region);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [homes]);

  const inputClass =
    "w-full rounded-lg border border-line bg-surface-raised px-4 py-3 text-base text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary/50";
  const labelClass = "mb-1 block text-base font-medium text-ink";
  const quietHelp = (
    <p className="text-base leading-(--tok-leading) text-ink-muted">
      {t("directoryAskHelpIntro")}{" "}
      <button
        type="button"
        onClick={() => setGeneralConsultOpen(true)}
        className="rounded-sm text-primary underline underline-offset-4 transition-dignified hover:text-primary-deep focus:outline-2 focus:outline-offset-2 focus:outline-primary/60"
      >
        {t("directoryAskHelp")}
      </button>
      .
    </p>
  );

  return (
    <section aria-label={t("directoryAria")} className="space-y-8">
      {/* Filters — applied on submit only; no background requests. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(filters);
        }}
        className="grid gap-4 rounded-lg border border-line bg-surface-raised p-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label htmlFor="fd-location" className={labelClass}>
            {t("filterLocation")}
          </label>
          <input
            id="fd-location"
            value={filters.location}
            onChange={(e) =>
              setFilters((f) => ({ ...f, location: e.target.value }))
            }
            placeholder={t("filterLocationPlaceholder")}
            list="fd-location-cities"
            className={inputClass}
          />
          <datalist id="fd-location-cities">
            {citySuggestions.map((place) => (
              <option key={place} value={place} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="fd-service" className={labelClass}>
            {t("filterService")}
          </label>
          <select
            id="fd-service"
            value={filters.serviceType}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                serviceType: e.target.value as DirectoryFilters["serviceType"],
              }))
            }
            className={inputClass}
          >
            <option value="">{t("filterAny")}</option>
            {SERVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`service_${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fd-language" className={labelClass}>
            {t("filterLanguage")}
          </label>
          <select
            id="fd-language"
            value={filters.language}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                language: e.target.value as DirectoryFilters["language"],
              }))
            }
            className={inputClass}
          >
            <option value="">{t("filterAny")}</option>
            {FUNERAL_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`language_${code}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-6 py-3 text-base font-medium text-surface-raised transition-dignified hover:bg-primary-deep focus:outline-2 focus:outline-offset-2 focus:outline-primary/60"
          >
            {t("filterSearch")}
          </button>
        </div>
      </form>

      {/* Results */}
      {state === "loading" && (
        <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
          <div className="h-64 animate-pulse rounded-lg bg-surface" />
          <div className="h-64 animate-pulse rounded-lg bg-surface" />
        </div>
      )}
      {state === "gap" && (
        <div className="space-y-4">
          <ContractGapNotice gapIds={["GAP-F02"]} />
          {/* Human contact stays reachable even while the backend is pending. */}
          {quietHelp}
        </div>
      )}
      {state === "error" && (
        <div className="space-y-4">
          <p
            role="alert"
            className="rounded-lg bg-danger-soft p-4 text-base text-ink"
          >
            {t("directoryLoadFailed")}
          </p>
          {quietHelp}
        </div>
      )}
      {state === "ready" &&
        (homes.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-raised p-6 text-base leading-(--tok-leading) text-ink-muted">
            {t("directoryEmpty")}
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {homes.map((home) => (
              <ServiceCard
                key={home.slug}
                home={home}
                onConsult={setConsultFor}
              />
            ))}
          </div>
        ))}

      <ConsultationForm
        open={consultFor !== null}
        providerName={consultFor?.name}
        providerSlug={consultFor?.slug ?? null}
        onClose={() => setConsultFor(null)}
      />
      {/* General (no provider) consultation — opened from the quiet help
          link when the directory cannot offer cards to consult from. */}
      <ConsultationForm
        open={generalConsultOpen}
        providerSlug={null}
        onClose={() => setGeneralConsultOpen(false)}
      />
    </section>
  );
}
