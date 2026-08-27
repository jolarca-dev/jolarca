"use client";

/**
 * Listings moderation queue — flagged content with auto/manual reasons,
 * preview modal (images, sanitized description, price), and the four
 * actions: approve / reject / minor correction / escalate. Decisions go
 * through GAP-M02, corrections through GAP-M10; every mutation is
 * confirmed and audit-logged.
 */
import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import {
  correctListing,
  decideListing,
  fetchListingQueue,
  type ListingDecision,
  type ListingQueueRow,
} from "@/lib/admin";
import { isContractPending } from "@/stores/cart-store";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTable } from "./data-table";

interface PendingDecision {
  decision: ListingDecision;
  id: string;
}

function Overlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

export function ListingQueue({ adminEmail }: { adminEmail: string }) {
  const t = useTranslations("admin");
  const [rows, setRows] = useState<ListingQueueRow[]>([]);
  const [state, setState] = useState<"loading" | "gap" | "error" | "ready">(
    "loading",
  );
  const [preview, setPreview] = useState<ListingQueueRow | null>(null);
  const [editing, setEditing] = useState<ListingQueueRow | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "",
    price: "",
  });
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await fetchListingQueue();
      setRows(data);
      setState("ready");
    } catch (error) {
      setState(isContractPending(error) ? "gap" : "error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDecision(p: PendingDecision, reason: string) {
    setBusy(true);
    try {
      await decideListing(p.id, p.decision, reason, adminEmail);
      setToast(t("decisionRecorded", { count: 1 }));
      setPending(null);
      await load();
    } catch {
      setToast(t("decisionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function runCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await correctListing(
        editing.id,
        {
          title: editForm.title || undefined,
          category: editForm.category || undefined,
          price: editForm.price || undefined,
        },
        adminEmail,
      );
      setToast(t("decisionRecorded", { count: 1 }));
      setEditing(null);
      await load();
    } catch {
      setToast(t("decisionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Array<ColumnDef<ListingQueueRow, unknown>>>(
    () => [
      { accessorKey: "title", header: t("colTitle") },
      { accessorKey: "sellerName", header: t("colSeller") },
      { accessorKey: "category", header: t("colCategory") },
      {
        accessorKey: "flagReason",
        header: t("colFlagReason"),
        cell: ({ row }) => (
          <span className="text-ink-muted">
            {t(`flag_${row.original.flagReason}`, {
              default: row.original.flagReason || t("flagUnknown"),
            })}{" "}
            <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-faint">
              {t(
                row.original.flagSource === "auto" ? "flagAuto" : "flagManual",
              )}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("colStatus"),
        cell: ({ getValue }) =>
          t(`listingStatus_${getValue<string>()}`, {
            default: getValue<string>(),
          }),
      },
      {
        id: "actions",
        enableSorting: false,
        header: t("colActions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreview(row.original)}
              className="rounded border border-line px-2 py-1 text-xs text-primary transition-dignified hover:border-primary"
            >
              {t("preview")}
            </button>
            <button
              type="button"
              onClick={() =>
                setPending({ decision: "approve", id: row.original.id })
              }
              className="rounded border border-line px-2 py-1 text-xs text-success transition-dignified hover:border-success"
            >
              {t("approve")}
            </button>
            <button
              type="button"
              onClick={() =>
                setPending({ decision: "reject", id: row.original.id })
              }
              className="rounded border border-line px-2 py-1 text-xs text-danger transition-dignified hover:border-danger"
            >
              {t("reject")}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(row.original);
                setEditForm({
                  title: row.original.title === "—" ? "" : row.original.title,
                  category:
                    row.original.category === "—" ? "" : row.original.category,
                  price: row.original.price,
                });
              }}
              className="rounded border border-line px-2 py-1 text-xs text-ink-muted transition-dignified hover:border-line-strong"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() =>
                setPending({ decision: "escalate", id: row.original.id })
              }
              className="rounded border border-line px-2 py-1 text-xs text-warning transition-dignified hover:border-warning"
            >
              {t("escalate")}
            </button>
          </div>
        ),
      },
    ],
    [t],
  );

  const decisionMeta = pending
    ? {
        approve: {
          title: t("confirmApproveListingTitle"),
          danger: false,
          withReason: false,
        },
        reject: {
          title: t("confirmRejectListingTitle"),
          danger: true,
          withReason: true,
        },
        escalate: {
          title: t("confirmEscalateTitle"),
          danger: false,
          withReason: true,
        },
      }[pending.decision]
    : null;

  return (
    <section aria-label={t("listingQueueAria")} className="space-y-4">
      {state === "loading" && (
        <div className="card h-48 animate-pulse" aria-hidden="true" />
      )}
      {state === "gap" && <ContractGapNotice gapIds={["GAP-M01"]} />}
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
          emptyMessage={t("listingQueueEmpty")}
        />
      )}

      <div aria-live="polite" className="sr-only">
        {toast}
      </div>

      {/* Preview modal */}
      {preview && (
        <Overlay label={t("previewTitle")} onClose={() => setPreview(null)}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-primary-deep">
              {preview.title}
            </h2>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label={t("close")}
              className="rounded border border-line px-2 py-1 text-sm text-ink-muted hover:border-line-strong"
            >
              ✕
            </button>
          </div>
          {preview.price && (
            <p className="mt-1 font-medium text-ink">{preview.price} €</p>
          )}
          {preview.imageUrls.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.imageUrls.map((url) => (
                <Image
                  key={url}
                  src={url}
                  alt={t("previewImageAlt", { title: preview.title })}
                  width={160}
                  height={160}
                  className="h-40 w-40 rounded-md border border-line object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-faint">
              {t("previewNoImages")}
            </p>
          )}
          <div
            className="prose-sm mt-4 max-w-none text-ink"
            // Queue content is untrusted — sanitize at the render boundary.
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(preview.descriptionHtml, {
                ALLOWED_TAGS: [
                  "p",
                  "br",
                  "strong",
                  "em",
                  "u",
                  "ul",
                  "ol",
                  "li",
                ],
              }),
            }}
          />
        </Overlay>
      )}

      {/* Minor corrections modal */}
      {editing && (
        <Overlay label={t("editTitle")} onClose={() => setEditing(null)}>
          <form onSubmit={runCorrection}>
            <h2 className="text-lg font-semibold text-primary-deep">
              {t("editTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{t("editHint")}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="corr-title"
                  className="mb-1 block text-sm font-medium text-ink"
                >
                  {t("colTitle")}
                </label>
                <input
                  id="corr-title"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/40"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="corr-category"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    {t("colCategory")}
                  </label>
                  <input
                    id="corr-category"
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, category: e.target.value }))
                    }
                    className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/40"
                  />
                </div>
                <div>
                  <label
                    htmlFor="corr-price"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    {t("listingPrice")}
                  </label>
                  <input
                    id="corr-price"
                    inputMode="decimal"
                    value={editForm.price}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, price: e.target.value }))
                    }
                    className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/40"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-50"
              >
                {t("saveCorrections")}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {pending && decisionMeta && (
        <ConfirmDialog
          open
          title={decisionMeta.title}
          body={t("confirmBody", { count: 1 })}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          danger={decisionMeta.danger}
          withReason={decisionMeta.withReason}
          reasonLabel={t("reasonLabel")}
          reasonRequired={pending.decision === "reject"}
          busy={busy}
          onConfirm={(reason) => void runDecision(pending, reason)}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
