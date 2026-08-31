"use client";

/**
 * Cart entry point for the site header: badge trigger button + slide-out
 * drawer + a permanently mounted screen-reader announcer, plus the one-shot
 * guest→authenticated cart sync (POST /cart/sync). Drawer visibility lives
 * in the zustand store so any island (e.g. AddToCartButton with
 * `openDrawer`) can open it after a successful add.
 */
import { useId } from "react";
import { useTranslations } from "next-intl";

import { CartBadge } from "@/components/client/cart-badge";
import { CartDrawer } from "@/components/client/cart-drawer";
import { useCartSyncOnLogin } from "@/hooks/use-cart";
import { useCartStore } from "@/stores/cart-store";

/** Visually hidden aria-live region; localizes store announcements. */
function CartAnnouncer() {
  const t = useTranslations("cart");
  const announcement = useCartStore((s) => s.announcement);
  if (!announcement) return null;
  const text =
    announcement.code === "added"
      ? t("announceAdded", { title: announcement.title })
      : announcement.code === "removed"
        ? t("announceRemoved", { title: announcement.title })
        : t("announceUpdated", {
            title: announcement.title,
            quantity: announcement.quantity ?? 1,
          });
  return <span className="sr-only">{text}</span>;
}

export function CartController({ locale }: { locale: string }) {
  const open = useCartStore((s) => s.drawerOpen);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const closeDrawer = useCartStore((s) => s.closeDrawer);
  const drawerId = useId();
  useCartSyncOnLogin();

  return (
    <>
      <CartBadge
        onClick={() => openDrawer()}
        ariaExpanded={open}
        ariaControls={drawerId}
      />
      <CartDrawer
        id={drawerId}
        open={open}
        onClose={() => closeDrawer()}
        locale={locale}
      />
      <div aria-live="polite" role="status">
        <CartAnnouncer />
      </div>
    </>
  );
}
