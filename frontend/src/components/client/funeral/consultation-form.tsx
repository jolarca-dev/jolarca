"use client";

/**
 * Consultation request modal — opens in place so the visitor keeps their
 * context. Grief-aware choices: only name + ONE contact method required,
 * calm microcopy, no urgency, no tracking. PII goes straight to the
 * backend (GAP-F01) and is never written to client storage.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  consultationFieldErrors,
  consultationSchema,
  SERVICE_TYPES,
  submitConsultationRequest,
  type ConsultationFieldErrors,
} from "@/lib/funeral";
import { isContractPending } from "@/stores/cart-store";
import { GriefButton } from "./grief-aware-elements";

interface ConsultationFormProps {
  open: boolean;
  providerName?: string;
  providerSlug: string | null;
  defaultServiceType?: string;
  onClose: () => void;
}

export function ConsultationForm({
  open,
  providerName,
  providerSlug,
  defaultServiceType = "",
  onClose,
}: ConsultationFormProps) {
  const t = useTranslations("funeral");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    preferredContact: "phone" as "phone" | "email",
    serviceType: defaultServiceType,
    message: "",
  });
  const [errors, setErrors] = useState<ConsultationFieldErrors>({});
  const [outcome, setOutcome] = useState<
    "idle" | "submitting" | "success" | "portal-pending" | "error"
  >("idle");
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setOutcome("idle");
    restoreRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Success closes the dialog by itself after 5 seconds — the visitor never
  // has to act. The confirmation copy (with the 24-hour promise) announces
  // the auto-close so it never feels abrupt.
  useEffect(() => {
    if (!open || outcome !== "success") return;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [open, outcome, onClose]);

  if (!open) return null;

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }) as typeof form);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = consultationSchema.safeParse(form);
    if (!result.success) {
      setErrors(consultationFieldErrors(result.error));
      return;
    }
    setErrors({});
    setOutcome("submitting");
    try {
      await submitConsultationRequest(result.data, providerSlug);
      setOutcome("success");
    } catch (error) {
      setOutcome(isContractPending(error) ? "portal-pending" : "error");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-line bg-surface-raised px-4 py-3 text-base text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary/50";
  const labelClass = "mb-1 block text-base font-medium text-ink";
  const errorClass = "mt-1 text-base text-danger";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("consultTitle")}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-surface-raised p-6 shadow-lg"
      >
        {outcome === "success" ? (
          <div
            role="status"
            aria-live="polite"
            className="space-y-4 text-center"
          >
            <h2 className="font-display text-2xl text-ink">
              {t("consultSuccessTitle")}
            </h2>
            <p className="text-base leading-(--tok-leading) text-ink-muted">
              {t("consultSuccessBody")}
            </p>
            <p className="text-base text-ink-faint">{t("consultAutoClose")}</p>
            <GriefButton variant="secondary" onClick={onClose}>
              {t("consultClose")}
            </GriefButton>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl text-ink">
                {t("consultTitle")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("consultClose")}
                className="rounded-md border border-line px-2.5 py-1 text-base text-ink-muted transition-dignified hover:border-line-strong focus:outline-2 focus:outline-offset-2 focus:outline-primary/60"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-base leading-(--tok-leading) text-ink-muted">
              {providerName
                ? t("consultIntroProvider", { provider: providerName })
                : t("consultIntro")}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="cf-name" className={labelClass}>
                  {t("cfName")}
                </label>
                <input
                  id="cf-name"
                  ref={firstFieldRef}
                  value={form.name}
                  onChange={(e) => field("name", e.target.value)}
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "cf-name-err" : undefined}
                  className={inputClass}
                />
                {errors.name && (
                  <p id="cf-name-err" className={errorClass}>
                    {t("cfNameRequired")}
                  </p>
                )}
              </div>

              <fieldset>
                <legend className="mb-2 text-base text-ink-muted">
                  {t("cfContactLegend")}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cf-phone" className={labelClass}>
                      {t("cfPhone")}
                    </label>
                    <input
                      id="cf-phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => field("phone", e.target.value)}
                      aria-invalid={!!errors.phone}
                      aria-describedby={
                        errors.phone ? "cf-phone-err" : undefined
                      }
                      className={inputClass}
                    />
                    {errors.phone && (
                      <p id="cf-phone-err" className={errorClass}>
                        {t("cfPhoneInvalid")}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cf-email" className={labelClass}>
                      {t("cfEmail")}
                    </label>
                    <input
                      id="cf-email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => field("email", e.target.value)}
                      aria-invalid={!!errors.email}
                      aria-describedby={
                        errors.email ? "cf-email-err" : undefined
                      }
                      className={inputClass}
                    />
                    {errors.email && (
                      <p id="cf-email-err" className={errorClass}>
                        {t("cfEmailInvalid")}
                      </p>
                    )}
                  </div>
                </div>
                {errors.contact && (
                  <p role="alert" className={errorClass}>
                    {t("cfContactRequired")}
                  </p>
                )}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-base text-ink-muted">
                  {t("cfPreferredLegend")}
                </legend>
                <div className="flex gap-6">
                  {(["phone", "email"] as const).map((method) => (
                    <label
                      key={method}
                      className="flex items-center gap-2 text-base text-ink"
                    >
                      <input
                        type="radio"
                        name="cf-preferred"
                        value={method}
                        checked={form.preferredContact === method}
                        onChange={() => field("preferredContact", method)}
                        className="h-4 w-4 accent-(--tok-primary)"
                      />
                      {t(method === "phone" ? "cfByPhone" : "cfByEmail")}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="cf-service" className={labelClass}>
                  {t("cfService")}
                </label>
                <select
                  id="cf-service"
                  value={form.serviceType}
                  onChange={(e) => field("serviceType", e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t("cfServiceUnsure")}</option>
                  {SERVICE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`service_${type}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cf-message" className={labelClass}>
                  {t("cfMessage")}
                </label>
                <textarea
                  id="cf-message"
                  rows={4}
                  value={form.message}
                  onChange={(e) => field("message", e.target.value)}
                  placeholder={t("cfMessagePlaceholder")}
                  className={inputClass}
                />
              </div>
            </div>

            {outcome === "portal-pending" && (
              <p
                role="status"
                className="mt-4 rounded-lg bg-gold-soft p-3 text-base text-ink"
              >
                {t("consultPortalPending")}
              </p>
            )}
            {outcome === "error" && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-danger-soft p-3 text-base text-ink"
              >
                {t("consultFailed")}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <GriefButton variant="quiet" onClick={onClose}>
                {t("consultCancel")}
              </GriefButton>
              <GriefButton
                type="submit"
                variant="primary"
                disabled={outcome === "submitting"}
              >
                {outcome === "submitting"
                  ? t("consultSending")
                  : t("consultSend")}
              </GriefButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
