"use client";

/**
 * The 4-step seller onboarding wizard: business info → identity → payout →
 * review. The stepper is a real list with aria-current="step"; any step is
 * reachable from the stepper (honest pending surfaces live inside each step).
 */
import { useTranslations } from "next-intl";

import { BusinessInfoForm } from "./business-info-form";
import { KycUpload } from "./kyc-upload";
import {
  ONBOARDING_STEPS,
  OnboardingProvider,
  useOnboarding,
} from "./onboarding-provider";
import { PayoutSetup } from "./payout-setup";
import { ReviewStep } from "./review-step";

function Stepper() {
  const t = useTranslations("seller");
  const { step, goToStep } = useOnboarding();
  const currentIndex = ONBOARDING_STEPS.indexOf(step);

  return (
    <ol className="mb-8 flex flex-wrap gap-2" aria-label={t("wizardAria")}>
      {ONBOARDING_STEPS.map((id, index) => {
        const isCurrent = id === step;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => goToStep(id)}
              aria-current={isCurrent ? "step" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm transition-dignified focus:outline-2 focus:outline-primary/40 ${
                isCurrent
                  ? "bg-primary font-medium text-surface-raised"
                  : index < currentIndex
                    ? "bg-primary-soft text-primary-deep hover:bg-primary-soft/70"
                    : "border border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {t(`step_${id}`)}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function WizardBody() {
  const { step } = useOnboarding();
  switch (step) {
    case "business":
      return <BusinessInfoForm />;
    case "identity":
      return <KycUpload />;
    case "payout":
      return <PayoutSetup />;
    case "review":
      return <ReviewStep />;
  }
}

export function OnboardingWizard() {
  return (
    <OnboardingProvider>
      <Stepper />
      <WizardBody />
    </OnboardingProvider>
  );
}
