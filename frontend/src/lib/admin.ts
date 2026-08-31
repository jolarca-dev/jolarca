/**
 * Admin moderation API layer — every queue/decision against the registered
 * gaps GAP-M01…M10. Compliance posture:
 *  - EVERY mutation also emits an audit event (GAP-M09) carrying the
 *    acting admin identity; backend mutations emit their own server-side
 *    events too (defense in depth — the client event never replaces it);
 *  - audit emission is fire-and-forget: a failed audit POST must never
 *    block the moderation action itself, but it IS surfaced in the logger;
 *  - destructive actions (reject, erasure confirmation) always require a
 *    reason/confirmation collected by the UI before these functions run.
 */
import { ApiError, apiClient } from "@/lib/api-client";
import { logger } from "@/lib/logger";

async function unwrapOk(res: {
  response: Response;
  error?: unknown;
}): Promise<void> {
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/* -------------------------------------------------------------------------- */
/* Audit trail                                                                 */
/* -------------------------------------------------------------------------- */

export interface AdminAuditEvent {
  action: string;
  targetType: "seller" | "listing" | "compliance_request" | "admin";
  targetId: string;
  detail?: string;
}

/** POST /api/v1/admin/audit/ (GAP-M09) — fire-and-forget by contract. */
export async function logAdminAction(event: AdminAuditEvent): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/admin/audit/" as never,
    {
      body: {
        action: event.action,
        target_type: event.targetType,
        target_id: event.targetId,
        detail: event.detail,
        occurred_at: new Date().toISOString(),
      },
    } as never,
  );
  if (!res.response.ok) {
    // Never throw into the moderation flow — log loudly instead.
    logger.warn(
      `audit emission failed for ${event.action} on ${event.targetId}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Dashboard stats                                                             */
/* -------------------------------------------------------------------------- */

export interface AdminStats {
  pendingVerifications: number;
  activeSellers: number;
  flaggedListings: number;
  openComplianceRequests: number;
}

/** GET /api/v1/admin/stats/ (GAP-M03). */
export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await apiClient.GET("/api/v1/admin/stats/" as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const num = (value: unknown): number =>
    typeof value === "number" ? value : 0;
  return {
    pendingVerifications: num(r.pending_verifications),
    activeSellers: num(r.active_sellers),
    flaggedListings: num(r.flagged_listings),
    openComplianceRequests: num(r.open_compliance_requests),
  };
}

/* -------------------------------------------------------------------------- */
/* Seller verification                                                         */
/* -------------------------------------------------------------------------- */

export const SELLER_QUEUE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_review",
] as const;
export type SellerQueueStatus = (typeof SELLER_QUEUE_STATUSES)[number];

export interface SellerQueueRow {
  id: string;
  businessName: string;
  businessType: string;
  registeredAt: string;
  documentsStatus: string;
  connectStatus: string;
  verificationStatus: SellerQueueStatus;
}

/** GET /api/v1/admin/sellers/?status=… (GAP-M04). */
export async function fetchSellerQueue(
  status: SellerQueueStatus | "all",
): Promise<SellerQueueRow[]> {
  const res = await apiClient.GET(
    "/api/v1/admin/sellers/" as never,
    {
      query: status === "all" ? {} : { status },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  return raw
    .map((entry): SellerQueueRow | null => {
      const s = entry as Record<string, unknown>;
      if (typeof s.id !== "string") return null;
      const status = s.verification_status;
      return {
        id: s.id,
        businessName:
          typeof s.business_name === "string" ? s.business_name : "—",
        businessType:
          typeof s.business_type === "string" ? s.business_type : "unknown",
        registeredAt:
          typeof s.registered_at === "string" ? s.registered_at : "",
        documentsStatus:
          typeof s.documents_status === "string" ? s.documents_status : "none",
        connectStatus:
          typeof s.connect_status === "string" ? s.connect_status : "none",
        verificationStatus: SELLER_QUEUE_STATUSES.some((v) => v === status)
          ? (status as SellerQueueStatus)
          : "pending",
      };
    })
    .filter((row): row is SellerQueueRow => row !== null);
}

export interface SellerDocumentInfo {
  kind: string;
  fileName: string;
  url: string;
  mimeType: string;
}

export interface SellerVerificationEvent {
  at: string;
  admin: string;
  action: string;
  note: string;
}

export interface SellerDetail {
  id: string;
  businessName: string;
  businessType: string;
  registrationNumber: string;
  vatId: string;
  country: string;
  address: string;
  contactEmail: string;
  phone: string;
  verificationStatus: SellerQueueStatus;
  connectStatus: string;
  documents: SellerDocumentInfo[];
  history: SellerVerificationEvent[];
}

/** GET /api/v1/admin/sellers/{id}/ (GAP-M05). */
export async function fetchSellerDetail(
  sellerId: string,
): Promise<SellerDetail> {
  const res = await apiClient.GET(
    "/api/v1/admin/sellers/{id}/" as never,
    {
      params: { path: { id: sellerId } },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string =>
    typeof value === "string" ? value : "";
  const docs = Array.isArray(r.documents) ? r.documents : [];
  const history = Array.isArray(r.history) ? r.history : [];
  const status = r.verification_status;
  return {
    id: str(r.id) || sellerId,
    businessName: str(r.business_name) || "—",
    businessType: str(r.business_type) || "unknown",
    registrationNumber: str(r.registration_number),
    vatId: str(r.vat_id),
    country: str(r.country),
    address: str(r.address),
    contactEmail: str(r.contact_email),
    phone: str(r.phone),
    verificationStatus: SELLER_QUEUE_STATUSES.some((v) => v === status)
      ? (status as SellerQueueStatus)
      : "pending",
    connectStatus: str(r.connect_status) || "none",
    documents: docs
      .map((entry): SellerDocumentInfo | null => {
        const d = entry as Record<string, unknown>;
        if (typeof d.url !== "string") return null;
        return {
          kind: typeof d.kind === "string" ? d.kind : "document",
          fileName: typeof d.file_name === "string" ? d.file_name : "file",
          url: d.url,
          mimeType:
            typeof d.mime_type === "string" ? d.mime_type : "image/jpeg",
        };
      })
      .filter((d): d is SellerDocumentInfo => d !== null),
    history: history
      .map((entry): SellerVerificationEvent | null => {
        const h = entry as Record<string, unknown>;
        if (typeof h.at !== "string") return null;
        return {
          at: h.at,
          admin: typeof h.admin === "string" ? h.admin : "system",
          action: typeof h.action === "string" ? h.action : "note",
          note: typeof h.note === "string" ? h.note : "",
        };
      })
      .filter((h): h is SellerVerificationEvent => h !== null),
  };
}

export const SELLER_DECISIONS = [
  "approve",
  "reject",
  "hold",
  "more_info",
] as const;
export type SellerDecision = (typeof SELLER_DECISIONS)[number];

/** POST /api/v1/admin/sellers/{id}/decision/ (GAP-M06) + audit event. */
export async function decideSeller(
  sellerId: string,
  decision: SellerDecision,
  reason: string,
  adminEmail: string,
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/admin/sellers/{id}/decision/" as never,
    {
      params: { path: { id: sellerId } },
      body: { decision, reason: reason || undefined },
    } as never,
  );
  await unwrapOk(res);
  await logAdminAction({
    action: `seller.${decision}`,
    targetType: "seller",
    targetId: sellerId,
    detail: `by ${adminEmail}${reason ? ` — ${reason}` : ""}`,
  });
}

/* -------------------------------------------------------------------------- */
/* Listings moderation                                                         */
/* -------------------------------------------------------------------------- */

export const FLAG_REASONS = [
  "inappropriate_content",
  "wrong_category",
  "pricing_issue",
  "ip_violation",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export interface ListingQueueRow {
  id: string;
  title: string;
  sellerName: string;
  category: string;
  flagReason: string;
  flagSource: "auto" | "manual";
  status: string;
  /** Preview payload — present when the queue endpoint embeds it. */
  price: string;
  descriptionHtml: string;
  imageUrls: string[];
}

/** GET /api/v1/admin/moderation/queue/ (GAP-M01). */
export async function fetchListingQueue(): Promise<ListingQueueRow[]> {
  const res = await apiClient.GET("/api/v1/admin/moderation/queue/" as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  return raw
    .map((entry): ListingQueueRow | null => {
      const l = entry as Record<string, unknown>;
      if (typeof l.id !== "string") return null;
      return {
        id: l.id,
        title: typeof l.title === "string" ? l.title : "—",
        sellerName: typeof l.seller_name === "string" ? l.seller_name : "—",
        category: typeof l.category === "string" ? l.category : "—",
        flagReason: typeof l.flag_reason === "string" ? l.flag_reason : "",
        flagSource: l.flag_source === "auto" ? "auto" : "manual",
        status: typeof l.status === "string" ? l.status : "flagged",
        price: typeof l.price === "string" ? l.price : "",
        descriptionHtml:
          typeof l.description_html === "string" ? l.description_html : "",
        imageUrls: Array.isArray(l.image_urls)
          ? l.image_urls.filter((u): u is string => typeof u === "string")
          : [],
      };
    })
    .filter((row): row is ListingQueueRow => row !== null);
}

export const LISTING_DECISIONS = ["approve", "reject", "escalate"] as const;
export type ListingDecision = (typeof LISTING_DECISIONS)[number];

/** POST /api/v1/admin/moderation/{id}/decision/ (GAP-M02) + audit event. */
export async function decideListing(
  listingId: string,
  decision: ListingDecision,
  reason: string,
  adminEmail: string,
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/admin/moderation/{id}/decision/" as never,
    {
      params: { path: { id: listingId } },
      body: { decision, reason: reason || undefined },
    } as never,
  );
  await unwrapOk(res);
  await logAdminAction({
    action: `listing.${decision}`,
    targetType: "listing",
    targetId: listingId,
    detail: `by ${adminEmail}${reason ? ` — ${reason}` : ""}`,
  });
}

/** PATCH /api/v1/admin/moderation/{id}/corrections/ (GAP-M10). */
export async function correctListing(
  listingId: string,
  corrections: { title?: string; category?: string; price?: string },
  adminEmail: string,
): Promise<void> {
  const res = await apiClient.PATCH(
    "/api/v1/admin/moderation/{id}/corrections/" as never,
    {
      params: { path: { id: listingId } },
      body: corrections,
    } as never,
  );
  await unwrapOk(res);
  await logAdminAction({
    action: "listing.corrected",
    targetType: "listing",
    targetId: listingId,
    detail: `by ${adminEmail}`,
  });
}

/* -------------------------------------------------------------------------- */
/* GDPR compliance requests                                                    */
/* -------------------------------------------------------------------------- */

export const COMPLIANCE_REQUEST_TYPES = [
  "access",
  "erasure",
  "export",
] as const;
export type ComplianceRequestType = (typeof COMPLIANCE_REQUEST_TYPES)[number];

export interface ComplianceRequestRow {
  id: string;
  type: ComplianceRequestType;
  userEmail: string;
  requestedAt: string;
  status: "open" | "in_progress" | "fulfilled";
  assignedAdmin: string;
  downloadUrl: string | null;
}

/** GET /api/v1/admin/compliance/requests/ (GAP-M07). */
export async function fetchComplianceRequests(): Promise<
  ComplianceRequestRow[]
> {
  const res = await apiClient.GET(
    "/api/v1/admin/compliance/requests/" as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  return raw
    .map((entry): ComplianceRequestRow | null => {
      const q = entry as Record<string, unknown>;
      if (typeof q.id !== "string") return null;
      const type = q.type;
      const status = q.status;
      return {
        id: q.id,
        type: COMPLIANCE_REQUEST_TYPES.some((v) => v === type)
          ? (type as ComplianceRequestType)
          : "access",
        userEmail: typeof q.user_email === "string" ? q.user_email : "—",
        requestedAt: typeof q.requested_at === "string" ? q.requested_at : "",
        status:
          status === "in_progress" || status === "fulfilled" ? status : "open",
        assignedAdmin:
          typeof q.assigned_admin === "string" ? q.assigned_admin : "",
        downloadUrl: typeof q.download_url === "string" ? q.download_url : null,
      };
    })
    .filter((row): row is ComplianceRequestRow => row !== null);
}

/** POST /api/v1/admin/compliance/requests/{id}/fulfill/ (GAP-M08). */
export async function fulfillComplianceRequest(
  requestId: string,
  note: string,
  adminEmail: string,
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/admin/compliance/requests/{id}/fulfill/" as never,
    {
      params: { path: { id: requestId } },
      body: { note: note || undefined },
    } as never,
  );
  await unwrapOk(res);
  await logAdminAction({
    action: "compliance.fulfilled",
    targetType: "compliance_request",
    targetId: requestId,
    detail: `by ${adminEmail}${note ? ` — ${note}` : ""}`,
  });
}
