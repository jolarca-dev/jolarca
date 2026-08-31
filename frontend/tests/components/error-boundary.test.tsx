// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/components/client/error-boundary";
import { logger } from "@/lib/logger";

import messages from "../../messages/en.json";

/**
 * Error boundary contract — sanitized reporting (component stack frames
 * only, never props/values), localized fallback with trace ID, and a
 * working retry path.
 */

function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Throws with PII-laden props — the props must NEVER reach the logger.
 * The thrown message is deliberately clean: what this test proves is
 * that React's boundary handoff (error + componentStack) carries no
 * prop values, not that developer-authored messages are auto-scrubbed. */
function Broken({ secretProp }: { secretProp: string }) {
  if (!secretProp) return null;
  throw new Error("boom");
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
  // React prints boundary errors to console during tests — silence.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders the localized fallback with a trace ID", () => {
    render(
      <Wrap>
        <ErrorBoundary section="test-section">
          <Broken secretProp="SECRET_VALUE_123" />
        </ErrorBoundary>
      </Wrap>,
    );

    expect(screen.getByText("Something went wrong on this page")).toBeTruthy();
    expect(screen.getByText(/The problem is on our side/)).toBeTruthy();
    // Trace reference is displayed for support correlation.
    expect(screen.getByText(/Reference:/)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByText("Return to home")).toBeTruthy();
  });

  it("logs a sanitized record — no prop values, no raw stack", () => {
    render(
      <Wrap>
        <ErrorBoundary section="checkout-island">
          <Broken secretProp="SECRET_VALUE_123" />
        </ErrorBoundary>
      </Wrap>,
    );

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = logSpy.mock.calls[0] as [string, unknown];
    expect(label).toContain("checkout-island");
    const wire = JSON.stringify(payload);
    expect(wire).not.toContain("SECRET_VALUE_123");
    expect(wire).toContain('"name":"Error"');
    expect(wire).toContain("componentStack");
  });

  it("retry resets the boundary and re-renders recovered children", () => {
    let shouldThrow = true;
    function Flaky(): ReactNode {
      if (shouldThrow) throw new Error("transient");
      return <div>recovered content</div>;
    }

    render(
      <Wrap>
        <ErrorBoundary section="flaky">
          <Flaky />
        </ErrorBoundary>
      </Wrap>,
    );
    expect(screen.getByText("Something went wrong on this page")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByText("recovered content")).toBeTruthy();
  });
});
