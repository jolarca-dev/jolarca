"use client";

/**
 * Step 2 — Delivery method. Prices come from the backend
 * (POST /api/v1/orders/shipping-options/); parcel-locker lists from
 * GET /api/v1/shipping/lockers/. On any failure the step shows an
 * actionable error — delivery prices are never invented client-side.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { emitToast, isApiError } from "@/lib/api-client";
import type { ParcelLocker } from "@/lib/checkout";
import { formatPrice } from "@/server/catalog";
import { isContractPending } from "@/stores/cart-store";
import {
  fetchLockers,
  fetchShippingOptions,
  useCheckout,
} from "./checkout-provider";

export function DeliveryMethodStep() {
  const t = useTranslations("checkout");
  const {
    address,
    deliveryMethod,
    setDeliveryMethod,
    locker,
    setLocker,
    shippingOptions,
    setShippingOptions,
    goToStep,
  } = useCheckout();

  const [state, setState] = useState<
    "loading" | "ready" | "contract-pending" | "error"
  >("loading");
  const [lockers, setLockers] = useState<ParcelLocker[]>([]);
  const [lockersState, setLockersState] = useState<
    "idle" | "loading" | "ready" | "contract-pending" | "error"
  >("idle");

  const country = address?.country ?? "LT";
  const locale =
    typeof window === "undefined"
      ? "lt"
      : document.documentElement.lang || "lt";

  const loadOptions = useCallback(async () => {
    setState("loading");
    try {
      const options = await fetchShippingOptions(country);
      setShippingOptions(options);
      setState("ready");
    } catch (error) {
      if (isContractPending(error)) {
        setState("contract-pending");
      } else {
        setState("error");
        emitToast({
          variant: "error",
          code: isApiError(error) ? error.code : "shipping_options_failed",
        });
      }
    }
  }, [country, setShippingOptions]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  // Locker list follows the selected locker carrier.
  useEffect(() => {
    if (deliveryMethod !== "dpd_locker" && deliveryMethod !== "omniva_locker") {
      setLockersState("idle");
      return;
    }
    const carrier = deliveryMethod === "dpd_locker" ? "dpd" : "omniva";
    let cancelled = false;
    setLockersState("loading");
    fetchLockers(carrier, country)
      .then((result) => {
        if (cancelled) return;
        setLockers(result);
        setLockersState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setLockersState(
          isContractPending(error) ? "contract-pending" : "error",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryMethod, country]);

  const needsLocker =
    deliveryMethod === "dpd_locker" || deliveryMethod === "omniva_locker";
  const canContinue = deliveryMethod !== null && (!needsLocker || locker);

  if (state === "contract-pending") {
    return (
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">
          {t("stepDelivery")}
        </h2>
        <p className="mt-3 rounded-md border border-line bg-surface-raised p-4 text-ink-muted">
          {t("optionsError")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepDelivery")}
      </h2>

      {state === "loading" && (
        <p role="status" className="text-ink-muted">
          {t("loadingOptions")}
        </p>
      )}
      {state === "error" && (
        <div className="rounded-md border border-danger bg-danger-soft p-4 text-sm text-danger">
          {t("optionsError")}{" "}
          <button
            type="button"
            onClick={() => void loadOptions()}
            className="underline underline-offset-2"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {state === "ready" && shippingOptions.length === 0 && (
        <p className="rounded-md border border-line bg-surface-raised p-4 text-ink-muted">
          {t("optionsError")}
        </p>
      )}

      {state === "ready" && shippingOptions.length > 0 && (
        <fieldset>
          <legend className="sr-only">{t("stepDelivery")}</legend>
          <div className="space-y-3">
            {shippingOptions.map((option) => {
              const selected = deliveryMethod === option.id;
              return (
                <label
                  key={option.id}
                  className={
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md border p-4 transition-dignified " +
                    (selected
                      ? "border-primary bg-primary-soft"
                      : "border-line bg-surface-raised hover:border-line-strong")
                  }
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="delivery-method"
                      checked={selected}
                      onChange={() => setDeliveryMethod(option.id)}
                      className="h-4 w-4 accent-[var(--tok-primary)]"
                    />
                    <span>
                      <span className="block font-medium text-ink">
                        {t(`delivery_${option.labelKey}`)}
                      </span>
                      {option.etaDays && (
                        <span className="text-sm text-ink-muted">
                          {t("etaDays", { days: option.etaDays })}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatPrice(option.price, option.currency, locale)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Parcel-locker picker (list today; map is a post-MVP enhancement) */}
      {needsLocker && (
        <div>
          <h3 className="mb-2 font-medium text-ink">{t("chooseLocker")}</h3>
          {lockersState === "loading" && (
            <p role="status" className="text-sm text-ink-muted">
              {t("loadingLockers")}
            </p>
          )}
          {lockersState === "contract-pending" && (
            <p className="text-sm text-ink-muted">{t("lockersError")}</p>
          )}
          {lockersState === "error" && (
            <p className="text-sm text-danger">{t("lockersError")}</p>
          )}
          {lockersState === "ready" && lockers.length === 0 && (
            <p className="text-sm text-ink-muted">{t("noLockers")}</p>
          )}
          {lockersState === "ready" && lockers.length > 0 && (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {lockers.map((option) => {
                const selected = locker?.id === option.id;
                return (
                  <li key={option.id}>
                    <label
                      className={
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-dignified " +
                        (selected
                          ? "border-primary bg-primary-soft"
                          : "border-line bg-surface-raised hover:border-line-strong")
                      }
                    >
                      <input
                        type="radio"
                        name="parcel-locker"
                        checked={selected}
                        onChange={() => setLocker(option)}
                        className="mt-0.5 h-4 w-4 accent-[var(--tok-primary)]"
                      />
                      <span>
                        <span className="block font-medium text-ink">
                          {option.name}
                        </span>
                        <span className="text-ink-muted">
                          {option.address}
                          {option.city ? `, ${option.city}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => goToStep("address")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => goToStep("payment")}
          className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-50"
        >
          {t("continue")}
        </button>
      </div>
    </div>
  );
}
