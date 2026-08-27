"use client";

/**
 * Screen reader announcements for components:
 *   const announce = useAnnounce();
 *   announce("Item added to cart", "polite");
 *
 * Messages are queued by the root-mounted Announcer island — safe to call
 * from rapid interactions (quantity steppers, cart adds) without
 * collisions.
 */
import { useCallback } from "react";

import { announceToScreenReader, type AnnouncePriority } from "@/lib/a11y";

export function useAnnounce() {
  return useCallback(
    (message: string, priority: AnnouncePriority = "polite") =>
      announceToScreenReader(message, priority),
    [],
  );
}
