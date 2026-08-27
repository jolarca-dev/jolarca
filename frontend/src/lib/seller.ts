/**
 * Seller onboarding/dashboard domain logic — pure validation helpers plus
 * API functions against sellers_app (registered gaps GAP-V01…V12).
 *
 * Compliance boundaries:
 *  - KYC documents go to the backend as multipart and straight to S3 —
 *    NEVER processed client-side beyond preview rendering;
 *  - Stripe Connect is backend-mediated (payments_app owns Stripe); this
 *    module only POSTs for an onboarding URL and follows it;
 *  - platform commission lives in backend configuration, never client-side.
 */
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";
import { PHONE_PATTERN } from "@/lib/checkout";

/* -------------------------------------------------------------------------- */
/* Registration numbers (client-side format check; backend re-validates)       */
/* -------------------------------------------------------------------------- */

export const SELLER_COUNTRIES = ["LT", "LV", "EE"] as const;
export type SellerCountry = (typeof SELLER_COUNTRIES)[number];

/** LT JAR code: 9 digits · LV unified register: 11 digits · EE register: 8. */
export const REG_NUMBER_PATTERNS: Record<SellerCountry, RegExp> = {
  LT: /^\d{9}$/,
  LV: /^\d{11}$/,
  EE: /^\d{8}$/,
};

export function registrationNumberValid(
  country: SellerCountry,
  value: string,
): boolean {
  return REG_NUMBER_PATTERNS[country].test(value.trim());
}

/* -------------------------------------------------------------------------- */
/* Business info schema                                                        */
/* -------------------------------------------------------------------------- */

export const BUSINESS_TYPES = ["individual", "company"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const businessInfoSchema = z.object({
  businessName: z.string().trim().min(2),
  registrationNumber: z.string().trim().min(8),
  vatId: z.string().trim().optional().or(z.literal("")),
  businessType: z.enum(BUSINESS_TYPES),
  country: z.enum(SELLER_COUNTRIES),
  street: z.string().trim().min(3),
  city: z.string().trim().min(2),
  postalCode: z.string().trim().min(3),
  contactEmail: z.string().trim().min(1).email(),
  phone: z.string().trim().min(1).regex(PHONE_PATTERN),
});
export type BusinessInfo = z.infer<typeof businessInfoSchema>;

export type BusinessFieldErrors = Partial<
  Record<keyof BusinessInfo, "required" | "invalid">
>;

export function businessFieldErrors(error: z.ZodError): BusinessFieldErrors {
  const out: BusinessFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof BusinessInfo | undefined;
    if (!field || out[field]) continue;
    out[field] = issue.code === "too_small" ? "required" : "invalid";
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Listing schema                                                              */
/* -------------------------------------------------------------------------- */

export const LISTING_LOCALES = ["lt", "lv", "en"] as const;
export type ListingLocale = (typeof LISTING_LOCALES)[number];

export const listingSchema = z.object({
  /** Lithuanian title is the launch-market requirement; others optional
   * (AI translation fills gaps post-MVP via the catalog pipeline). */
  titles: z
    .object({
      lt: z.string().trim().min(3),
      lv: z.string().trim().optional().or(z.literal("")),
      en: z.string().trim().optional().or(z.literal("")),
    })
    .refine((value) => value.lt.length >= 3),
  descriptionHtml: z.string().trim().min(10),
  categoryId: z.string().min(1),
  price: z
    .string()
    .refine((value) => Number(value) > 0, { message: "price_positive" }),
  currency: z.string().length(3),
  stock: z.number().int().min(0, { message: "stock_non_negative" }),
  shippingProfileId: z.string().min(1),
});
export type ListingDraft = z.infer<typeof listingSchema>;

/* -------------------------------------------------------------------------- */
/* API — registered gaps until sellers_app ships them                          */
/* -------------------------------------------------------------------------- */

export async function unwrapOk(res: {
  response: Response;
  error?: unknown;
}): Promise<void> {
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/** POST /api/v1/sellers/onboard/ (GAP-V01). Logo travels as base64 WebP. */
export async function submitBusinessInfo(
  info: BusinessInfo,
  logoDataUrl?: string,
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/sellers/onboard/" as never,
    {
      body: {
        business_name: info.businessName,
        registration_number: info.registrationNumber,
        vat_id: info.vatId || undefined,
        business_type: info.businessType,
        country: info.country,
        street: info.street,
        city: info.city,
        postal_code: info.postalCode,
        contact_email: info.contactEmail,
        phone: info.phone,
        logo_webp_base64: logoDataUrl,
      },
    } as never,
  );
  await unwrapOk(res);
}

export type KycDocumentKind = "identity" | "proof_of_address";

/** POST /api/v1/sellers/documents/ (GAP-V07) — multipart, direct to the
 * backend (S3 storage is server-side); no third-party upload targets. */
export async function uploadKycDocument(
  kind: KycDocumentKind,
  file: File,
): Promise<void> {
  const body = new FormData();
  body.append("document_type", kind);
  body.append("file", file);
  const res = await apiClient.POST(
    "/api/v1/sellers/documents/" as never,
    {
      body,
    } as never,
  );
  await unwrapOk(res);
}

/** POST /api/v1/sellers/stripe-connect/ (GAP-V03) → onboarding URL. */
export async function createStripeConnect(returnUrl: string): Promise<string> {
  const res = await apiClient.POST(
    "/api/v1/sellers/stripe-connect/" as never,
    {
      body: { return_url: returnUrl },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  const url = record.onboarding_url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new ApiError(
      500,
      "connect_contract_mismatch",
      "Missing onboarding URL",
    );
  }
  return url;
}

export interface SellerStats {
  totalSales: number;
  currency: string;
  pendingOrders: number;
  activeListings: number;
  payoutBalance: number;
}

/** GET /api/v1/sellers/me/stats/ (GAP-V09). */
export async function fetchSellerStats(): Promise<SellerStats> {
  const res = await apiClient.GET("/api/v1/sellers/me/stats/" as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  return {
    totalSales: typeof r.total_sales === "number" ? r.total_sales : 0,
    currency: typeof r.currency === "string" ? r.currency : "EUR",
    pendingOrders: typeof r.pending_orders === "number" ? r.pending_orders : 0,
    activeListings:
      typeof r.active_listings === "number" ? r.active_listings : 0,
    payoutBalance: typeof r.payout_balance === "number" ? r.payout_balance : 0,
  };
}

export interface SellerOrderRow {
  id: string;
  placedAt: string;
  buyerName: string;
  total: string;
  status: string;
}

/** GET /api/v1/sellers/me/orders/?page=… (GAP-V11). */
export async function fetchSellerOrders(page: number): Promise<{
  page: number;
  totalPages: number;
  results: SellerOrderRow[];
}> {
  const res = await apiClient.GET(
    "/api/v1/sellers/me/orders/" as never,
    {
      query: { page },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  return {
    page: typeof r.page === "number" ? r.page : page,
    totalPages: typeof r.total_pages === "number" ? r.total_pages : 1,
    results: raw
      .map((entry): SellerOrderRow | null => {
        const o = entry as Record<string, unknown>;
        if (typeof o.id !== "string") return null;
        return {
          id: o.id,
          placedAt: typeof o.placed_at === "string" ? o.placed_at : "",
          buyerName: typeof o.buyer_name === "string" ? o.buyer_name : "—",
          total: typeof o.total === "string" ? o.total : "0",
          status: typeof o.status === "string" ? o.status : "unknown",
        };
      })
      .filter((row): row is SellerOrderRow => row !== null),
  };
}

export interface CategoryOption {
  id: string;
  name: string;
  /** URL slug — search facets and /c/{slug} links key off this. */
  slug: string;
}

/** GET /api/v1/categories/ — category picker for listings + search facet. */
export async function fetchCategories(): Promise<CategoryOption[]> {
  const res = await apiClient.GET("/api/v1/categories/" as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  return raw
    .map((entry): CategoryOption | null => {
      const c = entry as Record<string, unknown>;
      if (typeof c.id !== "string" || typeof c.name !== "string") return null;
      return {
        id: c.id,
        name: c.name,
        slug: typeof c.slug === "string" ? c.slug : c.id,
      };
    })
    .filter((row): row is CategoryOption => row !== null);
}

/** POST /api/v1/sellers/listings/ (GAP-V04). Images travel as base64 WebP
 * (≤5 files); the backend's media queue normalizes sizes/crops. */
export async function createListing(payload: {
  listing: ListingDraft;
  imagesDataUrls: string[];
}): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/sellers/listings/" as never,
    {
      body: {
        titles: payload.listing.titles,
        description_html: payload.listing.descriptionHtml,
        category_id: payload.listing.categoryId,
        price: payload.listing.price,
        currency: payload.listing.currency,
        stock: payload.listing.stock,
        shipping_profile_id: payload.listing.shippingProfileId,
        images_webp_base64: payload.imagesDataUrls,
      },
    } as never,
  );
  await unwrapOk(res);
}

/** PATCH /api/v1/sellers/listings/{id}/ (GAP-V08). */
export async function updateListing(
  listingId: string,
  payload: Partial<ListingDraft>,
): Promise<void> {
  const res = await apiClient.PATCH(
    "/api/v1/sellers/listings/{id}/" as never,
    {
      params: { path: { id: listingId } },
      body: payload,
    } as never,
  );
  await unwrapOk(res);
}

export interface PayoutInfo {
  status: "active" | "pending" | "restricted";
  availableBalance: string;
  nextPayoutDate: string;
  totalPaid: string;
  expressDashboardUrl: string | null;
}

/** GET /api/v1/sellers/me/payouts/ (GAP-V10). */
export async function fetchPayoutInfo(): Promise<PayoutInfo> {
  const res = await apiClient.GET("/api/v1/sellers/me/payouts/" as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const status = r.status;
  return {
    status: status === "active" || status === "restricted" ? status : "pending",
    availableBalance:
      typeof r.available_balance === "string" ? r.available_balance : "—",
    nextPayoutDate:
      typeof r.next_payout_date === "string" ? r.next_payout_date : "",
    totalPaid: typeof r.total_paid === "string" ? r.total_paid : "—",
    expressDashboardUrl:
      typeof r.express_dashboard_url === "string"
        ? r.express_dashboard_url
        : null,
  };
}

export interface ShippingProfileOption {
  id: string;
  name: string;
}

/** GET /api/v1/sellers/me/shipping-profiles/ (GAP-V12). */
export async function fetchShippingProfiles(): Promise<
  ShippingProfileOption[]
> {
  const res = await apiClient.GET(
    "/api/v1/sellers/me/shipping-profiles/" as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  return raw
    .map((entry): ShippingProfileOption | null => {
      const p = entry as Record<string, unknown>;
      if (typeof p.id !== "string" || typeof p.name !== "string") return null;
      return { id: p.id, name: p.name };
    })
    .filter((row): row is ShippingProfileOption => row !== null);
}
