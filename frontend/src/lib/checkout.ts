/**
 * Checkout domain logic — pure, typed, unit-tested. No React, no network.
 *
 * Compliance notes:
 *  - Card data NEVER touches this app: the Payment Element renders inside
 *    Stripe's iframe; only the backend-created client secret is handled here
 *    (PCI DSS SAQ-A preserved).
 *  - VAT is computed by the backend (Stripe Tax) at order creation; the
 *    client shows estimates only (included-in-gross, labeled as estimates).
 *  - The address itself is never persisted client-side (see
 *    checkout-provider.tsx — sessionStorage holds delivery method/country
 *    only, never names/addresses/phones).
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Countries + postal codes                                                    */
/* -------------------------------------------------------------------------- */

export const CHECKOUT_COUNTRIES = ["LT", "LV", "EE"] as const;
export type CheckoutCountry = (typeof CHECKOUT_COUNTRIES)[number];

/** National postal formats (validated client-side; backend re-validates). */
export const POSTAL_PATTERNS: Record<CheckoutCountry, RegExp> = {
  LT: /^LT-\d{5}$/,
  LV: /^LV-\d{4}$/,
  EE: /^\d{5}$/,
};

export const POSTAL_PLACEHOLDERS: Record<CheckoutCountry, string> = {
  LT: "LT-01100",
  LV: "LV-1050",
  EE: "10111",
};

/** E.164-ish international number; the carrier validates delivery-day. */
export const PHONE_PATTERN = /^\+?[0-9 ()-]{7,17}$/;

/* -------------------------------------------------------------------------- */
/* Address schema                                                              */
/* -------------------------------------------------------------------------- */

export const addressSchema = z.object({
  fullName: z.string().trim().min(2),
  street: z.string().trim().min(3),
  city: z.string().trim().min(2),
  postalCode: z.string().trim(),
  country: z.enum(CHECKOUT_COUNTRIES),
  phone: z.string().trim().regex(PHONE_PATTERN),
  saveToAddressBook: z.boolean(),
});
export type AddressData = z.infer<typeof addressSchema>;

export type AddressFieldErrors = Partial<
  Record<keyof AddressData, "required" | "invalid">
>;

/** Translate a zod failure into per-field i18n error keys. */
export function addressFieldErrors(error: z.ZodError): AddressFieldErrors {
  const out: AddressFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof AddressData | undefined;
    if (!field || out[field]) continue;
    out[field] = issue.code === "too_small" ? "required" : "invalid";
  }
  return out;
}

/** Postal validation is country-specific — reported as its own field error. */
export function postalCodeValid(
  country: CheckoutCountry,
  postalCode: string,
): boolean {
  return POSTAL_PATTERNS[country].test(postalCode.trim().toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* VAT ID (B2B) — client-side format check; VIES check is backend GAP-T01      */
/* -------------------------------------------------------------------------- */

export const VAT_ID_PATTERNS: Record<CheckoutCountry, RegExp> = {
  LT: /^LT(\d{9}|\d{12})$/,
  LV: /^LV\d{11}$/,
  EE: /^EE\d{9}$/,
};

/** Normalizes then format-checks a VAT ID against the address country. */
export function vatIdFormatValid(
  country: CheckoutCountry,
  vatId: string,
): boolean {
  const normalized = vatId.replace(/[\s.-]/g, "").toUpperCase();
  return VAT_ID_PATTERNS[country].test(normalized);
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

export type DeliveryMethodId = "courier" | "dpd_locker" | "omniva_locker";

export interface DeliveryMethod {
  id: DeliveryMethodId;
  /** Localized label resolved by the UI; API labels are fallbacks only. */
  labelKey: "courier" | "dpdLocker" | "omnivaLocker";
  price: string;
  currency: string;
  /** Estimated working days, e.g. "1-3". */
  etaDays?: string;
}

export interface ParcelLocker {
  id: string;
  name: string;
  address: string;
  city?: string;
}

/* -------------------------------------------------------------------------- */
/* Payment errors — Stripe codes → non-technical i18n keys                     */
/* -------------------------------------------------------------------------- */

/** Machine code → i18n key in the `checkout` namespace. */
export const PAYMENT_ERROR_KEYS: Record<string, string> = {
  card_declined: "errorCardDeclined",
  incorrect_cvc: "errorCardDetails",
  invalid_cvc: "errorCardDetails",
  invalid_number: "errorCardDetails",
  incomplete_number: "errorCardDetails",
  expired_card: "errorCardExpired",
  insufficient_funds: "errorInsufficientFunds",
  processing_error: "errorProcessing",
  sepa_debit_failed: "errorSepaFailed",
  requires_action: "errorRequiresAction",
};

/** Resolves a StripeError-like object to a stable i18n key. */
export function paymentErrorKey(error: {
  code?: string;
  type?: string;
}): string {
  const mapped = error.code ? PAYMENT_ERROR_KEYS[error.code] : undefined;
  if (mapped) return mapped;
  if (error.type === "validation_error") return "errorCardDetails";
  return "errorPaymentGeneric";
}

/* -------------------------------------------------------------------------- */
/* Session-storage recovery — NON-PII ONLY                                     */
/* -------------------------------------------------------------------------- */

export const CHECKOUT_RECOVERY_KEY = "jol_checkout_recovery";

/** The ONLY fields allowed in sessionStorage. Names, addresses and phones
 * must never be added here (GDPR data minimization). */
export interface CheckoutRecovery {
  deliveryMethod: DeliveryMethodId;
  country: CheckoutCountry;
}

export function readRecovery(): CheckoutRecovery | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutRecovery>;
    const methodOk = ["courier", "dpd_locker", "omniva_locker"].includes(
      parsed.deliveryMethod ?? "",
    );
    const countryOk = (CHECKOUT_COUNTRIES as readonly string[]).includes(
      parsed.country ?? "",
    );
    if (!methodOk || !countryOk) return null;
    return {
      deliveryMethod: parsed.deliveryMethod as DeliveryMethodId,
      country: parsed.country as CheckoutCountry,
    };
  } catch {
    return null;
  }
}

export function writeRecovery(recovery: CheckoutRecovery): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      CHECKOUT_RECOVERY_KEY,
      JSON.stringify(recovery),
    );
  } catch {
    // Storage unavailable (private mode) — checkout still works in-memory.
  }
}

export function clearRecovery(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}
