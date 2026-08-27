/**
 * Structured client logging — JSON records, batched async transport to
 * `POST /api/v1/logs/` (GAP-L01; until the backend endpoint exists the
 * queue drains silently).
 *
 * PII contract (GDPR):
 *  - every payload passes `redactObject` before queueing — emails, phone
 *    numbers, Luhn-valid card fragments, and name/address-like keys are
 *    replaced, not forwarded;
 *  - user identity is a one-way SHA-256 hash prefix, never the raw id;
 *  - `path` is captured WITHOUT query strings (no PII ever rides URLs);
 *  - stack traces never enter records (see errors.serializeError).
 *
 * Production discipline: `debug` is a no-op, and nothing is mirrored to
 * the console in production — this module is the only sanctioned channel.
 */

import { luhnValid } from "@/lib/sanitization";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  requestId: string;
  /** Error-correlation trace ID when the record reports an AppError. */
  traceId?: string;
  userId?: string; // hashed
  path?: string;
  data?: unknown;
}

const LOGS_ENDPOINT = "/api/v1/logs/";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 20;
/** In-memory survival buffer when the POST transport fails. */
const MAX_BUFFER = 100;
const MAX_DEPTH = 6;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MIN_LEVEL: LogLevel = IS_PRODUCTION ? "info" : "debug";

/* -------------------------------------------------------------------------- */
/* Redaction                                                                    */
/* -------------------------------------------------------------------------- */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// E.164-capped (≤15 digits): longer unseparated runs are order IDs etc.;
// both guards refuse partial matches inside longer digit runs.
const PHONE_PATTERN = /(?<!\d)\+?\d(?:[ \-().]?\d){6,14}(?!\d)/g;

/** Keys whose VALUES are always personal data — replaced wholesale. */
const PII_KEY_PATTERN =
  /^(.*(email|phone|password|secret|token).*)$|^.*(first_?name|last_?name|full_?name|name|street|address|city|postal|zip|dob|birth|ip).*/i;

export const REDACTED = "[REDACTED]";
export const REDACTED_EMAIL = "[REDACTED_EMAIL]";
export const REDACTED_PHONE = "[REDACTED_PHONE]";
export const REDACTED_CARD = "[REDACTED_CARD]";

/** Card-like digit runs (13–19 digits) — Luhn-gated to avoid false hits. */
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

function redactCards(value: string): string {
  return value.replace(CARD_CANDIDATE, (candidate) => {
    const digits = candidate.replace(/[ -]/g, "");
    return luhnValid(digits) ? REDACTED_CARD : candidate;
  });
}

/** Scrub PII patterns out of free text. Cards go first (whole-span Luhn
 * check before the phone pattern can partially consume the digits). */
export function redactString(value: string): string {
  return redactCards(value)
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(PHONE_PATTERN, REDACTED_PHONE);
}

/** Deep redaction for arbitrary payloads. Cycles are cut at MAX_DEPTH. */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Error) {
    // Errors carry messages that may embed user input — redact those too.
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry, depth + 1));
  }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    out[key] = PII_KEY_PATTERN.test(key)
      ? REDACTED
      : redactObject(entry, depth + 1);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Context                                                                      */
/* -------------------------------------------------------------------------- */

let requestId = "";
let hashedUserId: string | undefined;

/** One correlation ID per page load; callers may replace it per request. */
export function getRequestId(): string {
  if (!requestId) {
    requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 13)
        : Math.random().toString(36).slice(2, 15);
  }
  return requestId;
}

export function setRequestId(id: string): void {
  requestId = id;
}

/**
 * Adopt the backend's `x-request-id` response header when present so
 * client and server records share one searchable correlation ID. The
 * header value is length-capped and charset-checked — it must never
 * smuggle attacker-controlled free text into logs.
 */
export function captureRequestId(headers: Headers): void {
  const header = headers.get("x-request-id");
  if (header && /^[A-Za-z0-9_.-]{1,64}$/.test(header)) {
    requestId = header;
  }
}

/**
 * Register the signed-in user. Only a SHA-256 prefix (12 hex chars) is
 * ever stored — logs can correlate a user without identifying them.
 */
export function setUserId(rawId: string): void {
  void (async () => {
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawId.toLowerCase().trim()),
      );
      hashedUserId = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 12);
    } catch {
      hashedUserId = undefined; // No hashing available → no user context.
    }
  })();
}

export function clearUserId(): void {
  hashedUserId = undefined;
}

/** Pathname only — query strings are never logged (no PII in URLs). */
function currentPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname;
}

/* -------------------------------------------------------------------------- */
/* Queue + transport                                                            */
/* -------------------------------------------------------------------------- */

const queue: LogRecord[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function levelRank(level: LogLevel): number {
  return { debug: 0, info: 1, warn: 2, error: 3 }[level];
}

export async function flushLogs(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const payload = JSON.stringify({ records: batch });
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      // Beacon gives no delivery signal — requeuing would double-send,
      // so beaconed batches are committed as sent.
      navigator.sendBeacon(
        `${API_BASE}${LOGS_ENDPOINT}`,
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }
    const response = await fetch(`${API_BASE}${LOGS_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      ...(typeof window !== "undefined" ? { keepalive: true } : {}),
    });
    if (!response.ok) requeue(batch);
  } catch {
    // Transport failure — buffer in memory (max 100, drop oldest) so a
    // transient outage doesn't lose error reports.
    requeue(batch);
  }
}

function requeue(batch: LogRecord[]): void {
  queue.unshift(...batch);
  if (queue.length > MAX_BUFFER) {
    queue.splice(0, queue.length - MAX_BUFFER); // drop oldest
  }
}

function scheduleFlush(): void {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = setInterval(() => {
    void flushLogs();
  }, FLUSH_INTERVAL_MS);
  // Drain on exit so error reports survive navigation.
  window.addEventListener("pagehide", () => void flushLogs(), { once: true });
}

function enqueue(
  level: LogLevel,
  msg: string,
  data?: unknown,
  traceId?: string,
): void {
  if (levelRank(level) < levelRank(MIN_LEVEL)) return;
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    msg: redactString(msg),
    requestId: getRequestId(),
    traceId,
    userId: hashedUserId,
    path: currentPath(),
    data: data === undefined ? undefined : redactObject(data),
  };
  queue.push(record);

  // Development ergonomics: pretty-print to console. Production NEVER
  // mirrors to console — the transport is the only channel (no-console
  // is an ESLint error; this is the one sanctioned exception).
  if (!IS_PRODUCTION) {
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](
      `[${record.ts}] ${level.toUpperCase()} ${record.msg}`,
      record.data ?? "",
    );
  }

  if (queue.length >= MAX_BATCH) {
    void flushLogs();
    return;
  }
  scheduleFlush();
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                   */
/* -------------------------------------------------------------------------- */

export const logger = {
  debug: (msg: string, data?: unknown, traceId?: string): void =>
    enqueue("debug", msg, data, traceId),
  info: (msg: string, data?: unknown, traceId?: string): void =>
    enqueue("info", msg, data, traceId),
  warn: (msg: string, data?: unknown, traceId?: string): void =>
    enqueue("warn", msg, data, traceId),
  error: (msg: string, data?: unknown, traceId?: string): void =>
    enqueue("error", msg, data, traceId),
};
