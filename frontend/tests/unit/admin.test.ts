import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

/* Mock the API client — admin flows must never hit the network here. */
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
  correctListing,
  decideListing,
  decideSeller,
  fetchAdminStats,
  fetchComplianceRequests,
  fetchListingQueue,
  fetchSellerDetail,
  fetchSellerQueue,
  fulfillComplianceRequest,
  logAdminAction,
} = await import("@/lib/admin");

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("audit trail", () => {
  it("logAdminAction posts the event with identity-bearing detail", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    await logAdminAction({
      action: "seller.approve",
      targetType: "seller",
      targetId: "s-1",
      detail: "by admin@jol.example",
    });
    const [path, options] = client.POST.mock.calls[0] as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(path).toBe("/api/v1/admin/audit/");
    expect(options.body.action).toBe("seller.approve");
    expect(options.body.target_id).toBe("s-1");
    expect(typeof options.body.occurred_at).toBe("string");
  });

  it("a failed audit POST never throws into the moderation flow", async () => {
    // The failure is surfaced through the structured logger (batched
    // transport), never through the console and never into the flow.
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { flushLogs } = await import("@/lib/logger");

    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      logAdminAction({
        action: "seller.approve",
        targetType: "seller",
        targetId: "s-1",
      }),
    ).resolves.toBeUndefined();

    await flushLogs();
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(init.body).toContain("audit emission failed");
    vi.unstubAllGlobals();
  });
});

describe("dashboard stats", () => {
  it("maps snake_case counters with safe defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({ pending_verifications: 3, active_sellers: 12 }),
    );
    expect(await fetchAdminStats()).toEqual({
      pendingVerifications: 3,
      activeSellers: 12,
      flaggedListings: 0,
      openComplianceRequests: 0,
    });
  });

  it("throws ApiError on non-ok responses", async () => {
    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchAdminStats()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("seller verification queue", () => {
  it("normalizes rows and falls back unknown statuses to pending", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            id: "s-1",
            business_name: "Šventoji UAB",
            business_type: "company",
            registered_at: "2026-08-10",
            documents_status: "uploaded",
            connect_status: "active",
            verification_status: "needs_review",
          },
          { id: "s-2", verification_status: "weird" },
          { business_name: "no id" },
        ],
      }),
    );
    const rows = await fetchSellerQueue("all");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.verificationStatus).toBe("needs_review");
    expect(rows[1]?.verificationStatus).toBe("pending");
    expect(rows[1]?.businessName).toBe("—");
  });

  it("error responses surface as ApiError across fetchers", async () => {
    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchSellerDetail("s-1")).rejects.toBeInstanceOf(ApiError);

    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchListingQueue()).rejects.toBeInstanceOf(ApiError);

    client.GET.mockResolvedValueOnce(notFound());
    await expect(fetchComplianceRequests()).rejects.toBeInstanceOf(ApiError);
  });

  it("passes the status filter as a query param", async () => {
    client.GET.mockResolvedValueOnce(ok({ results: [] }));
    await fetchSellerQueue("rejected");
    expect(client.GET).toHaveBeenCalledWith("/api/v1/admin/sellers/", {
      query: { status: "rejected" },
    });
  });

  it("coerces non-string fields to safe defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            id: "s-3",
            business_name: 42,
            business_type: null,
            registered_at: 7,
            documents_status: true,
            connect_status: [],
          },
        ],
      }),
    );
    const rows = await fetchSellerQueue("all");
    expect(rows[0]).toMatchObject({
      businessName: "—",
      businessType: "unknown",
      registeredAt: "",
      documentsStatus: "none",
      connectStatus: "none",
    });
  });
});

describe("seller detail", () => {
  it("normalizes documents and history, dropping malformed entries", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        id: "s-1",
        business_name: "Šventoji UAB",
        verification_status: "approved",
        documents: [
          { kind: "identity", file_name: "id.jpg", url: "https://s3/id.jpg" },
          { kind: "proof_of_address" },
        ],
        history: [{ at: "2026-08-16", admin: "a@jol", action: "approved" }, {}],
      }),
    );
    const detail = await fetchSellerDetail("s-1");
    expect(detail.verificationStatus).toBe("approved");
    expect(detail.documents).toHaveLength(1);
    expect(detail.documents[0]?.url).toBe("https://s3/id.jpg");
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]?.admin).toBe("a@jol");
  });

  it("coerces malformed detail payloads to safe defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        business_name: 1,
        verification_status: null,
        documents: "nope",
        history: "nope",
      }),
    );
    const detail = await fetchSellerDetail("s-9");
    expect(detail.id).toBe("s-9");
    expect(detail.businessName).toBe("—");
    expect(detail.verificationStatus).toBe("pending");
    expect(detail.documents).toEqual([]);
    expect(detail.history).toEqual([]);
    expect(detail.connectStatus).toBe("none");
  });
});

describe("decisions are audit-emitting", () => {
  it("decideSeller posts the decision then the audit event", async () => {
    client.POST.mockResolvedValueOnce(ok({})); // decision
    client.POST.mockResolvedValueOnce(ok({})); // audit
    await decideSeller("s-1", "reject", "docs unreadable", "a@jol.example");
    expect(client.POST).toHaveBeenCalledTimes(2);
    const [decisionPath, decisionOptions] = client.POST.mock.calls[0] as [
      string,
      { params: { path: { id: string } }; body: Record<string, unknown> },
    ];
    expect(decisionPath).toBe("/api/v1/admin/sellers/{id}/decision/");
    expect(decisionOptions.params.path.id).toBe("s-1");
    expect(decisionOptions.body).toMatchObject({
      decision: "reject",
      reason: "docs unreadable",
    });
    const [auditPath, auditOptions] = client.POST.mock.calls[1] as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(auditPath).toBe("/api/v1/admin/audit/");
    expect(auditOptions.body.action).toBe("seller.reject");
    expect(String(auditOptions.body.detail)).toContain("a@jol.example");
  });

  it("a failed decision does not emit an audit event", async () => {
    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      decideSeller("s-1", "approve", "", "a@jol.example"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.POST).toHaveBeenCalledTimes(1);
  });

  it("decideListing and correctListing audit with the admin identity", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    client.POST.mockResolvedValueOnce(ok({}));
    await decideListing("l-1", "escalate", "IP claim", "a@jol.example");
    expect(client.POST.mock.calls[1]?.[1].body.action).toBe("listing.escalate");

    client.PATCH.mockResolvedValueOnce(ok({}));
    client.POST.mockResolvedValueOnce(ok({}));
    await correctListing("l-1", { title: "Fixed title" }, "a@jol.example");
    const [patchPath] = client.PATCH.mock.calls[0] as [string];
    expect(patchPath).toBe("/api/v1/admin/moderation/{id}/corrections/");
    // calls[0]/[1] belong to decideListing above; the correction audit is #3.
    expect(client.POST.mock.calls[2]?.[1].body.action).toBe(
      "listing.corrected",
    );
  });
});

describe("listings moderation queue", () => {
  it("normalizes flag metadata and preview payload", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            id: "l-1",
            title: "Rosary",
            seller_name: "Šventoji",
            category: "Prayer",
            flag_reason: "pricing_issue",
            flag_source: "auto",
            price: "19.99",
            description_html: "<p>ok</p>",
            image_urls: ["https://media/1.webp", 42],
          },
          { title: "missing id" },
        ],
      }),
    );
    const rows = await fetchListingQueue();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.flagSource).toBe("auto");
    expect(rows[0]?.imageUrls).toEqual(["https://media/1.webp"]);
    expect(rows[0]?.descriptionHtml).toBe("<p>ok</p>");
  });

  it("coerces malformed listing rows to safe defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            id: "l-2",
            title: 9,
            seller_name: false,
            category: {},
            flag_reason: 3,
            flag_source: "robot",
            status: 0,
            price: 1,
            description_html: 2,
            image_urls: "none",
          },
        ],
      }),
    );
    const rows = await fetchListingQueue();
    expect(rows[0]).toMatchObject({
      title: "—",
      sellerName: "—",
      category: "—",
      flagReason: "",
      flagSource: "manual",
      status: "flagged",
      price: "",
      descriptionHtml: "",
      imageUrls: [],
    });
  });
});

describe("compliance requests", () => {
  it("normalizes types, statuses and download URLs", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            id: "c-1",
            type: "erasure",
            user_email: "user@example.com",
            requested_at: "2026-08-16",
            status: "open",
          },
          {
            id: "c-2",
            type: "weird",
            status: "done",
            download_url: "https://packages/c-2.zip",
          },
          {},
        ],
      }),
    );
    const rows = await fetchComplianceRequests();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.type).toBe("erasure");
    expect(rows[1]?.type).toBe("access");
    expect(rows[1]?.status).toBe("open");
    expect(rows[1]?.downloadUrl).toBe("https://packages/c-2.zip");
  });

  it("coerces malformed compliance rows to safe defaults", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        results: [
          {
            id: "c-3",
            type: 5,
            user_email: null,
            requested_at: 2,
            status: "mystery",
            assigned_admin: 8,
            download_url: 3,
          },
        ],
      }),
    );
    const rows = await fetchComplianceRequests();
    expect(rows[0]).toMatchObject({
      type: "access",
      userEmail: "—",
      requestedAt: "",
      status: "open",
      assignedAdmin: "",
      downloadUrl: null,
    });
  });

  it("fulfillComplianceRequest posts fulfilment and an audit event", async () => {
    client.POST.mockResolvedValueOnce(ok({}));
    client.POST.mockResolvedValueOnce(ok({}));
    await fulfillComplianceRequest("c-1", "package delivered", "a@jol.example");
    expect(client.POST.mock.calls[1]?.[1].body).toMatchObject({
      action: "compliance.fulfilled",
      target_type: "compliance_request",
    });
  });

  it("a failed fulfilment throws before any audit event", async () => {
    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      fulfillComplianceRequest("c-1", "", "a@jol.example"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.POST).toHaveBeenCalledTimes(1);
  });
});
