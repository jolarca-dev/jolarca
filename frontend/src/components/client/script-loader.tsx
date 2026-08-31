"use client";

/**
 * Consent-aware script loading.
 *
 *  - Plausible (self-hosted): renders ONLY under explicit analytics consent
 *    (wrap in ConsentGate or rely on the internal gate below). `data-api`
 *    points at the self-hosted ingest endpoint; nothing phones home until
 *    consent exists.
 *  - Stripe: NECESSARY category — it is loaded on demand at checkout via
 *    @stripe/stripe-js (src/lib/stripe.ts), never via a global tag, and is
 *    exempt from consent as payment infrastructure. Documented here so the
 *    exemption is auditable, not implicit.
 *  - Marketing pixels: no vendor is selected yet — the placeholder mounts
 *    nothing under marketing consent until one is contracted.
 *
 * No PII in any tracker configuration: domain-level analytics only.
 */
import Script from "next/script";

import { ConsentGate } from "@/components/client/consent-gate";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
/** Self-hosted ingest origin, e.g. https://pa.jol-marketplace.example */
const PLAUSIBLE_API = process.env.NEXT_PUBLIC_PLAUSIBLE_API;

/**
 * Self-hosted Plausible, analytics-consent gated. Unconfigured env → renders
 * nothing (analytics disabled by configuration, which is the safe default).
 */
export function PlausibleScript() {
  if (!PLAUSIBLE_DOMAIN) return null;
  return (
    <ConsentGate category="analytics">
      <Script
        src={`${PLAUSIBLE_API ?? "https://plausible.io"}/js/script.js`}
        data-domain={PLAUSIBLE_DOMAIN}
        data-api={PLAUSIBLE_API || undefined}
        defer
        strategy="afterInteractive"
      />
    </ConsentGate>
  );
}

/**
 * Marketing pixels — intentionally empty. When a vendor is contracted, add
 * its loader behind <ConsentGate category="marketing"> and register the
 * processor in the privacy policy BEFORE shipping.
 */
export function MarketingPixels() {
  return (
    <ConsentGate category="marketing">
      {/* no vendor contracted yet */}
    </ConsentGate>
  );
}
