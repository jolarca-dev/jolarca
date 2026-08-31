"use client";

/**
 * Seller verification queue — status filters, sortable DataTable, per-row
 * decisions (view / approve / reject-with-reason / request more info) and
 * bulk approve/reject. Every decision confirms first and emits an audit
 * event via decideSeller (GAP-M06 + GAP-M09).
 */
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import { Link } from "@/i18n/navigation";
import {
  decideSeller,
  fetchSellerQueue,
  SELLER_QUEUE_STATUSES,
  type SellerDecision,
  type SellerQueueRow,
  type SellerQueueStatus,
} from "@/lib/admin";
import { isContractPending } from "@/stores/cart-store";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTable } from "./data-table";

type Filter = "all" | SellerQueueStatus;

interface PendingAction {
  decision: SellerDecision;
  ids: string[];
}

const STATUS_BADGE: Record<SellerQueueStatus, string> = {
  pending: "bg-warning-soft text-warning",
  approved: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-danger",
  needs_review: "bg-info-soft text-info",
};

export function SellerQueue({ adminEmail }: { adminEmail: string }) {
  const t = useTranslations("admin");
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<SellerQueueRow[]>([]);
  const [state, setState] = useState<"loading" | "gap" | "error" | "ready">(
    "loading",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (next: Filter) => {
    setState("loading");
    try {
      const data = await fetchSellerQueue(next);
      setRows(data);
      setState("ready");
    } catch (error) {
      setState(isContractPending(error) ? "gap" : "error");
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function runAction(pending: PendingAction, reason: string) {
    setBusy(true);
    try {
      for (const id of pending.ids) {
        await decideSeller(id, pending.decision, reason, adminEmail);
      }
      setToast(t("decisionRecorded", { count: pending.ids.length }));
      setSelected([]);
      setAction(null);
      await load(filter);
    } catch {
      setToast(t("decisionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Array<ColumnDef<SellerQueueRow, unknown>>>(
    () => [
      {
        accessorKey: "businessName",
        header: t("colSeller"),
        cell: ({ row }) => (
          <Link
            href={`/admin/sellers/${row.original.id}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {row.original.businessName}
          </Link>
        ),
      },
      {
        accessorKey: "businessType",
        header: t("colBusinessType"),
        cell: ({ getValue }) =>
          t(`type_${getValue<string>()}`, { default: getValue<string>() }),
      },
      { accessorKey: "registeredAt", header: t("colRegistered") },
      {
        accessorKey: "documentsStatus",
        header: t("colDocuments"),
        cell: ({ getValue }) =>
          t(`docs_${getValue<string>()}`, { default: getValue<string>() }),
      },
      {
        accessorKey: "connectStatus",
        header: t("colConnect"),
        cell: ({ getValue }) =>
          t(`connect_${getValue<string>()}`, { default: getValue<string>() }),
      },
      {
        accessorKey: "verificationStatus",
        header: t("colStatus"),
        cell: ({ row }) => (
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.original.verificationStatus]}`}
          >
            {t(`status_${row.original.verificationStatus}`)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: t("colActions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setAction({ decision: "approve", ids: [row.original.id] })
              }
              className="rounded border border-line px-2 py-1 text-xs text-success transition-dignified hover:border-success"
            >
              {t("approve")}
            </button>
            <button
              type="button"
              onClick={() =>
                setAction({ decision: "reject", ids: [row.original.id] })
              }
              className="rounded border border-line px-2 py-1 text-xs text-danger transition-dignified hover:border-danger"
            >
              {t("reject")}
            </button>
            <button
              type="button"
              onClick={() =>
                setAction({ decision: "more_info", ids: [row.original.id] })
              }
              className="rounded border border-line px-2 py-1 text-xs text-ink-muted transition-dignified hover:border-line-strong"
            >
              {t("moreInfo")}
            </button>
          </div>
        ),
      },
    ],
    [t],
  );

  const actionMeta = action
    ? {
        approve: {
          title: t("confirmApproveTitle"),
          danger: false,
          withReason: false,
        },
        reject: {
          title: t("confirmRejectTitle"),
          danger: true,
          withReason: true,
        },
        hold: {
          title: t("confirmHoldTitle"),
          danger: false,
          withReason: true,
        },
        more_info: {
          title: t("confirmMoreInfoTitle"),
          danger: false,
          withReason: true,
        },
      }[action.decision]
    : null;

  return (
    <section aria-label={t("sellerQueueAria")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t("statusFilters")}
          className="flex flex-wrap gap-2"
        >
          {(["all", ...SELLER_QUEUE_STATUSES] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-full px-3 py-1 text-sm transition-dignified focus:outline-2 focus:outline-primary/40 ${
                filter === value
                  ? "bg-primary font-medium text-surface-raised"
                  : "border border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {t(`filter_${value}`)}
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div
            className="flex items-center gap-2"
            role="group"
            aria-label={t("bulkAria")}
          >
            <span className="text-sm text-ink-faint">
              {t("selectedCount", { count: selected.length })}
            </span>
            <button
              type="button"
              onClick={() => setAction({ decision: "approve", ids: selected })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
            >
              {t("bulkApprove")}
            </button>
            <button
              type="button"
              onClick={() => setAction({ decision: "reject", ids: selected })}
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-surface-raised transition-dignified hover:bg-danger/85"
            >
              {t("bulkReject")}
            </button>
          </div>
        )}
      </div>

      {state === "loading" && (
        <div className="card h-48 animate-pulse" aria-hidden="true" />
      )}
      {state === "gap" && <ContractGapNotice gapIds={["GAP-M04"]} />}
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
          enableSelection
          onSelectionChange={setSelected}
          emptyMessage={t("queueEmpty")}
        />
      )}

      <div aria-live="polite" className="sr-only">
        {toast}
      </div>

      {action && actionMeta && (
        <ConfirmDialog
          open
          title={actionMeta.title}
          body={t("confirmBody", { count: action.ids.length })}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          danger={actionMeta.danger}
          withReason={actionMeta.withReason}
          reasonLabel={t("reasonLabel")}
          reasonRequired={action.decision === "reject"}
          busy={busy}
          onConfirm={(reason) => void runAction(action, reason)}
          onCancel={() => setAction(null)}
        />
      )}
    </section>
  );
}
