/**
 * Search domain — queries travel via the API client only; the PAGE URL
 * never carries query strings (privacy posture: nothing typed lands in
 * history/logs via URLs). Recent searches persist to localStorage under a
 * fixed key and contain query text only (non-PII by contract — capped at
 * 5 entries). Pagination is explicit (no infinite scroll, ADR-0009).
 */
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";
import { ProductSchema, type Product } from "@/server/catalog";

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_STORAGE_KEY = "jol_search_recent";
export const RECENT_SEARCHES_LIMIT = 5;

/* -------------------------------------------------------------------------- */
/* Query building (pure — unit-tested)                                         */
/* -------------------------------------------------------------------------- */

export interface SearchFilters {
  category: string;
  priceMin: string;
  priceMax: string;
  seller: string;
  /** "" | "in_stock" */
  availability: string;
  /** "" | "courier" | "locker" */
  delivery: string;
}

export const EMPTY_FILTERS: SearchFilters = {
  category: "",
  priceMin: "",
  priceMax: "",
  seller: "",
  availability: "",
  delivery: "",
};

export interface SearchQuery {
  q: string;
  page: number;
  filters: SearchFilters;
}

/** Only non-empty fields travel; empty strings never become params. The
 * POST body carries the same shape (queries never live in URLs). */
export function buildSearchQuery(query: SearchQuery): Record<string, string> {
  const params: Record<string, string> = {};
  const q = query.q.trim();
  if (q) params.q = q;
  if (query.page > 1) params.page = String(query.page);
  const f = query.filters;
  if (f.category) params.category = f.category;
  if (f.priceMin) params.price_min = f.priceMin;
  if (f.priceMax) params.price_max = f.priceMax;
  if (f.seller) params.seller = f.seller;
  if (f.availability) params.availability = f.availability;
  if (f.delivery) params.delivery = f.delivery;
  return params;
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export interface SearchResults {
  products: Product[];
  page: number;
  totalPages: number;
  /** Honest ranking marker from the backend ("stub" under MVP-Q1). */
  ranking: string;
}

/** POST /api/v1/search/ (GAP-S01) — malformed products are dropped, not thrown.
 * The query travels in the JSON body so typed terms never reach access
 * logs or history via URLs (ADR-0009). */
export async function fetchSearch(query: SearchQuery): Promise<SearchResults> {
  const res = await apiClient.POST(
    "/api/v1/search/" as never,
    {
      body: buildSearchQuery(query),
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  const products = raw
    .map((entry) => ProductSchema.safeParse(entry))
    .filter((parsed): parsed is z.SafeParseSuccess<Product> => parsed.success)
    .map((parsed) => parsed.data);
  return {
    products,
    page: typeof r.page === "number" ? r.page : query.page,
    totalPages: typeof r.total_pages === "number" ? r.total_pages : 1,
    ranking: typeof r.ranking === "string" ? r.ranking : "",
  };
}

/* -------------------------------------------------------------------------- */
/* Suggestions (command palette)                                               */
/* -------------------------------------------------------------------------- */

export interface SearchSuggestions {
  categories: Array<{ slug: string; name: string }>;
  products: Product[];
  sellers: Array<{ slug: string; name: string }>;
}

/** GET /api/v1/search/suggest/ (GAP-S02). */
export async function fetchSuggestions(q: string): Promise<SearchSuggestions> {
  const res = await apiClient.GET(
    "/api/v1/search/suggest/" as never,
    {
      query: q.trim() ? { q: q.trim() } : {},
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;

  const slugNames = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .map((entry): { slug: string; name: string } | null => {
        const item = entry as Record<string, unknown>;
        if (typeof item.slug !== "string" || typeof item.name !== "string") {
          return null;
        }
        return { slug: item.slug, name: item.name };
      })
      .filter((item): item is { slug: string; name: string } => item !== null);

  return {
    categories: slugNames(r.categories),
    products: (Array.isArray(r.products) ? r.products : [])
      .map((entry) => ProductSchema.safeParse(entry))
      .filter((parsed): parsed is z.SafeParseSuccess<Product> => parsed.success)
      .map((parsed) => parsed.data),
    sellers: slugNames(r.sellers),
  };
}

/* -------------------------------------------------------------------------- */
/* Recent searches — localStorage, query text only (non-PII contract)          */
/* -------------------------------------------------------------------------- */

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(SEARCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .slice(0, RECENT_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

export function writeRecentSearch(term: string): void {
  const q = term.trim();
  if (!q) return;
  try {
    const next = [
      q,
      ...readRecentSearches().filter((entry) => entry !== q),
    ].slice(0, RECENT_SEARCHES_LIMIT);
    window.localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — recents simply don't persist.
  }
}
