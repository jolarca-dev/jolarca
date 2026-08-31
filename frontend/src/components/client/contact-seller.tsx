"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Link } from "@/i18n/navigation";
import { useIsAuthenticated } from "@/hooks/use-auth";

/**
 * Contact-seller island. PII-safe by construction: no email/phone is ever
 * rendered (the API never sends them). Anonymous buyers are routed to
 * sign-in; authenticated buyers get the honest roadmap note until the
 * order-system messaging lands.
 */
export function ContactSeller() {
  const t = useTranslations("storefront");
  const ta = useTranslations("auth");
  const authenticated = useIsAuthenticated();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    dialogRef.current?.close();
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-surface-raised transition-dignified hover:bg-primary-deep"
      >
        {t("contactSeller")}
      </button>
      {/* Native <dialog>: focus trap + ESC for free (WCAG 2.2). */}
      <dialog
        ref={dialogRef}
        aria-label={t("contactSeller")}
        className="m-auto w-full max-w-md rounded-lg border border-line bg-surface-raised p-6 text-ink backdrop:bg-ink/40"
        onClose={() => buttonRef.current?.focus()}
      >
        <p className="text-ink-muted">
          {authenticated ? t("contactBodyAuth") : t("contactBodyAnon")}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          {!authenticated && (
            <Link
              href="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium no-underline text-surface-raised transition-dignified hover:bg-primary-deep"
            >
              {ta("signIn")}
            </Link>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong"
          >
            {t("close")}
          </button>
        </div>
      </dialog>
    </>
  );
}
