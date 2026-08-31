"use client";

/**
 * GDPR compliance queue — Art. 15 access, Art. 20 export, Art. 17 erasure.
 * Export rows offer the package download + fulfilment; erasure rows require
 * reviewing the impact list and typing DELETE before fulfilment (financial
 * records stay retained per statutory duties). Every fulfilment is
 * confirmed, audit-logged (GAP-M08 + M09) and carries the admin identity.
 */
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import {
  fetchComplianceRequests,
  fulfillComplianceRequest,
  type ComplianceRequestRow,
} from "@/lib/admin";
import { isContractPending } from "@/stores/cart-store";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTable } from "./data-table";

const STATUS_BADGE: Record<ComplianceRequestRow["status"], string> = {
  open: "bg-warning-soft text-warning",
  in_progress: "bg-info-soft text-info",
  fulfilled: "bg-success-soft text-success",
};

export function ComplianceQueue({ adminEmail }: { adminEmail: string }) {
  const t = useTranslations("admin");
  const [rows, setRows] = useState<ComplianceRequestRow[]>([]);
  const [state, setState] = useState<"loading" | "gap" | "error" | "ready">(
    "loading",
  );
  const [dialog, setDialog] = useState<{
    kind: "fulfill" | "erasure";
    row: ComplianceRequestRow;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await fetchComplianceRequests();
      setRows(data);
      setState("ready");
    } catch (error) {
      setState(isContractPending(error) ? "gap" : "error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runFulfill(note: string) {
    if (!dialog) return;
    setBusy(true);
    try {
      await fulfillComplianceRequest(dialog.row.id, note, adminEmail);
      setToast(t("decisionRecorded", { count: 1 }));
      setDialog(null);
      await load();
    } catch {
      setToast(t("decisionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Array<ColumnDef<ComplianceRequestRow, unknown>>>(
    () => [
      {
        accessorKey: "type",
        header: t("colRequestType"),
        cell: ({ row }) => t(`request_${row.original.type}`),
      },
      { accessorKey: "userEmail", header: t("colUser") },
      { accessorKey: "requestedAt", header: t("colRequested") },
      {
        accessorKey: "status",
        header: t("colStatus"),
        cell: ({ row }) => (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.original.status]}`}
          >
            {t(`requestStatus_${row.original.status}`)}
          </span>
        ),
      },
      {
        accessorKey: "assignedAdmin",
        header: t("colAssigned"),
        cell: ({ getValue }) => getValue<string>() || "—",
      },
      {
        id: "actions",
        enableSorting: false,
        header: t("colActions"),
        cell: ({ row }) => {
          const request = row.original;
          if (request.status === "fulfilled") return null;
          return (
            <div className="flex flex-wrap gap-2">
              {request.type === "export" && request.downloadUrl && (
                <a
                  href={request.downloadUrl}
                  download
                  className="rounded border border-line px-2 py-1 text-xs text-primary transition-dignified hover:border-primary"
                >
                  {t("downloadPackage")}
                </a>
              )}
              <button
                type="button"
                onClick={() =>
                  setDialog({
                    kind: request.type === "erasure" ? "erasure" : "fulfill",
                    row: request,
                  })
                }
                className={`rounded border border-line px-2 py-1 text-xs transition-dignified ${
                  request.type === "erasure"
                    ? "text-danger hover:border-danger"
                    : "text-success hover:border-success"
                }`}
              >
                {t("markFulfilled")}
              </button>
            </div>
          );
        },
      },
    ],
    [t],
  );

  return (
    <section aria-label={t("complianceAria")} className="space-y-4">
      <p className="rounded-md border border-gold/40 bg-gold-soft p-3 text-sm text-ink">
        {t("auditNotice")}
      </p>

      {state === "loading" && (
        <div className="card h-48 animate-pulse" aria-hidden="true" />
      )}
      {state === "gap" && <ContractGapNotice gapIds={["GAP-M07"]} />}
      {state === "error" && (
        <p
          role="alert"
          className="rounded-md bg-danger-soft p-3 text-sm text-ink"
        >
          {t("queueLoadFailed")}
        </p>
      )}
      {state === "ready" && (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          emptyMessage={t("complianceEmpty")}
        />
      )}

      <div aria-live="polite" className="sr-only">
        {toast}
      </div>

      {dialog && dialog.kind === "fulfill" && (
        <ConfirmDialog
          open
          title={t("confirmFulfillTitle")}
          body={t("confirmFulfillBody", { user: dialog.row.userEmail })}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          withReason
          reasonRequired={false}
          reasonLabel={t("fulfillNoteLabel")}
          busy={busy}
          onConfirm={(note) => void runFulfill(note)}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog && dialog.kind === "erasure" && (
        <ConfirmDialog
          open
          danger
          title={t("confirmErasureTitle")}
          body={
            <div className="space-y-2">
              <p>{t("erasureImpactIntro", { user: dialog.row.userEmail })}</p>
              <ul className="list-disc ps-5">
                <li>{t("erasureImpact1")}</li>
                <li>{t("erasureImpact2")}</li>
                <li>{t("erasureImpact3")}</li>
              </ul>
            </div>
          }
          confirmLabel={t("confirmErasure")}
          cancelLabel={t("cancel")}
          requireText="DELETE"
          requireHint={t("erasureHint")}
          busy={busy}
          onConfirm={() => void runFulfill("")}
          onCancel={() => setDialog(null)}
        />
      )}
    </section>
  );
}
