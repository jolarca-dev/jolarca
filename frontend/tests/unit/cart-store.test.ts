import { beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

/* Mock the API client — store API functions must never hit the network in
   unit tests. The real module's exports (ApiError, emitToast…) survive. */
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

/* Minimal localStorage stub for the persist middleware (node environment).
   zustand's default storage reads `window.localStorage`, so both are
   stubbed BEFORE the store module is imported. */
const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
};
vi.stubGlobal("localStorage", localStorageStub);
vi.stubGlobal("window", { localStorage: localStorageStub });

/* Imported after the stub so persist finds storage at creation time. */
const {
  CART_STORAGE_KEY,
  cartSubtotal,
  clampQuantity,
  countItems,
  fetchServerCart,
  includedVat,
  isContractPending,
  isLowStock,
  lineTotal,
  mergeServerCart,
  parseMoney,
  parseServerCart,
  pushLocalDraftToServer,
  serverAddItem,
  serverRemoveItem,
  serverUpdateQuantity,
  selectItemCount,
  selectSubtotal,
  titleFromSlug,
  useCartStore,
} = await import("@/stores/cart-store");

const { apiClient } = await import("@/lib/api-client");
const client = apiClient as unknown as {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
  PATCH: ReturnType<typeof vi.fn>;
  DELETE: ReturnType<typeof vi.fn>;
};

function okResult(data?: unknown) {
  return {
    data,
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

function failResult(status: number, detail: string) {
  return {
    data: undefined,
    error: { detail },
    response: new Response(null, { status }),
  };
}

const item = {
  productId: "p1",
  slug: "altar-linens",
  title: "Altar linens",
  price: "12.50",
  currency: "EUR",
};

beforeAll(() => {
  useCartStore.getState().clearCart();
});

describe("pure money helpers", () => {
  it("parses decimal strings and tolerates garbage", () => {
    expect(parseMoney("12.50")).toBe(12.5);
    expect(parseMoney("abc")).toBe(0);
  });

  it("computes line totals and subtotals", () => {
    expect(lineTotal({ price: "12.50", quantity: 3 })).toBeCloseTo(37.5);
    expect(
      cartSubtotal({
        a: { ...item, quantity: 2 },
        b: { ...item, productId: "p2", price: "5.00", quantity: 1 },
      }),
    ).toBeCloseTo(30);
  });

  it("estimates included VAT at the default 21% rate", () => {
    expect(includedVat(121)).toBeCloseTo(21);
    expect(includedVat(110, 0.1)).toBeCloseTo(10);
    expect(includedVat(0)).toBe(0);
  });
});

describe("quantity + stock rules", () => {
  it("clamps to [1, maxStock]", () => {
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(9, 5)).toBe(5);
    expect(clampQuantity(3.7)).toBe(3);
    expect(clampQuantity(42)).toBe(42);
  });

  it("flags low stock when remaining ≤ threshold", () => {
    expect(isLowStock({ ...item, maxStock: 3, quantity: 1 })).toBe(true);
    expect(isLowStock({ ...item, maxStock: 50, quantity: 1 })).toBe(false);
    expect(isLowStock({ ...item, quantity: 1 })).toBe(false);
  });
});

describe("merge + parse helpers", () => {
  it("server lines win, unknown local lines survive", () => {
    const local = {
      p1: { ...item, quantity: 1 },
      pLocal: { ...item, productId: "pLocal", quantity: 2 },
    };
    const merged = mergeServerCart(local, [
      { ...item, quantity: 4, serverItemId: "srv-1" },
    ]);
    expect(Object.keys(merged).sort()).toEqual(["p1", "pLocal"]);
    expect(merged.p1?.quantity).toBe(4);
    expect(merged.p1?.serverItemId).toBe("srv-1");
    expect(merged.pLocal?.quantity).toBe(2);
  });

  it("humanizes slugs for draft-only lines", () => {
    expect(titleFromSlug("altar-linens")).toBe("altar linens");
  });

  it("parses tolerant server cart payloads, skipping invalid rows", () => {
    const parsed = parseServerCart({
      cart_id: "c-1",
      items: [
        {
          product_id: "p1",
          slug: "altar-linens",
          title: "Altar linens",
          price: "12.50",
          currency: "EUR",
          quantity: 2,
          max_stock: 7,
          seller_id: "s-1",
          seller_name: "Šventoji Workshop",
          id: "srv-1",
        },
        { quantity: 3 }, // no product_id → dropped
      ],
    });
    expect(parsed.cartId).toBe("c-1");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.maxStock).toBe(7);
    expect(parsed.items[0]?.sellerId).toBe("s-1");
    expect(parsed.items[0]?.sellerName).toBe("Šventoji Workshop");
    expect(parseServerCart(undefined)).toEqual({
      cartId: undefined,
      items: [],
    });
  });

  it("treats only 404/405/501 ApiErrors as contract-pending", () => {
    expect(isContractPending(new ApiError(404, "http_404", "nf"))).toBe(true);
    expect(isContractPending(new ApiError(405, "http_405", "na"))).toBe(true);
    expect(isContractPending(new ApiError(501, "http_501", "na"))).toBe(true);
    expect(isContractPending(new ApiError(400, "bad", "bad"))).toBe(false);
    expect(isContractPending(new Error("x"))).toBe(false);
  });
});

describe("store actions", () => {
  it("adds, merges quantities, and announces", () => {
    const store = useCartStore.getState();
    store.addItem(item);
    store.addItem(item, 2);
    const state = useCartStore.getState();
    expect(countItems(state.items)).toBe(3);
    expect(state.announcement).toEqual({
      code: "added",
      title: "Altar linens",
      quantity: 3,
    });
  });

  it("updateQuantity clamps and announces", () => {
    useCartStore.getState().addItem({ ...item, maxStock: 4 }, 3);
    useCartStore.getState().updateQuantity("p1", 99);
    const state = useCartStore.getState();
    expect(state.items.p1?.quantity).toBe(4);
    useCartStore.getState().updateQuantity("missing", 5);
    expect(useCartStore.getState().items.missing).toBeUndefined();
  });

  it("removeItem deletes and announces; rollback restores", () => {
    useCartStore.getState().removeItem("p1");
    expect(useCartStore.getState().items.p1).toBeUndefined();
    useCartStore.getState().rollback();
    expect(useCartStore.getState().items.p1).toBeDefined();
    useCartStore.getState().confirm();
    useCartStore.getState().rollback(); // nothing to restore → no-op
    expect(useCartStore.getState().items.p1).toBeDefined();
  });

  it("clearCart empties everything including sync flags", () => {
    useCartStore
      .getState()
      .applyServerCart([{ ...item, quantity: 1, serverItemId: "s" }], "cart-9");
    expect(useCartStore.getState().serverSynced).toBe(true);
    useCartStore.getState().clearCart();
    const state = useCartStore.getState();
    expect(state.items).toEqual({});
    expect(state.cartId).toBeUndefined();
    expect(state.serverSynced).toBe(false);
  });
});

describe("hydration merge + selectors", () => {
  const persistStore = useCartStore as unknown as {
    persist: { getOptions: () => { merge: unknown } };
  };

  it("rehydrates slim draft lines into display-less items", () => {
    const merge = persistStore.persist.getOptions().merge as (
      persisted: unknown,
      current: Record<string, unknown>,
    ) => { items: Record<string, { title: string; quantity: number }> };
    const merged = merge(
      {
        cartId: "c-7",
        lines: [
          { productId: "p1", slug: "altar-linens", quantity: 2 },
          { productId: "p2" }, // no slug → falls back to productId
          { slug: "no-id" }, // no productId → dropped
          null,
        ],
      },
      { serverSynced: false },
    );
    expect(Object.keys(merged.items).sort()).toEqual(["p1", "p2"]);
    expect(merged.items.p1?.title).toBe("altar linens");
    expect(merged.items.p2?.title).toBe("p2");
    expect(merged.items.p1?.quantity).toBe(2);
  });

  it("tolerates a missing persisted payload", () => {
    const merge = persistStore.persist.getOptions().merge as (
      persisted: unknown,
      current: Record<string, unknown>,
    ) => { items: Record<string, unknown> };
    const merged = merge(undefined, {});
    expect(merged.items).toEqual({});
  });

  it("selectors derive count and subtotal", () => {
    useCartStore.getState().clearCart();
    useCartStore.getState().addItem({ ...item }, 2);
    const state = useCartStore.getState();
    expect(selectItemCount(state)).toBe(2);
    expect(selectSubtotal(state)).toBeCloseTo(25);
    useCartStore.getState().clearCart();
  });
});

describe("persistence — non-PII guarantee", () => {
  it("writes only ids, slugs and quantities to localStorage", () => {
    useCartStore.getState().clearCart();
    useCartStore.getState().addItem({ ...item, imageUrl: "http://x/y.jpg" });
    const raw = storage.get(CART_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw as string) as {
      state: { cartId?: string; lines: Array<Record<string, unknown>> };
    };
    expect(persisted.state.lines).toHaveLength(1);
    const firstLine = persisted.state.lines[0];
    expect(firstLine).toBeDefined();
    expect(Object.keys(firstLine as Record<string, unknown>).sort()).toEqual([
      "productId",
      "quantity",
      "slug",
    ]);
    // No display/PII fields may leak into storage.
    expect(raw).not.toContain("price");
    expect(raw).not.toContain("title");
    expect(raw).not.toContain("imageUrl");
  });
});

describe("server API functions (cart endpoints — closed)", () => {
  it("serverAddItem returns the confirmed line id + quantity", async () => {
    client.POST.mockResolvedValueOnce(okResult({ id: "srv-9", quantity: 3 }));
    await expect(serverAddItem("p1", 2)).resolves.toEqual({
      serverItemId: "srv-9",
      quantity: 3,
    });
    client.POST.mockResolvedValueOnce(okResult());
    await expect(serverAddItem("p1", 1)).resolves.toEqual({
      serverItemId: undefined,
      quantity: undefined,
    });
    client.POST.mockResolvedValueOnce(failResult(400, "invalid_quantity"));
    await expect(serverAddItem("p1", 0)).rejects.toMatchObject({
      status: 400,
      code: "invalid_quantity",
    });
  });

  it("serverUpdateQuantity PATCHes the line id", async () => {
    client.PATCH.mockResolvedValueOnce(okResult());
    await expect(serverUpdateQuantity("srv-1", 3)).resolves.toBeUndefined();
    expect(client.PATCH).toHaveBeenCalledWith(
      "/api/v1/cart/items/{id}/",
      expect.objectContaining({
        params: { path: { id: "srv-1" } },
        body: { quantity: 3 },
      }),
    );
  });

  it("serverRemoveItem DELETEs the line id", async () => {
    client.DELETE.mockResolvedValueOnce(okResult());
    await expect(serverRemoveItem("srv-1")).resolves.toBeUndefined();
  });

  it("fetchServerCart parses the payload and maps 401 to null", async () => {
    client.GET.mockResolvedValueOnce(
      okResult({ cart_id: "c-1", items: [{ product_id: "p1", quantity: 2 }] }),
    );
    const cart = await fetchServerCart();
    expect(cart?.cartId).toBe("c-1");
    expect(cart?.items[0]?.quantity).toBe(2);

    client.GET.mockResolvedValueOnce(failResult(401, "unauthenticated"));
    await expect(fetchServerCart()).resolves.toBeNull();

    client.GET.mockResolvedValueOnce(failResult(500, "boom"));
    await expect(fetchServerCart()).rejects.toMatchObject({ status: 500 });
  });

  it("pushLocalDraftToServer posts the slim draft", async () => {
    client.POST.mockResolvedValueOnce(okResult());
    await expect(
      pushLocalDraftToServer([{ productId: "p1", slug: "s", quantity: 2 }]),
    ).resolves.toBeUndefined();
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/cart/sync/",
      expect.objectContaining({
        body: { items: [{ product_id: "p1", slug: "s", quantity: 2 }] },
      }),
    );
  });
});

describe("server line confirmation + drawer state", () => {
  it("confirmServerLine stamps the server id and authoritative quantity", () => {
    useCartStore.getState().clearCart();
    useCartStore.getState().addItem({ ...item });
    useCartStore.getState().confirmServerLine("p1", "srv-42", 2);
    const stamped = useCartStore.getState().items.p1;
    expect(stamped?.serverItemId).toBe("srv-42");
    expect(stamped?.quantity).toBe(2);
    // Unknown product → no-op.
    useCartStore.getState().confirmServerLine("ghost", "srv-0");
    expect(useCartStore.getState().items.ghost).toBeUndefined();
    useCartStore.getState().clearCart();
  });

  it("drawer open/close is UI state and never persisted", () => {
    expect(useCartStore.getState().drawerOpen).toBe(false);
    useCartStore.getState().openDrawer();
    expect(useCartStore.getState().drawerOpen).toBe(true);
    useCartStore.getState().closeDrawer();
    expect(useCartStore.getState().drawerOpen).toBe(false);
    expect(storage.get(CART_STORAGE_KEY) ?? "").not.toContain("drawerOpen");
  });
});
