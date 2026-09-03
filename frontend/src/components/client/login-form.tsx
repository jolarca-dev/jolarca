"use client";

/**
 * Login form island.
 * - Zod validation with real-time per-field errors (on blur) + full check on
 *   submit; backend errors surface verbatim (never a generic "login failed").
 * - UI rate limit: submit disabled for 5s after a failed attempt.
 * - Success: redirect to the validated `?redirect=` target or /account.
 * - Accessibility: label association, aria-describedby, aria-live announcements.
 */
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import { SESSION_QUERY_KEY } from "@/hooks/use-auth";
import { isApiError } from "@/lib/api-client";
import { login, safeRedirectTarget } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";

const LOCK_MS = 5000;

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const uid = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [locked, setLocked] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t("required")).email(t("invalidEmail")),
        password: z.string().min(1, t("required")),
      }),
    [t],
  );

  function validateField(name: "email" | "password", value: string) {
    const result = schema.shape[name].safeParse(value);
    setFieldErrors((prev) => ({
      ...prev,
      [name]: result.success ? undefined : result.error.errors[0]?.message,
    }));
  }

  function engageLock() {
    setLocked(true);
    setLockedUntil(Date.now() + LOCK_MS);
    window.setTimeout(() => setLocked(false), LOCK_MS);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || locked || Date.now() < lockedUntil) return;

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const next: typeof fieldErrors = {};
      for (const issue of parsed.error.errors) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !next[key]) {
          next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      await login(parsed.data.email, parsed.data.password, remember);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      router.refresh();
      router.push(safeRedirectTarget(searchParams.get("redirect")));
    } catch (error) {
      // Backend message verbatim (DRF detail) — no generic fallback.
      setFormError(isApiError(error) ? error.message : String(error));
      engageLock();
    } finally {
      setPending(false);
    }
  }

  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const errorId = `${uid}-form-error`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor={emailId} className="mb-1 block font-medium">
          {t("email")}
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => validateField("email", email)}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          className="w-full rounded-md border border-line bg-surface-raised px-3 py-2"
        />
        {fieldErrors.email && (
          <p id={`${emailId}-error`} className="mt-1 text-sm text-danger">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={passwordId} className="mb-1 block font-medium">
          {t("password")}
        </label>
        <input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => validateField("password", password)}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={
            fieldErrors.password ? `${passwordId}-error` : undefined
          }
          className="w-full rounded-md border border-line bg-surface-raised px-3 py-2"
        />
        {fieldErrors.password && (
          <p id={`${passwordId}-error`} className="mt-1 text-sm text-danger">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`${uid}-remember`}
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <label htmlFor={`${uid}-remember`}>{t("rememberMe")}</label>
      </div>

      {/* Announce submit-level errors assertively for assistive tech. */}
      <div aria-live="assertive" role="alert">
        {formError && (
          <p
            id={errorId}
            className="rounded-md bg-danger-soft px-3 py-2 text-danger"
          >
            {formError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || locked}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
      >
        {pending ? t("signingIn") : t("signIn")}
      </button>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/register">{t("noAccount")}</Link>
      </p>
    </form>
  );
}
