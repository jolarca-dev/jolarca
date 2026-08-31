import { describe, expect, it } from "vitest";

import { colors, funeralOverrides, funeralTheme, theme } from "@/styles/theme";

describe("theme (typed mirror of tokens.css)", () => {
  it("exposes the sacred-modern primary palette", () => {
    expect(theme.colors.primary).toBe("#1B4332");
    expect(theme.colors.surface).toBe("#F5F1EB");
    expect(theme.colors.gold).toBe("#C9A96E");
    expect(theme.colors.ink).toBe("#1A1A1A"); // warm charcoal, never #000
  });

  it("uses the major-third scale with 18px base and 3.052rem ceiling", () => {
    expect(theme.typography.scale.base).toBe("1.125rem");
    expect(theme.typography.scale["4xl"]).toBe("3.052rem");
    expect(theme.typography.leading.body).toBe(1.6);
  });

  it("motion is dignified: 200/400ms, no bounce easing", () => {
    expect(theme.motion.durationMicro).toBe("200ms");
    expect(theme.motion.durationPage).toBe("400ms");
    expect(theme.motion.ease).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("funeral theme overrides the palette completely where declared", () => {
    for (const [key, value] of Object.entries(funeralOverrides)) {
      expect(funeralTheme.colors[key as keyof typeof funeralTheme.colors]).toBe(
        value,
      );
    }
    expect(funeralTheme.colors.primary).toBe("#4A5568");
    expect(funeralTheme.colors.line).toBe("#E2E8F0");
  });

  it("funeral theme raises base type to 20px with 1.7 leading", () => {
    expect(funeralTheme.typography.scale.base).toBe("1.25rem");
    expect(funeralTheme.typography.leading.body).toBe(1.7);
  });

  it("funeral motion stays calmer than the default", () => {
    expect(parseInt(funeralTheme.motion.durationMicro)).toBeGreaterThanOrEqual(
      parseInt(theme.motion.durationMicro),
    );
  });

  it("every override key exists in the base palette (no drift)", () => {
    for (const key of Object.keys(funeralOverrides)) {
      expect(key in colors).toBe(true);
    }
  });
});
