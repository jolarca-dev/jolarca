"use client";

/**
 * Cart hooks — thin React layer over the zustand store. Optimistic policy:
 * every mutation updates local state first; when the user is authenticated
 * the server call runs in the background and failures roll back + toast.
 *
 * Defensive degradation: if a cart route ever answers 404/405/501, the
 * local draft is kept (the cart remains usable, nothing is faked) and a
 * single info toast surfaces it; real errors roll back with an error toast.
 */
import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useIsAuthenticated } from "@/hooks/use-auth";
import { emitToast, isApiError } from "@/lib/api-client";
import {
  fetchServerCart,
  isContractPending,
  pushLocalDraftToServer,
  selectItemCount,
  selectSubtotal,
  serverAddItem,
  serverRemoveItem,
  serverUpdateQuantity,
  useCartStore,
  type CartItem,
} from "@/stores/cart-store";

/* -------------------------------------------------------------------------- */
/* Selectors                                                                   */
/* -------------------------------------------------------------------------- */

export function useCartItems(): CartItem[] {
  // useShallow: Object.values yields a fresh array per snapshot; without
  // shallow memoization useSyncExternalStore loops during hydration
  // (zustand v5 compares selector output by reference).
  return useCartStore(useShallow((s) => Object.values(s.items)));
}

/** Gross subtotal across all lines. */
export function useCartTotal(): number {
  return useCartStore(selectSubtotal);
}

/** Total quantity across all lines (badge count). */
export function useCartItemCount(): number {
  return useCartStore(selectItemCount);
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export interface AddToCartInput {
  productId: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  imageUrl?: string;
  maxStock?: number;
  sellerId?: string;
  sellerName?: string;
  quantity?: number;
}

/**
 * Optimistic add: store updates instantly; authenticated users get a
 * background POST /api/v1/cart/items/ that rolls back on real errors.
 * Returns false when the mutation was rolled back (caller may reflect it).
 */
export function useAddToCart() {
  const isAuthenticated = useIsAuthenticated();
  const addItem = useCartStore((s) => s.addItem);
  const rollback = useCartStore((s) => s.rollback);
  const confirm = useCartStore((s) => s.confirm);

  return useCallback(
    async (input: AddToCartInput): Promise<boolean> => {
      const { quantity, ...item } = input;
      addItem(item, quantity ?? 1);
      if (!isAuthenticated) {
        // Guest cart is the draft itself — nothing to confirm.
        confirm();
        return true;
      }
      try {
        const confirmed = await serverAddItem(input.productId, quantity ?? 1);
        if (confirmed.serverItemId) {
          useCartStore
            .getState()
            .confirmServerLine(
              input.productId,
              confirmed.serverItemId,
              confirmed.quantity,
            );
        }
        confirm();
        return true;
      } catch (error) {
        if (isContractPending(error)) {
          // Contract pending: keep the draft, inform once, never fake success.
          confirm();
          emitToast({ variant: "info", code: "cart_sync_pending" });
          return true;
        }
        rollback();
        emitToast({
          variant: "error",
          code: isApiError(error) ? error.code : "cart_add_failed",
        });
        return false;
      }
    },
    [isAuthenticated, addItem, rollback, confirm],
  );
}

/** Optimistic quantity change with PATCH confirmation (GAP-O05). */
export function useUpdateQuantity() {
  const isAuthenticated = useIsAuthenticated();
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const rollback = useCartStore((s) => s.rollback);
  const confirm = useCartStore((s) => s.confirm);

  return useCallback(
    async (productId: string, quantity: number): Promise<void> => {
      const item = useCartStore.getState().items[productId];
      if (!item) return;
      updateQuantity(productId, quantity);
      if (!isAuthenticated) {
        confirm();
        return;
      }
      try {
        // Without a confirmed server line there is nothing to PATCH yet —
        // the draft carries the change until the add POST assigned an id.
        if (item.serverItemId) {
          await serverUpdateQuantity(item.serverItemId, quantity);
        }
        confirm();
      } catch (error) {
        if (isContractPending(error)) {
          confirm();
          emitToast({ variant: "info", code: "cart_sync_pending" });
          return;
        }
        rollback();
        emitToast({
          variant: "error",
          code: isApiError(error) ? error.code : "cart_update_failed",
        });
      }
    },
    [isAuthenticated, updateQuantity, rollback, confirm],
  );
}

/** Optimistic removal with DELETE confirmation (GAP-O06). */
export function useRemoveItem() {
  const isAuthenticated = useIsAuthenticated();
  const removeItem = useCartStore((s) => s.removeItem);
  const rollback = useCartStore((s) => s.rollback);
  const confirm = useCartStore((s) => s.confirm);

  return useCallback(
    async (productId: string): Promise<void> => {
      const item = useCartStore.getState().items[productId];
      if (!item) return;
      removeItem(productId);
      if (!isAuthenticated) {
        confirm();
        return;
      }
      try {
        if (item.serverItemId) {
          await serverRemoveItem(item.serverItemId);
        }
        confirm();
      } catch (error) {
        if (isContractPending(error)) {
          confirm();
          emitToast({ variant: "info", code: "cart_sync_pending" });
          return;
        }
        rollback();
        emitToast({
          variant: "error",
          code: isApiError(error) ? error.code : "cart_remove_failed",
        });
      }
    },
    [isAuthenticated, removeItem, rollback, confirm],
  );
}

/* -------------------------------------------------------------------------- */
/* Server sync                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * syncWithServer — call once the session is known-authenticated:
 *  1. POST the guest draft to /cart/sync/ (GAP-O07) so nothing is lost,
 *  2. GET /cart/ (GAP-O01) and merge — server lines win, unknown local
 *     lines stay as drafts for the next sync attempt.
 */
export async function syncWithServer(): Promise<void> {
  const state = useCartStore.getState();
  const draft = Object.values(state.items).map(
    ({ productId, slug, quantity }) => ({ productId, slug, quantity }),
  );

  if (draft.length > 0) {
    try {
      await pushLocalDraftToServer(draft);
    } catch (error) {
      if (!isContractPending(error)) {
        emitToast({
          variant: "warning",
          code: isApiError(error) ? error.code : "cart_sync_failed",
        });
      }
    }
  }

  try {
    const serverCart = await fetchServerCart();
    if (serverCart) {
      state.applyServerCart(serverCart.items, serverCart.cartId);
    }
  } catch (error) {
    if (!isContractPending(error)) {
      emitToast({
        variant: "warning",
        code: isApiError(error) ? error.code : "cart_sync_failed",
      });
    }
  }
}

/**
 * Fires when a session appears (login, or discovery on load): pushes the
 * local draft and merges the server cart. Runs once per session identity.
 */
export function useCartSyncOnLogin(): void {
  const isAuthenticated = useIsAuthenticated();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === "session") return;
    syncedFor.current = "session";
    void syncWithServer();
  }, [isAuthenticated]);
}
