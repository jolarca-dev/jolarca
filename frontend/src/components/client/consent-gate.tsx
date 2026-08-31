"use client";

/**
 * ConsentGate — mounts children ONLY when the required category has
 * explicit consent. No consent (or no decision yet) → children are never
 * instantiated, not merely hidden: no element, no side effects, no network.
 *
 * "necessary" always passes (session/auth + payment infrastructure, legally
 * exempt). Server renders and the first client paint match (nothing
 * optional), so there is no hydration mismatch.
 *
 * Usage:
 *   <ConsentGate category="analytics">
 *     <PlausibleScript />
 *   </ConsentGate>
 */
import { useEffect, useState, type ReactNode } from "react";

import { useConsentStore, type ConsentCategory } from "@/stores/consent-store";

export function ConsentGate({
  category,
  children,
  fallback = null,
}: {
  category: ConsentCategory;
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const decided = useConsentStore((s) => s.decided);
  const granted = useConsentStore((s) => s.choices[category]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (category === "necessary") return <>{children}</>;
  if (!mounted || !decided || !granted) return <>{fallback}</>;
  return <>{children}</>;
}
