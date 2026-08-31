# JOL Marketplace — Design System ("Sacred-Modern")

**Version:** 1.0 · **Source of truth:** `frontend/src/styles/tokens.css`
**Audience:** Designers, frontend contributors, accessibility auditors

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Token Reference](#2-token-reference)
3. [Component Usage Guidelines](#3-component-usage-guidelines)
4. [Funeral Vertical Variant](#4-funeral-vertical-variant)
5. [Accessibility Requirements](#5-accessibility-requirements)

---

## 1. Design Principles

The system is called **sacred-modern**: the visual register of a place of
quiet reverence, implemented with modern e-commerce ergonomics. Five rules
outrank every individual taste decision:

1. **Dignity over urgency.** No countdown timers, no scarcity language, no
   auto-playing media, no pop-ups. Commerce may be persuasive; it must never
   be predatory.
2. **Calm hierarchy.** Serif display headings (Cormorant Garamond) carry
   meaning; the sans body (Inter) carries information. Decoration is
   confined to the gold accent — it never encodes meaning.
3. **Borders over shadows.** Hairline `--tok-line` borders define surfaces.
   Shadows are reserved for transient layers (drawers, dialogs).
4. **Motion is restrained.** `transition-dignified` (≈150ms ease) is the
   house motion. Nothing animates on scroll; nothing moves without user
   intent.
5. **Legibility for the 50+ persona on modest hardware.** 18px body floor,
   generous line-height, AAA contrast targets on the journeys that matter
   most (checkout, consent, funeral).

### Runtime theming model

Tokens are raw CSS custom properties (`--tok-*`) mapped once through
Tailwind's `@theme inline`, so utilities compile to `var(--tok-*)`.
A single class swap re-skins the entire tree — this powers the
`.theme-funeral` vertical and the `.theme-dark` admin mode with **zero CSS
duplication**.

## 2. Token Reference

### Color — brand

| Token | Value | Usage |
|---|---|---|
| `--tok-primary` | `#1B4332` | Links, primary buttons, active states |
| `--tok-primary-deep` | `#12332A` | Headings, hover/pressed states |
| `--tok-primary-soft` | `#E3EBE6` | Tinted surfaces, selected rows |
| `--tok-surface` | `#F5F1EB` | Page background ("stone") |
| `--tok-surface-raised` | `#FDFCFA` | Cards, panels, inputs |
| `--tok-gold` | `#C9A96E` | **Decorative only** — never carries meaning |
| `--tok-gold-soft` | `#F0E8D8` | Decorative fills, empty-image placeholder |
| `--tok-gold-ink` | `#7A6237` | Decorative caption text |

### Color — ink & lines

| Token | Value | Contrast | Usage |
|---|---|---|---|
| `--tok-ink` | `#1A1A1A` | ≈14:1 on stone | Body text |
| `--tok-ink-muted` | `#5C574E` | 6.3:1 | Secondary text |
| `--tok-ink-faint` | `#8A8478` | — | Captions **on raised surfaces only** |
| `--tok-line` | `#E7E0D5` | — | 1px borders |
| `--tok-line-strong` | `#D5CCBD` | — | Hover borders, dividers |

### Color — semantic (all ≥ 4.5:1 on stone)

| Token | Value | Contrast |
|---|---|---|
| `--tok-success` | `#245C3B` | 6.9:1 |
| `--tok-warning` | `#8A5A18` | 5.3:1 |
| `--tok-danger` | `#9B2C2C` | 6.7:1 |
| `--tok-info` | `#1F4E79` | 7.7:1 |

Each has a `-soft` companion (e.g. `#E2EEE5`) for status pills — dark text
on soft fill, never white text on mid tones.

### Typography

Self-hosted via `next/font` (zero third-party font requests — GDPR):

| Token | Size | Role |
|---|---|---|
| `--tok-font-display` | Cormorant Garamond (400–700, italic) | Headings only |
| `--tok-font-body` | Inter (latin + **latin-ext** for Baltic diacritics) | Everything else |
| `--tok-text-xs` | 0.72rem (12.96px) | Micro labels — never body |
| `--tok-text-sm` | 0.9rem (16.2px) | Helper text |
| `--tok-text-base` | 1.125rem (**18px floor**) | Body copy |
| `--tok-text-lg` | 1.406rem | Lead paragraphs |
| `--tok-text-xl` | 1.758rem | Section headings |

### Spacing, radii, motion

- Spacing follows the Tailwind scale; component padding clusters around
  `p-4` (cards) and `p-8` (page gutters).
- Radii: `rounded-md` for controls, `rounded-lg` for cards/dialogs.
- `transition-dignified` ≈150ms ease-out; hover states change **border
  color**, not position or size (CLS-safe).

## 3. Component Usage Guidelines

| Component | Location | Contract |
|---|---|---|
| `HomeHero` (no image) | `components/rsc/home-sections.tsx` | Full-bleed `bg-primary` (#1B4332) panel; serif `text-surface` title + `text-primary-soft` subtitle (≥12:1); image variant overlays `bg-ink/40` |
| `ProductGrid` | `components/rsc/product-grid.tsx` | 1→2→4 columns (mobile→tablet→desktop) |
| `ProductCard` | `components/rsc/product-card.tsx` | Pure RSC; blur placeholder; heading hierarchy stays flat (`h3` inside grids) |
| `OptimizedImage` | `components/rsc/image-optimizer.tsx` | `aboveTheFold` ⇒ `priority`; else `loading="lazy"`; fixed-size box ⇒ zero CLS |
| `SkeletonGrid` | `components/rsc/skeleton-grid.tsx` | `role="status" aria-busy`; fixed aspect boxes — the only sanctioned Suspense fallback |
| `StreamedSection` | `lib/streaming.tsx` | Suspense **plus** error boundary; one failing section never takes down a page |
| `DataTable` (TanStack v8) | `components/client/admin/data-table.tsx` | `aria-sort` headers, aria-live announcements on sort/filter/page |
| `ConfirmDialog` | `components/client/admin/confirm-dialog.tsx` | `role="alertdialog"`, ESC closes, focus restored; `requireText` for destructive gates, `withReason` for rejections |
| `ContractGapNotice` | `components/contract-gap-notice.tsx` | The **only** sanctioned degradation surface — shows GAP-IDs, never fake data (ADR-0007) |
| `GriefButton` / `GriefHeading` / `GriefNotice` | `components/client/funeral/grief-aware-elements.tsx` | Funeral vertical only — see §4 |

Rules:

- **Client islands are earned.** Every `"use client"` boundary must justify
  itself; RSC is the default.
- **Forms**: labels are always rendered (placeholders never replace
  labels); inline errors use `aria-live="assertive"` regions; required is
  the default reading — `optional` is the marked exception.
- **Money** always renders through `formatPrice` (locale-aware, never
  float math on the client).

## 4. Funeral Vertical Variant

The funeral services directory is **lead-generation, not e-commerce**. Its
visual grammar is a deliberate softening of the house system, applied by
wrapping the route in `<div className="theme-funeral">`:

| Override | Value | Intent |
|---|---|---|
| `--tok-text-base` | `1.25rem` (20px) | Larger, calmer reading size |
| Line height | 1.7 | Unhurried pacing |
| Muted palette | softened stone/lilac tones | No bright commerce signals |
| Headings | serif display everywhere | Editorial, not transactional |

Hard content rules (enforced in review and by the Playwright
`funeral-journey.spec.ts` contract):

- **No pricing, no cart, no "Buy now", no countdowns, no scarcity** —
  enforced at the type level (`FuneralHome` has no price field) and by e2e.
- A prominent **phone CTA** ("Speak to a human") on every page.
- Maps are OpenStreetMap embeds that mount **only on explicit user click**
  (no Google Maps; no third-party request before user action).
- Copy targets Flesch–Kincaid grade 6–8; grief-aware microcopy never
  implies obligation.

### Admin dark mode

`.theme-dark` (warm charcoal `#14120E` surface, light primary `#8FC7A8`)
reuses the same token cascade. Preference persists to `localStorage`
(`jol_admin_theme`) — a UI preference, not personal data.

## 5. Accessibility Requirements

**Floor: WCAG 2.2 AA everywhere. Target: AAA on checkout, consent, and
funeral journeys** (ratified scope decision).

| Requirement | Implementation |
|---|---|
| Contrast | All semantic/ink tokens pre-verified (table above); AAA ink ≈14:1 |
| Keyboard | Every interactive element reachable and operable; visible focus rings (`focus:outline-2`); command palette fully arrow/Enter/Esc driven |
| Screen readers | Landmarks (`header/main/nav`), `aria-live` for async results, `aria-sort` tables, dialog roles with labelled titles |
| Layout shift | Fixed-size media boxes + blur placeholders; skeleton grids sized to final layout |
| Motion | No autoplay, no parallax; transitions ≤150ms |
| Skip links | Present on funeral pages (`focus:not-sr-only` pattern) |
| Forms | Rendered labels, described errors, no placeholder-only fields |
| Verification | axe-core (WCAG 2.2 AA tags) in Playwright on all public pages; manual audit checklist at `audits/internal/` |

Known posture: `--tok-ink-faint` is reserved for captions on raised
surfaces precisely because it does not clear AA against raw stone — a
documented constraint, not an oversight.

---

**Cross-references:** [ARCHITECTURE.md](./ARCHITECTURE.md) ·
[TESTING.md](./TESTING.md) · tokens in `frontend/src/styles/tokens.css`
