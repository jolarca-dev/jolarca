import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

/* Mock the API client — seller flows must never hit the network here. */
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      GET: vi.fn(),
      POST: vi.fn(),
      PATCH: vi.fn(),
      DELETE: vi.fn(),
      use: vi.fn(),
    },
  };
});

const {
  businessFieldErrors,
  businessInfoSchema,
  createListing,
  createStripeConnect,
  fetchCategories,
  fetchPayoutInfo,
  fetchSellerOrders,
  fetchSellerStats,
  fetchShippingProfiles,
  listingSchema,
  registrationNumberValid,
  submitBusinessInfo,
  unwrapOk,
  updateListing,
  uploadKycDocument,
} = await import("@/lib/seller");

const { apiClient } = await import("@/lib/api-client");
const client = apiClient as unknown as {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
  PATCH: ReturnType<typeof vi.fn>;
};

function ok(data: unknown): { response: Response; data: unknown } {
  return { response: new Response(null, { status: 200 }), data };
}

function notFound(): { response: Response; error: unknown } {
  return {
    response: new Response(JSON.stringify({ detail: "not found" }), {
      status: 404,
    }),
    error: { detail: "not found" },
  };
}

const validBusiness = {
  businessName: "Šventoji UAB",
  registrationNumber: "301234567",
  vatId: "",
  businessType: "company" as const,
  country: "LT" as const,
  street: "Gedimino pr. 1",
  city: "Vilnius",
  postalCode: "LT-01100",
  contactEmail: "labas@sventoji.lt",
  phone: "+370 600 00000",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registration number formats", () => {
  it("accepts the LT 9-digit JAR code and trims input", () => {
    expect(registrationNumberValid("LT", "301234567")).toBe(true);
    expect(registrationNumberValid("LT", " 301234567 ")).toBe(true);
  });

  it("rejects wrong lengths per country", () => {
    expect(registrationNumberValid("LT", "30123456")).toBe(false);
    expect(registrationNumberValid("LV", "4010304050")).toBe(false);
    expect(registrationNumberValid("EE", "1012345")).toBe(false);
    expect(registrationNumberValid("LT", "30123456a")).toBe(false);
  });

  it("accepts LV 11-digit and EE 8-digit codes", () => {
    expect(registrationNumberValid("LV", "40103040506")).toBe(true);
    expect(registrationNumberValid("EE", "10123456")).toBe(true);
  });
});

describe("business info schema", () => {
  it("parses a complete business info object", () => {
    const result = businessInfoSchema.safeParse(validBusiness);
    expect(result.success).toBe(true);
  });

  it("maps missing fields to required errors", () => {
    const result = businessInfoSchema.safeParse({
      ...validBusiness,
      businessName: "",
      contactEmail: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = businessFieldErrors(result.error);
    expect(errors.businessName).toBe("required");
    expect(errors.contactEmail).toBe("required");
  });

  it("maps invalid formats to invalid errors", () => {
    const result = businessInfoSchema.safeParse({
      ...validBusiness,
      contactEmail: "not-an-email",
      phone: "abc",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = businessFieldErrors(result.error);
    expect(errors.contactEmail).toBe("invalid");
    expect(errors.phone).toBe("invalid");
  });
});

describe("listing schema", () => {
  const validListing = {
    titles: { lt: "Rožinis iš alyvmedžio", lv: "", en: "Olive rosary" },
    descriptionHtml: "<p>Rankų darbo rožinis.</p>",
    categoryId: "cat-1",
    price: "19.99",
    currency: "EUR",
    stock: 4,
    shippingProfileId: "sp-1",
  };

  it("parses a valid listing", () => {
    expect(listingSchema.safeParse(validListing).success).toBe(true);
  });

  it("rejects zero and negative prices", () => {
    expect(
      listingSchema.safeParse({ ...validListing, price: "0" }).success,
    ).toBe(false);
    expect(
      listingSchema.safeParse({ ...validListing, price: "-5" }).success,
    ).toBe(false);
  });

  it("rejects negative or fractional stock", () => {
    expect(
      listingSchema.safeParse({ ...validListing, stock: -1 }).success,
    ).toBe(false);
    expect(
      listingSchema.safeParse({ ...validListing, stock: 1.5 }).success,
    ).toBe(false);
  });

  it("requires the Lithuanian title", () => {
    expect(
      listingSchema.safeParse({
        ...validListing,
        titles: { lt: "", lv: "x", en: "y" },
      }).success,
    ).toBe(false);
  });
});

describe("seller API normalization", () => {
  it("fetchSellerStats maps snake_case fields with defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        total_sales: 12345,
        pending_orders: 2,
        active_listings: 7,
        payout_balance: 500,
      }),
    );
    const stats = await fetchSellerStats();
    expect(stats).toEqual({
      totalSales: 12345,
      currency: "EUR",
      pendingOrders: 2,
      activeListings: 7,
      payoutBalance: 500,
    });
  });

  it("fetchSellerStats throws ApiError on non-ok responses", async () => {
    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchSellerStats()).rejects.toBeInstanceOf(ApiError);
  });

  it("fetchPayoutInfo normalizes unknown statuses to pending", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        status: "weird",
        available_balance: "10,00 €",
        total_paid: "25,00 €",
      }),
    );
    const info = await fetchPayoutInfo();
    expect(info.status).toBe("pending");
    expect(info.availableBalance).toBe("10,00 €");
    expect(info.expressDashboardUrl).toBeNull();
  });

  it("fetchPayoutInfo keeps active/restricted statuses and dashboard URL", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        status: "active",
        next_payout_date: "2026-08-25",
        express_dashboard_url: "https://connect.stripe.com/express",
      }),
    );
    const active = await fetchPayoutInfo();
    expect(active.status).toBe("active");
    expect(active.nextPayoutDate).toBe("2026-08-25");
    expect(active.expressDashboardUrl).toBe(
      "https://connect.stripe.com/express",
    );

    client.GET.mockResolvedValueOnce(ok({ status: "restricted" }));
    expect((await fetchPayoutInfo()).status).toBe("restricted");
  });

  it("fetchSellerOrders filters malformed rows and reads pagination", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        page: 2,
        total_pages: 4,
        results: [
          {
            id: "ord-1",
            placed_at: "2026-08-16",
            buyer_name: "Ona",
            total: "12,00 €",
            status: "paid",
          },
          { placed_at: "2026-08-16" },
        ],
      }),
    );
    const orders = await fetchSellerOrders(2);
    expect(orders.page).toBe(2);
    expect(orders.totalPages).toBe(4);
    expect(orders.results).toHaveLength(1);
    expect(orders.results[0]?.id).toBe("ord-1");
  });

  it("fetchSellerOrders tolerates a missing results array", async () => {
    client.GET.mockResolvedValueOnce(ok(null));
    const orders = await fetchSellerOrders(1);
    expect(orders.page).toBe(1);
    expect(orders.totalPages).toBe(1);
    expect(orders.results).toEqual([]);
  });

  it("error responses surface as ApiError across fetchers", async () => {
    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchSellerOrders(1)).rejects.toBeInstanceOf(ApiError);

    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchCategories()).rejects.toBeInstanceOf(ApiError);

    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchPayoutInfo()).rejects.toBeInstanceOf(ApiError);

    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchShippingProfiles()).rejects.toBeInstanceOf(ApiError);
  });

  it("fetchCategories and fetchShippingProfiles drop malformed entries", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          { id: "c1", slug: "rosaries", name: "Rožiniai" },
          { id: "c2", name: "Žvakės" }, // missing slug → falls back to id
          { name: "bad" },
        ],
      }),
    );
    expect(await fetchCategories()).toEqual([
      { id: "c1", slug: "rosaries", name: "Rožiniai" },
      { id: "c2", slug: "c2", name: "Žvakės" },
    ]);

    client.GET.mockResolvedValueOnce(
      ok({ results: [{ id: "s1", name: "DPD" }, {}] }),
    );
    expect(await fetchShippingProfiles()).toEqual([{ id: "s1", name: "DPD" }]);
  });
});

describe("Stripe Connect mediation", () => {
  it("createStripeConnect returns the backend-issued URL", async () => {
    client.POST.mockResolvedValueOnce(
      ok({ onboarding_url: "https://connect.stripe.com/setup/abc" }),
    );
    await expect(
      createStripeConnect("https://jol.example/lv/seller/dashboard"),
    ).resolves.toBe("https://connect.stripe.com/setup/abc");
  });

  it("rejects a missing or non-https onboarding URL", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    await expect(
      createStripeConnect("https://jol.example"),
    ).rejects.toMatchObject({
      status: 500,
    });
    client.POST.mockResolvedValueOnce(
      ok({ onboarding_url: "javascript:alert(1)" }),
    );
    await expect(
      createStripeConnect("https://jol.example"),
    ).rejects.toBeInstanceOf(ApiError);

    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      createStripeConnect("https://jol.example"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("updateListing PATCHes the listing path with the id param", async () => {
    client.PATCH.mockResolvedValueOnce(ok({}));
    await updateListing("lst-9", { stock: 3 });
    expect(client.PATCH).toHaveBeenCalledWith(
      "/api/v1/sellers/listings/{id}/",
      {
        params: { path: { id: "lst-9" } },
        body: { stock: 3 },
      },
    );
  });
});

describe("submission endpoints", () => {
  it("submitBusinessInfo posts business data and resolves on success", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    await expect(
      submitBusinessInfo(validBusiness, "data:image/webp;base64,AAA"),
    ).resolves.toBeUndefined();
    const [, options] = client.POST.mock.calls[0] as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(options.body.logo_webp_base64).toBe("data:image/webp;base64,AAA");
  });

  it("submitBusinessInfo throws ApiError on failure", async () => {
    client.POST.mockResolvedValueOnce(notFound());
    await expect(submitBusinessInfo(validBusiness)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("uploadKycDocument sends a multipart body untouched", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    const file = new File(["fake-bytes"], "id.jpg", { type: "image/jpeg" });
    await expect(uploadKycDocument("identity", file)).resolves.toBeUndefined();
    const [, options] = client.POST.mock.calls[0] as [
      string,
      { body: FormData },
    ];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("document_type")).toBe("identity");
    expect(options.body.get("file")).toBeInstanceOf(File);
  });

  it("createListing resolves on success and throws ApiError on failure", async () => {
    const listing = {
      titles: { lt: "Rožinis", lv: "", en: "" },
      descriptionHtml: "<p>Rankų darbo.</p>",
      categoryId: "cat-1",
      price: "19.99",
      currency: "EUR",
      stock: 4,
      shippingProfileId: "sp-1",
    };
    client.POST.mockResolvedValueOnce(ok({}));
    await expect(
      createListing({
        listing,
        imagesDataUrls: ["data:image/webp;base64,BBB"],
      }),
    ).resolves.toBeUndefined();

    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      createListing({ listing, imagesDataUrls: [] }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("unwrapOk", () => {
  it("passes through ok responses and throws ApiError otherwise", async () => {
    await expect(unwrapOk(ok({}))).resolves.toBeUndefined();
    await expect(unwrapOk(notFound())).rejects.toBeInstanceOf(ApiError);
  });
});
