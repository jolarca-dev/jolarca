/**
 * Typed mirror of the design tokens (single source of truth: src/styles/tokens.css).
 *
 * Use this ONLY where CSS custom properties are unavailable (canvas, inline
 * SVG attributes, dynamic chart colors). For everything else prefer the
 * Tailwind utilities / var(--tok-*). If a value changes, update tokens.css
 * first, then sync this file — CI review enforces parity.
 *
 * Tree-shakeable: every export is a named const; bundlers drop unused ones.
 */

/* --- Structural types (widened so theme variants can merge) --------------- */

export interface ThemeColors {
  primary: string;
  primaryDeep: string;
  primarySoft: string;
  surface: string;
  surfaceRaised: string;
  gold: string;
  goldSoft: string;
  goldInk: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  line: string;
  lineStrong: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
}

export type ColorToken = keyof ThemeColors;

export type TypeScaleStep =
  "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";

export interface ThemeTypography {
  fontDisplay: string;
  fontBody: string;
  scale: Record<TypeScaleStep, string>;
  leading: { body: number; tight: number };
  /** Funeral vertical: 20px base, 1.7 leading. */
  funeral: { base: string; leadingBody: number };
}

export interface ThemeMotion {
  ease: string;
  durationMicro: string;
  durationPage: string;
  funeral: { durationMicro: string; durationPage: string };
}

export interface Theme {
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: typeof spacing;
  elevation: typeof elevation;
  motion: ThemeMotion;
}

/* --- Values ---------------------------------------------------------------- */

export const colors: ThemeColors = {
  /** Deep forest green — primary action + headings (9.8:1 on stone). */
  primary: "#1B4332",
  primaryDeep: "#12332A",
  primarySoft: "#E3EBE6",
  /** Warm stone surfaces. */
  surface: "#F5F1EB",
  surfaceRaised: "#FDFCFA",
  /** Aged gold — decorative ONLY (2.0:1). Use goldInk for meaningful text. */
  gold: "#C9A96E",
  goldSoft: "#F0E8D8",
  goldInk: "#7A6237",
  /** Warm charcoal ink — never pure black. */
  ink: "#1A1A1A",
  inkMuted: "#5C574E",
  inkFaint: "#8A8478",
  /** Lines — 1px borders preferred over shadows. */
  line: "#E7E0D5",
  lineStrong: "#D5CCBD",
  /** Semantic — all >= 4.5:1 (WCAG 2.2 AA) on `surface`. */
  success: "#245C3B",
  successSoft: "#E2EEE5",
  warning: "#8A5A18",
  warningSoft: "#F4EAD7",
  danger: "#9B2C2C",
  dangerSoft: "#F5E2E2",
  info: "#1F4E79",
  infoSoft: "#E1EAF3",
};

/**
 * Funeral variant — only the tokens that change under `.theme-funeral`.
 * Merge: `{ ...colors, ...funeralOverrides }`.
 */
export const funeralOverrides: Partial<ThemeColors> = {
  primary: "#4A5568",
  primaryDeep: "#3A4353",
  primarySoft: "#E6E9EE",
  surface: "#F4F6F8",
  surfaceRaised: "#FDFDFE",
  gold: "#A8A29A",
  goldSoft: "#ECEAE6",
  goldInk: "#635F58",
  ink: "#26282C",
  inkMuted: "#4C5158",
  inkFaint: "#7B8087",
  line: "#E2E8F0",
  lineStrong: "#CBD2DC",
  success: "#2F5D50",
  successSoft: "#E3ECE9",
  warning: "#7D5A24",
  warningSoft: "#F0E9DC",
  danger: "#8F3A3A",
  dangerSoft: "#F2E4E4",
  info: "#3D5A80",
  infoSoft: "#E4EAF1",
};

export const typography: ThemeTypography = {
  fontDisplay: '"Cormorant Garamond", Georgia, serif',
  fontBody: '"Inter", system-ui, sans-serif',
  /** Major third (1.25) scale, 18px base, H1 capped at 3.052rem. */
  scale: {
    xs: "0.72rem",
    sm: "0.9rem",
    base: "1.125rem",
    lg: "1.406rem",
    xl: "1.758rem",
    "2xl": "2.197rem",
    "3xl": "2.746rem",
    "4xl": "3.052rem",
  },
  leading: { body: 1.6, tight: 1.2 },
  funeral: { base: "1.25rem", leadingBody: 1.7 },
};

export const spacing = {
  /** 8px grid — use even Tailwind steps; explicit multiples below. */
  grid: "0.5rem",
  sectionSm: "5rem", // 80px
  section: "6rem", // 96px
  sectionLg: "7.5rem", // 120px
} as const;

export const elevation = {
  /** Prefer `1px solid ${colors.line}` over any shadow. */
  border: `1px solid ${colors.line}`,
  borderStrong: `1px solid ${colors.lineStrong}`,
  shadowSm: "0 1px 2px rgba(26,26,26,0.04), 0 1px 3px rgba(27,67,50,0.05)",
  shadowMd: "0 2px 4px rgba(26,26,26,0.04), 0 4px 12px rgba(27,67,50,0.07)",
  shadowLg: "0 4px 8px rgba(26,26,26,0.05), 0 12px 32px rgba(27,67,50,0.09)",
} as const;

export const motion: ThemeMotion = {
  /** Dignified easing only — no bounce, no spring physics. */
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  durationMicro: "200ms",
  durationPage: "400ms",
  funeral: { durationMicro: "250ms", durationPage: "500ms" },
};

/* --- Theme objects ----------------------------------------------------------- */

/** Default (sacred-modern) theme object for runtime consumers. */
export const theme: Theme = {
  colors,
  typography,
  spacing,
  elevation,
  motion,
};

/** Funeral theme — full palette merge + calmer type/motion. */
export const funeralTheme: Theme = {
  colors: { ...colors, ...funeralOverrides },
  typography: {
    ...typography,
    scale: { ...typography.scale, base: typography.funeral.base },
    leading: { ...typography.leading, body: typography.funeral.leadingBody },
  },
  spacing,
  elevation,
  motion: {
    ...motion,
    durationMicro: motion.funeral.durationMicro,
    durationPage: motion.funeral.durationPage,
  },
};
