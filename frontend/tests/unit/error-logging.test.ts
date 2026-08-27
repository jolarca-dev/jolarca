import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  AuthError,
  classifyError,
  NetworkError,
  newTraceId,
  safeUserMessage,
  serializeError,
  ValidationError,
} from "@/lib/errors";
import {
  flushLogs,
  logger,
  REDACTED,
  REDACTED_EMAIL,
  REDACTED_PHONE,
  redactObject,
  redactString,
  setUserId,
} from "@/lib/logger";

/* -------------------------------------------------------------------------- */
/* Redaction — the PII gate                                                     */
/* -------------------------------------------------------------------------- */

describe("redaction", () => {
  it("strips emails and phone numbers from free text", () => {
    expect(redactString("contact ona@example.com or +370 600 12345")).toBe(
      `contact ${REDACTED_EMAIL} or ${REDACTED_PHONE}`,
    );
  });

  it("replaces PII keys wholesale, keeps safe values, recurses", () => {
    const redacted = redactObject({
      email: "ona@example.com",
      fullName: "Ona Vilkienė",
      street: "Gedimino pr. 1",
      phone: "+370 600 12345",
      status: "pending",
      nested: { lastName: "Vilkienė", page: 2 },
      list: [{ password: "hunter2", ok: true }],
    }) as Record<string, unknown>;
    expect(redacted.email).toBe(REDACTED);
    expect(redacted.fullName).toBe(REDACTED);
    expect(redacted.street).toBe(REDACTED);
    expect(redacted.phone).toBe(REDACTED);
    expect(redacted.status).toBe("pending");
    expect((redacted.nested as Record<string, unknown>).lastName).toBe(
      REDACTED,
    );
    expect((redacted.nested as Record<string, unknown>).page).toBe(2);
    expect(
      (
        (redacted.list as Array<Record<string, unknown>>)[0] as Record<
          string,
          unknown
        >
      ).password,
    ).toBe(REDACTED);
    expect(
      (
        (redacted.list as Array<Record<string, unknown>>)[0] as Record<
          string,
          unknown
        >
      ).ok,
    ).toBe(true);
  });

  it("reduces Error instances to redacted name + message (no stack)", () => {
    const redacted = redactObject(
      new Error("failed for ona@example.com"),
    ) as Record<string, unknown>;
    expect(redacted.name).toBe("Error");
    expect(redacted.message).toContain(REDACTED_EMAIL);
    expect(redacted).not.toHaveProperty("stack");
  });
});

/* -------------------------------------------------------------------------- */
/* Classification & serialization                                               */
/* -------------------------------------------------------------------------- */

describe("classifyError", () => {
  it("maps API statuses to user-facing keys", () => {
    expect(classifyError(new ApiError(401, "http_401", "x")).messageKey).toBe(
      "unauthorized",
    );
    expect(classifyError(new ApiError(403, "http_403", "x")).messageKey).toBe(
      "forbidden",
    );
    expect(classifyError(new ApiError(404, "http_404", "x")).messageKey).toBe(
      "notFound",
    );
    expect(classifyError(new ApiError(500, "http_500", "x")).messageKey).toBe(
      "serverError",
    );
    expect(classifyError(new ApiError(400, "bad", "x")).messageKey).toBe(
      "generic",
    );
  });

  it("maps validation, network, auth and unknown shapes", () => {
    expect(
      classifyError(new ValidationError({ name: ["required"] })).kind,
    ).toBe("validation");
    expect(classifyError(new NetworkError()).messageKey).toBe("network");
    expect(classifyError(new TypeError("fetch failed")).messageKey).toBe(
      "network",
    );
    expect(classifyError(new AuthError("forbidden")).messageKey).toBe(
      "forbidden",
    );
    expect(classifyError("boom").kind).toBe("unknown");
  });

  it("every classification carries a trace ID", () => {
    for (const error of [
      new ApiError(500, "http_500", "x"),
      new ValidationError({}),
      new NetworkError(),
      new AuthError("unauthenticated"),
      new Error("other"),
    ]) {
      expect(classifyError(error).traceId.length).toBeGreaterThan(5);
    }
  });
});

describe("serializeError — transport-safe shape", () => {
  it("never includes stacks or response bodies", () => {
    const error = new ApiError(500, "boom", "internal detail", {
      secret: "value",
    });
    const serialized = serializeError(error);
    expect(serialized).toEqual(
      expect.objectContaining({ name: "ApiError", status: 500, code: "boom" }),
    );
    expect(serialized).not.toHaveProperty("details");
    expect(serialized).not.toHaveProperty("stack");
    // The DRF body (`details`) must never travel — only structural facts.
    expect(JSON.stringify(serialized)).not.toContain("value");
  });

  it("exposes validation field NAMES only, never values", () => {
    const serialized = serializeError(
      new ValidationError({ email: ["user@example.com"] }),
    );
    expect(serialized.fieldNames).toEqual(["email"]);
    expect(JSON.stringify(serialized)).not.toContain("user@example.com");
  });

  it("handles non-Error throws", () => {
    expect(serializeError("raw string").name).toBe("NonError");
  });
});

describe("safeUserMessage", () => {
  it("returns only a friendly key and the trace ID", () => {
    const error = new ApiError(500, "db_error_42", "connection pool exhausted");
    const safe = safeUserMessage(error);
    expect(safe.messageKey).toBe("serverError");
    expect(safe.traceId).toBe(error.traceId);
    expect(JSON.stringify(safe)).not.toContain("connection pool");
  });

  it("trace IDs are unique per error", () => {
    expect(newTraceId()).not.toBe(newTraceId());
  });
});

/* -------------------------------------------------------------------------- */
/* Logger transport                                                             */
/* -------------------------------------------------------------------------- */

describe("logger transport", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a redacted, structured batch (no PII in the payload)", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    // No sendBeacon in node — the fetch path is exercised.

    logger.error("checkout failed", {
      email: "ona@example.com",
      orderId: "o-1",
    });
    await flushLogs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const sent = JSON.parse(init.body) as {
      records: Array<{
        level: string;
        data: Record<string, unknown>;
        ts: string;
        requestId: string;
      }>;
    };
    expect(sent.records).toHaveLength(1);
    const record = sent.records[0];
    expect(record).toBeDefined();
    expect(record?.level).toBe("error");
    expect(record?.ts).toBeTruthy();
    expect(record?.requestId).toBeTruthy();
    expect(record?.data.email).toBe(REDACTED);
    expect(record?.data.orderId).toBe("o-1");
    expect(init.body).not.toContain("ona@example.com");
  });

  it("flushes with an empty queue without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await flushLogs();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives transport failure silently (buffered for retry)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    logger.warn("survives outage");
    await expect(flushLogs()).resolves.toBeUndefined();
    // Failed batches are requeued into the max-100 survival buffer —
    // drain via a recovered transport so later tests start clean.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await flushLogs();
  });

  it("stores only a hash prefix of the user ID", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    setUserId("Ona@example.com");
    await new Promise((resolve) => setTimeout(resolve, 15)); // hash is async
    logger.info("session event");
    await flushLogs();

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const sent = JSON.parse(init.body) as {
      records: Array<{ userId?: string }>;
    };
    const userId = sent.records[0]?.userId ?? "";
    expect(userId).toMatch(/^[0-9a-f]{12}$/);
    expect(init.body).not.toContain("ona@example.com");
  });
});
