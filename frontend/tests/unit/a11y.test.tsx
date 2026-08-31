// @vitest-environment jsdom
/**
 * A11y primitives — unit + axe-core verification. Every interactive
 * primitive must be keyboard operable and violation-free under axe's
 * WCAG 2.x ruleset; the lib utilities are exercised against a live DOM.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";

import { Announcer } from "@/components/client/a11y/announcer";
import { ErrorSummary } from "@/components/client/a11y/error-summary";
import { FocusTrap } from "@/components/client/a11y/focus-trap";
import { AccessiblePagination } from "@/components/client/a11y/pagination";
import { SkipLink } from "@/components/client/a11y/skip-link";
import { VisuallyHidden } from "@/components/client/a11y/visually-hidden";
import {
  announceToScreenReader,
  ANNOUNCE_EVENT,
  focusFirst,
  prefersReducedMotion,
  restoreFocus,
  skipToContent,
  trapFocus,
} from "@/lib/a11y";
import {
  errorIdFor,
  errorSummaryEntries,
  fieldAriaProps,
  hasErrors,
} from "@/lib/validation";

// vitest-axe's own extend-expect entry does not bind under Vitest 4's
// module registry; extend explicitly. The module augmentation below gives
// the matcher its typing.
expect.extend(axeMatchers);

declare module "vitest" {
  interface Assertion<T> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

const MESSAGES = {
  a11y: {
    skipToMain: "Skip to main content",
    paginationAria: "Result pages",
    previousPage: "Previous",
    nextPage: "Next",
    pageNumber: "Page {page}",
    errorSummaryTitle: "There is a problem",
    errorSummaryBody: "Fix the following before continuing:",
  },
};

function withIntl(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {ui}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

/* -------------------------------------------------------------------------- */
/* axe-core scans of every primitive                                            */
/* -------------------------------------------------------------------------- */

describe("axe-core: primitives are violation-free", () => {
  it("SkipLink", async () => {
    const { container } = render(withIntl(<SkipLink />));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AccessiblePagination", async () => {
    const { container } = render(
      withIntl(
        <AccessiblePagination
          page={2}
          totalPages={5}
          onPageChange={() => {}}
        />,
      ),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ErrorSummary", async () => {
    const { container } = render(
      withIntl(
        <>
          <ErrorSummary errors={{ email: ["Email is required"] }} />
          <label htmlFor="email">Email</label>
          <input
            id="email"
            aria-invalid="true"
            aria-describedby={errorIdFor("email")}
          />
        </>,
      ),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("FocusTrap", async () => {
    const { container } = render(
      withIntl(
        <FocusTrap label="Dialog">
          <button type="button">First</button>
          <button type="button">Second</button>
        </FocusTrap>,
      ),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Announcer", async () => {
    const { container } = render(<Announcer />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

/* -------------------------------------------------------------------------- */
/* Behavior                                                                     */
/* -------------------------------------------------------------------------- */

describe("FocusTrap behavior", () => {
  it("moves focus inside on mount and traps Tab at the edges", () => {
    render(
      withIntl(
        <>
          <button type="button" data-testid="outside">
            Outside
          </button>
          <FocusTrap>
            <button type="button" data-testid="first">
              First
            </button>
            <button type="button" data-testid="second">
              Second
            </button>
          </FocusTrap>
        </>,
      ),
    );

    const first = document.querySelector(
      "[data-testid='first']",
    ) as HTMLButtonElement;
    const second = document.querySelector(
      "[data-testid='second']",
    ) as HTMLButtonElement;

    // Auto-activates on mount.
    expect(document.activeElement).toBe(first);

    // Tab from the last element wraps to the first.
    fireEvent.keyDown(second, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first element wraps to the last.
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(second);
  });
});

describe("Announcer behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders announcements into the polite region and clears them", () => {
    const { getByTestId } = render(<Announcer />);
    const region = getByTestId("announcer-polite");

    fireEvent(
      window,
      new CustomEvent(ANNOUNCE_EVENT, {
        detail: { message: "Item added to cart", priority: "polite" },
      }),
    );
    expect(region.textContent).toBe("Item added to cart");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(region.textContent).toBe("");
  });

  it("routes assertive messages to the alert region", () => {
    const { getByTestId } = render(<Announcer />);
    fireEvent(
      window,
      new CustomEvent(ANNOUNCE_EVENT, {
        detail: { message: "Payment failed", priority: "assertive" },
      }),
    );
    expect(getByTestId("announcer-assertive").textContent).toBe(
      "Payment failed",
    );
  });
});

describe("AccessiblePagination behavior", () => {
  it("marks the current page and navigates with arrow keys", () => {
    const onPageChange = vi.fn();
    const { getByRole } = render(
      withIntl(
        <AccessiblePagination
          page={2}
          totalPages={5}
          onPageChange={onPageChange}
        />,
      ),
    );

    const current = getByRole("button", { name: "Page 2" });
    expect(current.getAttribute("aria-current")).toBe("page");

    const nav = getByRole("navigation");
    fireEvent.keyDown(nav, { key: "ArrowRight" });
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.keyDown(nav, { key: "ArrowLeft" });
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("renders nothing for a single page", () => {
    const { container } = render(
      withIntl(
        <AccessiblePagination
          page={1}
          totalPages={1}
          onPageChange={() => {}}
        />,
      ),
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("ErrorSummary behavior", () => {
  it("lists errors as links into the fields and takes focus", () => {
    render(
      withIntl(<ErrorSummary errors={{ email: ["Required"], name: "" }} />),
    );
    const alert = document.querySelector("[role='alert']") as HTMLElement;
    expect(alert).not.toBeNull();
    expect(document.activeElement).toBe(alert);
    const link = alert.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("#email");
  });
});

describe("VisuallyHidden", () => {
  it("hides visually without display:none (still readable by AT)", () => {
    const { container } = render(<VisuallyHidden>Hidden label</VisuallyHidden>);
    const span = container.querySelector("span") as HTMLElement;
    expect(span.textContent).toBe("Hidden label");
    expect(span.style.display).not.toBe("none");
    expect(span.style.position).toBe("absolute");
    expect(span.style.clip).toBe("rect(0px, 0px, 0px, 0px)");
  });
});

/* -------------------------------------------------------------------------- */
/* lib/a11y utilities                                                           */
/* -------------------------------------------------------------------------- */

describe("lib/a11y", () => {
  it("focusFirst falls back to the container itself", () => {
    document.body.innerHTML = "<div id='panel'><p>no controls</p></div>";
    const panel = document.getElementById("panel") as HTMLElement;
    expect(focusFirst(panel)).toBe(panel);
    expect(panel.getAttribute("tabindex")).toBe("-1");

    // A container that already carries a tabindex keeps it.
    document.body.innerHTML = "<div id='p2' tabindex='-1'></div>";
    const p2 = document.getElementById("p2") as HTMLElement;
    expect(focusFirst(p2)).toBe(p2);
  });

  it("trapFocus pulls focus in from outside and blocks empty traps", () => {
    document.body.innerHTML =
      "<button id='outside'>out</button><div id='trap'><a href='#a'>A</a><a href='#b'>B</a></div><div id='empty'></div>";
    const outside = document.getElementById("outside") as HTMLButtonElement;
    const trap = document.getElementById("trap") as HTMLElement;
    const empty = document.getElementById("empty") as HTMLElement;
    outside.focus();

    const cleanupTrap = trapFocus(trap);
    // Forward Tab while focus is OUTSIDE pulls to the first element.
    fireEvent.keyDown(trap, { key: "Tab" });
    expect((document.activeElement as HTMLElement).textContent).toBe("A");
    // Shift+Tab from outside pulls to the last element.
    fireEvent.keyDown(trap, { key: "Tab", shiftKey: true });
    expect((document.activeElement as HTMLElement).textContent).toBe("B");
    cleanupTrap();

    // restoreFocus (called by useFocusTrap on teardown) returns to the
    // element that was active before the trap.
    restoreFocus();
    expect(document.activeElement).toBe(outside);

    // Empty trap: Tab is swallowed, focus never escapes.
    outside.focus();
    const cleanupEmpty = trapFocus(empty);
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    empty.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    cleanupEmpty();

    // restoreFocus with nothing saved is a safe no-op.
    expect(() => restoreFocus()).not.toThrow();
  });

  it("announceToScreenReader dispatches a queued event; blank is ignored", () => {
    const received: Array<CustomEvent["detail"]> = [];
    const listener = (event: Event) =>
      received.push((event as CustomEvent).detail);
    window.addEventListener(ANNOUNCE_EVENT, listener);

    announceToScreenReader("  ");
    announceToScreenReader("Saved", "assertive");

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ message: "Saved", priority: "assertive" });
    window.removeEventListener(ANNOUNCE_EVENT, listener);
  });

  it("skipToContent focuses #main-content, then falls back to <main>", () => {
    document.body.innerHTML = "<main><p>content</p></main>";
    expect(skipToContent()).toBe(true);
    expect(document.activeElement?.tagName).toBe("MAIN");

    document.body.innerHTML = "<div id='main-content'></div><main></main>";
    skipToContent();
    expect(document.activeElement?.id).toBe("main-content");

    document.body.innerHTML = "<div>nothing</div>";
    expect(skipToContent()).toBe(false);
  });

  it("prefersReducedMotion reads the media query", () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    window.matchMedia = original;
  });
});

/* -------------------------------------------------------------------------- */
/* lib/validation                                                               */
/* -------------------------------------------------------------------------- */

describe("lib/validation", () => {
  it("associates errors with fields via aria-describedby", () => {
    expect(errorIdFor("email")).toBe("email-error");
    expect(fieldAriaProps("email", ["Required"])).toEqual({
      "aria-invalid": true,
      "aria-describedby": "email-error",
    });
    expect(fieldAriaProps("email")).toEqual({});
    expect(fieldAriaProps("email", [""])).toEqual({});
  });

  it("flattens error maps for the summary", () => {
    const entries = errorSummaryEntries({
      email: ["Required", "Too long"],
      name: "",
      phone: "Invalid",
    });
    expect(entries).toEqual([
      { fieldId: "email", message: "Required" },
      { fieldId: "phone", message: "Invalid" },
    ]);
    expect(hasErrors({ name: "" })).toBe(false);
    expect(hasErrors({ phone: "Invalid" })).toBe(true);
  });
});
