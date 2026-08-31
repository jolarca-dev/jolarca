/**
 * Core Web Vitals thresholds — Google's "Good" boundaries, used to
 * classify every captured metric BEFORE it leaves the browser (the
 * analytics endpoint receives the rating alongside the raw value).
 * Budget alignment: Lighthouse CI enforces the same numbers
 * (lighthouse-budget.json), so field data and CI speak one language.
 */

export type VitalName = "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
export type VitalRating = "good" | "needs-improvement" | "poor";

/** [good ≤, needs-improvement ≤] — anything above the second is poor. */
export const VITAL_THRESHOLDS: Record<VitalName, readonly [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

export function isVitalName(name: string): name is VitalName {
  return name in VITAL_THRESHOLDS;
}

/** Classify a metric value against Google's thresholds. */
export function classifyVital(name: string, value: number): VitalRating {
  if (!isVitalName(name)) return "needs-improvement"; // unknown → cautious
  const [good, warning] = VITAL_THRESHOLDS[name];
  if (value <= good) return "good";
  if (value <= warning) return "needs-improvement";
  return "poor";
}

/** Wire shape sent to POST /api/v1/analytics/vitals/ (GAP-A01). */
export interface VitalRecord {
  name: VitalName;
  value: number;
  rating: VitalRating;
  /** web-vitals metric id — dedupe key on the collector. */
  id: string;
  path: string;
  ts: string;
}

export function buildVitalRecord(metric: {
  name: string;
  value: number;
  id: string;
}): VitalRecord | null {
  if (!isVitalName(metric.name)) return null;
  return {
    name: metric.name,
    // CLS is unitless — send with 3 decimals; everything else rounded ms.
    value:
      metric.name === "CLS"
        ? Math.round(metric.value * 1000) / 1000
        : Math.round(metric.value),
    rating: classifyVital(metric.name, metric.value),
    id: metric.id,
    path: typeof window !== "undefined" ? window.location.pathname : "/",
    ts: new Date().toISOString(),
  };
}
