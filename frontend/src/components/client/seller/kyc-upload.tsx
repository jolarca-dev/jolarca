"use client";

/**
 * Step 2 — Identity verification. Drag-and-drop slots with full keyboard
 * support and screen-reader announcements. Sensitive documents are NEVER
 * processed client-side (no conversion, no third parties): the raw file is
 * multipart-posted straight to the backend, which stores it in S3
 * (GAP-V07). Preview is a local object URL only and is revoked on replace.
 */
import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { isContractPending } from "@/stores/cart-store";
import { uploadKycDocument, type KycDocumentKind } from "@/lib/seller";
import { useOnboarding, type DocStatus } from "./onboarding-provider";

const KYC_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per document
const KYC_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function isKycFile(file: File): boolean {
  const okType =
    file.type.startsWith("image/") || file.type === "application/pdf";
  return okType && file.size <= KYC_MAX_BYTES;
}

interface DropZoneProps {
  kind: KycDocumentKind;
}

function DropZone({ kind }: DropZoneProps) {
  const t = useTranslations("seller");
  const { docs, setDoc } = useOnboarding();
  const doc = docs[kind];
  const [dragOver, setDragOver] = useState(false);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const titleKey = kind === "identity" ? "kycIdentity" : "kycProofAddress";
  const hintKey = kind === "identity" ? "kycIdentityHint" : "kycProofHint";

  async function handleFiles(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!isKycFile(file)) {
      setAnnounce(t("kycFileRejected"));
      setDoc(kind, {
        fileName: file.name,
        status: "error",
      });
      return;
    }
    const preview = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;
    setDoc(kind, {
      fileName: file.name,
      previewUrl: preview,
      status: "uploading",
    });
    setAnnounce(t("kycUploading"));
    try {
      await uploadKycDocument(kind, file);
      setDoc(kind, {
        fileName: file.name,
        previewUrl: preview,
        status: "uploaded",
      });
      setAnnounce(t("kycUploaded"));
    } catch (error) {
      if (isContractPending(error)) {
        // Backend document portal not live yet — nothing is stored, and we
        // never claim a KYC document was received (ADR-0007).
        setDoc(kind, {
          fileName: file.name,
          previewUrl: preview,
          status: "portal-pending",
        });
        setAnnounce(t("kycPortalPending"));
      } else {
        setDoc(kind, {
          fileName: file.name,
          previewUrl: preview,
          status: "error",
        });
        setAnnounce(t("kycUploadFailed"));
      }
    }
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function remove() {
    setDoc(kind, { status: "empty" });
    setAnnounce(t("kycRemoved"));
  }

  const statusLabel: Record<DocStatus, string> = {
    empty: "",
    uploading: t("kycUploading"),
    uploaded: t("kycUploaded"),
    "portal-pending": t("kycPortalPending"),
    error: t("kycUploadFailed"),
  };

  return (
    <div className="rounded-md border border-line bg-surface-raised p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">{t(titleKey)}</h3>
        {doc.status !== "empty" && (
          <span
            className={`text-sm ${
              doc.status === "uploaded"
                ? "text-primary"
                : doc.status === "error"
                  ? "text-danger"
                  : "text-ink-muted"
            }`}
          >
            {statusLabel[doc.status]}
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-ink-faint">{t(hintKey)}</p>

      {/* Keyboard: the zone is a real button. Drag: pointer events. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t("kycDropAria", { doc: t(titleKey) })}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center transition-dignified focus:outline-2 focus:outline-primary/40 ${
          dragOver
            ? "border-primary bg-primary-soft"
            : "border-line hover:border-line-strong"
        }`}
      >
        <span className="text-sm text-ink-muted">{t("kycDropText")}</span>
        <span className="mt-1 text-xs text-ink-faint">{t("kycFormats")}</span>
        <input
          ref={inputRef}
          type="file"
          accept={KYC_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {doc.fileName && doc.status !== "empty" && (
        <div className="mt-3 flex items-center gap-3">
          {doc.previewUrl ? (
            <Image
              src={doc.previewUrl}
              alt={t("kycPreviewAlt", { doc: t(titleKey) })}
              width={56}
              height={56}
              className="h-14 w-14 rounded-md border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-md border border-line text-xs text-ink-faint"
            >
              PDF
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {doc.fileName}
          </span>
          {doc.status !== "uploading" && (
            <>
              <button
                type="button"
                onClick={openPicker}
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                {t("kycReplace")}
              </button>
              <button
                type="button"
                onClick={remove}
                className="text-sm text-ink-faint underline-offset-2 hover:text-danger hover:underline"
              >
                {t("kycRemove")}
              </button>
            </>
          )}
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}

export function KycUpload() {
  const t = useTranslations("seller");
  const { docs, goToStep } = useOnboarding();

  const bothUploaded =
    docs.identity.status === "uploaded" &&
    docs.proof_of_address.status === "uploaded";
  const anyPortalPending =
    docs.identity.status === "portal-pending" ||
    docs.proof_of_address.status === "portal-pending";

  return (
    <section aria-label={t("stepIdentity")} className="space-y-4">
      <h2 className="text-xl font-semibold text-primary-deep">
        {t("stepIdentity")}
      </h2>
      <p className="text-sm text-ink-muted">{t("kycIntro")}</p>

      <DropZone kind="identity" />
      <DropZone kind="proof_of_address" />

      {anyPortalPending && (
        <p
          role="status"
          className="rounded-md border border-gold/40 bg-gold-soft p-3 text-sm text-ink"
        >
          {t("kycPortalNotice")}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => goToStep("business")}
          className="rounded-md border border-line px-6 py-2 text-ink transition-dignified hover:border-line-strong"
        >
          {t("back")}
        </button>
        {bothUploaded && (
          <button
            type="button"
            onClick={() => goToStep("payout")}
            className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
          >
            {t("continue")}
          </button>
        )}
      </div>
    </section>
  );
}
