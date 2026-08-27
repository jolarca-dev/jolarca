import { describe, expect, it } from "vitest";

import {
  ApiError,
  AppError,
  AuthError,
  classifyError,
  NetworkError,
  PermissionError,
  serializeError,
  ValidationError,
} from "@/lib/errors";

/**
 * Typed error architecture — the privacy contract is tested here: safe
 * objects never carry stacks/details; log entries are structural only.
 */

describe("PermissionError", () => {
  it("classifies as auth/forbidden with a trace ID", () => {
    const error = new PermissionError();
    expect(error.name).toBe("PermissionError");
    expect(classifyError(error)).toMatchObject({
      kind: "auth",
      messageKey: "forbidden",
    });
    expect(error.traceId.length).toBeGreaterThan(8);
  });
});

describe("toSafeObject — the only shape for screens and external clients", () => {
  it("ApiError exposes its machine code, never details or stack", () => {
    const error = new ApiError(500, "payment_provider_down", "Provider down", {
      secret: "card-data",
    });
    const safe = error.toSafeObject();
    expect(safe).toEqual({
      code: "payment_provider_down",
      message: "Provider down",
      traceId: error.traceId,
    });
    expect(JSON.stringify(safe)).not.toContain("card-data");
    expect(JSON.stringify(safe)).not.toContain("stack");
  });

  it("non-API errors fall back to the classified message key", () => {
    expect(new NetworkError().toSafeObject().code).toBe("network");
    expect(new PermissionError().toSafeObject().code).toBe("forbidden");
    expect(new AuthError("unauthenticated").toSafeObject().code).toBe(
      "unauthorized",
    );
  });
});

describe("toLogEntry — structured, sanitized, stack-free", () => {
  it("matches serializeError and never carries stacks or bodies", () => {
    const error = new ApiError(400, "invalid", "Bad request", {
      field: "user@example.lt",
    });
    const entry = error.toLogEntry();
    expect(entry).toEqual(serializeError(error));
    expect(entry).toMatchObject({ status: 400, code: "invalid" });
    const wire = JSON.stringify(entry);
    expect(wire).not.toContain("user@example.lt");
    expect(wire).not.toContain("at "); // no stack frames
  });

  it("ValidationError log entries carry field NAMES only", () => {
    const error = new ValidationError({ phone: ["too_short"] });
    const entry = error.toLogEntry();
    expect(entry.fieldNames).toEqual(["phone"]);
    expect(JSON.stringify(entry)).not.toContain("too_short");
  });
});

describe("trace IDs", () => {
  it("are unique per error and preserved through classification", () => {
    const a = new AppError("a");
    const b = new AppError("b");
    expect(a.traceId).not.toBe(b.traceId);
    expect(classifyError(a).traceId).toBe(a.traceId);
  });
});
