"use client";

/**
 * Admin dark-mode toggle. The token system cascades at runtime: toggling
 * `.theme-dark` on <html> re-skins every component with zero CSS changes
 * (tokens.css). The choice persists to localStorage — a UI preference only,
 * never PII, so no consent gating is required.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const THEME_KEY = "jol_admin_theme";

export function ThemeToggle() {
  const t = useTranslations("admin");
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDark(window.localStorage.getItem(THEME_KEY) === "dark");
    } catch {
      // Storage unavailable — default to light, silently.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("theme-dark", dark);
    try {
      window.localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Preference simply won't persist — the toggle still works.
    }
  }, [dark, mounted]);

  return (
    <button
      type="button"
      onClick={() => setDark((value) => !value)}
      aria-pressed={dark}
      className="rounded-md border border-line px-3 py-1.5 text-sm text-ink transition-dignified hover:border-line-strong"
    >
      {mounted && dark ? t("themeLight") : t("themeDark")}
    </button>
  );
}
