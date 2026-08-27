"use client";

/**
 * Step 3 — Payment (and the mount for step 4). Embedded Stripe Payment
 * Element (NOT redirect Checkout): the buyer stays on-domain and card data
 * lives only inside Stripe's iframe (SAQ-A).
 *
 * Architectural constraint proven out live: Elements created WITH a client
 * secret can only be confirmed through THAT SAME mounted group
 * (`confirmPayment({ elements })`). So steps 3 and 4 share one <Elements>
 * tree: the PaymentElement stays mounted for both and is merely hidden on
 * review, while the review step confirms against the same group.
 *
 * Order creation (GAP-O08, closed) happens when this phase mounts so the
 * Element can receive a client secret; until it answers the step degrades
 * loudly (contract-pending notice or actionable error) — never fakes.
 */
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { emitToast, isApiError } from "@/lib/api-client";
import { paymentErrorKey, vatIdFormatValid } from "@/lib/checkout";
import { stripePromise } from "@/lib/stripe";
import { useCartItems } from "@/hooks/use-cart";
import { isContractPending, useCartStore } from "@/stores/cart-store";
import { createOrder, useCheckout, validateVatId } from "./checkout-provider";
import { OrderSummary } from "./order-summary";
import { ReviewChrome } from "./review-step";

type PrepareState = "loading" | "ready" | "contract-pending" | "error";

export function PaymentStep() {
  const t = useTranslations("checkout");

  if (!stripePromise) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">
          {t("stepPayment")}
        </h2>
        <p className="mt-3 rounded-md border border-line bg-surface-raised p-4 text-ink-muted">
          {t("paymentsNotConfigured")}
        </p>
      </div>
    );
  }
  return <PaymentPhase />;
}

function PaymentPhase() {
  const t = useTranslations("checkout");
  const {
    order,
    setOrder,
    goToStep,
    idempotencyKey,
    address,
    deliveryMethod,
    locker,
    vatId,
  } = useCheckout();
  const items = useCartItems();
  const [prepareState, setPrepareState] = useState<PrepareState>(
    order ? "ready" : "loading",
  );
  const startedRef = useRef(false);

  // Create the order once to obtain the PaymentIntent client secret.
  useEffect(() => {
    if (order || startedRef.current || !address || !deliveryMethod) return;
    startedRef.current = true;
    createOrder({
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      shipping: {
        method: deliveryMethod,
        lockerId: locker?.id,
        address: { ...address },
      },
      vatId: vatId || undefined,
      cartId: useCartStore.getState().cartId,
      idempotencyKey,
    })
      .then((created) => {
        setOrder(created);
        setPrepareState("ready");
      })
      .catch((error) => {
        startedRef.current = false;
        if (isContractPending(error)) {
          setPrepareState("contract-pending");
        } else {
          setPrepareState("error");
          emitToast({
            variant: "error",
            code: isApiError(error) ? error.code : "order_create_failed",
          });
        }
      });
  }, [
    order,
    address,
    deliveryMethod,
    locker,
    vatId,
    items,
    setOrder,
    idempotencyKey,
  ]);

  if (!order) {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-primary-deep">
          {t("stepPayment")}
        </h2>
        <OrderSummary />
        {prepareState === "loading" && (
          <p role="status" className="text-ink-muted">
            {t("preparingPayment")}
          </p>
        )}
        {prepareState === "contract-pending" && (
          <ContractGapNotice gapIds={["GAP-Y01"]} />
        )}
        {prepareState === "error" && (
          <p className="text-sm text-danger">{t("paymentPrepareError")}</p>
        )}
        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={() => goToStep("delivery")}
            className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
          >
            {t("back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <SharedElements orderId={order.orderId} clientSecret={order.clientSecret} />
  );
}

/** ONE Elements group for steps 3+4. The PaymentElement never unmounts
 * between the two — on review it is visually hidden but keeps its state,
 * which is what confirmPayment({ elements }) confirms against. */
function SharedElements({
  orderId,
  clientSecret,
}: {
  orderId: string;
  clientSecret: string;
}) {
  const { step, address } = useCheckout();
  const options = useMemo<StripeElementsOptions>(
    () => ({
      clientSecret,
      // Sacred-modern appearance; the fields themselves stay Stripe-hosted.
      appearance: {
        theme: "flat",
        variables: {
          colorPrimary: "#1B4332",
          colorBackground: "#FDFCFA",
          colorText: "#1A1A1A",
          colorDanger: "#9b2c2c",
          borderRadius: "6px",
          fontFamily: "Inter, system-ui, sans-serif",
        },
      },
    }),
    [clientSecret],
  );

  // STABLE TREE POSITION: the PaymentElement must live at the same React
  // position for both steps — moving it between step parents remounts it
  // and silently drops the entered card values (confirm then fails with a
  // validation_error). Chrome renders as a sibling below.
  return (
    <Elements key={orderId} stripe={stripePromise} options={options}>
      <div
        // display:none is safe HERE because the stable tree position keeps
        // the element (and its entered values) mounted across both steps;
        // earlier validation_errors came from REMOUNTS, not from hiding.
        className={step === "review" ? "hidden" : undefined}
        aria-hidden={step === "review" ? true : undefined}
      >
        <PaymentElement
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card", "sepa_debit"],
            defaultValues: {
              billingDetails: {
                name: address?.fullName,
                phone: address?.phone,
                // No postal_code here: Baltic formats ("LT-01103") fail
                // Stripe's validation and an invalid field discards the WHOLE
                // defaults block — country would render unselected and block
                // submit. City + country prefill is the safe subset.
                address: address
                  ? {
                      city: address.city,
                      country: address.country.toLowerCase(),
                    }
                  : undefined,
              },
            },
          }}
        />
      </div>
      {step === "payment" ? <PaymentChrome /> : <ReviewChrome />}
    </Elements>
  );
}

/** Step-3 chrome around the hosted fields. */
function PaymentChrome() {
  const t = useTranslations("checkout");
  const { address, vatId, setVatId, vatStatus, setVatStatus, goToStep } =
    useCheckout();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  /** B2B VAT ID: format check now, backend validation via tax_app. */
  async function checkVatId(): Promise<boolean> {
    if (!vatId.trim() || !address) {
      setVatStatus("idle");
      return true;
    }
    if (!vatIdFormatValid(address.country, vatId)) {
      setVatStatus("invalid");
      return false;
    }
    setVatStatus("checking");
    try {
      const valid = await validateVatId(
        vatId.replace(/[\s.-]/g, "").toUpperCase(),
      );
      setVatStatus(valid ? "valid" : "invalid");
      return valid;
    } catch (error) {
      // Format passed, VIES deferred to order creation. Honest degradation
      // — never claim a validation that did not happen.
      if (isContractPending(error)) {
        setVatStatus("idle");
        return true;
      }
      setVatStatus("invalid");
      return false;
    }
  }

  async function handleContinue() {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    try {
      // Validate the hosted fields; confirmation itself happens on review
      // against this SAME elements group (see SharedElements).
      const { error } = await elements.submit();
      if (error) {
        emitToast({
          variant: "error",
          code: paymentErrorKey(error),
          message: error.message,
        });
        return;
      }
      const vatOk = await checkVatId();
      if (!vatOk) return;
      goToStep("review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepPayment")}
      </h2>

      <OrderSummary />

      <div>
        <label
          htmlFor="co-vat-id"
          className="mb-1 block text-sm font-medium text-ink"
        >
          {t("vatIdLabel")}{" "}
          <span className="font-normal text-ink-faint">{t("optional")}</span>
        </label>
        <input
          id="co-vat-id"
          value={vatId}
          onChange={(e) => {
            setVatId(e.target.value);
            setVatStatus("idle");
          }}
          placeholder="LT123456789"
          autoComplete="off"
          aria-invalid={vatStatus === "invalid"}
          aria-describedby="co-vat-id-hint"
          className="w-full max-w-sm rounded-md border border-line bg-surface-raised px-3 py-2 text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40"
        />
        <p id="co-vat-id-hint" className="mt-1 text-xs text-ink-faint">
          {vatStatus === "checking" && t("vatChecking")}
          {vatStatus === "valid" && t("vatValid")}
          {vatStatus === "invalid" && t("vatInvalid")}
          {vatStatus === "idle" && t("vatHint")}
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => goToStep("delivery")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
        <button
          type="button"
          disabled={submitting || !stripe}
          onClick={() => void handleContinue()}
          className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
        >
          {submitting ? t("checking") : t("continue")}
        </button>
      </div>
    </div>
  );
}
