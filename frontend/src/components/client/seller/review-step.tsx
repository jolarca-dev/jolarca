"use client";

/**
 * Step 4 — Review & submit. Summarizes everything collected and submits
 * the business info (with the WebP logo) to sellers_app once (GAP-V01).
 * If the backend portal is not live yet we say so honestly — onboarding is
 * never marked complete without a server record (ADR-0007).
 */
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { submitBusinessInfo } from "@/lib/seller";
import { isContractPending } from "@/stores/cart-store";
import { useOnboarding } from "./onboarding-provider";

export function ReviewStep() {
  const t = useTranslations("seller");
  const router = useRouter();
  const { businessInfo, logoDataUrl, docs, connectStatus, goToStep } =
    useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "pending" | "error">("idle");

  async function handleSubmit() {
    if (!businessInfo) {
      goToStep("business");
      return;
    }
    setSubmitting(true);
    setOutcome("idle");
    try {
      await submitBusinessInfo(businessInfo, logoDataUrl ?? undefined);
      router.push("/seller/dashboard");
    } catch (error) {
      setOutcome(isContractPending(error) ? "pending" : "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!businessInfo) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-primary-deep">
          {t("stepReview")}
        </h2>
        <p className="text-ink-muted">{t("reviewMissing")}</p>
        <button
          type="button"
          onClick={() => goToStep("business")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
      </section>
    );
  }

  const docLabel = (status: string) =>
    status === "uploaded"
      ? t("docUploaded")
      : status === "portal-pending"
        ? t("docPortalPending")
        : t("docMissing");

  const rows: Array<[string, string]> = [
    [t("businessName"), businessInfo.businessName],
    [t("businessType"), t(`type_${businessInfo.businessType}`)],
    [t("registrationNumber"), businessInfo.registrationNumber],
    [t("vatIdOptional"), businessInfo.vatId || "—"],
    [t("country"), t(`country_${businessInfo.country}`)],
    [
      t("addressSummary"),
      `${businessInfo.street}, ${businessInfo.postalCode} ${businessInfo.city}`,
    ],
    [t("contactEmail"), businessInfo.contactEmail],
    [t("phone"), businessInfo.phone],
  ];

  return (
    <section aria-label={t("stepReview")} className="space-y-4">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepReview")}
      </h2>

      <div className="card p-4">
        <h3 className="mb-3 font-medium text-ink">{t("reviewBusiness")}</h3>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 text-sm">
              <dt className="text-ink-faint">{label}</dt>
              <dd className="text-end text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {logoDataUrl && (
          <div className="mt-3 flex items-center gap-3">
            <Image
              src={logoDataUrl}
              alt={t("logoPreviewAlt")}
              width={48}
              height={48}
              className="h-12 w-12 rounded-md border border-line object-cover"
            />
            <span className="text-sm text-ink-muted">{t("logoLabel")}</span>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-medium text-ink">{t("reviewKyc")}</h3>
        <ul className="space-y-1 text-sm text-ink-muted">
          <li>
            {t("kycIdentity")}: {docLabel(docs.identity.status)}
          </li>
          <li>
            {t("kycProofAddress")}: {docLabel(docs.proof_of_address.status)}
          </li>
        </ul>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-medium text-ink">{t("reviewPayout")}</h3>
        <p className="text-sm text-ink-muted">
          {connectStatus === "success"
            ? t("connectSuccess")
            : t("connectNotYet")}
        </p>
      </div>

      {outcome === "pending" && (
        <p
          role="status"
          className="rounded-md border border-gold/40 bg-gold-soft p-3 text-sm text-ink"
        >
          {t("reviewPortalPending")}
        </p>
      )}
      {outcome === "error" && (
        <p
          role="alert"
          className="rounded-md bg-danger-soft p-3 text-sm text-ink"
        >
          {t("reviewSubmitFailed")}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => goToStep("payout")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
        >
          {submitting ? t("reviewSubmitting") : t("reviewSubmit")}
        </button>
      </div>
    </section>
  );
}
