import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";

// Session-gated: redirects depend on the live session.
export const dynamic = "force-dynamic";

/**
 * /seller — role-aware landing point. Sellers go to their dashboard; everyone
 * else is sent home. Kept deliberately thin: the real surfaces are
 * /seller/dashboard and /seller/onboarding.
 */
export default async function SellerIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (!session || session.role !== "seller") {
    redirect({ href: "/", locale });
  }
  redirect({ href: "/seller/dashboard", locale });
}
