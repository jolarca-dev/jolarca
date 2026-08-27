"use client";

/**
 * Registration form island.
 * - Email, password (+ strength indicator), confirm, account type, terms and
 *   GDPR consent. Consent checkboxes are hard gates: no consent, no submit.
 * - GDPR discipline (ADR-0009): the UI records intent, but consent evidence
 *   must be persisted server-side (compliance_app) — the client is never the
 *   ledger.
 * - Backend errors (e.g. duplicate email) surface verbatim via aria-live.
 */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import { isApiError } from "@/lib/api-client";
import { register } from "@/lib/auth";
import { passwordStrength } from "@/lib/password-strength";

const STRENGTH_COLOR: Record<string, string> = {
  weak: "bg-danger",
  fair: "bg-warning",
  good: "bg-info",
  strong: "bg-success",
};

export function RegisterForm({
  locale,
}: {
  locale: "lt" | "lv" | "et" | "en";
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const uid = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accountType, setAccountType] = useState<"buyer" | "seller" | "parish">(
    "buyer",
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const strength = passwordStrength(password);

  const schema = z
    .object({
      email: z.string().min(1, t("required")).email(t("invalidEmail")),
      password: z.string().min(12, t("passwordMin")),
      confirm: z.string().min(1, t("required")),
      acceptTerms: z.literal(true, {
        errorMap: () => ({ message: t("required") }),
      }),
      consent: z.literal(true, {
        errorMap: () => ({ message: t("required") }),
      }),
    })
    .refine((data) => data.password === data.confirm, {
      path: ["confirm"],
      message: t("passwordMismatch"),
    });

  type FieldErrors = Partial<
    Record<"email" | "password" | "confirm" | "acceptTerms" | "consent", string>
  >;
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const parsed = schema.safeParse({
      email,
      password,
      confirm,
      acceptTerms,
      consent,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.errors) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await register({ email, password, language: locale });
      // Backend owns session creation; send the user to sign in.
      router.push("/login");
    } catch (error) {
      setFormError(isApiError(error) ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  const id = (name: string) => `${uid}-${name}`;
  const err = (name: keyof FieldErrors) =>
    fieldErrors[name] ? `${id(name)}-error` : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor={id("email")} className="mb-1 block font-medium">
          {t("email")}
        </label>
        <input
          id={id("email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={err("email")}
          className="w-full rounded-md border border-line bg-surface-raised px-3 py-2"
        />
        {fieldErrors.email && (
          <p id={`${id("email")}-error`} className="mt-1 text-sm text-danger">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={id("password")} className="mb-1 block font-medium">
          {t("password")}
        </label>
        <input
          id={id("password")}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={`${id("password")}-strength ${err("password") ?? ""}`.trim()}
          className="w-full rounded-md border border-line bg-surface-raised px-3 py-2"
        />
        {/* Strength indicator (visual + announced). */}
        <div
          id={`${id("password")}-strength`}
          className="mt-2 flex items-center gap-2"
          aria-live="polite"
        >
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded ${
                  password && i <= strength.score - 1
                    ? STRENGTH_COLOR[strength.level]
                    : "bg-line"
                }`}
              />
            ))}
          </div>
          <span className="text-sm text-ink-muted">
            {password ? t(strength.level) : ""}
          </span>
        </div>
        {fieldErrors.password && (
          <p
            id={`${id("password")}-error`}
            className="mt-1 text-sm text-danger"
          >
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={id("confirm")} className="mb-1 block font-medium">
          {t("confirmPassword")}
        </label>
        <input
          id={id("confirm")}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={!!fieldErrors.confirm}
          aria-describedby={err("confirm")}
          className="w-full rounded-md border border-line bg-surface-raised px-3 py-2"
        />
        {fieldErrors.confirm && (
          <p id={`${id("confirm")}-error`} className="mt-1 text-sm text-danger">
            {fieldErrors.confirm}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={id("type")} className="mb-1 block font-medium">
          {t("accountType")}
        </label>
        <select
          id={id("type")}
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as typeof accountType)}
          className="w-full rounded-md border border-line bg-surface-raised px-3 py-2"
        >
          <option value="buyer">{t("buyer")}</option>
          <option value="seller">{t("seller")}</option>
          <option value="parish">{t("parish")}</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <input
            id={id("terms")}
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            aria-invalid={!!fieldErrors.acceptTerms}
            aria-describedby={err("acceptTerms")}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <label htmlFor={id("terms")}>
            {t.rich("acceptTerms", {
              link: (chunks) => (
                <Link href="/legal" className="text-info underline">
                  {chunks}
                </Link>
              ),
            })}
          </label>
        </div>
        {fieldErrors.acceptTerms && (
          <p id={`${id("terms")}-error`} className="text-sm text-danger">
            {fieldErrors.acceptTerms}
          </p>
        )}

        <div className="flex items-start gap-2">
          <input
            id={id("consent")}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={!!fieldErrors.consent}
            aria-describedby={err("consent")}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <label htmlFor={id("consent")}>
            {t.rich("consentProcessing", {
              link: (chunks) => (
                <Link href="/legal" className="text-info underline">
                  {chunks}
                </Link>
              ),
            })}
          </label>
        </div>
        {fieldErrors.consent && (
          <p id={`${id("consent")}-error`} className="text-sm text-danger">
            {fieldErrors.consent}
          </p>
        )}
      </div>

      <div aria-live="assertive" role="alert">
        {formError && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-danger">
            {formError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
      >
        {pending ? t("creating") : t("createAccount")}
      </button>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/login">{t("hasAccount")}</Link>
      </p>
    </form>
  );
}
