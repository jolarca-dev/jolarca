# JOL Marketplace — Sprint Changelog (100-Day Sprint)

**Scope:** Human-curated sprint record. The machine-generated,
commit-derived changelog lives at the repository root (`CHANGELOG.md` —
do not edit by hand); this document is the grant-period narrative.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Table of Contents

1. [Sprint-by-Sprint Deliverables](#1-sprint-by-sprint-deliverables)
2. [Known Issues and Limitations](#2-known-issues-and-limitations)
3. [Post-MVP Roadmap](#3-post-mvp-roadmap)

---

## 1. Sprint-by-Sprint Deliverables

### Sprint 1 — Foundations (days 1–10)
- Monorepo layout: `backend/` (11 domain apps), `frontend/` (Next.js),
  `scripts/`, governance docs.
- ADR register opened (ADR-0001…0006): modular monolith, AGPL-3.0, dual
  i18n, Fernet encryption, S3-compatible storage, edge-restricted admin.
- CI skeleton: ruff/mypy/pytest, npm gates, Gitleaks secrets job.
- Compliance matrix + assumptions register seeded.

### Sprint 2 — Compliance Core (days 11–25)
- `core.EncryptedTextField` with MultiFernet rotation; pgcrypto extension
  provisioned (ADR-0004).
- Consent store architecture (versioned decisions, undecided-by-default)
  and consent banner; zero-analytics-by-default posture.
- Retention engine (`compliance_app/retention.py`) with
  `RETENTION_FINANCIAL_YEARS` and erasure SLA configuration.
- OpenAPI contract workflow: `make api-schema` → generated client →
  snapshot gate.

### Sprint 3 — Buyer Storefront (days 26–45)
- Sacred-modern design system (tokens.css, Cormorant Garamond + Inter
  self-hosted, latin-ext).
- Catalog home/category/product surfaces (RSC-first, skeleton streaming).
- Cart store + drawer; checkout wizard (address → delivery → payment →
  review) with VAT-OSS summary and Stripe Payment Element integration.
- Registration/login surfaces against the contract; session handling with
  httpOnly cookies.

### Sprint 4 — Seller Platform (days 46–60)
- Onboarding wizard: business info (LT/LV/EE registration formats), KYC
  upload (server-direct, no client processing of sensitive images),
  Stripe Connect Express setup with return-state handling, review/submit.
- Listing editor: multilingual titles, sanitized rich text, image
  pipeline (WebP conversion, reorder, crop hints).
- Seller dashboard: stats, paginated recent orders, quick actions.
- Fix: SSG prerendering was baking null-session redirects into gated
  pages — all role-gated pages moved to `force-dynamic`.

### Sprint 5 — Moderation & Rights (days 61–75)
- Admin layout with role gate (403 surface), responsive sidebar, dark
  mode via token variant.
- Seller verification queue (bulk actions, reasons), seller detail with
  document viewer and history; listing moderation (preview, corrections,
  escalation).
- GDPR compliance queue: Art. 15/17/20 flows, typed-DELETE erasure gate,
  audit emission on every mutation (GAP-M09).
- Reusable `DataTable` (TanStack v8) and `ConfirmDialog` primitives.

### Sprint 6 — Funeral Vertical (days 76–85)
- `.theme-funeral` token cascade; grief-aware components
  (GriefButton/GriefHeading/GriefNotice).
- Directory + service profiles: phone-first CTAs, minimal-friction
  consultation form (name + one contact method), user-initiated
  OpenStreetMap embeds behind a CSP-allowlisted frame.
- Ethics contract encoded: price-free types, e2e assertions banning
  commerce language and payment elements.

### Sprint 7 — Search & Performance (days 86–93)
- Search page: debounce, five facets, keyboard-navigable pagination,
  honest degradation (gap vs outage states); Cmd/Ctrl+K command palette
  with grouped suggestions and non-PII recent searches.
- Performance pass: AVIF/WebP + trimmed device ladder, source maps off,
  image optimizer wrapper, `StreamedSection` (Suspense + error boundary),
  preconnect/dns-prefetch hints, consent-gated Core Web Vitals.
- Lighthouse budgets hardened: Speed Index promoted to error;
  `scripts/lighthouse-budget.json` wired into LHCI.

### Sprint 8 — Verification & Package (days 94–100)
- Playwright suite: 45 scenarios across chromium / iPhone 14 / Pixel 7 —
  buyer, seller, funeral journeys; axe-core WCAG 2.2 AA; GDPR gate; LCP
  budget; smoke. CI split: backend-free smoke job vs full-stack journeys.
- Documentation package (this set): ARCHITECTURE, DESIGN_SYSTEM,
  API_CONTRACT, DEPLOYMENT, SECURITY, GDPR_COMPLIANCE, GRANT_SUBMISSION,
  TESTING, CHANGELOG.

## 2. Known Issues and Limitations

| Item | Status | Notes |
|---|---|---|
| **57 contract gaps** | Open, tracked | `frontend/src/lib/api/contract-gaps.ts` — every pending endpoint surfaces an honest notice; journeys fail with the GAP-id until implemented. This is the single largest launch blocker and is fully enumerated. |
| Login/session endpoints (GAP-U01…U05) | Pending | Registration is live; login/session surfaces degrade per doctrine |
| `ru` locale | Excluded by decision (A-06) | Requires an ADR (translation QA + market policy) |
| Assumption A-07 superseded | Resolved | Deployment target ratified as self-hosted Proxmox 9.2 / Docker (was: GKE candidate). Images remain orchestrator-agnostic. |
| Admin Orders/Users/Analytics | Honest stubs | GAP-M11/M12/M13 — nav entries show sanctioned notices |
| Stripe Connect seller onboarding | Partial | Frontend complete; Express account creation endpoint pending (GAP-V03) |
| Real-user CWV | Consent-gated | Metrics flow only after analytics consent; expect sparse data until adoption grows |
| `--tok-ink-faint` contrast | Documented constraint | Captions on raised surfaces only (DESIGN_SYSTEM.md §5) |
| Funeral directory data | Backend-pending | GAP-F02/F03 — the directory never invents providers; it shows the sanctioned notice instead |

## 3. Post-MVP Roadmap

Ordered by dependency, not date — each item requires its own ADR where
marked:

1. **Contract burn-down to zero** — the enumerated gaps, endpoint by
   endpoint, with the e2e suite as the acceptance meter.
2. **Phase-2 search** — pgvector semantic ranking behind the existing
   search protocol (A-05 path), AI-assisted ranking on the `ai` queue.
3. **Seller analytics** — consented, aggregated sales insight (no
   per-buyer profiling).
4. **Stripe Connect payouts hardening** — scheduled payouts surfacing,
   restricted-account remediation flows.
5. **Diocese procurement panel** — requires ADR (Net-30/SEPA was
   explicitly deferred from MVP scope).
6. **`ru` locale** — requires ADR-06 amendment.
7. **Import-linter contracts** — automate the cross-app import boundaries
   currently enforced by review (ADR-0001 follow-through).

---

**Cross-references:** root `CHANGELOG.md` (generated) ·
`docs/MVP_REMAINING_WORK.md` · `docs/ASSUMPTIONS.md` ·
`docs/TECH_DECISIONS.md`
