"use client";

/**
 * Cart state (zustand) — guest draft + optimistic authenticated mutations.
 *
 * Two ownership tiers, by design:
 *  - Guest cart: localStorage draft under `jol_cart_draft`. NON-PII ONLY —
 *    persisted shape is { cartId?, lines: [{ productId, slug, quantity }] }.
 *    No prices, names, addresses, or images are ever written to storage.
 *  - Authenticated cart: the backend is the source of truth; every mutation
 *    is applied optimistically, confirmed by the API in the background, and
 *    rolled back (+ toast) on failure.
 *
 * Contract reality: the cart endpoints shipped with GAP-O01/O02/O05/O06/O07
 * (orders_app cart views). Defensive degradation stays in place anyway —
 * 404/405/501 responses are treated as "contract pending": the local draft
 * is kept (nothing is faked — the UI surfaces the pending state) instead of
 * rolling back, so the cart stays usable. Real errors (400/409/500…) still
 * roll back.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ApiError, apiClient } from "@/lib/api-client";

/* -------------------------------------------------------------------------- */
/* Model                                                                       */
/* -------------------------------------------------------------------------- */

export interface CartItem {
  productId: string;
  slug: string;
  title: string;
  /** Gross unit price as a decimal string, e.g. "12.50". */
  price: string;
  currency: string;
  quantity: number;
  imageUrl?: string;
  maxStock?: number;
  /** Seller of record — display + future split-checkout grouping. */
  sellerId?: string;
  sellerName?: string;
  /** Server-side cart line id once GAP-O02 confirms the item. */
  serverItemId?: string;
}

/**
 * What survives a page reload for guests: ids, slugs and quantities only.
 * Display fields are refilled by server sync (GAP-O01) once it lands.
 */
export interface PersistedLine {
  productId: string;
  slug: string;
  quantity: number;
}

interface PersistedDraft {
  cartId?: string;
  lines: PersistedLine[];
}

/** Screen-reader announcement descriptor; the UI layer localizes it. */
export interface CartAnnouncement {
  code: "added" | "removed" | "updated";
  title: string;
  quantity?: number;
}

export interface CartState {
  items: Record<string, CartItem>;
  cartId?: string;
  /** True once a server cart has replaced the local draft this session. */
  serverSynced: boolean;
  announcement: CartAnnouncement | null;
  /** Snapshot for rollback of the in-flight optimistic mutation. */
  previousItems: Record<string, CartItem> | null;
  /** Drawer visibility — UI state only, never persisted. */
  drawerOpen: boolean;

  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** GET /cart + POST /cart/sync merge (see useCartSyncOnLogin). */
  applyServerCart: (items: CartItem[], cartId?: string) => void;
  snapshot: () => void;
  confirm: () => void;
  rollback: () => void;
  announce: (announcement: CartAnnouncement | null) => void;
  /** Stamp the server-confirmed line id (and authoritative quantity) onto
   * an optimistically added item so later PATCH/DELETE can address it. */
  confirmServerLine: (
    productId: string,
    serverItemId: string,
    quantity?: number,
  ) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers (unit-tested)                                                  */
/* -------------------------------------------------------------------------- */

/** Default VAT rate used for the *estimate* only (LT standard; final tax is
 * computed server-side at checkout — payments_app/tax_app). */
export const DEFAULT_VAT_RATE = 0.21;

/** Items at or below this remaining stock get an availability warning. */
export const LOW_STOCK_THRESHOLD = 5;

export function parseMoney(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function lineTotal(item: Pick<CartItem, "price" | "quantity">): number {
  return parseMoney(item.price) * item.quantity;
}

export function cartSubtotal(items: Record<string, CartItem>): number {
  return Object.values(items).reduce((sum, item) => sum + lineTotal(item), 0);
}

/** VAT included in gross prices: gross - gross / (1 + rate). */
export function includedVat(gross: number, rate = DEFAULT_VAT_RATE): number {
  return gross - gross / (1 + rate);
}

export function countItems(items: Record<string, CartItem>): number {
  return Object.values(items).reduce((sum, item) => sum + item.quantity, 0);
}

/** 1 ≤ quantity ≤ maxStock (maxStock optional). */
export function clampQuantity(quantity: number, maxStock?: number): number {
  const floor = Math.max(1, Math.floor(quantity));
  return maxStock !== undefined ? Math.min(floor, maxStock) : floor;
}

/** True when the remaining stock warrants a warning. */
export function isLowStock(item: CartItem): boolean {
  if (item.maxStock === undefined) return false;
  return item.maxStock - item.quantity <= LOW_STOCK_THRESHOLD;
}

/** Merge strategy when a server cart arrives: server lines win; local lines
 * the server does not know yet are kept as drafts (survive sync round-trips
 * until /cart/sync/ accepts them). */
export function mergeServerCart(
  local: Record<string, CartItem>,
  server: CartItem[],
): Record<string, CartItem> {
  const merged: Record<string, CartItem> = {};
  for (const item of Object.values(local)) {
    merged[item.productId] = item;
  }
  for (const item of server) {
    merged[item.productId] = item;
  }
  return merged;
}

/** Humanize a slug into a best-effort display title for draft-only lines
 * (e.g. "altar-linens" → "altar linens"). Not fake data — the slug is the
 * user's own cart entry. */
export function titleFromSlug(slug: string): string {
  return slug.replace(/-/g, " ");
}

/** Contract-gap degradation (defensive): if the backend ever answers
 * 404/405/501 on a cart route, keep the local draft instead of rolling
 * back; every other status is a real error. */
export function isContractPending(error: unknown): boolean {
  return error instanceof ApiError && [404, 405, 501].includes(error.status);
}

/* -------------------------------------------------------------------------- */
/* Server API — orders_app cart endpoints (GAP-O01/O02/O05/O06/O07, closed)  */
/* -------------------------------------------------------------------------- */

const CART_PATH = "/api/v1/cart/" as never;
const CART_ITEMS_PATH = "/api/v1/cart/items/" as never;

export async function serverAddItem(
  productId: string,
  quantity: number,
): Promise<{ serverItemId?: string; quantity?: number }> {
  // GAP-O02 (closed): POST /api/v1/cart/items/ — the 201 carries the
  // server-assigned line id and the authoritative (summed) quantity.
  const res = await apiClient.POST(CART_ITEMS_PATH, {
    body: { product_id: productId, quantity },
  } as never);
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  return {
    serverItemId: typeof r.id === "string" ? r.id : undefined,
    quantity: typeof r.quantity === "number" ? r.quantity : undefined,
  };
}

export async function serverUpdateQuantity(
  serverItemId: string,
  quantity: number,
): Promise<void> {
  // GAP-O05: PATCH /api/v1/cart/items/{id}/
  const res = await apiClient.PATCH(
    "/api/v1/cart/items/{id}/" as never,
    {
      params: { path: { id: serverItemId } },
      body: { quantity },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

export async function serverRemoveItem(serverItemId: string): Promise<void> {
  // GAP-O06: DELETE /api/v1/cart/items/{id}/
  const res = await apiClient.DELETE(
    "/api/v1/cart/items/{id}/" as never,
    {
      params: { path: { id: serverItemId } },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/** Zod-lite tolerant parse of the server cart payload (GAP-O01). */
export function parseServerCart(data: unknown): {
  cartId?: string;
  items: CartItem[];
} {
  const record = (data ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items: CartItem[] = rawItems
    .map((raw): CartItem | null => {
      const r = raw as Record<string, unknown>;
      const productId = typeof r.product_id === "string" ? r.product_id : "";
      if (!productId) return null;
      return {
        productId,
        slug: typeof r.slug === "string" ? r.slug : productId,
        title:
          typeof r.title === "string"
            ? r.title
            : titleFromSlug(String(r.slug ?? productId)),
        price: typeof r.price === "string" ? r.price : "0",
        currency: typeof r.currency === "string" ? r.currency : "EUR",
        quantity: typeof r.quantity === "number" ? r.quantity : 1,
        imageUrl: typeof r.image_url === "string" ? r.image_url : undefined,
        maxStock: typeof r.max_stock === "number" ? r.max_stock : undefined,
        sellerId: typeof r.seller_id === "string" ? r.seller_id : undefined,
        sellerName:
          typeof r.seller_name === "string" ? r.seller_name : undefined,
        serverItemId: typeof r.id === "string" ? r.id : undefined,
      };
    })
    .filter((parsed): parsed is CartItem => parsed !== null);
  return {
    cartId: typeof record.cart_id === "string" ? record.cart_id : undefined,
    items,
  };
}

/** GET /api/v1/cart/ (GAP-O01) — authenticated users only (the caller must
 * check; a guest call would trip the 401→login middleware). */
export async function fetchServerCart(): Promise<{
  cartId?: string;
  items: CartItem[];
} | null> {
  const res = await apiClient.GET(CART_PATH, undefined as never);
  if (res.response.status === 401) return null;
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  return parseServerCart(res.data);
}

/** POST /api/v1/cart/sync/ (GAP-O07) — push the guest draft on login. */
export async function pushLocalDraftToServer(
  lines: PersistedLine[],
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/cart/sync/" as never,
    {
      body: {
        items: lines.map((line) => ({
          product_id: line.productId,
          slug: line.slug,
          quantity: line.quantity,
        })),
      },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

export const CART_STORAGE_KEY = "jol_cart_draft";

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      cartId: undefined,
      serverSynced: false,
      announcement: null,
      previousItems: null,
      drawerOpen: false,

      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items[item.productId];
          const nextQuantity = clampQuantity(
            (existing?.quantity ?? 0) + quantity,
            item.maxStock,
          );
          return {
            previousItems: state.items,
            items: {
              ...state.items,
              [item.productId]: {
                ...item,
                title: item.title || titleFromSlug(item.slug),
                quantity: nextQuantity,
              },
            },
            announcement: {
              code: "added",
              title: item.title || titleFromSlug(item.slug),
              quantity: nextQuantity,
            },
          };
        }),

      removeItem: (productId) =>
        set((state) => {
          const gone = state.items[productId];
          return {
            previousItems: state.items,
            items: Object.fromEntries(
              Object.entries(state.items).filter(([id]) => id !== productId),
            ),
            announcement: gone
              ? { code: "removed", title: gone.title, quantity: gone.quantity }
              : null,
          };
        }),

      updateQuantity: (productId, quantity) =>
        set((state) => {
          const item = state.items[productId];
          if (!item) return state;
          const next = clampQuantity(quantity, item.maxStock);
          return {
            previousItems: state.items,
            items: { ...state.items, [productId]: { ...item, quantity: next } },
            announcement: {
              code: "updated",
              title: item.title,
              quantity: next,
            },
          };
        }),

      clearCart: () =>
        set({
          items: {},
          cartId: undefined,
          serverSynced: false,
          announcement: null,
          previousItems: null,
        }),

      applyServerCart: (serverItems, cartId) =>
        set((state) => ({
          items: mergeServerCart(state.items, serverItems),
          cartId: cartId ?? state.cartId,
          serverSynced: true,
        })),

      snapshot: () => set((state) => ({ previousItems: state.items })),
      confirm: () => set({ previousItems: null }),
      rollback: () =>
        set((state) =>
          state.previousItems
            ? { items: state.previousItems, previousItems: null }
            : state,
        ),
      announce: (announcement) => set({ announcement }),
      confirmServerLine: (productId, serverItemId, quantity) =>
        set((state) => {
          const item = state.items[productId];
          if (!item) return state;
          return {
            items: {
              ...state.items,
              [productId]: {
                ...item,
                serverItemId,
                ...(quantity !== undefined ? { quantity } : {}),
              },
            },
          };
        }),
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
    }),
    {
      name: CART_STORAGE_KEY,
      version: 1,
      // NON-PII guarantee: only ids, slugs and quantities leave memory.
      partialize: (state): PersistedDraft => ({
        cartId: state.cartId,
        lines: Object.values(state.items).map(
          ({ productId, slug, quantity }) => ({ productId, slug, quantity }),
        ),
      }),
      // Slim draft rehydrates as display-less items; server sync refills.
      merge: (persisted, current) => {
        const draft = (persisted ?? {}) as Partial<PersistedDraft>;
        const items: Record<string, CartItem> = {};
        for (const line of draft.lines ?? []) {
          if (!line?.productId) continue;
          items[line.productId] = {
            productId: line.productId,
            slug: line.slug ?? line.productId,
            title: titleFromSlug(line.slug ?? line.productId),
            price: "0",
            currency: "EUR",
            quantity: Math.max(1, line.quantity ?? 1),
          };
        }
        return { ...current, items, cartId: draft.cartId };
      },
    },
  ),
);

/** Derived item count for badge etc. (selector-friendly). */
export function selectItemCount(state: CartState): number {
  return countItems(state.items);
}

/** Derived subtotal (gross) for drawer/page summaries. */
export function selectSubtotal(state: CartState): number {
  return cartSubtotal(state.items);
}
