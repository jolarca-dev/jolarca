import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { LoginForm } from "@/components/client/login-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("loginTitle"),
    // Auth pages are never indexed.
    robots: { index: false, follow: false },
  };
}

/** Placeholder social providers — enabled only when the backend ships OAuth. */
function SocialLoginPlaceholder() {
  return <SocialButtons />;
}

async function SocialButtons() {
  const t = await getTranslations("auth");
  return (
    <div className="mt-8">
      <p className="text-center text-sm text-ink-muted">{t("socialTitle")}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={t("socialSoon")}
          className="rounded-md border border-line bg-surface-raised px-4 py-2 text-ink-muted opacity-60"
        >
          Google
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={t("socialSoon")}
          className="rounded-md border border-line bg-surface-raised px-4 py-2 text-ink-muted opacity-60"
        >
          Apple
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-faint">
        {t("socialSoon")}
      </p>
    </div>
  );
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold text-primary-deep">
        {t("loginTitle")}
      </h1>
      <div className="card mt-6 p-6">
        {/* useSearchParams inside LoginForm requires a Suspense boundary. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <SocialLoginPlaceholder />
    </main>
  );
}
