"use client";

/**
 * Stripe loader — single promise shared by every checkout surface.
 * Publishable key only (never a secret); card data never leaves Stripe's
 * iframe (SAQ-A). Null promise → checkout renders the "payments being
 * prepared" notice instead of touching Stripe.
 *
 * CSP note: loadStripe injects an EXTERNAL <script src="js.stripe.com/v3">.
 * External scripts from the allowlisted origin execute without a nonce
 * (nonces gate inline code only), and Stripe's SDK does not require
 * 'unsafe-eval' — no documented exception exists in this codebase.
 */
import { loadStripe, type Stripe } from "@stripe/stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const stripePromise: Promise<Stripe | null> | null = PUBLISHABLE_KEY
  ? loadStripe(PUBLISHABLE_KEY)
  : null;
