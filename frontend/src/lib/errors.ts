/**
 * Typed error model — the single canonical home for error classes.
 * `api-client.ts` re-exports `ApiError` from here for compatibility.
 *
 * Privacy contract (non-negotiable):
 *  - `serializeError` is the ONLY shape that may leave the browser —
 *    no stack traces, no response bodies, no field values.
 *  - `safeUserMessage` is the ONLY shape that may reach the screen —
 *    friendly text + technical trace ID, never internals.
 *  - Value-level PII redaction happens in `logger.ts` before any transport.
 */

/** Short technical trace ID shown to users and attached to every report. */
export function newTraceId(): string {
  try {
    return crypto.randomUUID().slice(0, 13);
  } catch {
    return Math.random().toString(36).slice(2, 15);
  }
}

/** Base class: every app error carries a trace ID for support correlation. */
export class AppError extends Error {
  readonly traceId: string;

  constructor(message: string, traceId?: string) {
    super(message);
    this.name = "AppError";
    this.traceId = traceId ?? newTraceId();
  }

  /**
   * The ONLY shape that may reach the user's screen or an external
   * client: code + friendly message + trace ID. Never stack traces,
   * never internals.
   */
  toSafeObject(): { code: string; message: string; traceId: string } {
    const code =
      this instanceof ApiError ? this.code : classifyError(this).messageKey;
    return { code, message: this.message, traceId: this.traceId };
  }

  /**
   * Structured log entry — structural facts plus sanitized context.
   * Values still pass through the logger's PII redaction pipeline;
   * stacks and response bodies never enter this shape.
   */
  toLogEntry(): SerializedError {
    return serializeError(this);
  }
}

/** Failed HTTP/API call. `details` never leaves the client (see above). */
export class ApiError extends AppError {
  readonly status: number;
  /** Machine-readable code: DRF's `detail` when present, else HTTP status. */
  readonly code: string;
  /** Raw DRF field errors, if any. Never rendered directly — UI maps it. */
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    traceId?: string,
  ) {
    super(message, traceId);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Build from an openapi-fetch failure result. DRF-aware body parsing. */
  static async fromResponse(
    response: Response,
    parsed?: unknown,
  ): Promise<ApiError> {
    let body: unknown = parsed;
    if (body === undefined) {
      try {
        body = await response.clone().json();
      } catch {
        body = undefined;
      }
    }

    const record =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : undefined;
    const detail =
      typeof record?.detail === "string" ? record.detail : undefined;
    const code =
      detail ??
      (typeof record?.code === "string"
        ? record.code
        : `http_${response.status}`);
    const message = detail ?? response.statusText ?? "Request failed";

    return new ApiError(response.status, code, message, record ?? undefined);
  }
}

/** Form/field-level validation failure (client Zod or server 400 mapping). */
export class ValidationError extends AppError {
  /** Field name → message codes/values. Values are mapped by forms, never
   * dumped into logs wholesale (may echo user input → redacted upstream). */
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    fieldErrors: Record<string, string[]>,
    message = "Validation failed",
    traceId?: string,
  ) {
    super(message, traceId);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** Transport failure — offline, DNS, blocked request, timeout. */
export class NetworkError extends AppError {
  constructor(message = "Network request failed", traceId?: string) {
    super(message, traceId);
    this.name = "NetworkError";
  }
}

/** Authentication/authorization failure surfaced to UI logic. */
export class AuthError extends AppError {
  readonly kind: "unauthenticated" | "forbidden";

  constructor(
    kind: "unauthenticated" | "forbidden",
    message?: string,
    traceId?: string,
  ) {
    super(
      message ?? (kind === "forbidden" ? "Forbidden" : "Not signed in"),
      traceId,
    );
    this.name = "AuthError";
    this.kind = kind;
  }
}

/** Insufficient permissions for the requested resource (403 semantics). */
export class PermissionError extends AppError {
  constructor(message = "Access denied", traceId?: string) {
    super(message, traceId);
    this.name = "PermissionError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/* -------------------------------------------------------------------------- */
/* Classification — one discriminator for every boundary and hook              */
/* -------------------------------------------------------------------------- */

export type ErrorKind = "api" | "validation" | "network" | "auth" | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  /** i18n key in the `errors` namespace for user-facing copy. */
  messageKey: string;
  traceId: string;
  status?: number;
  code?: string;
}

/** Map any thrown value to a display-safe classification. */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        kind: "auth",
        messageKey: "unauthorized",
        traceId: error.traceId,
        status: 401,
        code: error.code,
      };
    }
    if (error.status === 403) {
      return {
        kind: "auth",
        messageKey: "forbidden",
        traceId: error.traceId,
        status: 403,
        code: error.code,
      };
    }
    if (error.status === 404) {
      return {
        kind: "api",
        messageKey: "notFound",
        traceId: error.traceId,
        status: 404,
        code: error.code,
      };
    }
    return {
      kind: "api",
      messageKey: error.status >= 500 ? "serverError" : "generic",
      traceId: error.traceId,
      status: error.status,
      code: error.code,
    };
  }
  if (error instanceof ValidationError) {
    return {
      kind: "validation",
      messageKey: "validation",
      traceId: error.traceId,
    };
  }
  if (error instanceof NetworkError) {
    return { kind: "network", messageKey: "network", traceId: error.traceId };
  }
  if (error instanceof AuthError) {
    return {
      kind: "auth",
      messageKey: error.kind === "forbidden" ? "forbidden" : "unauthorized",
      traceId: error.traceId,
    };
  }
  if (error instanceof PermissionError) {
    return {
      kind: "auth",
      messageKey: "forbidden",
      traceId: error.traceId,
    };
  }
  if (error instanceof TypeError) {
    // fetch()'s network failure surfaces as TypeError.
    return { kind: "network", messageKey: "network", traceId: newTraceId() };
  }
  // AppError subclasses keep THEIR trace ID through classification —
  // the fallback below only fires for truly unknown thrown values.
  if (error instanceof AppError) {
    return { kind: "unknown", messageKey: "generic", traceId: error.traceId };
  }
  return { kind: "unknown", messageKey: "generic", traceId: newTraceId() };
}

/* -------------------------------------------------------------------------- */
/* Serialization — the only shape allowed to reach a logging transport          */
/* -------------------------------------------------------------------------- */

export interface SerializedError {
  name: string;
  /** Structural facts only. Values pass through logger redaction as well. */
  message: string;
  traceId: string;
  status?: number;
  code?: string;
  fieldNames?: string[];
  /** Sanitized React component stack (frames only — no props/values). */
  componentStack?: string;
}

/**
 * Strip everything sensitive: no stack trace, no `details` body, no field
 * VALUES (names only). The logger redacts residual PII patterns on top.
 */
export function serializeError(error: unknown): SerializedError {
  const classified = classifyError(error);
  const base: SerializedError = {
    name: error instanceof Error ? error.name : "NonError",
    message: error instanceof Error ? error.message : String(error),
    traceId: classified.traceId,
  };
  if (error instanceof ApiError) {
    base.status = error.status;
    base.code = error.code;
  }
  if (error instanceof ValidationError) {
    base.fieldNames = Object.keys(error.fieldErrors);
  }
  return base;
}

/**
 * User-facing copy: friendly key + technical trace ID. Never includes
 * stack traces, URLs, status internals, or IDs other than the trace ID.
 */
export function safeUserMessage(error: unknown): {
  messageKey: string;
  traceId: string;
} {
  const classified = classifyError(error);
  return { messageKey: classified.messageKey, traceId: classified.traceId };
}
