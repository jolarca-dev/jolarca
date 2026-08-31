"use client";

/**
 * Header cart button with optimistic item-count badge. The count updates
 * instantly via the zustand selector — no round-trip (guest or authed).
 * On every increment the badge plays a single 200ms pulse (disabled under
 * prefers-reduced-motion via the `.cart-badge-pulse` class) — subtle enough
 * to confirm, calm enough not to demand.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useCartItemCount } from "@/hooks/use-cart";

const PULSE_MS = 200;

export function CartBadge({
  onClick,
  ariaExpanded,
  ariaControls,
}: {
  onClick: () => void;
  ariaExpanded: boolean;
  ariaControls: string;
}) {
  const t = useTranslations("cart");
  const count = useCartItemCount();
  const previous = useRef(count);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (count > previous.current) {
      setPulsing(true);
      const timer = setTimeout(() => setPulsing(false), PULSE_MS);
      previous.current = count;
      return () => clearTimeout(timer);
    }
    previous.current = count;
  }, [count]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-label={t("openCart")}
      className="relative inline-flex items-center rounded-md border border-line bg-surface-raised p-2 text-ink transition-dignified hover:border-line-strong hover:text-primary"
    >
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
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -end-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-xs font-bold text-primary-deep ${
            pulsing ? "cart-badge-pulse" : ""
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
