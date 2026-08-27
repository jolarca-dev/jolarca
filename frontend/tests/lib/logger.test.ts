import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureRequestId,
  flushLogs,
  getRequestId,
  logger,
  setRequestId,
} from "@/lib/logger";

/**
 * Logger transport contract — complements tests/unit/error-logging.test.ts
 * (redaction). Focus here: x-request-id adoption, traceId propagation,
 * and the failure buffer (max 100 records, drop oldest).
 */

const ok204 = () => new Response(null, { status: 204 });

function sentRecords(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  const out: unknown[] = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as { body?: string } | undefined;
    if (init?.body) {
      out.push(...(JSON.parse(init.body) as { records: unknown[] }).records);
    }
  }
  return out;
}

beforeEach(() => {
  // Silence the dev pretty-print mirror so test output stays readable.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ok204()),
  );
});

afterEach(async () => {
  // Drain any leftover queue so tests stay independent.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ok204()),
  );
  await flushLogs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("captureRequestId — x-request-id adoption", () => {
  it("adopts a well-formed backend request ID", () => {
    captureRequestId(new Headers({ "x-request-id": "req_9f3b2c1a-4d5e_67" }));
    expect(getRequestId()).toBe("req_9f3b2c1a-4d5e_67");
  });

  it("rejects oversized or unsafe header values", () => {
    setRequestId("stable-base");
    captureRequestId(new Headers({ "x-request-id": "x".repeat(200) }));
    expect(getRequestId()).toBe("stable-base");
    // Spaces/semicolons fail the charset gate (Headers itself rejects
    // control chars, so smuggled newlines can't even be constructed).
    captureRequestId(new Headers({ "x-request-id": "evil injection; yes" }));
    expect(getRequestId()).toBe("stable-base");
  });
});

describe("record shape", () => {
  it("carries level, redacted message, requestId and optional traceId", async () => {
    const fetchMock = vi.fn(async () => ok204());
    vi.stubGlobal("fetch", fetchMock);

    logger.error("checkout failed", { orderId: "ord-1" }, "trace-abc123");
    await flushLogs();

    const records = sentRecords(fetchMock) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record).toMatchObject({
      level: "error",
      msg: "checkout failed",
      requestId: getRequestId(),
      traceId: "trace-abc123",
    });
  });
});

describe("failure buffer", () => {
  it("requeues records when the POST fails and delivers them on recovery", async () => {
    const failing = vi.fn(async () => {
      throw new Error("collector down");
    });
    vi.stubGlobal("fetch", failing);

    logger.error("first report");
    await flushLogs(); // fails → records must be requeued, not lost
    expect(failing).toHaveBeenCalledTimes(1);

    const recovered = vi.fn(async () => ok204());
    vi.stubGlobal("fetch", recovered);
    await flushLogs();

    const records = sentRecords(recovered) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ msg: "first report" });
  });

  it("caps the survival buffer at 100 records, dropping the oldest", async () => {
    const failing = vi.fn(async () => {
      throw new Error("collector down");
    });
    vi.stubGlobal("fetch", failing);

    for (let i = 0; i < 130; i += 1) {
      logger.info(`burst ${i}`);
    }
    // Let every auto-flush promise settle into the requeue path.
    for (let i = 0; i < 12; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushLogs();
    }

    const recovered = vi.fn(async () => ok204());
    vi.stubGlobal("fetch", recovered);
    await flushLogs();

    const records = sentRecords(recovered);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThanOrEqual(100);
  });
});
