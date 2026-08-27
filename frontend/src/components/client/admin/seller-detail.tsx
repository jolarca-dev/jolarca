"use client";

/**
 * Seller detail — business info, KYC document viewer (authenticated URLs
 * from the backend; nothing is cached client-side), verification history
 * and the three decisions: approve / reject (reason → email) / hold.
 * All decisions confirm first and emit audit events (GAP-M06/M09).
 */
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { Link } from "@/i18n/navigation";
import {
  decideSeller,
  fetchSellerDetail,
  type SellerDecision,
  type SellerDetail,
} from "@/lib/admin";
import { isContractPending } from "@/stores/cart-store";
import { ConfirmDialog } from "./confirm-dialog";

export function SellerDetailView({
  sellerId,
  adminEmail,
}: {
  sellerId: string;
  adminEmail: string;
}) {
  const t = useTranslations("admin");
  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [state, setState] = useState<"loading" | "gap" | "error" | "ready">(
    "loading",
  );
  const [activeDoc, setActiveDoc] = useState<number | null>(null);
  const [dialog, setDialog] = useState<SellerDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await fetchSellerDetail(sellerId);
      setDetail(data);
      setState("ready");
    } catch (error) {
      setState(isContractPending(error) ? "gap" : "error");
    }
  }, [sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDecision(decision: SellerDecision, reason: string) {
    setBusy(true);
    try {
      await decideSeller(sellerId, decision, reason, adminEmail);
      setToast(t("decisionRecorded", { count: 1 }));
      setDialog(null);
      await load();
    } catch {
      setToast(t("decisionFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <div className="card h-64 animate-pulse" aria-hidden="true" />;
  }
  if (state === "gap") return <ContractGapNotice gapIds={["GAP-M05"]} />;
  if (state === "error" || !detail) {
    return (
      <p
        role="alert"
        className="rounded-md bg-danger-soft p-3 text-sm text-ink"
      >
        {t("queueLoadFailed")}
      </p>
    );
  }

  const rows: Array<[string, string]> = [
    [
      t("colBusinessType"),
      t(`type_${detail.businessType}`, { default: detail.businessType }),
    ],
    [t("fieldRegistrationNumber"), detail.registrationNumber || "—"],
    [t("fieldVatId"), detail.vatId || "—"],
    [t("fieldCountry"), detail.country || "—"],
    [t("fieldAddress"), detail.address || "—"],
    [t("fieldEmail"), detail.contactEmail || "—"],
    [t("fieldPhone"), detail.phone || "—"],
    [
      t("colConnect"),
      t(`connect_${detail.connectStatus}`, { default: detail.connectStatus }),
    ],
  ];

  const docDialog =
    dialog === "approve"
      ? { title: t("confirmApproveTitle"), danger: false, withReason: false }
      : dialog === "reject"
        ? { title: t("confirmRejectTitle"), danger: true, withReason: true }
        : { title: t("confirmHoldTitle"), danger: false, withReason: true };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary-deep">
          {detail.businessName}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDialog("approve")}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
          >
            {t("approve")}
          </button>
          <button
            type="button"
            onClick={() => setDialog("hold")}
            className="rounded-md border border-line px-4 py-1.5 text-sm text-ink transition-dignified hover:border-line-strong"
          >
            {t("hold")}
          </button>
          <button
            type="button"
            onClick={() => setDialog("reject")}
            className="rounded-md bg-danger px-4 py-1.5 text-sm font-medium text-surface-raised transition-dignified hover:bg-danger/85"
          >
            {t("reject")}
          </button>
        </div>
      </div>

      {/* Business info */}
      <section aria-label={t("detailBusiness")} className="card p-4">
        <h3 className="mb-3 font-medium text-ink">{t("detailBusiness")}</h3>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 text-sm">
              <dt className="text-ink-faint">{label}</dt>
              <dd className="text-end text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Documents — viewer uses backend-issued authenticated URLs only. */}
      <section aria-label={t("detailDocuments")} className="card p-4">
        <h3 className="mb-3 font-medium text-ink">{t("detailDocuments")}</h3>
        {detail.documents.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noDocuments")}</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-3">
              {detail.documents.map((doc, index) => (
                <li key={doc.url}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDoc(index === activeDoc ? null : index)
                    }
                    aria-pressed={index === activeDoc}
                    aria-label={t("docOpen", { name: doc.fileName })}
                    className="rounded-md border border-line transition-dignified hover:border-line-strong focus:outline-2 focus:outline-primary/40"
                  >
                    <Image
                      src={doc.url}
                      alt={t("docThumb", {
                        kind: t(`docKind_${doc.kind}`, { default: doc.kind }),
                      })}
                      width={96}
                      height={96}
                      className="h-24 w-24 rounded-md object-cover"
                    />
                  </button>
                  <p className="mt-1 max-w-24 truncate text-xs text-ink-faint">
                    {doc.fileName}
                  </p>
                </li>
              ))}
            </ul>
            {activeDoc !== null && detail.documents[activeDoc] && (
              <figure className="mt-4 rounded-md border border-line p-3">
                {/* Sensitive document viewing stays inside the authenticated
                    admin surface; the URL is never copied elsewhere. */}
                <Image
                  src={detail.documents[activeDoc].url}
                  alt={t("docLarge", {
                    name: detail.documents[activeDoc].fileName,
                  })}
                  width={640}
                  height={420}
                  className="max-h-[420px] w-auto rounded"
                />
                <figcaption className="mt-2 text-xs text-ink-faint">
                  {detail.documents[activeDoc].fileName}
                </figcaption>
              </figure>
            )}
          </>
        )}
      </section>

      {/* Verification history */}
      <section aria-label={t("detailHistory")} className="card p-4">
        <h3 className="mb-3 font-medium text-ink">{t("detailHistory")}</h3>
        {detail.history.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noHistory")}</p>
        ) : (
          <ol className="space-y-2">
            {detail.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-3 text-sm">
                <time className="shrink-0 text-ink-faint">{event.at}</time>
                <span className="font-medium text-ink">
                  {t(`event_${event.action}`, { default: event.action })}
                </span>
                <span className="text-ink-muted">
                  {event.admin}
                  {event.note ? ` — ${event.note}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-sm">
        <Link
          href="/admin/sellers"
          className="text-primary underline-offset-2 hover:underline"
        >
          {t("backToQueue")}
        </Link>
      </p>

      <div aria-live="polite" className="sr-only">
        {toast}
      </div>

      {dialog && (
        <ConfirmDialog
          open
          title={docDialog.title}
          body={t("confirmBody", { count: 1 })}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          danger={docDialog.danger}
          withReason={docDialog.withReason}
          reasonLabel={t("reasonLabel")}
          reasonRequired={dialog === "reject"}
          busy={busy}
          onConfirm={(reason) => void runDecision(dialog, reason)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
