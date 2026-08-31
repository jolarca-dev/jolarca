"use client";

/**
 * Seller onboarding wizard state — 4 steps: business → identity → payout →
 * review. All collection is local until the review step submits to
 * sellers_app (GAP-V01); KYC uploads happen per-document in step 2
 * (GAP-V07). Nothing here persists to client storage: onboarding data is
 * identity data and must not outlive the flow outside the backend.
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import type { BusinessInfo, KycDocumentKind } from "@/lib/seller";

export const ONBOARDING_STEPS = [
  "business",
  "identity",
  "payout",
  "review",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type DocStatus =
  | "empty"
  | "uploading"
  | "uploaded"
  /** Backend document portal not live yet (GAP-V07) — nothing stored. */
  | "portal-pending"
  | "error";

export interface KycDocState {
  fileName?: string;
  previewUrl?: string;
  status: DocStatus;
}

export type ConnectStatus = "idle" | "redirecting" | "success" | "error";

interface OnboardingContextValue {
  step: OnboardingStep;
  goToStep: (step: OnboardingStep) => void;

  businessInfo: BusinessInfo | null;
  setBusinessInfo: (info: BusinessInfo) => void;
  logoDataUrl: string | null;
  setLogoDataUrl: (dataUrl: string | null) => void;

  docs: Record<KycDocumentKind, KycDocState>;
  setDoc: (kind: KycDocumentKind, doc: KycDocState) => void;

  connectStatus: ConnectStatus;
  setConnectStatus: (status: ConnectStatus) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<OnboardingStep>("business");
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<KycDocumentKind, KycDocState>>({
    identity: { status: "empty" },
    proof_of_address: { status: "empty" },
  });
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");

  const goToStep = useCallback((next: OnboardingStep) => {
    setStep(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0 });
    }
  }, []);

  const setDoc = useCallback((kind: KycDocumentKind, doc: KycDocState) => {
    setDocs((current) => {
      // Revoke replaced previews to avoid leaking object URLs.
      const previous = current[kind];
      if (previous.previewUrl && previous.previewUrl !== doc.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }
      return { ...current, [kind]: doc };
    });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        step,
        goToStep,
        businessInfo,
        setBusinessInfo,
        logoDataUrl,
        setLogoDataUrl,
        docs,
        setDoc,
        connectStatus,
        setConnectStatus,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  }
  return context;
}
