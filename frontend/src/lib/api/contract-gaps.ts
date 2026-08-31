/**
 * CONTRACT GAPS REGISTRY — frontend requirements the backend has not yet
 * exposed (verified against docs/api/openapi.yaml, generated from
 * drf-spectacular). Per ADR-0007 nothing silently fakes data: pages render
 * sanctioned "not available yet" states until the owning app ships the
 * endpoint. Each gap is a backend contract-change request, not a mock.
 *
 * When a gap closes: remove the entry, run `make api-schema`, and replace
 * the page's unavailable state with the generated SDK call.
 */
export interface ContractGap {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  ownerApp: string;
  neededFor: string;
}

export const CONTRACT_GAPS: readonly ContractGap[] = [
  // products_app — catalog browse (MVP-P3), endpoints as specified for the
  // buyer-facing RSC catalog pages (src/server/catalog.ts). GAP-P01
  // (catalog home), GAP-P02 (category grid), GAP-P03 (product detail),
  // GAP-P04 (related rail) and GAP-P05 (categories index) closed:
  // CatalogHomeView, CategoryProductsView, ProductDetailView,
  // RelatedProductsView and CategoriesIndexView ship in products_app.

  // search_app — GAP-S01 (POST /api/v1/search/) and GAP-S02 (suggest)
  // closed: SearchView/SearchSuggestView ship in search_app. Ranking is a
  // SANCTIONED STUB (MVP-Q1 icontains+recency) and says so in the payload
  // ("ranking": "stub"); the search page degrades to catalog browsing on
  // any failure.

  // orders_app — cart closed (GAP-O01/O02/O05/O06/O07): CartView,
  // CartItemsView, CartItemDetailView, CartSyncView ship in
  // orders_app/cart_views.py; the zustand store is the consumer contract.
  // Order flow closed (GAP-O08/O03/O04): OrderCreateView returns the
  // embedded PaymentIntent client_secret (SAQ-A); OrderListView and
  // OrderDetailView serve history + confirmation.

  // payments_app — standalone payment-intent endpoint (unused while order
  // creation returns the secret inline; kept for post-order retries).
  {
    id: "GAP-Y01",
    method: "POST",
    path: "/api/v1/orders/{id}/payment-intent/",
    ownerApp: "payments_app",
    neededFor: "embedded Stripe Payment Element",
  },

  // tax_app — B2B VAT ID validation closed (GAP-T01): VatIdValidateView
  // format-checks Baltic VAT IDs; the payload says "vies_checked": false
  // until the live VIES gateway lands (MVP-T3).

  // users_app — session lifecycle closed for login/logout/session
  // (GAP-U01/U02/U03): LoginView/LogoutView/SessionView ship in
  // users_app/views.py; 2FA + password reset remain open below.
  {
    id: "GAP-U04",
    method: "POST",
    path: "/api/v1/auth/totp/enroll/",
    ownerApp: "users_app",
    neededFor: "2FA enrollment (MVP-U2)",
  },
  {
    id: "GAP-U05",
    method: "POST",
    path: "/api/v1/auth/password-reset/",
    ownerApp: "users_app",
    neededFor:
      "password reset request (constant-time response, no user enumeration)",
  },

  // sellers_app — dashboard + Stripe Connect deep-links (frontend never
  // talks to Stripe Connect directly; backend issues the links)
  {
    id: "GAP-V01",
    method: "POST",
    path: "/api/v1/sellers/onboard/",
    ownerApp: "sellers_app",
    neededFor: "seller onboarding business info (incl. base64 WebP logo, ≤2MB)",
  },
  {
    id: "GAP-V02",
    method: "GET",
    path: "/api/v1/sellers/me/",
    ownerApp: "sellers_app",
    neededFor: "dashboard: KYC-lite/VIES + Connect status",
  },
  {
    id: "GAP-V03",
    method: "POST",
    path: "/api/v1/sellers/stripe-connect/",
    ownerApp: "sellers_app",
    neededFor:
      "Stripe Connect Express account creation + onboarding URL (platform fee configured server-side; frontend never talks to Connect directly)",
  },
  {
    id: "GAP-V04",
    method: "POST",
    path: "/api/v1/sellers/listings/",
    ownerApp: "sellers_app",
    neededFor:
      "listing creation (products_app owns catalog writes via services)",
  },
  {
    id: "GAP-V07",
    method: "POST",
    path: "/api/v1/sellers/documents/",
    ownerApp: "sellers_app",
    neededFor:
      "KYC document upload (multipart → S3 via backend; no client-side processing of sensitive images)",
  },
  {
    id: "GAP-V08",
    method: "PATCH",
    path: "/api/v1/sellers/listings/{id}/",
    ownerApp: "sellers_app",
    neededFor: "listing editing",
  },
  {
    id: "GAP-V09",
    method: "GET",
    path: "/api/v1/sellers/me/stats/",
    ownerApp: "sellers_app",
    neededFor:
      "dashboard stats cards (sales, pending orders, listings, balance)",
  },
  {
    id: "GAP-V10",
    method: "GET",
    path: "/api/v1/sellers/me/payouts/",
    ownerApp: "sellers_app",
    neededFor:
      "payout status/balance/next payout + Express dashboard link (data sourced from payments_app internally)",
  },
  {
    id: "GAP-V11",
    method: "GET",
    path: "/api/v1/sellers/me/orders/",
    ownerApp: "sellers_app",
    neededFor: "dashboard recent-orders table, server-side pagination",
  },
  {
    id: "GAP-V12",
    method: "GET",
    path: "/api/v1/sellers/me/shipping-profiles/",
    ownerApp: "sellers_app",
    neededFor: "listing form shipping-profile selection",
  },
  {
    id: "GAP-V13",
    method: "GET",
    path: "/api/v1/sellers/",
    ownerApp: "sellers_app",
    neededFor: "public seller directory (/sellers index page)",
  },

  // shipping_app — checkout delivery surface closed (GAP-H01/H02):
  // ShippingOptionsView serves the policy rate table and
  // LockerDirectoryView serves the curated locker directory
  // ("source": "curated") until the live carrier APIs land (MVP-H2).

  // compliance_app — data-subject self-service (Art. 15/17/20) + consent.
  // Consent records are an IMMUTABLE audit trail (no updates/deletes).
  {
    id: "GAP-C01",
    method: "POST",
    path: "/api/v1/compliance/consent/",
    ownerApp: "compliance_app",
    neededFor: "consent banner decisions (audited, immutable)",
  },
  {
    id: "GAP-C04",
    method: "GET",
    path: "/api/v1/compliance/consent/",
    ownerApp: "compliance_app",
    neededFor: "consent history on the account consent page",
  },
  {
    id: "GAP-C02",
    method: "POST",
    path: "/api/v1/compliance/export/",
    ownerApp: "compliance_app",
    neededFor: "Art. 20 portability request (self-service)",
  },
  {
    id: "GAP-C03",
    method: "POST",
    path: "/api/v1/compliance/erasure/",
    ownerApp: "compliance_app",
    neededFor: "Art. 17 erasure request (self-service)",
  },

  // admin/moderation (role-gated; purpose-built UI per ADR-0008)
  {
    id: "GAP-M01",
    method: "GET",
    path: "/api/v1/admin/moderation/queue/",
    ownerApp: "core + owners",
    neededFor: "moderation queue UI",
  },
  {
    id: "GAP-M02",
    method: "POST",
    path: "/api/v1/admin/moderation/{id}/decision/",
    ownerApp: "core + owners",
    neededFor: "takedown/approve actions (audit-emitting)",
  },
  {
    id: "GAP-M03",
    method: "GET",
    path: "/api/v1/admin/stats/",
    ownerApp: "core",
    neededFor:
      "admin dashboard stats (pending verifications, active sellers, flagged listings, open compliance requests)",
  },
  {
    id: "GAP-M04",
    method: "GET",
    path: "/api/v1/admin/sellers/",
    ownerApp: "sellers_app",
    neededFor: "seller verification queue with status filters",
  },
  {
    id: "GAP-M05",
    method: "GET",
    path: "/api/v1/admin/sellers/{id}/",
    ownerApp: "sellers_app",
    neededFor:
      "seller detail: business info, authenticated document URLs, verification history",
  },
  {
    id: "GAP-M06",
    method: "POST",
    path: "/api/v1/admin/sellers/{id}/decision/",
    ownerApp: "sellers_app",
    neededFor:
      "approve/reject/hold (audit-emitting; rejection email with reason)",
  },
  {
    id: "GAP-M07",
    method: "GET",
    path: "/api/v1/admin/compliance/requests/",
    ownerApp: "compliance_app",
    neededFor: "GDPR Art. 15/17/20 request queue for admins",
  },
  {
    id: "GAP-M08",
    method: "POST",
    path: "/api/v1/admin/compliance/requests/{id}/fulfill/",
    ownerApp: "compliance_app",
    neededFor:
      "mark export/erasure fulfilled (audit-emitting; export package download URL)",
  },
  {
    id: "GAP-M09",
    method: "POST",
    path: "/api/v1/admin/audit/",
    ownerApp: "core",
    neededFor:
      "client-emitted audit events (server-side mutations also emit their own)",
  },
  {
    id: "GAP-M10",
    method: "PATCH",
    path: "/api/v1/admin/moderation/{id}/corrections/",
    ownerApp: "products_app",
    neededFor: "minor listing corrections during moderation (audit-emitting)",
  },
  {
    id: "GAP-M11",
    method: "GET",
    path: "/api/v1/admin/orders/",
    ownerApp: "orders_app",
    neededFor: "admin orders overview (support + payment investigations)",
  },
  {
    id: "GAP-M12",
    method: "GET",
    path: "/api/v1/admin/users/",
    ownerApp: "users_app",
    neededFor: "admin user management (search, status, 2FA resets)",
  },
  {
    id: "GAP-M13",
    method: "GET",
    path: "/api/v1/admin/analytics/",
    ownerApp: "core",
    neededFor: "marketplace analytics (GMV, conversion, queue SLAs)",
  },

  // funeral_services_app — directory + lead generation ONLY (ADR-0008:
  // no service sales, no checkout, no pricing pressure)
  {
    id: "GAP-F01",
    method: "POST",
    path: "/api/v1/funeral-services/consultation-requests/",
    ownerApp: "funeral_services_app",
    neededFor:
      "consultation lead capture (name + one contact method; PII kept server-side only)",
  },
  {
    id: "GAP-F02",
    method: "GET",
    path: "/api/v1/funeral-services/",
    ownerApp: "funeral_services_app",
    neededFor:
      "directory with location/service-type/language filters (no prices in payload)",
  },
  {
    id: "GAP-F03",
    method: "GET",
    path: "/api/v1/funeral-services/{slug}/",
    ownerApp: "funeral_services_app",
    neededFor:
      "funeral home profile: services, gallery, team, reviews, coordinates",
  },

  // core — observability
  {
    id: "GAP-L01",
    method: "POST",
    path: "/api/v1/logs/",
    ownerApp: "core",
    neededFor:
      "client structured log ingestion (PII-redacted, batched; logger.ts transport)",
  },
  {
    id: "GAP-A01",
    method: "POST",
    path: "/api/v1/analytics/vitals/",
    ownerApp: "core",
    neededFor:
      "Core Web Vitals collector (consent-gated, batched beacon; web-vitals.tsx transport)",
  },

  // i18n — dynamic UI strings (static messages/*.json is the interim source)
  {
    id: "GAP-I01",
    method: "GET",
    path: "/api/v1/i18n/{locale}/",
    ownerApp: "core",
    neededFor:
      "server-side locale strings with static-JSON fallback (src/i18n/config.ts)",
  },
] as const;

/** Narrow a gap by id for page-level sanctioned stubs. Throws loudly if unknown. */
export function contractGap(id: string): ContractGap {
  const gap = CONTRACT_GAPS.find((g) => g.id === id);
  if (!gap) {
    throw new Error(`Unknown contract gap id: ${id}`);
  }
  return gap;
}
