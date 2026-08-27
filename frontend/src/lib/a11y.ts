/**
 * Accessibility utilities — WCAG 2.2 AA floor, AAA on the funeral/consent
 * journeys. House conventions these utilities encode:
 *  - focus indicators: 2px outline, 2px offset (globals.css :focus-visible);
 *  - live announcements flow through the Announcer island (root-mounted)
 *    via the "jol:announce" bus — never ad-hoc aria-live regions;
 *  - everything here is SSR-safe (no-ops without `window`).
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/* -------------------------------------------------------------------------- */
/* Focus management                                                             */
/* -------------------------------------------------------------------------- */

/** Last element saved by trapFocus — restored via restoreFocus(). */
let savedActiveElement: HTMLElement | null = null;

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      // Layout visibility in real browsers; the attribute/style checks keep
      // the heuristic correct in jsdom (where offsetParent is always null).
      element.offsetParent !== null ||
      element === document.activeElement ||
      (!element.hidden &&
        element.getAttribute("aria-hidden") !== "true" &&
        element.style.display !== "none" &&
        element.style.visibility !== "hidden"),
  );
}

/**
 * Focus the first focusable element inside a container; falls back to the
 * container itself when it is focusable (tabindex="-1" panels). Returns
 * the element that received focus, if any.
 */
export function focusFirst(container: HTMLElement): HTMLElement | undefined {
  const first = getFocusableElements(container)[0];
  if (first) {
    first.focus();
    return first;
  }
  // No focusable children: make the container programmatically focusable
  // (outside the tab order) so focus still lands somewhere meaningful.
  if (container.getAttribute("tabindex") === null) {
    container.setAttribute("tabindex", "-1");
  }
  container.focus();
  return container;
}

/**
 * Trap Tab/Shift+Tab within `container`. Remembers the previously focused
 * element so `restoreFocus()` can return it on teardown. Returns a cleanup
 * function that removes the trap WITHOUT restoring focus (call
 * restoreFocus() explicitly when desired — the FocusTrap component does).
 */
export function trapFocus(container: HTMLElement): () => void {
  if (typeof window === "undefined") return () => undefined;
  savedActiveElement = (document.activeElement as HTMLElement | null) ?? null;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (active === last || !container.contains(active))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }

  container.addEventListener("keydown", onKeyDown);
  return () => container.removeEventListener("keydown", onKeyDown);
}

/** Return focus to the element active before the last trapFocus call. */
export function restoreFocus(): void {
  if (savedActiveElement && typeof savedActiveElement.focus === "function") {
    savedActiveElement.focus();
  }
  savedActiveElement = null;
}

/* -------------------------------------------------------------------------- */
/* Screen reader announcements                                                  */
/* -------------------------------------------------------------------------- */

export type AnnouncePriority = "polite" | "assertive";

export const ANNOUNCE_EVENT = "jol:announce";

export interface AnnounceDetail {
  message: string;
  priority: AnnouncePriority;
}

/**
 * Queue a screen reader announcement. The root-mounted Announcer island
 * consumes the event and sequences it through a live region; calling this
 * repeatedly never collides (the Announcer queues).
 */
export function announceToScreenReader(
  message: string,
  priority: AnnouncePriority = "polite",
): void {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent<AnnounceDetail>(ANNOUNCE_EVENT, {
      detail: { message: message.trim(), priority },
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Skip link                                                                    */
/* -------------------------------------------------------------------------- */

export const MAIN_CONTENT_ID = "main-content";

/**
 * Move focus to the main landmark: #main-content when present, otherwise
 * the first <main>. The target is given tabindex="-1" so programmatic
 * focus lands reliably (WCAG 2.4.1 bypass blocks). Returns true when a
 * target was focused.
 */
export function skipToContent(): boolean {
  if (typeof window === "undefined") return false;
  const target =
    document.getElementById(MAIN_CONTENT_ID) ??
    document.querySelector<HTMLElement>("main");
  if (!target) return false;
  if (target.getAttribute("tabindex") === null) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus();
  // Keep the target visually calm: blur outline only matters for keyboard
  // users, and focus is real — no scroll jump beyond the browser default.
  target.scrollIntoView?.({ block: "start" });
  return true;
}

/* -------------------------------------------------------------------------- */
/* Motion preference                                                            */
/* -------------------------------------------------------------------------- */

/** Respect OS-level reduced-motion preference (vestibular safety). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
