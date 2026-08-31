import { beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

/* Mock the API client — consent recording must never hit the network here. */
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

/* localStorage stub (zustand persist reads `window.localStorage`). */
const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
};
vi.stubGlobal("localStorage", localStorageStub);
vi.stubGlobal("window", { localStorage: localStorageStub });

const {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  DEFAULT_CHOICES,
  decide,
  fetchConsentHistory,
  isCurrentVersion,
  recordConsent,
  requestDataErasure,
  requestDataExport,
  useConsentStore,
} = await import("@/stores/consent-store");

const { apiClient } = await import("@/lib/api-client");
const client = apiClient as unknown as {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
};

beforeAll(() => {
  useConsentStore.getState().resetConsent();
});

describe("pure helpers", () => {
  it("decide() stamps a decision and forces necessary on", () => {
    const stamped = decide({
      necessary: true,
      analytics: true,
      marketing: false,
      preferences: false,
    });
    expect(stamped.choices.necessary).toBe(true);
    expect(stamped.choices.analytics).toBe(true);
    expect(stamped.version).toBe(CONSENT_VERSION);
    expect(new Date(stamped.timestamp as string).getTime()).not.toBeNaN();
  });

  it("isCurrentVersion gates stale payloads", () => {
    expect(isCurrentVersion({ version: CONSENT_VERSION })).toBe(true);
    expect(isCurrentVersion({ version: CONSENT_VERSION - 1 })).toBe(false);
    expect(isCurrentVersion(null)).toBe(false);
    expect(isCurrentVersion({})).toBe(false);
  });
});

describe("store actions", () => {
  it("acceptAll grants every optional category", () => {
    const choices = useConsentStore.getState().acceptAll();
    const state = useConsentStore.getState();
    expect(choices).toEqual({
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true,
    });
    expect(state.decided).toBe(true);
    expect(state.timestamp).toBeTruthy();
  });

  it("rejectAll keeps only necessary", () => {
    const choices = useConsentStore.getState().rejectAll();
    expect(choices).toEqual(DEFAULT_CHOICES);
    expect(useConsentStore.getState().decided).toBe(true);
  });

  it("setCategory toggles optionals but never necessary", () => {
    const store = useConsentStore.getState();
    store.setCategory("analytics", true);
    store.setCategory("necessary", false as never);
    const state = useConsentStore.getState();
    expect(state.choices.analytics).toBe(true);
    expect(state.choices.necessary).toBe(true);
  });

  it("resetConsent withdraws and re-prompts", () => {
    useConsentStore.getState().acceptAll();
    useConsentStore.getState().resetConsent();
    const state = useConsentStore.getState();
    expect(state.decided).toBe(false);
    expect(state.timestamp).toBeNull();
    expect(state.choices).toEqual(DEFAULT_CHOICES);
  });
});

describe("persistence — version gate + non-PII", () => {
  it("writes choices/timestamp/version only", () => {
    useConsentStore.getState().acceptAll();
    const raw = storage.get(CONSENT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("email");
    expect(raw).not.toContain("name");
    const payload = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
    };
    expect(Object.keys(payload.state).sort()).toEqual([
      "choices",
      "timestamp",
      "version",
    ]);
  });

  it("rehydrates a current-version decision as decided", () => {
    const merge = (
      useConsentStore as unknown as {
        persist: { getOptions: () => { merge: unknown } };
      }
    ).persist.getOptions().merge as (
      persisted: unknown,
      current: Record<string, unknown>,
    ) => { decided: boolean; choices: { necessary: boolean } };

    const merged = merge(
      {
        choices: {
          necessary: true,
          analytics: true,
          marketing: false,
          preferences: false,
        },
        timestamp: "2026-08-17T12:00:00.000Z",
        version: CONSENT_VERSION,
      },
      { decided: false },
    );
    expect(merged.decided).toBe(true);
    expect(merged.choices.necessary).toBe(true);
  });

  it("discards stale-version payloads (re-prompt)", () => {
    const merge = (
      useConsentStore as unknown as {
        persist: { getOptions: () => { merge: unknown } };
      }
    ).persist.getOptions().merge as (
      persisted: unknown,
      current: { decided: boolean },
    ) => { decided: boolean };

    const merged = merge(
      {
        choices: {
          necessary: true,
          analytics: true,
          marketing: true,
          preferences: true,
        },
        timestamp: "2026-01-01T00:00:00.000Z",
        version: CONSENT_VERSION - 1,
      },
      { decided: false },
    );
    expect(merged.decided).toBe(false);
    expect(merge(null, { decided: false }).decided).toBe(false);
  });
});

describe("compliance API functions", () => {
  function ok(data?: unknown) {
    return {
      data,
      error: undefined,
      response: new Response(null, { status: 200 }),
    };
  }
  function fail(status: number, detail: string) {
    return {
      data: undefined,
      error: { detail },
      response: new Response(null, { status }),
    };
  }

  it("recordConsent posts the stamped decision", async () => {
    client.POST.mockResolvedValueOnce(ok());
    await expect(
      recordConsent(DEFAULT_CHOICES, "2026-08-17T12:00:00.000Z"),
    ).resolves.toBeUndefined();
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/compliance/consent/",
      expect.objectContaining({
        body: expect.objectContaining({
          necessary: true,
          analytics: false,
          version: CONSENT_VERSION,
        }),
      }),
    );
    client.POST.mockResolvedValueOnce(fail(500, "boom"));
    await expect(
      recordConsent(DEFAULT_CHOICES, "2026-08-17T12:00:00.000Z"),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("fetchConsentHistory parses records and maps 401 to empty", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        history: [
          {
            timestamp: "2026-08-17T12:00:00.000Z",
            analytics: true,
            version: 1,
          },
          { analytics: true }, // no timestamp → dropped
        ],
      }),
    );
    const history = await fetchConsentHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.choices.analytics).toBe(true);
    expect(history[0]?.choices.necessary).toBe(true);

    client.GET.mockResolvedValueOnce(fail(401, "unauthenticated"));
    await expect(fetchConsentHistory()).resolves.toEqual([]);

    client.GET.mockResolvedValueOnce(fail(500, "boom"));
    await expect(fetchConsentHistory()).rejects.toBeInstanceOf(ApiError);
  });

  it("requestDataExport and requestDataErasure surface failures", async () => {
    client.POST.mockResolvedValueOnce(ok());
    await expect(requestDataExport()).resolves.toBeUndefined();
    client.POST.mockResolvedValueOnce(fail(429, "rate_limited"));
    await expect(requestDataExport()).rejects.toMatchObject({ status: 429 });

    client.POST.mockResolvedValueOnce(ok());
    await expect(requestDataErasure()).resolves.toBeUndefined();
    client.POST.mockResolvedValueOnce(fail(500, "boom"));
    await expect(requestDataErasure()).rejects.toBeInstanceOf(ApiError);
  });
});
