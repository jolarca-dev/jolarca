"use client";

/**
 * Step 4 — Review & submit chrome. Renders INSIDE the same <Elements>
 * group that mounted the PaymentElement in step 3 (payment-step.tsx):
 * Elements created with a client secret can only be confirmed through that
 * same mounted group, so `confirmPayment({ elements })` happens here while
 * the hosted fields stay mounted-but-hidden (the `elementSlot` prop).
 *
 * `redirect: "always"` sends every successful payment (3-D Secure included)
 * to the localized success page with the order id; failures resolve to a
 * typed error mapped to non-technical messages.
 */
import { useState } from "react";
import { useElements, useStripe } from "@stripe/react-stripe-js";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { emitToast } from "@/lib/api-client";
import { paymentErrorKey } from "@/lib/checkout";
import { logger } from "@/lib/logger";
import { useCheckout } from "./checkout-provider";
import { OrderSummary } from "./order-summary";

export function ReviewChrome() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const stripe = useStripe();
  const elements = useElements();
  const {
    order,
    address,
    deliveryMethod,
    locker,
    vatId,
    termsAccepted,
    setTermsAccepted,
    goToStep,
  } = useCheckout();

  const [placing, setPlacing] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function handlePlaceOrder() {
    if (!termsAccepted) {
      setTermsError(true);
      return;
    }
    if (!stripe || !elements || placing || !order) return;
    setPlacing(true);
    setPaymentError(null);

    const returnUrl = `${window.location.origin}/${locale}/checkout/success?order_id=${encodeURIComponent(order.orderId)}`;
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "always",
    });

    // Reached only when the payment did NOT redirect (i.e. it failed or
    // requires action handled in-place).
    if (error) {
      // Raw detail through the PII-redacting logger — searchable alongside
      // the order id when support investigates a failed payment.
      logger.error("checkout confirmPayment failed", {
        type: error.type,
        code: error.code,
        orderId: order.orderId,
      });
      const key = paymentErrorKey(error);
      setPaymentError(t(key as never));
      emitToast({ variant: "error", code: key, message: error.message });
      setPlacing(false);
    }
    // Success → the browser is redirected to returnUrl; the pending state
    // stays visible for the brief moment before navigation.
  }

  if (!order) {
    // Defensive: review is unreachable without a created order.
    return (
      <div className="space-y-4">
        <p className="text-ink-muted">{t("reviewNoOrder")}</p>
        <button
          type="button"
          onClick={() => goToStep("payment")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
      </div>
    );
  }

  const deliveryLabel =
    deliveryMethod === "courier"
      ? t("delivery_courier")
      : deliveryMethod === "dpd_locker"
        ? t("delivery_dpdLocker")
        : t("delivery_omnivaLocker");

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepReview")}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-4">
          <h3 className="font-medium text-ink">{t("reviewAddress")}</h3>
          {address && (
            <p className="mt-2 text-sm text-ink-muted">
              {address.fullName}
              <br />
              {address.street}
              <br />
              {address.postalCode} {address.city}
              <br />
              {t(`country_${address.country}`)}
              <br />
              {address.phone}
            </p>
          )}
        </section>
        <section className="card p-4">
          <h3 className="font-medium text-ink">{t("reviewDelivery")}</h3>
          <p className="mt-2 text-sm text-ink-muted">
            {deliveryLabel}
            {locker && (
              <>
                <br />
                {locker.name} — {locker.address}
              </>
            )}
            {vatId && (
              <>
                <br />
                {t("vatIdLabel")}: {vatId.toUpperCase()}
              </>
            )}
          </p>
        </section>
      </div>

      <OrderSummary />

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => {
              setTermsAccepted(e.target.checked);
              setTermsError(false);
            }}
            aria-invalid={termsError}
            aria-describedby={termsError ? "co-terms-err" : undefined}
            className="mt-0.5 h-4 w-4 accent-[var(--tok-primary)]"
          />
          <span>
            {t.rich("acceptTermsRich", {
              link: (chunks) => (
                <Link href="/legal" className="underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {termsError && (
          <p id="co-terms-err" className="text-sm text-danger">
            {t("termsRequired")}
          </p>
        )}
        <p className="text-xs text-ink-faint">{t("gdprNotice")}</p>
      </div>

      {paymentError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-4 text-sm text-danger"
        >
          {paymentError}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => goToStep("payment")}
          disabled={placing}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
        >
          {t("back")}
        </button>
        <button
          type="button"
          disabled={placing || !stripe}
          onClick={() => void handlePlaceOrder()}
          className="rounded-md bg-primary px-8 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
        >
          {placing ? t("placing") : t("placeOrder")}
        </button>
      </div>
    </div>
  );
}
