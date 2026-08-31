"use client";

/**
 * Checkout flow state — React context over the four steps
 * (address → delivery → payment → review).
 *
 * GDPR data minimization: the sessionStorage recovery snapshot holds ONLY
 * delivery method + country (src/lib/checkout.ts CHECKOUT_RECOVERY_KEY).
 * Names, addresses and phones live in memory for the duration of the flow
 * and are never written to any client storage.
 *
 * SAQ-A: this module handles the backend-issued client secret only; card
 * data stays inside Stripe's Payment Element iframe.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, apiClient } from "@/lib/api-client";
import {
  addressSchema,
  clearRecovery,
  readRecovery,
  writeRecovery,
  type AddressData,
  type CheckoutCountry,
  type DeliveryMethod,
  type DeliveryMethodId,
  type ParcelLocker,
} from "@/lib/checkout";

/* -------------------------------------------------------------------------- */
/* API — registered gaps until backend ships them                              */
/* -------------------------------------------------------------------------- */

/** POST /api/v1/orders/shipping-options/ (GAP-H02). */
export async function fetchShippingOptions(
  country: CheckoutCountry,
): Promise<DeliveryMethod[]> {
  const res = await apiClient.POST(
    "/api/v1/orders/shipping-options/" as never,
    { body: { country } } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(record.options) ? record.options : [];
  return raw
    .map((entry): DeliveryMethod | null => {
      const r = entry as Record<string, unknown>;
      const id = r.id as DeliveryMethodId;
      if (!["courier", "dpd_locker", "omniva_locker"].includes(id)) {
        return null;
      }
      return {
        id,
        labelKey:
          id === "courier"
            ? "courier"
            : id === "dpd_locker"
              ? "dpdLocker"
              : "omnivaLocker",
        price: typeof r.price === "string" ? r.price : "0",
        currency: typeof r.currency === "string" ? r.currency : "EUR",
        etaDays: typeof r.eta_days === "string" ? r.eta_days : undefined,
      };
    })
    .filter((option): option is DeliveryMethod => option !== null);
}

/** GET /api/v1/shipping/lockers/?country=…&carrier=… (GAP-H01). */
export async function fetchLockers(
  carrier: "dpd" | "omniva",
  country: CheckoutCountry,
): Promise<ParcelLocker[]> {
  const res = await apiClient.GET(
    "/api/v1/shipping/lockers/" as never,
    {
      params: { query: { country, carrier } },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(record.lockers) ? record.lockers : [];
  return raw
    .map((entry): ParcelLocker | null => {
      const r = entry as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.name !== "string") return null;
      return {
        id: r.id,
        name: r.name,
        address: typeof r.address === "string" ? r.address : "",
        city: typeof r.city === "string" ? r.city : undefined,
      };
    })
    .filter((locker): locker is ParcelLocker => locker !== null);
}

/** POST /api/v1/tax/vat-id/validate/ (GAP-T01) — VIES check server-side. */
export async function validateVatId(vatId: string): Promise<boolean> {
  const res = await apiClient.POST(
    "/api/v1/tax/vat-id/validate/" as never,
    { body: { vat_id: vatId } } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  return record.valid === true;
}

export interface CreatedOrder {
  orderId: string;
  clientSecret: string;
}

/** POST /api/v1/orders/ (GAP-O08, closed) — creates the order and returns
 * the embedded PaymentIntent client secret (never a redirect session).
 * The Idempotency-Key makes retry-after-timeout safe on the money path;
 * cart_id (when present) lets the server price from its own cart instead
 * of the submitted lines. */
export async function createOrder(payload: {
  items: Array<{ productId: string; quantity: number }>;
  shipping: {
    method: DeliveryMethodId;
    lockerId?: string;
    address: Omit<AddressData, "saveToAddressBook">;
  };
  vatId?: string;
  cartId?: string;
  idempotencyKey: string;
}): Promise<CreatedOrder> {
  const res = await apiClient.POST(
    "/api/v1/orders/" as never,
    {
      headers: { "Idempotency-Key": payload.idempotencyKey },
      body: {
        cart_id: payload.cartId,
        items: payload.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
        shipping: {
          method: payload.shipping.method,
          locker_id: payload.shipping.lockerId,
          address: {
            full_name: payload.shipping.address.fullName,
            street: payload.shipping.address.street,
            city: payload.shipping.address.city,
            postal_code: payload.shipping.address.postalCode,
            country: payload.shipping.address.country,
            phone: payload.shipping.address.phone,
          },
        },
        vat_id: payload.vatId || undefined,
      },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  const orderId = record.order_id ?? record.id;
  const clientSecret = record.client_secret;
  if (typeof orderId !== "string" || typeof clientSecret !== "string") {
    throw new ApiError(
      500,
      "order_contract_mismatch",
      "Unexpected order payload",
    );
  }
  return { orderId, clientSecret };
}

export interface OrderDetail {
  orderId: string;
  orderNumber: string;
  status: string;
  totalGross: string;
  currency: string;
  etaDays?: string;
}

/** GET /api/v1/orders/{id}/ (GAP-O04, closed) — confirmation details. */
export async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  const res = await apiClient.GET(
    "/api/v1/orders/{order_id}/" as never,
    { params: { path: { order_id: orderId } } } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  return {
    orderId: typeof r.order_id === "string" ? r.order_id : orderId,
    orderNumber: typeof r.order_number === "string" ? r.order_number : "",
    status: typeof r.status === "string" ? r.status : "",
    totalGross: typeof r.total_gross === "string" ? r.total_gross : "0",
    currency: typeof r.currency === "string" ? r.currency : "EUR",
    etaDays: typeof r.eta_days === "string" ? r.eta_days : undefined,
  };
}

export interface OrderHistoryEntry {
  orderId: string;
  orderNumber: string;
  status: string;
  totalGross: string;
  currency: string;
  createdAt: string;
}

/** GET /api/v1/orders/ (GAP-O03, closed) — the buyer's order history. */
export async function fetchOrderHistory(): Promise<OrderHistoryEntry[]> {
  const res = await apiClient.GET("/api/v1/orders/" as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(record.results) ? record.results : [];
  return raw
    .map((entry): OrderHistoryEntry | null => {
      const r = entry as Record<string, unknown>;
      if (typeof r.order_id !== "string") return null;
      return {
        orderId: r.order_id,
        orderNumber: typeof r.order_number === "string" ? r.order_number : "",
        status: typeof r.status === "string" ? r.status : "",
        totalGross: typeof r.total_gross === "string" ? r.total_gross : "0",
        currency: typeof r.currency === "string" ? r.currency : "EUR",
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
      };
    })
    .filter((row): row is OrderHistoryEntry => row !== null);
}

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

export const CHECKOUT_STEPS = [
  "address",
  "delivery",
  "payment",
  "review",
] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];
export type VatStatus = "idle" | "checking" | "valid" | "invalid";

interface CheckoutContextValue {
  step: CheckoutStep;
  goToStep: (step: CheckoutStep) => void;

  address: AddressData | null;
  setAddress: (address: AddressData) => void;

  deliveryMethod: DeliveryMethodId | null;
  setDeliveryMethod: (method: DeliveryMethodId | null) => void;
  locker: ParcelLocker | null;
  setLocker: (locker: ParcelLocker | null) => void;
  shippingOptions: DeliveryMethod[];
  setShippingOptions: (options: DeliveryMethod[]) => void;
  /** Selected option's price, if the options list carries it. */
  shippingPrice: DeliveryMethod | null;

  vatId: string;
  setVatId: (vatId: string) => void;
  vatStatus: VatStatus;
  setVatStatus: (status: VatStatus) => void;

  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;

  order: CreatedOrder | null;
  setOrder: (order: CreatedOrder | null) => void;

  /** Stable per-attempt token for the money path (Idempotency-Key). One
   * key per order attempt: retries replay it, a NEW attempt mints a new
   * one — never reuse a key across different carts. */
  idempotencyKey: string;
}

function mintIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `jol-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<CheckoutStep>("address");
  const [address, setAddressState] = useState<AddressData | null>(null);
  const [deliveryMethod, setDeliveryMethodState] =
    useState<DeliveryMethodId | null>(null);
  const [locker, setLocker] = useState<ParcelLocker | null>(null);
  const [shippingOptions, setShippingOptions] = useState<DeliveryMethod[]>([]);
  const [vatId, setVatId] = useState("");
  const [vatStatus, setVatStatus] = useState<VatStatus>("idle");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [idempotencyKey] = useState(mintIdempotencyKey);

  // Recovery: restore ONLY non-PII choices (delivery method + country).
  useEffect(() => {
    const recovery = readRecovery();
    if (!recovery) return;
    setDeliveryMethodState(recovery.deliveryMethod);
    setAddressState(
      (current) =>
        current ?? {
          fullName: "",
          street: "",
          city: "",
          postalCode: "",
          country: recovery.country,
          phone: "",
          saveToAddressBook: false,
        },
    );
  }, []);

  const setAddress = useCallback((next: AddressData) => {
    setAddressState(next);
  }, []);

  const setDeliveryMethod = useCallback((method: DeliveryMethodId | null) => {
    setDeliveryMethodState(method);
    setLocker(null);
  }, []);

  // Recovery snapshot — NON-PII only, written whenever either value changes.
  useEffect(() => {
    if (deliveryMethod && address) {
      writeRecovery({ deliveryMethod, country: address.country });
    }
  }, [deliveryMethod, address]);

  const goToStep = useCallback((next: CheckoutStep) => {
    setStep(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0 });
    }
  }, []);

  const shippingPrice = useMemo(
    () =>
      shippingOptions.find((option) => option.id === deliveryMethod) ?? null,
    [shippingOptions, deliveryMethod],
  );

  const value: CheckoutContextValue = {
    step,
    goToStep,
    address,
    setAddress,
    deliveryMethod,
    setDeliveryMethod,
    locker,
    setLocker,
    shippingOptions,
    setShippingOptions,
    shippingPrice,
    vatId,
    setVatId,
    vatStatus,
    setVatStatus,
    termsAccepted,
    setTermsAccepted,
    order,
    setOrder,
    idempotencyKey,
  };

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout(): CheckoutContextValue {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error("useCheckout must be used inside <CheckoutProvider>");
  }
  return context;
}

/** Validates + stores the address; returns per-field errors or null. */
export function commitAddress(
  input: AddressData,
  setAddress: (address: AddressData) => void,
): AddressData {
  const parsed = addressSchema.parse(input);
  setAddress(parsed);
  return parsed;
}

export function resetCheckoutRecovery(): void {
  clearRecovery();
}
