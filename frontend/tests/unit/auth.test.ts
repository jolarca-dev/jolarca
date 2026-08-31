import { describe, expect, it } from "vitest";

import { passwordStrength } from "@/lib/password-strength";
import { readCsrfToken, safeRedirectTarget } from "@/lib/auth";

describe("readCsrfToken (pure cookie-jar parser)", () => {
  it("extracts the csrftoken from a mixed jar", () => {
    const jar = "sessionid=abc; csrftoken=XYZ123; jol_locale=lt";
    expect(readCsrfToken(jar)).toBe("XYZ123");
  });

  it("returns undefined when absent or empty", () => {
    expect(readCsrfToken("sessionid=abc")).toBeUndefined();
    expect(readCsrfToken("")).toBeUndefined();
  });

  it("decodes URI-encoded tokens", () => {
    expect(readCsrfToken("csrftoken=a%2Fb%3D")).toBe("a/b=");
  });

  it("ignores lookalike cookie names", () => {
    expect(
      readCsrfToken("xc_srftoken=nope; csrftoken_extra=nope"),
    ).toBeUndefined();
  });

  it("falls back to the app's renamed CSRF cookies", () => {
    expect(readCsrfToken("jol_locale=lt; jol_csrf=ABC")).toBe("ABC");
    expect(readCsrfToken("__Host-jol_csrf=DEF")).toBe("DEF");
    // Framework default wins when both are present.
    expect(readCsrfToken("csrftoken=ONE; jol_csrf=TWO")).toBe("ONE");
  });
});

describe("safeRedirectTarget (open-redirect guard)", () => {
  it("passes same-origin relative paths", () => {
    expect(safeRedirectTarget("/lt/checkout?x=1")).toBe("/lt/checkout?x=1");
    expect(safeRedirectTarget("/account")).toBe("/account");
  });

  it("rejects protocol-relative and absolute targets", () => {
    expect(safeRedirectTarget("//evil.example")).toBe("/account");
    expect(safeRedirectTarget("https://evil.example")).toBe("/account");
  });

  it("defaults null/undefined/empty", () => {
    expect(safeRedirectTarget(null)).toBe("/account");
    expect(safeRedirectTarget(undefined)).toBe("/account");
    expect(safeRedirectTarget("")).toBe("/account");
  });
});

describe("passwordStrength heuristic", () => {
  it("scores trivial passwords as weak", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("aaaaaaaaaaaa").level).toBe("weak");
    expect(passwordStrength("password12345").level).toBe("weak");
  });

  it("scores long mixed passwords as strong", () => {
    const result = passwordStrength("Correct-Horse-9-Battery");
    expect(result.level).toBe("strong");
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("never exceeds the 0–4 range", () => {
    for (const pw of ["a", "abc123", "Xk9$mQ2!vL8@pR4z"]) {
      const { score } = passwordStrength(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});
