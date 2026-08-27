/**
 * RSC streaming helpers — the house pattern for progressive rendering on
 * the self-hosted runner (no Vercel-specific features):
 *
 *   <StreamedSection label="…">
 *     <SlowServerComponent />
 *   </StreamedSection>
 *
 * wraps a section in a Suspense boundary with a CLS-safe skeleton AND an
 * error boundary so one failing section never takes down the page.
 */
import { Component, Suspense, type ReactNode } from "react";

import { SkeletonGrid } from "@/components/rsc/skeleton-grid";
import { serializeError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Error boundary per streamed section — keeps failures isolated. */
class SectionErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // Sanitized record only — serializeError strips stacks and bodies.
    logger.error("streamed section failed", serializeError(error));
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * StreamingSection — Suspense wrapper with explicit fallback and an
 * OPTIONAL artificial delay for staggered visual appearance (sections
 * arriving one after another instead of all at once). The delay is
 * server-side: an async component that sleeps before rendering children,
 * so the fallback stays visible for `delayMs`. Keep delays small — LCP
 * outranks aesthetics; default is zero (no delay).
 */
async function Delay({ ms, children }: { ms: number; children: ReactNode }) {
  // Server-side sleep inside an async RSC component — Suspense keeps the
  // fallback visible until the promise resolves. Never blocks siblings.
  await new Promise((resolve) => setTimeout(resolve, ms));
  return children;
}

export function StreamingSection({
  fallback,
  children,
  delayMs,
}: {
  fallback: ReactNode;
  children: ReactNode;
  /** Optional stagger delay in milliseconds (0 = immediate). */
  delayMs?: number;
}) {
  return (
    <Suspense fallback={fallback}>
      {delayMs && delayMs > 0 ? (
        <Delay ms={delayMs}>{children}</Delay>
      ) : (
        children
      )}
    </Suspense>
  );
}

/**
 * Suspense + error boundary with a meaningful skeleton fallback.
 * `count` shapes the skeleton like the incoming grid so the swap causes
 * no layout shift.
 */
export function StreamedSection({
  label,
  count = 6,
  fallback,
  errorFallback,
  children,
}: {
  label: string;
  count?: number;
  fallback?: ReactNode;
  errorFallback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionErrorBoundary
      fallback={errorFallback ?? <SkeletonGrid count={count} label={label} />}
    >
      <Suspense
        fallback={fallback ?? <SkeletonGrid count={count} label={label} />}
      >
        {children}
      </Suspense>
    </SectionErrorBoundary>
  );
}
