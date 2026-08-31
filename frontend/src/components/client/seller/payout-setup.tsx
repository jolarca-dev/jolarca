"use client";

/**
 * Step 3 — Payout setup via Stripe Connect Express. The frontend never
 * talks to Stripe Connect directly: the backend (payments_app, GAP-V03)
 * creates the account with the platform fee configured server-side and
 * returns a hosted onboarding URL we redirect to. Stripe appends
 * ?success=... to the return URL; the dashboard renders the banner.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { createStripeConnect } from "@/lib/seller";
import { isContractPending } from "@/stores/cart-store";
import { useOnboarding } from "./onboarding-provider";

export function PayoutSetup() {
  const t = useTranslations("seller");
  const locale = useLocale();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const { goToStep, connectStatus, setConnectStatus } = useOnboarding();
  const [portalPending, setPortalPending] = useState(false);

  // Returning from Stripe's hosted onboarding (redirected back with the
  // success flag Stripe appends to our return URL).
  useEffect(() => {
    const returned = searchParams.get("connect_return");
    if (returned === "1") {
      setConnectStatus(
        searchParams.get("success") === "false" ? "error" : "success",
      );
    }
  }, [searchParams, setConnectStatus]);

  async function startConnect() {
    setConnectStatus("redirecting");
    const localePath = params.locale ?? locale;
    const returnUrl = `${window.location.origin}/${localePath}/seller/dashboard?connect_return=1`;
    try {
      const url = await createStripeConnect(returnUrl);
      window.location.assign(url);
    } catch (error) {
      if (isContractPending(error)) {
        setPortalPending(true);
        setConnectStatus("idle");
      } else {
        setConnectStatus("error");
      }
    }
  }

  return (
    <section aria-label={t("stepPayout")} className="space-y-4">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepPayout")}
      </h2>
      <p className="text-sm text-ink-muted">{t("payoutIntro")}</p>

      <div className="card p-4">
        <h3 className="font-medium text-ink">{t("payoutExpressTitle")}</h3>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-muted">
          <li>{t("payoutBullet1")}</li>
          <li>{t("payoutBullet2")}</li>
          <li>{t("payoutBullet3")}</li>
        </ul>

        {connectStatus === "success" && (
          <p
            role="status"
            className="mt-4 rounded-md bg-success-soft p-3 text-sm text-ink"
          >
            {t("connectSuccess")}
          </p>
        )}
        {connectStatus === "error" && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-ink"
          >
            {t("connectError")}
          </p>
        )}
        {portalPending && (
          <p
            role="status"
            className="mt-4 rounded-md border border-gold/40 bg-gold-soft p-3 text-sm text-ink"
          >
            {t("connectPortalPending")}
          </p>
        )}

        {connectStatus !== "success" && !portalPending && (
          <button
            type="button"
            onClick={() => void startConnect()}
            disabled={connectStatus === "redirecting"}
            className="mt-4 rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
          >
            {connectStatus === "redirecting"
              ? t("connectRedirecting")
              : t("connectCta")}
          </button>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => goToStep("identity")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={() => goToStep("review")}
          className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
