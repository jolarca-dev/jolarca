"use client";

/**
 * Checkout flow island: provider + accessible progress stepper + step
 * switch. Empty carts short-circuit to a friendly pointer back to the
 * catalog — checkout never renders against zero lines. The mobile total
 * bar keeps the running total visible on small screens; the PRIMARY CTA
 * stays inside each step (duplicating it would risk double submission on
 * the money step).
 */
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useCartItems, useCartTotal } from "@/hooks/use-cart";
import { parseMoney } from "@/stores/cart-store";
import { formatPrice } from "@/server/catalog";
import { AddressForm } from "./address-form";
import { DeliveryMethodStep } from "./delivery-method";
import { PaymentStep } from "./payment-step";
import {
  CHECKOUT_STEPS,
  CheckoutProvider,
  useCheckout,
  type CheckoutStep,
} from "./checkout-provider";

const STEP_LABEL_KEYS: Record<CheckoutStep, string> = {
  address: "stepAddress",
  delivery: "stepDelivery",
  payment: "stepPayment",
  review: "stepReview",
};

function Stepper() {
  const t = useTranslations("checkout");
  const { step, goToStep } = useCheckout();
  const currentIndex = CHECKOUT_STEPS.indexOf(step);

  return (
    <ol
      aria-label={t("progressLabel")}
      className="mb-8 flex flex-wrap items-center gap-2 text-sm"
    >
      {CHECKOUT_STEPS.map((stepId, index) => {
        const isCurrent = stepId === step;
        const isDone = index < currentIndex;
        return (
          <li key={stepId} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-ink-faint">
                —
              </span>
            )}
            {isDone ? (
              <button
                type="button"
                onClick={() => goToStep(stepId)}
                className="rounded-full border border-line px-3 py-1 text-ink-muted transition-dignified hover:border-line-strong hover:text-ink"
              >
                {index + 1}. {t(STEP_LABEL_KEYS[stepId])}
              </button>
            ) : (
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={
                  "rounded-full border px-3 py-1 " +
                  (isCurrent
                    ? "border-primary bg-primary-soft font-medium text-primary-deep"
                    : "border-line text-ink-faint")
                }
              >
                {index + 1}. {t(STEP_LABEL_KEYS[stepId])}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Sticky bottom total on small screens — informational only (no CTA). */
function MobileTotalBar() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const items = useCartItems();
  const subtotal = useCartTotal();
  const { shippingPrice } = useCheckout();
  const currency = items[0]?.currency ?? "EUR";
  const total = subtotal + parseMoney(shippingPrice?.price ?? "0");

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 sm:hidden">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <span className="text-sm text-ink-muted">{t("summaryTotal")}</span>
        <span className="font-semibold tabular-nums">
          {formatPrice(String(total), currency, locale)}
        </span>
      </div>
    </div>
  );
}

function FlowBody() {
  const t = useTranslations("checkout");
  const { step } = useCheckout();
  const items = useCartItems();

  if (items.length === 0) {
    return (
      <div className="card mt-6 flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-lg text-ink">{t("emptyCart")}</p>
        <Link
          href="/"
          className="rounded-md bg-primary px-5 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
        >
          {t("browseCatalog")}
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-16 sm:pb-0">
      <Stepper />
      {step === "address" && <AddressForm />}
      {step === "delivery" && <DeliveryMethodStep />}
      {/* PaymentStep owns BOTH steps 3+4: the Stripe Elements group must
          stay mounted across them (confirm happens on review against the
          same group that collected the card — see payment-step.tsx). */}
      {(step === "payment" || step === "review") && <PaymentStep />}
      <MobileTotalBar />
    </div>
  );
}

export function CheckoutFlow() {
  return (
    <CheckoutProvider>
      <FlowBody />
    </CheckoutProvider>
  );
}
