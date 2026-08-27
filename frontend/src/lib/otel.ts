/**
 * Minimal OpenTelemetry-style tracing, self-hosted edition.
 *
 * Design decision: the full @opentelemetry/sdk-* stack (~200KB+ and its
 * own transport) is disproportionate for this app's tracing surface. This
 * module exports a tiny span API that emits OTLP/HTTP-JSON span batches to
 * NEXT_PUBLIC_OTEL_ENDPOINT — and ONLY when that variable is set. No
 * endpoint → every call is a zero-cost no-op.
 *
 * PII contract (absolute):
 *  - allowed attributes: route name, HTTP method, status code;
 *  - NEVER query params, request bodies, or user-agent strings;
 *  - no baggage API at all — baggage is the classic accidental-PII
 *    propagation vector, so it doesn't exist here.
 */

const OTEL_ENDPOINT = process.env.NEXT_PUBLIC_OTEL_ENDPOINT;

export const OTEL_ENABLED = Boolean(OTEL_ENDPOINT);

const FLUSH_INTERVAL_MS = 10_000;
const MAX_SPANS = 50;

/** The ONLY attribute names a span may carry. */
export type SpanAttributes = {
  "http.method"?: string;
  "http.status_code"?: number;
  "route.name"?: string;
};

interface SpanRecord {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: SpanAttributes;
  status: "ok" | "error";
}

const spanBuffer: SpanRecord[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whitelist enforcement — unknown attributes are dropped, not scrubbed. */
function sanitizeAttributes(attrs?: SpanAttributes): SpanAttributes {
  if (!attrs) return {};
  const out: SpanAttributes = {};
  if (typeof attrs["http.method"] === "string") {
    out["http.method"] = attrs["http.method"].toUpperCase().slice(0, 10);
  }
  if (typeof attrs["http.status_code"] === "number") {
    out["http.status_code"] = attrs["http.status_code"];
  }
  if (typeof attrs["route.name"] === "string") {
    // Route NAMES only — never interpolated paths or params.
    out["route.name"] = attrs["route.name"].slice(0, 80);
  }
  return out;
}

function flushSpans(): void {
  if (spanBuffer.length === 0 || !OTEL_ENDPOINT) return;
  const batch = spanBuffer.splice(0, spanBuffer.length);
  const payload = JSON.stringify({
    resourceSpans: [{ scopeSpans: [{ spans: batch }] }],
  });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        OTEL_ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
    } else {
      void fetch(OTEL_ENDPOINT, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* Tracing is best-effort observability, never product-critical. */
  }
}

export interface Span {
  setAttribute(key: keyof SpanAttributes, value: string | number): void;
  setStatus(status: "ok" | "error"): void;
  end(): void;
}

/**
 * Start a span. Returns a no-op span when tracing is disabled.
 * `name` must be a static route/operation name — never user data.
 */
export function startSpan(name: string, attributes?: SpanAttributes): Span {
  if (!OTEL_ENABLED) {
    return { setAttribute: () => {}, setStatus: () => {}, end: () => {} };
  }

  const record: SpanRecord = {
    traceId: randomHex(16),
    spanId: randomHex(8),
    name: name.slice(0, 80),
    startTimeUnixNano: String(Date.now() * 1_000_000),
    endTimeUnixNano: "",
    attributes: sanitizeAttributes(attributes),
    status: "ok",
  };

  return {
    setAttribute(key, value) {
      record.attributes = sanitizeAttributes({
        ...record.attributes,
        [key]: value,
      });
    },
    setStatus(status) {
      record.status = status;
    },
    end() {
      record.endTimeUnixNano = String(Date.now() * 1_000_000);
      spanBuffer.push(record);
      if (spanBuffer.length >= MAX_SPANS) {
        flushSpans();
        return;
      }
      if (!flushTimer && typeof window !== "undefined") {
        flushTimer = setInterval(flushSpans, FLUSH_INTERVAL_MS);
        window.addEventListener("pagehide", flushSpans, { once: true });
      }
    },
  };
}
