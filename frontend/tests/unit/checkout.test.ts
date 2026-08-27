import { describe, expect, it, vi } from "vitest";

import {
  addressFieldErrors,
  addressSchema,
  CHECKOUT_RECOVERY_KEY,
  clearRecovery,
  postalCodeValid,
  paymentErrorKey,
  readRecovery,
  vatIdFormatValid,
  writeRecovery,
} from "@/lib/checkout";

/* sessionStorage stub for the recovery helpers (node environment). */
const sessionStore = new Map<string, string>();
let storageThrows = false;
vi.stubGlobal("window", {
  sessionStorage: {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("storage unavailable");
      return sessionStore.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (storageThrows) throw new Error("storage unavailable");
      sessionStore.set(key, value);
    },
    removeItem: (key: string) => {
      if (storageThrows) throw new Error("storage unavailable");
      sessionStore.delete(key);
    },
  },
});

const validAddress = {
  fullName: "Jonas Jonaitis",
  street: "Gedimino pr. 1",
  city: "Vilnius",
  postalCode: "LT-01100",
  country: "LT" as const,
  phone: "+370 600 00000",
  saveToAddressBook: false,
};

describe("postal code patterns", () => {
  it("accepts national formats", () => {
    expect(postalCodeValid("LT", "LT-01100")).toBe(true);
    expect(postalCodeValid("LV", "LV-1050")).toBe(true);
    expect(postalCodeValid("EE", "10111")).toBe(true);
  });

  it("is case/space tolerant", () => {
    expect(postalCodeValid("LT", " lt-01100 ")).toBe(true);
  });

  it("rejects cross-country formats", () => {
    expect(postalCodeValid("LT", "01100")).toBe(false);
    expect(postalCodeValid("LV", "LT-01100")).toBe(false);
    expect(postalCodeValid("EE", "LV-1050")).toBe(false);
    expect(postalCodeValid("EE", "1011")).toBe(false);
  });
});

describe("address schema", () => {
  it("accepts a complete Baltic address", () => {
    expect(addressSchema.safeParse(validAddress).success).toBe(true);
  });

  it("rejects blanks and maps errors to field keys", () => {
    const result = addressSchema.safeParse({
      ...validAddress,
      fullName: "",
      phone: "abc",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = addressFieldErrors(result.error);
      expect(errors.fullName).toBe("required");
      expect(errors.phone).toBe("invalid");
    }
  });

  it("enforces the country whitelist", () => {
    const result = addressSchema.safeParse({ ...validAddress, country: "DE" });
    expect(result.success).toBe(false);
  });
});

describe("VAT ID format validation", () => {
  it("accepts valid national shapes", () => {
    expect(vatIdFormatValid("LT", "LT123456789")).toBe(true);
    expect(vatIdFormatValid("LT", "LT123456789012")).toBe(true);
    expect(vatIdFormatValid("LV", "LV12345678901")).toBe(true);
    expect(vatIdFormatValid("EE", "EE123456789")).toBe(true);
  });

  it("normalizes separators before checking", () => {
    expect(vatIdFormatValid("LT", "lt 123.456.789")).toBe(true);
  });

  it("rejects malformed or foreign ids", () => {
    expect(vatIdFormatValid("LT", "LT123")).toBe(false);
    expect(vatIdFormatValid("EE", "LT123456789")).toBe(false);
    expect(vatIdFormatValid("LV", "LV1234567890")).toBe(false);
  });
});

describe("Stripe error mapping", () => {
  it("maps known decline codes to i18n keys", () => {
    expect(paymentErrorKey({ code: "card_declined" })).toBe(
      "errorCardDeclined",
    );
    expect(paymentErrorKey({ code: "insufficient_funds" })).toBe(
      "errorInsufficientFunds",
    );
    expect(paymentErrorKey({ code: "expired_card" })).toBe("errorCardExpired");
    expect(paymentErrorKey({ code: "invalid_cvc" })).toBe("errorCardDetails");
  });

  it("falls back sensibly for unknown codes and types", () => {
    expect(paymentErrorKey({ code: "mystery" })).toBe("errorPaymentGeneric");
    expect(paymentErrorKey({ type: "validation_error" })).toBe(
      "errorCardDetails",
    );
    expect(paymentErrorKey({})).toBe("errorPaymentGeneric");
  });
});

describe("sessionStorage recovery — NON-PII guarantee", () => {
  it("round-trips only delivery method + country", () => {
    writeRecovery({ deliveryMethod: "dpd_locker", country: "LV" });
    expect(readRecovery()).toEqual({
      deliveryMethod: "dpd_locker",
      country: "LV",
    });
    const raw = sessionStore.get(CHECKOUT_RECOVERY_KEY) ?? "";
    // The schema structurally excludes identity fields; assert the wire
    // shape never grows them silently.
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "country",
      "deliveryMethod",
    ]);
  });

  it("rejects corrupted or unknown values", () => {
    sessionStore.set(CHECKOUT_RECOVERY_KEY, "{not json");
    expect(readRecovery()).toBeNull();
    sessionStore.set(
      CHECKOUT_RECOVERY_KEY,
      JSON.stringify({ deliveryMethod: "teleport", country: "XX" }),
    );
    expect(readRecovery()).toBeNull();
    sessionStore.set(CHECKOUT_RECOVERY_KEY, "{}");
    expect(readRecovery()).toBeNull();
  });

  it("clears the snapshot", () => {
    writeRecovery({ deliveryMethod: "courier", country: "EE" });
    clearRecovery();
    expect(sessionStore.has(CHECKOUT_RECOVERY_KEY)).toBe(false);
  });

  it("survives unavailable storage (private mode) without throwing", () => {
    storageThrows = true;
    try {
      expect(() =>
        writeRecovery({ deliveryMethod: "courier", country: "LT" }),
      ).not.toThrow();
      expect(readRecovery()).toBeNull();
      expect(() => clearRecovery()).not.toThrow();
    } finally {
      storageThrows = false;
    }
  });
});
