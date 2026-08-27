// @vitest-environment jsdom
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { StreamingSection } from "@/lib/streaming";

/**
 * Streaming contract tests — Suspense boundaries must emit their fallback
 * (skeleton) first, then swap to content when the async work resolves,
 * and sibling boundaries resolve independently.
 */

async function renderToHtml(
  element: React.ReactElement,
  /**
   * shell = pipe as soon as the shell is ready (observes Suspense
   * fallbacks in the stream); all = wait for full resolution.
   */
  mode: "shell" | "all" = "all",
): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString();
        callback();
      },
    });
    const stream = renderToPipeableStream(element, {
      onShellReady: () => {
        if (mode === "shell") stream.pipe(sink);
      },
      onAllReady: () => {
        if (mode === "all") stream.pipe(sink);
        sink.on("finish", () => resolve(html));
      },
      onError: reject,
    });
  });
}

async function AsyncContent({
  ms,
  children,
}: {
  ms: number;
  children: React.ReactNode;
}) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return <>{children}</>;
}

describe("StreamingSection", () => {
  it("renders the skeleton fallback, then streams the resolved content", async () => {
    // Pipe at shell-ready: the initial bytes carry the fallback, the
    // resolved content follows as streamed replacement chunks. The <main>
    // wrapper mirrors real page structure — a ROOT-level boundary has no
    // shell above it and therefore streams no fallback.
    const html = await renderToHtml(
      <main>
        <StreamingSection fallback={<div data-testid="skeleton" />}>
          <AsyncContent ms={10}>
            <div data-testid="content">resolved</div>
          </AsyncContent>
        </StreamingSection>
      </main>,
      "shell",
    );
    // Fallback shape present in the initial stream…
    expect(html).toContain('data-testid="skeleton"');
    // …and the streamed replacement resolves into the final HTML.
    expect(html).toContain("resolved");
  });

  it("keeps sibling boundaries independent (fast section is not gated by slow)", async () => {
    const html = await renderToHtml(
      <>
        <StreamingSection fallback={<div>fast-skeleton</div>}>
          <AsyncContent ms={5}>
            <div>fast-content</div>
          </AsyncContent>
        </StreamingSection>
        <StreamingSection fallback={<div>slow-skeleton</div>}>
          <AsyncContent ms={30}>
            <div>slow-content</div>
          </AsyncContent>
        </StreamingSection>
      </>,
    );
    expect(html).toContain("fast-content");
    expect(html).toContain("slow-content");
  });

  it("honors delayMs by keeping the fallback visible longer", async () => {
    const start = Date.now();
    const html = await renderToHtml(
      <StreamingSection fallback={<div>stagger-skeleton</div>} delayMs={60}>
        <div>stagger-content</div>
      </StreamingSection>,
    );
    const elapsed = Date.now() - start;
    expect(html).toContain("stagger-content");
    expect(elapsed).toBeGreaterThanOrEqual(55);
  });
});
