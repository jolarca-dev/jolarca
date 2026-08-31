"use client";

/**
 * Consent state (zustand) — GDPR Art. 7 discipline:
 *  - nothing optional loads until an explicit decision exists (`decided`);
 *  - every decision is stamped and pushed to compliance_app as an
 *    IMMUTABLE audit record (GAP-C01) — the client never edits history;
 *  - the persisted payload carries a policy version; a mismatch re-prompts
 *    (stale consent is not consent).
 *
 * Storage key `jol_consent_v1` holds only the choice matrix + metadata —
 * no identity, no PII.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ApiError, apiClient } from "@/lib/api-client";

/* -------------------------------------------------------------------------- */
/* Model                                                                       */
/* -------------------------------------------------------------------------- */

export type ConsentCategory =
  "necessary" | "analytics" | "marketing" | "preferences";

export interface ConsentChoices {
  /** Session/auth + payment infrastructure — legally exempt, always on. */
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

/** Bump when the consent policy text or category meaning changes — every
 * stored decision with an older version triggers a re-prompt. */
export const CONSENT_VERSION = 1;

export const CONSENT_STORAGE_KEY = "jol_consent_v1";

export const DEFAULT_CHOICES: ConsentChoices = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

interface PersistedConsent {
  choices: ConsentChoices;
  timestamp: string | null;
  version: number;
}

interface ConsentState {
  choices: ConsentChoices;
  /** ISO instant of the last explicit decision; null while undecided. */
  timestamp: string | null;
  version: number;
  /** False until the user makes ANY explicit choice (banner visible). */
  decided: boolean;

  acceptAll: () => ConsentChoices;
  rejectAll: () => ConsentChoices;
  setCategory: (category: ConsentCategory, value: boolean) => void;
  /** Withdraws consent → banner reappears; previous record stays audited. */
  resetConsent: () => void;
}

/** Pure decision stamp — unit-tested. */
export function decide(
  choices: ConsentChoices,
  version = CONSENT_VERSION,
): PersistedConsent {
  return {
    // Necessary cannot be switched off; normalize defensively.
    choices: { ...choices, necessary: true },
    timestamp: new Date().toISOString(),
    version,
  };
}

/** True when a persisted payload is still valid under the current policy. */
export function isCurrentVersion(
  payload: {
    version?: number;
  } | null,
): boolean {
  return payload?.version === CONSENT_VERSION;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      choices: DEFAULT_CHOICES,
      timestamp: null,
      version: CONSENT_VERSION,
      decided: false,

      acceptAll: () => {
        const next = decide({
          necessary: true,
          analytics: true,
          marketing: true,
          preferences: true,
        });
        set({ ...next, decided: true });
        return next.choices;
      },

      rejectAll: () => {
        const next = decide(DEFAULT_CHOICES);
        set({ ...next, decided: true });
        return next.choices;
      },

      setCategory: (category, value) =>
        set((state) => {
          if (category === "necessary") return state; // never toggleable
          return {
            choices: { ...state.choices, [category]: value },
          };
        }),

      resetConsent: () =>
        set({
          choices: DEFAULT_CHOICES,
          timestamp: null,
          version: CONSENT_VERSION,
          decided: false,
        }),
    }),
    {
      name: CONSENT_STORAGE_KEY,
      version: CONSENT_VERSION,
      partialize: (state): PersistedConsent => ({
        choices: state.choices,
        timestamp: state.timestamp,
        version: state.version,
      }),
      // Version gate: decisions recorded under an older policy version are
      // discarded (re-prompt), and `necessary` is force-true on the way in.
      merge: (persisted, current) => {
        const payload = (persisted ?? null) as PersistedConsent | null;
        if (!isCurrentVersion(payload) || !payload?.timestamp) {
          return current; // undecided → banner shows
        }
        return {
          ...current,
          choices: { ...payload.choices, necessary: true },
          timestamp: payload.timestamp,
          version: payload.version,
          decided: true,
        };
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Compliance API — registered gaps until compliance_app ships them            */
/* -------------------------------------------------------------------------- */

export interface ConsentRecord {
  choices: ConsentChoices;
  timestamp: string;
  version: number;
}

/** POST /api/v1/compliance/consent/ (GAP-C01) — append-only audit record. */
export async function recordConsent(
  choices: ConsentChoices,
  timestamp: string,
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/compliance/consent/" as never,
    {
      body: {
        necessary: choices.necessary,
        analytics: choices.analytics,
        marketing: choices.marketing,
        preferences: choices.preferences,
        timestamp,
        version: CONSENT_VERSION,
      },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/** GET /api/v1/compliance/consent/ (GAP-C04) — immutable history. */
export async function fetchConsentHistory(): Promise<ConsentRecord[]> {
  const res = await apiClient.GET("/api/v1/compliance/consent/" as never);
  if (res.response.status === 401) return [];
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const record = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(record.history) ? record.history : [];
  return raw
    .map((entry): ConsentRecord | null => {
      const r = entry as Record<string, unknown>;
      if (typeof r.timestamp !== "string") return null;
      return {
        timestamp: r.timestamp,
        version: typeof r.version === "number" ? r.version : 0,
        choices: {
          necessary: true,
          analytics: r.analytics === true,
          marketing: r.marketing === true,
          preferences: r.preferences === true,
        },
      };
    })
    .filter((entry): entry is ConsentRecord => entry !== null);
}

/** POST /api/v1/compliance/export/ (GAP-C02) — Art. 20 portability. */
export async function requestDataExport(): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/compliance/export/" as never,
    {} as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/** POST /api/v1/compliance/erasure/ (GAP-C03) — Art. 17 right to erasure. */
export async function requestDataErasure(): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/compliance/erasure/" as never,
    {} as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}
