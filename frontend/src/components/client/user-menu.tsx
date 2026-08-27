"use client";

/**
 * Session-aware user menu (header island). Anonymous visitors see a Sign-in
 * link; authenticated users get a role-filtered dropdown. Identity comes
 * from the httpOnly session cookie via useSession() — nothing local.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { SESSION_QUERY_KEY } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-auth";
import { logout } from "@/lib/auth";

export function UserMenu() {
  const t = useTranslations("auth");
  const user = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    try {
      await logout();
    } finally {
      // Converge header + any session consumers immediately.
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      router.refresh();
    }
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="no-underline text-ink-muted hover:text-primary"
      >
        {t("signIn")}
      </Link>
    );
  }

  const itemClass =
    "block w-full px-4 py-2 text-start no-underline text-ink hover:bg-surface";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("menuLabel")}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-line bg-surface-raised px-3 py-1.5 transition-dignified hover:border-line-strong"
      >
        {user.email}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("menuLabel")}
          className="card absolute end-0 z-20 mt-2 w-56 py-2"
        >
          <Link
            role="menuitem"
            href="/account"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {t("myAccount")}
          </Link>
          <Link
            role="menuitem"
            href="/account"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {t("orders")}
          </Link>
          {(user.role === "seller" || user.role === "admin") && (
            <Link
              role="menuitem"
              href="/seller"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {t("sellerDashboard")}
            </Link>
          )}
          {user.role === "admin" && (
            <Link
              role="menuitem"
              href="/admin"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {t("admin")}
            </Link>
          )}
          <div className="my-1 border-t border-line" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full px-4 py-2 text-start text-danger hover:bg-surface"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}
