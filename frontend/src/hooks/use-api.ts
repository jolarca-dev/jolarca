"use client";

/**
 * React Query (TanStack Query v5) hook factory over the typed API client.
 * Infrastructure layer only — no business logic, no feature knowledge.
 *
 * Cache policy:
 *  - catalog-like reads (products/categories/sellers/search): staleTime 5m
 *  - volatile state (cart/checkout/auth/orders) and all mutations: staleTime 0
 *  - gcTime (formerly cacheTime): 30m everywhere
 *
 * SSR-safety: nothing here touches `window` at module scope; the browser
 * QueryClient is a lazy singleton, and server renders get a fresh instance
 * per request (no cross-request cache leakage in RSC).
 */
import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { apiClient, unwrap } from "@/lib/api-client";
import type { paths } from "@/generated/api";

/* -------------------------------------------------------------------------- */
/* Path unions derived from the generated contract                              */
/* -------------------------------------------------------------------------- */

/** Paths exposing GET. */
export type GetPath = {
  [K in keyof paths]: [paths[K]["get"]] extends [never] ? never : K;
}[keyof paths];

/** Paths exposing POST (mutations in the current contract are POST-based). */
export type PostPath = {
  [K in keyof paths]: [paths[K]["post"]] extends [never] ? never : K;
}[keyof paths];

/* -------------------------------------------------------------------------- */
/* Cache policy                                                                 */
/* -------------------------------------------------------------------------- */

export const FIVE_MINUTES = 5 * 60 * 1000;
export const THIRTY_MINUTES = 30 * 60 * 1000;

const VOLATILE_PATTERN = /\/(cart|checkout|auth|orders)\b/;
const CATALOG_PATTERN = /\/(products|categories|sellers|search)\b/;

/** staleTime by data class; unknown paths fail safe at 0 (always fresh). */
export function staleTimeFor(path: string): number {
  if (VOLATILE_PATTERN.test(path)) return 0;
  if (CATALOG_PATTERN.test(path)) return FIVE_MINUTES;
  return 0;
}

/* -------------------------------------------------------------------------- */
/* SSR-safe QueryClient                                                         */
/* -------------------------------------------------------------------------- */

const defaultOptions = {
  queries: {
    gcTime: THIRTY_MINUTES,
    retry: 1, // dignified UX: one retry, then surface the ApiError
    refetchOnWindowFocus: false,
  },
};

let browserQueryClient: QueryClient | undefined;

/** Browser: singleton. Server: fresh instance per render (SSR-safe). */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return new QueryClient({ defaultOptions });
  }
  if (!browserQueryClient) {
    browserQueryClient = new QueryClient({ defaultOptions });
  }
  return browserQueryClient;
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                  */
/* -------------------------------------------------------------------------- */

export interface QueryOptions {
  /** Skip firing (e.g. waiting for a required param). */
  enabled?: boolean;
  /** Override the policy-driven staleTime. */
  staleTime?: number;
}

/**
 * Typed GET hook. `init` carries path/query/header params exactly as the
 * generated contract defines them for this path.
 */
export function useApiQuery<P extends GetPath>(
  path: P,
  init?: Record<string, unknown>,
  options?: QueryOptions,
): UseQueryResult {
  return useQuery({
    queryKey: [path, init ?? null],
    // `as never`: openapi-fetch narrows per literal path; the union call
    // site needs this single cast. Types re-narrow on the response side.
    queryFn: async () =>
      unwrap(await apiClient.GET(path as never, init as never)),
    staleTime: options?.staleTime ?? staleTimeFor(path),
    gcTime: THIRTY_MINUTES,
    enabled: options?.enabled,
  });
}

export interface PaginatedParams {
  page?: number;
  page_size?: number;
  [key: string]: unknown;
}

/**
 * Paginated GET hook — keeps the previous page rendered while the next one
 * loads (no layout jumps; CLS-sensitive by design).
 */
export function useApiPaginatedQuery<P extends GetPath>(
  path: P,
  params: PaginatedParams,
  options?: QueryOptions,
): UseQueryResult {
  return useQuery({
    queryKey: [path, params],
    queryFn: async () =>
      unwrap(await apiClient.GET(path as never, { query: params } as never)),
    staleTime: options?.staleTime ?? staleTimeFor(path),
    gcTime: THIRTY_MINUTES,
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}

/* -------------------------------------------------------------------------- */
/* Mutation hook                                                                */
/* -------------------------------------------------------------------------- */

export interface MutationOptions {
  /** Query keys invalidated on success (e.g. [["/api/v1/cart/"]]). */
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
}

/**
 * Typed POST mutation. Idempotency-Key and contract-specific headers belong
 * at the call site via `init.header` — this factory stays generic.
 * PATCH/DELETE variants land when the backend contract exposes them.
 */
export function useApiMutation<P extends PostPath>(
  path: P,
  options?: MutationOptions,
): UseMutationResult<unknown, Error, Record<string, unknown> | undefined> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (init?: Record<string, unknown>) =>
      unwrap(await apiClient.POST(path as never, init as never)),
    onSuccess: () => {
      for (const key of options?.invalidateKeys ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
