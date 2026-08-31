"use client";

/**
 * Step 1 — Shipping address. Zod validation with per-field errors, country-
 * specific postal patterns (LT-xxxxx / LV-xxxx / EExxxxx), full browser
 * autofill via autocomplete attributes. "Save to address book" appears for
 * authenticated users only (guests have no book).
 * Accessibility: labels bound via htmlFor/id, errors wired with
 * aria-describedby + an aria-live summary.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useIsAuthenticated } from "@/hooks/use-auth";
import {
  addressFieldErrors,
  addressSchema,
  CHECKOUT_COUNTRIES,
  postalCodeValid,
  POSTAL_PLACEHOLDERS,
  type AddressFieldErrors,
} from "@/lib/checkout";
import { useCheckout } from "./checkout-provider";

type FieldName =
  "fullName" | "street" | "city" | "postalCode" | "country" | "phone";

export function AddressForm() {
  const t = useTranslations("checkout");
  const { address, setAddress, goToStep } = useCheckout();
  const isAuthenticated = useIsAuthenticated();

  const [fullName, setFullName] = useState(address?.fullName ?? "");
  const [street, setStreet] = useState(address?.street ?? "");
  const [city, setCity] = useState(address?.city ?? "");
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? "");
  const [country, setCountry] = useState(address?.country ?? "LT");
  const [phone, setPhone] = useState(address?.phone ?? "");
  const [saveToAddressBook, setSaveToAddressBook] = useState(
    address?.saveToAddressBook ?? false,
  );
  const [errors, setErrors] = useState<AddressFieldErrors>({});

  function fieldError(field: FieldName): string | undefined {
    const kind = errors[field];
    if (!kind) return undefined;
    return kind === "required" ? t("fieldRequired") : t("fieldInvalid");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const candidate = {
      fullName,
      street,
      city,
      postalCode,
      country,
      phone,
      saveToAddressBook: isAuthenticated ? saveToAddressBook : false,
    };
    const result = addressSchema.safeParse(candidate);
    if (!result.success) {
      setErrors(addressFieldErrors(result.error));
      return;
    }
    if (!postalCodeValid(country, postalCode)) {
      setErrors({ postalCode: "invalid" });
      return;
    }
    setErrors({});
    setAddress(result.data);
    goToStep("delivery");
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40";
  const labelClass = "mb-1 block text-sm font-medium text-ink";
  const errorClass = "mt-1 text-sm text-danger";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepAddress")}
      </h2>
      {/* Screen-reader announcement for validation failures */}
      <div aria-live="polite" className="sr-only">
        {Object.keys(errors).length > 0 ? t("formHasErrors") : ""}
      </div>

      <div>
        <label htmlFor="co-fullname" className={labelClass}>
          {t("fullName")}
        </label>
        <input
          id="co-fullname"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "co-fullname-err" : undefined}
          className={inputClass}
        />
        {fieldError("fullName") && (
          <p id="co-fullname-err" className={errorClass}>
            {fieldError("fullName")}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="co-street" className={labelClass}>
          {t("street")}
        </label>
        <input
          id="co-street"
          autoComplete="street-address"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          aria-invalid={!!errors.street}
          aria-describedby={errors.street ? "co-street-err" : undefined}
          className={inputClass}
        />
        {fieldError("street") && (
          <p id="co-street-err" className={errorClass}>
            {fieldError("street")}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="co-city" className={labelClass}>
            {t("city")}
          </label>
          <input
            id="co-city"
            autoComplete="address-level2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-invalid={!!errors.city}
            aria-describedby={errors.city ? "co-city-err" : undefined}
            className={inputClass}
          />
          {fieldError("city") && (
            <p id="co-city-err" className={errorClass}>
              {fieldError("city")}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="co-postal" className={labelClass}>
            {t("postalCode")}
          </label>
          <input
            id="co-postal"
            autoComplete="postal-code"
            placeholder={POSTAL_PLACEHOLDERS[country]}
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            aria-invalid={!!errors.postalCode}
            aria-describedby={errors.postalCode ? "co-postal-err" : undefined}
            className={inputClass}
          />
          {errors.postalCode && (
            <p id="co-postal-err" className={errorClass}>
              {errors.postalCode === "required"
                ? t("fieldRequired")
                : t("postalInvalid", { example: POSTAL_PLACEHOLDERS[country] })}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="co-country" className={labelClass}>
            {t("country")}
          </label>
          <select
            id="co-country"
            autoComplete="country"
            value={country}
            onChange={(e) =>
              setCountry(e.target.value as (typeof CHECKOUT_COUNTRIES)[number])
            }
            className={inputClass}
          >
            {CHECKOUT_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {t(`country_${code}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="co-phone" className={labelClass}>
            {t("phone")}
          </label>
          <input
            id="co-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+370 600 00000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "co-phone-err" : undefined}
            className={inputClass}
          />
          {fieldError("phone") && (
            <p id="co-phone-err" className={errorClass}>
              {fieldError("phone")}
            </p>
          )}
        </div>
      </div>

      {isAuthenticated && (
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={saveToAddressBook}
            onChange={(e) => setSaveToAddressBook(e.target.checked)}
            className="h-4 w-4 accent-[var(--tok-primary)]"
          />
          {t("saveAddress")}
        </label>
      )}

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
