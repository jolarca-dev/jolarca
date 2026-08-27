"use client";

/**
 * Step 1 — Business info. Zod validation with country-specific registration
 * formats, optional VAT ID (format-checked against the address country),
 * and a logo upload converted to WebP client-side (non-sensitive asset;
 * ≤2MB). Submission to the backend happens once, on the review step.
 */
import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { vatIdFormatValid } from "@/lib/checkout";
import {
  blobToDataUrl,
  convertToWebp,
  isImageFile,
  isWithinSizeLimit,
} from "@/lib/image";
import {
  BUSINESS_TYPES,
  businessFieldErrors,
  businessInfoSchema,
  registrationNumberValid,
  SELLER_COUNTRIES,
  type BusinessFieldErrors,
  type SellerCountry,
} from "@/lib/seller";
import { useOnboarding } from "./onboarding-provider";

const REG_PLACEHOLDERS: Record<SellerCountry, string> = {
  LT: "301234567",
  LV: "40103040506",
  EE: "10123456",
};

type FieldName = keyof BusinessFieldErrors;

export function BusinessInfoForm() {
  const t = useTranslations("seller");
  const {
    businessInfo,
    setBusinessInfo,
    logoDataUrl,
    setLogoDataUrl,
    goToStep,
  } = useOnboarding();

  const [form, setForm] = useState({
    businessName: businessInfo?.businessName ?? "",
    registrationNumber: businessInfo?.registrationNumber ?? "",
    vatId: businessInfo?.vatId ?? "",
    businessType: businessInfo?.businessType ?? "company",
    country: businessInfo?.country ?? ("LT" as SellerCountry),
    street: businessInfo?.street ?? "",
    city: businessInfo?.city ?? "",
    postalCode: businessInfo?.postalCode ?? "",
    contactEmail: businessInfo?.contactEmail ?? "",
    phone: businessInfo?.phone ?? "",
  });
  const [errors, setErrors] = useState<BusinessFieldErrors>({});
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function field(name: FieldName, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleLogo(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (!isImageFile(file)) {
      setLogoError(t("logoNotImage"));
      return;
    }
    if (!isWithinSizeLimit(file)) {
      setLogoError(t("logoTooLarge"));
      return;
    }
    setLogoBusy(true);
    try {
      const webp = await convertToWebp(file);
      const dataUrl = await blobToDataUrl(webp);
      setLogoDataUrl(dataUrl);
    } catch {
      setLogoError(t("logoFailed"));
    } finally {
      setLogoBusy(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = businessInfoSchema.safeParse(form);
    if (!result.success) {
      setErrors(businessFieldErrors(result.error));
      return;
    }
    const nextErrors: BusinessFieldErrors = {};
    if (!registrationNumberValid(form.country, form.registrationNumber)) {
      nextErrors.registrationNumber = "invalid";
    }
    if (form.vatId && !vatIdFormatValid(form.country, form.vatId)) {
      nextErrors.vatId = "invalid";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setBusinessInfo(result.data);
    goToStep("identity");
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40";
  const labelClass = "mb-1 block text-sm font-medium text-ink";
  const errorClass = "mt-1 text-sm text-danger";

  function errorText(field: FieldName): string | undefined {
    const kind = errors[field];
    if (!kind) return undefined;
    return kind === "required" ? t("fieldRequired") : t("fieldInvalid");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepBusiness")}
      </h2>
      <div aria-live="polite" className="sr-only">
        {Object.keys(errors).length > 0 ? t("formHasErrors") : ""}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sb-name" className={labelClass}>
            {t("businessName")}
          </label>
          <input
            id="sb-name"
            autoComplete="organization"
            value={form.businessName}
            onChange={(e) => field("businessName", e.target.value)}
            aria-invalid={!!errors.businessName}
            aria-describedby={errors.businessName ? "sb-name-err" : undefined}
            className={inputClass}
          />
          {errorText("businessName") && (
            <p id="sb-name-err" className={errorClass}>
              {errorText("businessName")}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="sb-type" className={labelClass}>
            {t("businessType")}
          </label>
          <select
            id="sb-type"
            value={form.businessType}
            onChange={(e) => field("businessType", e.target.value)}
            className={inputClass}
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sb-reg" className={labelClass}>
            {t("registrationNumber")}
          </label>
          <input
            id="sb-reg"
            placeholder={REG_PLACEHOLDERS[form.country]}
            value={form.registrationNumber}
            onChange={(e) => field("registrationNumber", e.target.value)}
            aria-invalid={!!errors.registrationNumber}
            aria-describedby={
              errors.registrationNumber ? "sb-reg-err" : undefined
            }
            className={inputClass}
          />
          {errors.registrationNumber && (
            <p id="sb-reg-err" className={errorClass}>
              {errors.registrationNumber === "required"
                ? t("fieldRequired")
                : t("regInvalid", { example: REG_PLACEHOLDERS[form.country] })}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="sb-vat" className={labelClass}>
            {t("vatIdOptional")}
          </label>
          <input
            id="sb-vat"
            placeholder="LT123456789"
            value={form.vatId}
            onChange={(e) => field("vatId", e.target.value)}
            aria-invalid={!!errors.vatId}
            aria-describedby={errors.vatId ? "sb-vat-err" : undefined}
            className={inputClass}
          />
          {errors.vatId && (
            <p id="sb-vat-err" className={errorClass}>
              {t("vatInvalid")}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="sb-country" className={labelClass}>
            {t("country")}
          </label>
          <select
            id="sb-country"
            autoComplete="country"
            value={form.country}
            onChange={(e) => field("country", e.target.value)}
            className={inputClass}
          >
            {SELLER_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {t(`country_${code}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sb-city" className={labelClass}>
            {t("city")}
          </label>
          <input
            id="sb-city"
            autoComplete="address-level2"
            value={form.city}
            onChange={(e) => field("city", e.target.value)}
            aria-invalid={!!errors.city}
            className={inputClass}
          />
          {errorText("city") && (
            <p className={errorClass}>{errorText("city")}</p>
          )}
        </div>
        <div>
          <label htmlFor="sb-postal" className={labelClass}>
            {t("postalCode")}
          </label>
          <input
            id="sb-postal"
            autoComplete="postal-code"
            value={form.postalCode}
            onChange={(e) => field("postalCode", e.target.value)}
            aria-invalid={!!errors.postalCode}
            className={inputClass}
          />
          {errorText("postalCode") && (
            <p className={errorClass}>{errorText("postalCode")}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="sb-street" className={labelClass}>
          {t("street")}
        </label>
        <input
          id="sb-street"
          autoComplete="street-address"
          value={form.street}
          onChange={(e) => field("street", e.target.value)}
          aria-invalid={!!errors.street}
          className={inputClass}
        />
        {errorText("street") && (
          <p className={errorClass}>{errorText("street")}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sb-email" className={labelClass}>
            {t("contactEmail")}
          </label>
          <input
            id="sb-email"
            type="email"
            autoComplete="email"
            value={form.contactEmail}
            onChange={(e) => field("contactEmail", e.target.value)}
            aria-invalid={!!errors.contactEmail}
            className={inputClass}
          />
          {errorText("contactEmail") && (
            <p className={errorClass}>{errorText("contactEmail")}</p>
          )}
        </div>
        <div>
          <label htmlFor="sb-phone" className={labelClass}>
            {t("phone")}
          </label>
          <input
            id="sb-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+370 600 00000"
            value={form.phone}
            onChange={(e) => field("phone", e.target.value)}
            aria-invalid={!!errors.phone}
            className={inputClass}
          />
          {errorText("phone") && (
            <p className={errorClass}>{errorText("phone")}</p>
          )}
        </div>
      </div>

      {/* Logo — non-sensitive asset: WebP-converted client-side, ≤2MB. */}
      <div>
        <span className={labelClass}>{t("logoLabel")}</span>
        <div className="flex items-center gap-4">
          {logoDataUrl && (
            <Image
              src={logoDataUrl}
              alt={t("logoPreviewAlt")}
              width={64}
              height={64}
              className="h-16 w-16 rounded-md border border-line object-cover"
            />
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("logoLabel")}
            onChange={(e) => void handleLogo(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={logoBusy}
            className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-60"
          >
            {logoBusy ? t("logoConverting") : t("logoChoose")}
          </button>
          {logoDataUrl && (
            <button
              type="button"
              onClick={() => {
                setLogoDataUrl(null);
                if (logoInputRef.current) logoInputRef.current.value = "";
              }}
              className="text-sm text-ink-faint underline-offset-2 hover:text-danger hover:underline"
            >
              {t("logoRemove")}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-faint">{t("logoHint")}</p>
        {logoError && (
          <p role="alert" className={errorClass}>
            {logoError}
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("continue")}
        </button>
      </div>
    </form>
  );
}
