import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

/* Mock the API client — search must never hit the network here. */
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

/* localStorage stub (recent searches; node environment). */
const storage = new Map<string, string>();
let storageThrows = false;
const localStorageStub = {
  getItem: (key: string) => {
    if (storageThrows) throw new Error("storage unavailable");
    return storage.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (storageThrows) throw new Error("storage unavailable");
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    if (storageThrows) throw new Error("storage unavailable");
    storage.delete(key);
  },
};
vi.stubGlobal("localStorage", localStorageStub);
vi.stubGlobal("window", { localStorage: localStorageStub });

const {
  buildSearchQuery,
  EMPTY_FILTERS,
  fetchSearch,
  fetchSuggestions,
  readRecentSearches,
  RECENT_SEARCHES_LIMIT,
  SEARCH_STORAGE_KEY,
  writeRecentSearch,
} = await import("@/lib/search");

const { apiClient } = await import("@/lib/api-client");
const client = apiClient as unknown as {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
};

function ok(data: unknown): { response: Response; data: unknown } {
  return { response: new Response(null, { status: 200 }), data };
}

function notFound(): { response: Response; error: unknown } {
  return {
    response: new Response(JSON.stringify({ detail: "not found" }), {
      status: 404,
    }),
    error: { detail: "not found" },
  };
}

const validProduct = {
  id: "p-1",
  slug: "rosary",
  title: "Olive rosary",
  price_gross: "19.99",
  currency: "EUR",
};

beforeEach(() => {
  /* reset (not just clear) so no mockResolvedValueOnce queue leaks from a
   * failing test into the next — GET/POST queues must never cross over. */
  vi.resetAllMocks();
  storage.clear();
  storageThrows = false;
});

describe("buildSearchQuery — privacy posture", () => {
  it("omits empty fields; page 1 never travels", () => {
    expect(
      buildSearchQuery({ q: "  ", page: 1, filters: EMPTY_FILTERS }),
    ).toEqual({});
  });

  it("maps every facet to its API param", () => {
    expect(
      buildSearchQuery({
        q: " rosary ",
        page: 3,
        filters: {
          category: "rosaries",
          priceMin: "10",
          priceMax: "50",
          seller: "sventoji",
          availability: "in_stock",
          delivery: "locker",
        },
      }),
    ).toEqual({
      q: "rosary",
      page: "3",
      category: "rosaries",
      price_min: "10",
      price_max: "50",
      seller: "sventoji",
      availability: "in_stock",
      delivery: "locker",
    });
  });
});

describe("fetchSearch", () => {
  it("parses valid products, drops malformed entries, pins the ranking marker", async () => {
    client.POST.mockResolvedValueOnce(
      ok({
        results: [validProduct, { id: "broken" }],
        page: 2,
        total_pages: 5,
        ranking: "stub",
      }),
    );
    const data = await fetchSearch({
      q: "rosary",
      page: 2,
      filters: EMPTY_FILTERS,
    });
    expect(data.products).toHaveLength(1);
    expect(data.products[0]?.slug).toBe("rosary");
    expect(data.page).toBe(2);
    expect(data.totalPages).toBe(5);
    expect(data.ranking).toBe("stub");
    /* The query travels in the POST body, never in a URL (ADR-0009). */
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/search/",
      expect.objectContaining({ body: { q: "rosary", page: "2" } }),
    );
  });

  it("tolerates a missing results array", async () => {
    client.POST.mockResolvedValueOnce(ok(null));
    const data = await fetchSearch({ q: "x", page: 1, filters: EMPTY_FILTERS });
    expect(data.products).toEqual([]);
    expect(data.totalPages).toBe(1);
    expect(data.ranking).toBe("");
  });

  it("throws ApiError on non-ok responses", async () => {
    client.POST.mockResolvedValueOnce(notFound());
    await expect(
      fetchSearch({ q: "x", page: 1, filters: EMPTY_FILTERS }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("fetchSuggestions", () => {
  it("normalizes grouped suggestions", async () => {
    client.GET.mockResolvedValueOnce(
      ok({
        categories: [{ slug: "rosaries", name: "Rosaries" }, { name: "bad" }],
        products: [validProduct, {}],
        sellers: [{ slug: "sventoji", name: "Šventoji" }],
      }),
    );
    const data = await fetchSuggestions("rosary");
    expect(data.categories).toEqual([{ slug: "rosaries", name: "Rosaries" }]);
    expect(data.products).toHaveLength(1);
    expect(data.sellers).toEqual([{ slug: "sventoji", name: "Šventoji" }]);
  });

  it("sends an empty query object when the input is blank", async () => {
    client.GET.mockResolvedValueOnce(ok({}));
    await fetchSuggestions("   ");
    expect(client.GET).toHaveBeenCalledWith("/api/v1/search/suggest/", {
      query: {},
    });
  });
});

describe("recent searches — non-PII localStorage contract", () => {
  it("writes under the fixed key, dedupes, newest first, capped", () => {
    writeRecentSearch("rosary");
    writeRecentSearch("candles");
    writeRecentSearch("rosary");
    expect(readRecentSearches()).toEqual(["rosary", "candles"]);

    for (const term of ["a", "b", "c", "d", "e"]) writeRecentSearch(term);
    expect(readRecentSearches()).toHaveLength(RECENT_SEARCHES_LIMIT);
    expect(JSON.parse(storage.get(SEARCH_STORAGE_KEY) ?? "[]")).toHaveLength(
      RECENT_SEARCHES_LIMIT,
    );
  });

  it("ignores blank input and corrupted storage", () => {
    writeRecentSearch("   ");
    expect(readRecentSearches()).toEqual([]);

    storage.set(SEARCH_STORAGE_KEY, "{not json");
    expect(readRecentSearches()).toEqual([]);

    storage.set(SEARCH_STORAGE_KEY, '"a string"');
    expect(readRecentSearches()).toEqual([]);
  });

  it("survives storage throwing (private mode)", () => {
    storageThrows = true;
    expect(() => writeRecentSearch("rosary")).not.toThrow();
    expect(readRecentSearches()).toEqual([]);
  });
});
