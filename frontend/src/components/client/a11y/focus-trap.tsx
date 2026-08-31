"use client";

/**
 * FocusTrap — declarative wrapper for modals, drawers, dialogs:
 *
 *   <FocusTrap onEscape={close} label={t("dialogTitle")}>
 *     ...dialog contents...
 *   </FocusTrap>
 *
 * On mount: saves outside focus, moves focus to the first focusable
 * child, traps Tab/Shift+Tab. On unmount: restores the original focus.
 * Escape is forwarded to `onEscape` (close the dialog).
 */
import { useRef, type ReactNode } from "react";

import { useFocusTrap } from "@/hooks/use-focus-trap";

interface FocusTrapProps {
  children: ReactNode;
  /** Default true; pass false to render without trapping (e.g. hidden). */
  active?: boolean;
  onEscape?: () => void;
  /** Accessible label for the trapped region. */
  label?: string;
  className?: string;
}

export function FocusTrap({
  children,
  active = true,
  onEscape,
  label,
  className,
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, { active, onEscape });

  return (
    <div
      ref={containerRef}
      aria-label={label}
      className={className}
      // The wrapper itself is not tabbable; children own the tab order.
    >
      {children}
    </div>
  );
}
