/**
 * Server-only catalog data layer (RSC). React Server Components fetch here;
 * client islands never import this file.
 *
 * Contract reality (ADR-0007): the remaining catalog endpoints are
 * registered gaps (GAP-P02/P04/P05, GAP-V05/V06). Their fetchers speak the
 * specified contract through the Sprint-0 API client and validate the
 * payload with zod; until the backend ships them, fetchers throw
 * `ApiError` and pages render their sanctioned ContractGapNotice — never
 * fake data. The home endpoint (GAP-P01) is closed and fully typed.
 *
 * When a gap closes: remove the `as never` casts (paths become typed in the
 * generated client) and delete the gap entry — nothing else changes here.
 */
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";

/* -------------------------------------------------------------------------- */
/* Schemas — tolerant of optional backend fields, strict on money shapes       */
/* -------------------------------------------------------------------------- */

const money = z.string().regex(/^\d{0,10}(\.\d{0,2})?$/);

export const ProductImageSchema = z.object({
  url: z.string(),
  alt: z.string().default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const SellerRefSchema = z.object({
  slug: z.string(),
  name: z.string(),
  verified: z.boolean().default(false),
  logo_url: z.string().nullish(),
});
export type SellerRef = z.infer<typeof SellerRefSchema>;

export const RatingSchema = z.object({
  average: z.number().min(0).max(5),
  count: z.number().int().nonnegative(),
});

export const ProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  price_gross: money,
  currency: z.string().length(3),
  image: ProductImageSchema.nullish(),
  images: z.array(ProductImageSchema).default([]),
  description_html: z.string().default(""),
  seller: SellerRefSchema.nullish(),
  rating: RatingSchema.nullish(),
  vat_note: z.string().nullish(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().default(""),
  image: ProductImageSchema.nullish(),
});
export type Category = z.infer<typeof CategorySchema>;

export const FacetSellerSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});
export type FacetSeller = z.infer<typeof FacetSellerSchema>;

/** GAP-P02 category page: pagination envelope + meta + facets. */
export const CategoryPageSchema = paginatedSchema(ProductSchema).extend({
  category: CategorySchema,
  facets: z
    .object({ sellers: z.array(FacetSellerSchema).default([]) })
    .default({ sellers: [] }),
});
export type CategoryPage = z.infer<typeof CategoryPageSchema>;

export type CategoryFilters = {
  priceMin?: string;
  priceMax?: string;
  sellers?: string[];
  sort?: "newest" | "price_asc" | "price_desc" | "name";
};

export const HomeContentSchema = z.object({
  hero: z
    .object({
      title: z.string(),
      subtitle: z.string().default(""),
      image: ProductImageSchema.nullish(),
    })
    .nullish(),
  categories: z.array(CategorySchema).default([]),
  featured: z.array(ProductSchema).default([]),
});
export type HomeContent = z.infer<typeof HomeContentSchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    count: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
    results: z.array(item),
  });
}
export type Paginated<T> = {
  count: number;
  page: number;
  page_size: number;
  results: T[];
};

export const SellerSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().default(""),
  logo_url: z.string().nullish(),
  verified: z.boolean().default(false),
  location: z.string().default(""),
  country: z.string().length(2).default(""),
  member_since: z.string().default(""),
});
export type Seller = z.infer<typeof SellerSchema>;

/* -------------------------------------------------------------------------- */
/* Fetchers — all through the generated client; validated at the boundary      */
/* -------------------------------------------------------------------------- */

export const PAGE_SIZE = 24;

async function fetchValidated<S extends z.ZodType>(
  schema: S,
  path: string,
  init?: { query?: Record<string, unknown> },
): Promise<z.infer<S>> {
  // `as never`: catalog paths are registered gaps; casts disappear when the
  // backend closes them and the client regenerates. The collapsed return
  // shape is widened back to the openapi-fetch result contract here.
  // openapi-fetch 0.17 nests query params under `params` — a top-level
  // `query` key is silently dropped (pagination/filters would never reach
  // the backend).
  const res = (await apiClient.GET(
    path as never,
    {
      params: { query: init?.query ?? {} },
    } as never,
  )) as {
    data?: unknown;
    error?: unknown;
    response: Response;
  };
  if (!res.response.ok || res.data === undefined) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  return schema.parse(res.data);
}

/** Deduplicated per render: three home sections share one request. */
export const getHomeContent = cache(async (): Promise<HomeContent> => {
  // GAP-P01 closed: path is typed in the generated client — no cast.
  // Request-scoped locale (setRequestLocale) drives Accept-Language so the
  // backend resolves modeltranslation content to the route language.
  const locale = await getLocale();
  const res = await apiClient.GET("/api/v1/catalog/home/", {
    headers: { "Accept-Language": locale },
  });
  if (!res.response.ok || res.data === undefined) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  return HomeContentSchema.parse(res.data);
});

export function getCategoryProducts(
  slug: string,
  page: number,
  filters: CategoryFilters = {},
): Promise<CategoryPage> {
  // cache(): metadata + page body share one request per render.
  return cachedCategoryProducts(slug, page, filters);
}

const cachedCategoryProducts = cache(
  (slug: string, page: number, filters: CategoryFilters = {}) => {
    const query: Record<string, string | number> = {
      page,
      page_size: PAGE_SIZE,
    };
    if (filters.priceMin) query.price_min = filters.priceMin;
    if (filters.priceMax) query.price_max = filters.priceMax;
    if (filters.sellers?.length) query.sellers = filters.sellers.join(",");
    if (filters.sort && filters.sort !== "newest") query.sort = filters.sort;
    return fetchValidated(
      CategoryPageSchema,
      `/api/v1/categories/${encodeURIComponent(slug)}/products/`,
      { query },
    );
  },
);

export function getProduct(slug: string): Promise<Product> {
  return fetchValidated(
    ProductSchema,
    `/api/v1/products/${encodeURIComponent(slug)}/`,
  );
}

export function getRelatedProducts(slug: string): Promise<Product[]> {
  return fetchValidated(
    z.array(ProductSchema),
    `/api/v1/products/${encodeURIComponent(slug)}/related/`,
  );
}

export function getSeller(slug: string): Promise<Seller> {
  return fetchValidated(
    SellerSchema,
    `/api/v1/sellers/${encodeURIComponent(slug)}/`,
  );
}

export function getSellerProducts(
  slug: string,
  page: number,
): Promise<Paginated<Product>> {
  return fetchValidated(
    paginatedSchema(ProductSchema),
    `/api/v1/sellers/${encodeURIComponent(slug)}/products/`,
    { query: { page, page_size: PAGE_SIZE } },
  );
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers (server-safe)                                           */
/* -------------------------------------------------------------------------- */

/** Locale-aware money formatting; BCP-47 tag straight from the route. */
export function formatPrice(
  value: string,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(value));
}
