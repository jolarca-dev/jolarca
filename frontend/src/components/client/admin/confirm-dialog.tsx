"use client";

/**
 * Accessible confirmation dialog for destructive admin actions.
 * role="alertdialog" + aria-modal, ESC closes, focus moves into the dialog
 * on open and back to the trigger on close. Destructive confirmations may
 * require typing a confirmation word (requireText) — used for erasure.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  /** When set, the user must type this exact word to enable confirm. */
  requireText?: string;
  requireHint?: string;
  /** When true, renders a reason textarea; onConfirm receives its value. */
  withReason?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  requireText,
  requireHint,
  withReason = false,
  reasonLabel,
  reasonRequired = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTyped("");
    setReason("");
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const blocked =
    (requireText ? typed !== requireText : false) ||
    (withReason && reasonRequired && reason.trim().length === 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="card w-full max-w-md p-6 shadow-lg focus:outline-2 focus:outline-primary/40"
      >
        <h2 className="text-lg font-semibold text-primary-deep">{title}</h2>
        <div className="mt-2 text-sm text-ink-muted">{body}</div>

        {requireText && (
          <div className="mt-4">
            <label
              htmlFor="confirm-dialog-text"
              className="mb-1 block text-sm font-medium text-ink"
            >
              {requireHint}
            </label>
            <input
              id="confirm-dialog-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/40"
            />
          </div>
        )}

        {withReason && (
          <div className="mt-4">
            <label
              htmlFor="confirm-dialog-reason"
              className="mb-1 block text-sm font-medium text-ink"
            >
              {reasonLabel}
            </label>
            <textarea
              id="confirm-dialog-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-primary focus:outline-2 focus:outline-primary/40"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || blocked}
            className={`rounded-md px-4 py-2 text-sm font-medium text-surface-raised transition-dignified disabled:opacity-50 ${
              danger
                ? "bg-danger hover:bg-danger/85"
                : "bg-primary hover:bg-primary-deep"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
