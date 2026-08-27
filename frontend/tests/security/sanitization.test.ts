import { describe, expect, it } from "vitest";

import { luhnValid, SCRUBBED, scrubPii, scrubString } from "@/lib/sanitization";

/**
 * PII scrubber coverage — every redaction pattern must be proven with a
 * realistic Baltic-market sample, and every pass-through case proven too
 * (over-redaction breaks log searchability).
 */

describe("scrubString — value patterns", () => {
  it("redacts emails", () => {
    expect(scrubString("contact jonas.kairys@example.lt now")).toContain(
      SCRUBBED,
    );
    expect(scrubString("contact jonas.kairys@example.lt now")).not.toContain(
      "jonas.kairys",
    );
  });

  it("redacts international phone numbers (LT/LV formats)", () => {
    expect(scrubString("call +370 612 34567")).not.toContain("612 34567");
    expect(scrubString("zvaniet +371 21234567")).not.toContain("21234567");
  });

  it("redacts IPv4 addresses", () => {
    expect(scrubString("from 192.168.12.34")).not.toContain("192.168.12.34");
  });

  it("redacts UUID-like strings (potential session tokens)", () => {
    expect(
      scrubString("session 3f2c9a1e-8b4d-4e7a-9f6c-1d2e3f4a5b6c end"),
    ).not.toContain("3f2c9a1e-8b4d-4e7a-9f6c-1d2e3f4a5b6c");
  });

  it("redacts Lithuanian personal codes", () => {
    expect(scrubString("AK 39001011234")).not.toContain("39001011234");
  });

  it("redacts Latvian personal codes (legacy and new 32-form)", () => {
    expect(scrubString("PK 120375-12345")).not.toContain("120375-12345");
    expect(scrubString("PK 32123456789")).not.toContain("32123456789");
  });

  it("redacts LT/LV postal codes", () => {
    expect(scrubString("ship to LT-01100")).not.toContain("LT-01100");
    expect(scrubString("sūtīt uz LV-1010")).not.toContain("LV-1010");
  });

  it("redacts Luhn-valid card fragments but keeps innocent long numbers", () => {
    expect(scrubString("card 4242 4242 4242 4242")).not.toContain("4242");
    // Order number: long but Luhn-invalid → survives.
    expect(scrubString("order 1000000000000001")).toContain("1000000000000001");
  });

  it("keeps plain text intact", () => {
    expect(scrubString("order status is pending")).toBe(
      "order status is pending",
    );
  });
});

describe("luhnValid", () => {
  it("accepts real test numbers and rejects invalid runs", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("1234567890123456")).toBe(false);
    expect(luhnValid("12a4")).toBe(false);
  });
});

describe("scrubPii — recursive traversal", () => {
  it("replaces PII-keyed values wholesale (incl. LT/LV field names)", () => {
    const scrubbed = scrubPii({
      vardas: "Jonas",
      pavarde: "Kairys",
      email: "j@example.lt",
      password: "hunter2",
      address: { street: "Gedimino pr. 1" },
      quantity: 3,
    }) as Record<string, unknown>;
    expect(scrubbed.vardas).toBe(SCRUBBED);
    expect(scrubbed.pavarde).toBe(SCRUBBED);
    expect(scrubbed.email).toBe(SCRUBBED);
    expect(scrubbed.password).toBe(SCRUBBED);
    expect(scrubbed.address).toBe(SCRUBBED);
    expect(scrubbed.quantity).toBe(3); // non-PII survives
  });

  it("scrubs nested arrays and pattern-matched string values", () => {
    const scrubbed = scrubPii({
      notes: ["deliver to +370 612 34567", "ok"],
    }) as { notes: string[] };
    expect(scrubbed.notes[0]).not.toContain("612 34567");
    expect(scrubbed.notes[1]).toBe("ok");
  });

  it("reduces Errors to name + scrubbed message", () => {
    const scrubbed = scrubPii(new Error("failed for j@example.lt")) as {
      name: string;
      message: string;
    };
    expect(scrubbed.name).toBe("Error");
    expect(scrubbed.message).not.toContain("j@example.lt");
  });

  it("passes primitives through and truncates deep nesting", () => {
    expect(scrubPii(42)).toBe(42);
    expect(scrubPii(null)).toBe(null);
    expect(scrubPii(undefined)).toBe(undefined);
    const deep = scrubPii(
      (() => {
        let node: Record<string, unknown> = { value: "leaf" };
        for (let i = 0; i < 12; i += 1) node = { child: node };
        return node;
      })(),
    );
    expect(JSON.stringify(deep)).toContain("[TRUNCATED]");
  });

  it("never throws on circular structures (depth cap cuts cycles)", () => {
    const node: Record<string, unknown> = { name: "loop" };
    node.self = node;
    expect(() => scrubPii(node)).not.toThrow();
    expect((scrubPii(node) as Record<string, unknown>).name).toBe(SCRUBBED);
  });
});
