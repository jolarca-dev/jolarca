"use client";

/**
 * Add-to-cart client island — the ONLY client JS on a product card.
 * Optimistic via useAddToCart (src/hooks/use-cart.ts): the badge and any
 * mounted cart surface update instantly; the background POST confirms or
 * rolls back (+ toast). States: idle → loading (spinner) → success
 * (checkmark, 1s) → idle; failures surface through the hook's error toast.
 * Screen-reader announcements come from the store (header CartAnnouncer).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useAddToCart } from "@/hooks/use-cart";
import { useCartStore } from "@/stores/cart-store";

const SUCCESS_MS = 1000;

export function AddToCartButton({
  productId,
  slug,
  title,
  priceGross,
  currency,
  imageUrl,
  maxStock,
  sellerId,
  sellerName,
  variant = "default",
  openDrawer = false,
}: {
  productId: string;
  slug: string;
  title: string;
  priceGross: string;
  currency: string;
  imageUrl?: string;
  maxStock?: number;
  sellerId?: string;
  sellerName?: string;
  /** Full-width card/PDP button or an icon-only compact square for grids. */
  variant?: "default" | "compact";
  /** Pop the header drawer open after a successful add. */
  openDrawer?: boolean;
}) {
  const t = useTranslations("common");
  const addToCart = useAddToCart();
  const drawerOpen = useCartStore((s) => s.openDrawer);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    [],
  );

  async function handleAdd() {
    if (status !== "idle") return;
    setStatus("loading");
    const ok = await addToCart({
      productId,
      slug,
      title,
      price: priceGross,
      currency,
      imageUrl,
      maxStock,
      sellerId,
      sellerName,
    });
    if (!ok) {
      // The hook already toasted the failure — return to idle quietly.
      setStatus("idle");
      return;
    }
    setStatus("success");
    if (openDrawer) drawerOpen();
    successTimer.current = setTimeout(() => setStatus("idle"), SUCCESS_MS);
  }

  const label =
    status === "loading"
      ? t("addingToCart")
      : status === "success"
        ? t("addedToCart")
        : t("addToCart");

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={() => void handleAdd()}
        disabled={status === "loading"}
        aria-label={`${t("addToCart")} — ${title}`}
        title={t("addToCart")}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
      >
        {status === "loading" ? (
          <Spinner />
        ) : status === "success" ? (
          <Checkmark />
        ) : (
          <CartPlusIcon />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleAdd()}
      disabled={status === "loading"}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
    >
      {status === "loading" ? (
        <Spinner />
      ) : status === "success" ? (
        <Checkmark />
      ) : null}
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Checkmark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="h-4 w-4"
    >
      <path
        d="M4 12.5l5 5L20 6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartPlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
    >
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2.5 3.5h2l2.6 12h11.4l2-8.5H6" strokeLinecap="round" />
      <path d="M12 6v5M9.5 8.5h5" strokeLinecap="round" />
    </svg>
  );
}
