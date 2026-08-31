"use client";

/**
 * Announcer — the single live-region island for the whole app. Mounted
 * once at the root; everything announces through lib/a11y's
 * `announceToScreenReader` (event bus) so rapid calls are QUEUED instead
 * of colliding in a shared aria-live region.
 *
 * Mechanics: two regions (polite = role status, assertive = role alert);
 * a message shows for ~3.5s, then the region clears so an identical next
 * message re-announces. Assertive messages jump the queue.
 */
import { useEffect, useRef, useState } from "react";

import { ANNOUNCE_EVENT, type AnnounceDetail } from "@/lib/a11y";

const DISPLAY_MS = 3500;

interface Slot {
  message: string;
  /** Keyed to force re-render for repeated identical messages. */
  stamp: number;
}

export function Announcer() {
  const [polite, setPolite] = useState<Slot | null>(null);
  const [assertive, setAssertive] = useState<Slot | null>(null);
  const queue = useRef<AnnounceDetail[]>([]);
  const busy = useRef(false);
  const stamp = useRef(0);

  useEffect(() => {
    function drain(): void {
      const next = queue.current.shift();
      if (!next) {
        busy.current = false;
        return;
      }
      busy.current = true;
      stamp.current += 1;
      const slot: Slot = { message: next.message, stamp: stamp.current };
      if (next.priority === "assertive") {
        setAssertive(slot);
      } else {
        setPolite(slot);
      }
      // Clear, then allow the next queued message to flow.
      window.setTimeout(() => {
        if (next.priority === "assertive") {
          setAssertive(null);
        } else {
          setPolite(null);
        }
      }, DISPLAY_MS);
      window.setTimeout(drain, 600);
    }

    function onAnnounce(event: Event): void {
      const detail = (event as CustomEvent<AnnounceDetail>).detail;
      if (!detail?.message) return;
      if (detail.priority === "assertive") {
        // Assertive messages go to the front — they exist to interrupt.
        queue.current.unshift(detail);
      } else {
        queue.current.push(detail);
      }
      if (!busy.current) drain();
    }

    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    return () => window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
  }, []);

  // The regions are ALWAYS in the DOM (adding aria-live regions at
  // announcement time is unreliable across screen readers). Content is
  // injected into pre-existing empty regions.
  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
        data-testid="announcer-polite"
      >
        {polite?.message}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
        data-testid="announcer-assertive"
      >
        {assertive?.message}
      </div>
    </>
  );
}
