import { describe, expect, it } from "vitest";

import { CONTRACT_GAPS, contractGap } from "@/lib/api/contract-gaps";

describe("contract gaps registry", () => {
  it("has unique ids", () => {
    const ids = CONTRACT_GAPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every id follows the GAP-* convention", () => {
    for (const gap of CONTRACT_GAPS) {
      expect(gap.id).toMatch(/^GAP-[A-Z]{1,2}\d{2,3}$/);
    }
  });

  it("every path is versioned under /api/v1/", () => {
    for (const gap of CONTRACT_GAPS) {
      expect(gap.path.startsWith("/api/v1/")).toBe(true);
    }
  });

  it("every entry names an owning app and a justification", () => {
    for (const gap of CONTRACT_GAPS) {
      expect(gap.ownerApp.length).toBeGreaterThan(0);
      expect(gap.neededFor.length).toBeGreaterThan(0);
    }
  });

  it("contractGap resolves registered ids", () => {
    const gap = contractGap("GAP-Y01");
    expect(gap.method).toBe("POST");
    expect(gap.path).toBe("/api/v1/orders/{id}/payment-intent/");
  });

  it("contractGap throws loudly on unknown ids (ADR-0007)", () => {
    expect(() => contractGap("GAP-Z999")).toThrow(/Unknown contract gap/);
  });
});
