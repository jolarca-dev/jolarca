import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

/* Mock the API client — funeral flows must never hit the network here. */
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
  consultationFieldErrors,
  consultationSchema,
  fetchFuneralDirectory,
  fetchFuneralHome,
  submitConsultationRequest,
} = await import("@/lib/funeral");

const { apiClient } = await import("@/lib/api-client");
const client = apiClient as unknown as {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
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

const validDraft = {
  name: "Ona Jonaitienė",
  phone: "+370 600 00000",
  email: "",
  preferredContact: "phone" as const,
  serviceType: "burial" as const,
  message: "",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("consultation schema — grief-aware minimal friction", () => {
  it("accepts name + phone only (email optional)", () => {
    expect(consultationSchema.safeParse(validDraft).success).toBe(true);
  });

  it("accepts name + email only (phone optional)", () => {
    expect(
      consultationSchema.safeParse({
        ...validDraft,
        phone: "",
        email: "ona@example.lt",
      }).success,
    ).toBe(true);
  });

  it("requires at least one contact method", () => {
    const result = consultationSchema.safeParse({
      ...validDraft,
      phone: "",
      email: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(consultationFieldErrors(result.error).contact).toBe("required");
  });

  it("requires the name", () => {
    const result = consultationSchema.safeParse({ ...validDraft, name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(consultationFieldErrors(result.error).name).toBe("required");
  });

  it("flags malformed phone and email separately", () => {
    const result = consultationSchema.safeParse({
      ...validDraft,
      phone: "abc",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = consultationFieldErrors(result.error);
    expect(errors.phone).toBe("invalid");
    expect(errors.email).toBe("invalid");
  });
});

describe("submitConsultationRequest", () => {
  it("posts only the minimal payload with the provider context", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    await submitConsultationRequest(validDraft, "ramybe-namai");
    const [path, options] = client.POST.mock.calls[0] as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(path).toBe("/api/v1/funeral-services/consultation-requests/");
    expect(options.body).toMatchObject({
      name: "Ona Jonaitienė",
      phone: "+370 600 00000",
      preferred_contact: "phone",
      service_type: "burial",
      provider_slug: "ramybe-namai",
    });
    // Empty optionals must not travel (undefined drops in serialization).
    expect(options.body.email).toBeUndefined();
    expect(options.body.message).toBeUndefined();
  });

  it("throws ApiError on non-ok responses", async () => {
    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      submitConsultationRequest(validDraft, null),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("fetchFuneralDirectory", () => {
  it("normalizes rows, drops id-less entries, never carries prices", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            slug: "ramybe-namai",
            name: "Ramybės namai",
            city: "Vilnius",
            region: "Vilniaus r.",
            phone: "+370 5 000 0000",
            services: ["burial", "cremation", 7],
            price: "SHOULD NEVER RENDER",
          },
          { name: "no slug" },
        ],
      }),
    );
    const homes = await fetchFuneralDirectory({
      location: "Vilnius",
      serviceType: "",
      language: "",
    });
    expect(homes).toHaveLength(1);
    expect(homes[0]?.services).toEqual(["burial", "cremation"]);
    expect(homes[0]).not.toHaveProperty("price");
  });

  it("sends only provided filters as query params", async () => {
    client.GET.mockResolvedValueOnce(ok({ results: [] }));
    await fetchFuneralDirectory({
      location: "  Kaunas  ",
      serviceType: "cremation",
      language: "",
    });
    expect(client.GET).toHaveBeenCalledWith("/api/v1/funeral-services/", {
      query: { location: "Kaunas", service_type: "cremation" },
    });
  });

  it("throws ApiError on non-ok responses", async () => {
    client.GET.mockResolvedValueOnce(notFound());
    await expect(
      fetchFuneralDirectory({ location: "", serviceType: "", language: "" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("fetchFuneralHome", () => {
  it("normalizes the full profile with gallery, team and reviews", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        slug: "ramybe-namai",
        name: "Ramybės namai",
        services: ["burial"],
        gallery: [{ url: "https://media/chapel.webp", alt: "Chapel" }, {}],
        team: [
          {
            name: "Jonas",
            role: "Director",
            image_url: "https://media/j.webp",
          },
          {},
        ],
        reviews: [{ author: "Šeima", text: "Ačiū." }, { author: "no text" }],
        latitude: 54.687,
        longitude: 25.28,
      }),
    );
    const home = await fetchFuneralHome("ramybe-namai");
    expect(home.gallery).toHaveLength(1);
    expect(home.team[0]?.name).toBe("Jonas");
    expect(home.reviews).toHaveLength(1);
    expect(home.latitude).toBe(54.687);
    expect(home.longitude).toBe(25.28);
  });

  it("coerces malformed payloads to safe defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({ name: 3, gallery: "nope", team: 1, reviews: null, latitude: "x" }),
    );
    const home = await fetchFuneralHome("unknown");
    expect(home.slug).toBe("unknown");
    expect(home.name).toBe("—");
    expect(home.gallery).toEqual([]);
    expect(home.team).toEqual([]);
    expect(home.reviews).toEqual([]);
    expect(home.latitude).toBeNull();
  });

  it("throws ApiError on non-ok responses", async () => {
    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchFuneralHome("missing")).rejects.toBeInstanceOf(ApiError);
  });
});
