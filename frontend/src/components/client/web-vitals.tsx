"use client";

import { useEffect, useRef } from "react";

import { useConsentStore } from "@/stores/consent-store";
import { buildVitalRecord, type VitalRecord } from "@/lib/vitals";

/**
 * Core Web Vitals reporter — captures LCP, INP, CLS, TTFB, FCP via the
 * web-vitals v4 library and ships them to the SELF-HOSTED collector at
 * POST /api/v1/analytics/vitals/ (contract GAP-A01).
 *
 * Consent-first: nothing is imported or sent until the user grants
 * analytics consent (GDPR Art. 7). Metrics are BATCHED and flushed on
 * visibilitychange/pagehide with sendBeacon (survives tab close), with a
 * keepalive fetch fallback. Never blocks interaction; never retries —
 * vitals are samples, not transactions.
 */

const VITALS_ENDPOINT = "/api/v1/analytics/vitals/";
const MAX_BATCH = 10;

export function WebVitals() {
  const decided = useConsentStore((state) => state.decided);
  const analytics = useConsentStore((state) => state.choices.analytics);
  const queueRef = useRef<VitalRecord[]>([]);

  useEffect(() => {
    if (!decided || !analytics) return;

    let cancelled = false;

    const flush = () => {
      const queue = queueRef.current;
      if (queue.length === 0) return;
      queueRef.current = [];
      const body = JSON.stringify({ metrics: queue });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            VITALS_ENDPOINT,
            new Blob([body], { type: "application/json" }),
          );
        } else {
          void fetch(VITALS_ENDPOINT, {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        /* Beacon unavailable — vitals are best-effort samples. */
      }
    };

    const enqueue = (metric: { name: string; value: number; id: string }) => {
      if (cancelled) return;
      const record = buildVitalRecord(metric);
      if (!record) return;
      queueRef.current.push(record);
      if (queueRef.current.length >= MAX_BATCH) flush();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    void import("web-vitals").then((vitals) => {
      if (cancelled) return;
      vitals.onLCP(enqueue);
      vitals.onINP(enqueue);
      vitals.onCLS(enqueue);
      vitals.onTTFB(enqueue);
      vitals.onFCP(enqueue);
    });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      cancelled = true;
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [decided, analytics]);

  return null;
}
