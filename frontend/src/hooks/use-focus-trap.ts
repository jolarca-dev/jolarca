"use client";

/**
 * Focus trap hook — wraps modals, drawers, dialogs. Activates on mount
 * (or when `active` flips true): saves the previously focused element,
 * moves focus inside the container, traps Tab/Shift+Tab, and optionally
 * handles Escape. Deactivation/unmount restores focus to where the user
 * was — the WCAG 2.1 dialog contract.
 */
import { useEffect, type RefObject } from "react";

import { focusFirst, restoreFocus, trapFocus } from "@/lib/a11y";

interface UseFocusTrapOptions {
  /** Default true — set false to keep the trap dormant. */
  active?: boolean;
  /** Called on Escape (close the dialog). */
  onEscape?: () => void;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions = {},
): void {
  const { active = true, onEscape } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    const cleanupTrap = trapFocus(container);
    focusFirst(container);

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && onEscape) {
        event.stopPropagation();
        onEscape();
      }
    }
    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      cleanupTrap();
      restoreFocus();
    };
    // onEscape identity changes are the caller's responsibility (useCallback).
  }, [active, containerRef, onEscape]);
}
