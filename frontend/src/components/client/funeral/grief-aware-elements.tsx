"use client";

/**
 * Reusable grief-aware primitives for the funeral vertical (ADR-0009).
 * Design rules they enforce: softer corners, muted colors, gentle hover,
 * generous spacing, serif dignity for headings, AAA-friendly ink tones.
 * Nothing here may ever render urgency, scarcity, or pricing.
 */
import type { ReactNode } from "react";

interface GriefButtonProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "quiet";
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
}

/** Softer corners, muted colors, gentle hover — never aggressive. */
export function GriefButton({
  children,
  onClick,
  href,
  variant = "secondary",
  type = "button",
  disabled = false,
  ariaLabel,
}: GriefButtonProps) {
  const base =
    "inline-block rounded-lg px-6 py-3 text-base transition-dignified focus:outline-2 focus:outline-offset-2 focus:outline-primary/60";
  const styles = {
    primary: "bg-primary text-surface-raised hover:bg-primary-deep",
    secondary:
      "border border-line-strong bg-surface-raised text-ink hover:border-primary/50",
    quiet: "text-primary underline-offset-4 hover:underline",
  }[variant];
  const className = `${base} ${styles} ${disabled ? "opacity-60" : ""}`;

  if (href) {
    return (
      <a href={href} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}

interface GriefHeadingProps {
  children: ReactNode;
  level?: 2 | 3;
  id?: string;
}

/** Serif, dignified, generous leading. */
export function GriefHeading({ children, level = 2, id }: GriefHeadingProps) {
  if (level === 3) {
    return (
      <h3
        id={id}
        className="font-display text-xl leading-(--tok-leading-tight) text-ink"
      >
        {children}
      </h3>
    );
  }
  return (
    <h2
      id={id}
      className="font-display text-2xl leading-(--tok-leading-tight) text-ink"
    >
      {children}
    </h2>
  );
}

interface GriefNoticeProps {
  title: string;
  children: ReactNode;
}

/** Informational box for "What to expect next" style guidance. */
export function GriefNotice({ title, children }: GriefNoticeProps) {
  return (
    <section className="rounded-lg border border-line bg-surface-raised p-6">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      <div className="mt-3 space-y-2 text-base leading-(--tok-leading) text-ink-muted">
        {children}
      </div>
    </section>
  );
}
