# JOL Marketplace — Grant Submission Package

**Programme:** 100-day digital platform sprint · **Applicant:** Journey of Life
**Status:** Final deliverable · **License of outcome:** AGPL-3.0 (public-good orientation)

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Scope and Objectives](#2-project-scope-and-objectives)
3. [Technical Approach and Innovation](#3-technical-approach-and-innovation)
4. [Timeline — 100-Day Breakdown](#4-timeline--100-day-breakdown)
5. [Team Composition and Roles](#5-team-composition-and-roles)
6. [Budget Breakdown (Indicative)](#6-budget-breakdown-indicative)
7. [Risk Assessment and Mitigation](#7-risk-assessment-and-mitigation)
8. [Success Metrics and KPIs](#8-success-metrics-and-kpis)
9. [Sustainability Plan Post-Grant](#9-sustainability-plan-post-grant)

---

## 1. Executive Summary

JOL Marketplace is a **Baltic-first e-commerce platform** — Lithuania,
Latvia, Estonia, in four languages — built for communities that mainstream
marketplaces ignore: Catholic and faith communities, parish suppliers, and
a **grief-aware funeral services vertical** that treats its visitors as
mourners, not consumers.

In 100 days the project delivered a working, compliance-grade platform:

- **Buyer storefront** with catalog, search, cart, and Stripe-powered
  checkout at PCI SAQ-A scope;
- **Seller onboarding** — business registration, KYC document upload,
  Stripe Connect payouts, multilingual listing creation;
- **Admin moderation backoffice** — verification queues, listing
  moderation, and a GDPR compliance queue (Art. 15/17/20) with full audit
  logging;
- **Funeral services directory** — lead-generation only, with an
  accessibility posture (WCAG AAA target) and an explicit no-dark-patterns
  contract enforced by automated tests;
- **GDPR-by-architecture**: consent-gated analytics, field-level
  encryption, anonymize-don't-delete erasure, EU-only data residency,
  self-hosted infrastructure.

The platform runs **fully self-hosted** (Proxmox 9.2 / Docker / Nginx) — no
managed-cloud lock-in — and ships with automated verification at every
layer: 164 frontend unit tests, a 45-scenario Playwright suite across three
device profiles, axe-core accessibility scans, and Lighthouse CI budgets
that fail the build if LCP exceeds 2 seconds.

**Funding need:** completion of the remaining backend contract endpoints
(57 registered, tracked publicly in the contract-gap registry) and the
Phase-2 AI ranking layer, detailed in §7 and `docs/MVP_REMAINING_WORK.md`.

## 2. Project Scope and Objectives

| Objective | Delivered status |
|---|---|
| Baltic multilingual storefront (lt/lv/et/en) | ✅ shipped |
| Seller onboarding + verification pipeline | ✅ frontend complete; verification endpoints pending (tracked) |
| Checkout with VAT-OSS-aware totals and parcel-locker delivery | ✅ frontend complete; payments contract in integration |
| Funeral services vertical (dignity-first) | ✅ shipped, ethically constrained by tests |
| Moderation + GDPR rights backoffice | ✅ shipped against registered contract |
| Compliance posture (GDPR, PCI SAQ-A, ISO/SOC2-oriented) | ✅ documented + enforced in CI |
| Performance budgets (LCP < 2s) | ✅ enforced in CI (Lighthouse) and runtime (Playwright) |

Explicit non-goals for the grant period (decided, not deferred by drift):
`ru` locale (A-06), subscription/Net-30 billing, diocese procurement panel
— each requires its own decision record.

## 3. Technical Approach and Innovation

1. **Sanctioned stubs over silent fakes (ADR-0007).** Instead of blocking
   UI work on backend completion, every missing endpoint is registered in
   a public, tested contract-gap registry and renders an honest notice.
   Reviewers see only real data; completion is measurable (57 gaps → 0).
2. **Compliance as architecture.** Consent gates script loading at the
   component level; erasure anonymizes rather than deletes financial
   records; PII columns are Fernet-encrypted; CSP is nonce-based per
   request. Compliance is enforced by tests, not promises.
3. **Dignity as an engineering constraint.** The funeral vertical's ethics
   (no pricing, no cart, no urgency language, human-first CTAs) are
   encoded in TypeScript types and asserted end-to-end — an unusually
   strict example of values-as-tests.
4. **Performance for the actual persona.** 50+ users on modest hardware:
   18px typography floor, server-rendered storefront with minimal client
   JS, LCP/CLS/TBT/SI budgets in CI on emulated mobile.
5. **Self-hosted sovereignty.** Every component (including analytics and
   fonts) runs on organization-owned infrastructure; container topology is
   orchestrator-agnostic.

## 4. Timeline — 100-Day Breakdown

| Days | Phase | Deliverables |
|---|---|---|
| 1–10 | Foundations | Monorepo, 11 domain apps, ADR register, CI skeleton, compliance matrix |
| 11–25 | Compliance core | Consent architecture, encryption primitives, retention engine, OpenAPI contract workflow |
| 26–45 | Buyer storefront | Catalog, product detail, search UX, cart, checkout steps, consent-gated analytics |
| 46–60 | Seller platform | Onboarding wizard, KYC upload, Stripe Connect flow, listing editor, dashboard |
| 61–75 | Moderation & rights | Admin layout + role gates, verification/listing queues, GDPR compliance queue, audit trail |
| 76–85 | Funeral vertical | Theme variant, directory, consultation lead-gen, grief-aware components, AAA pass |
| 86–93 | Search & performance | Command palette, facets, image optimization, streaming helpers, CWV monitoring, budgets |
| 94–100 | Verification & package | 45-scenario e2e suite, accessibility scans, documentation set, grant submission |

## 5. Team Composition and Roles

A deliberately lean team with compliance ownership concentrated:

| Role | Responsibility |
|---|---|
| Technical lead / architect | ADRs, contract design, review gates |
| Full-stack engineer (backend) | Django apps, payments, retention jobs |
| Full-stack engineer (frontend) | Storefront, backoffices, design system, tests |
| Compliance lead | GDPR register, consent policy versions, erasure decisions |
| Community/vertical liaison | Funeral-vertical ethics review, seller onboarding research |

CODEOWNERS enforces second approval on `payments_app`, `compliance_app`,
settings, and workflows — no single person can merge a payment or
compliance change alone.

## 6. Budget Breakdown (Indicative)

Indicative figures for the 100-day sprint (EUR, ex. VAT); final accounting
follows the organization's financial records:

| Item | Share | Notes |
|---|---|---|
| Engineering personnel (2.0 FTE × 100 days) | ~62% | Backend + frontend |
| Compliance & legal review | ~12% | GDPR register, terms, processor DPAs |
| Infrastructure | ~8% | Proxmox host amortization, backups, Stripe test environment |
| Design & accessibility audit | ~8% | Sacred-modern system, WCAG audit |
| Contingency | ~10% | Held against contract-completion variance |

Self-hosting keeps recurring platform costs near infrastructure-only after
the grant — see §9.

## 7. Risk Assessment and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backend contract gaps delay journeys | **High (current state)** | Medium | Public gap registry (57 items) makes progress measurable; UI degrades honestly; e2e journeys turn green endpoint-by-endpoint |
| Stripe verification latency for sellers | Medium | Medium | Express flow + "connect later from dashboard" path; KYC step never faked |
| Funeral-vertical misuse (commerce creep) | Low | High | Type-level + e2e enforcement; ethics review gate on content |
| Self-hosted ops burden | Medium | Medium | Runbooks, nightly backups, monitoring with paged alerts, quarterly restore drills |
| Baltic localization quality | Medium | Low | Native-speaker review cycle per locale; `latin-ext` font coverage; ICU plural rules per language |
| AI translation PII leakage | Low | High | PII guardrail filter before any external call; self-hosted model fallback; dedicated queue |

## 8. Success Metrics and KPIs

| KPI | Target | Instrument |
|---|---|---|
| Contract-gap burn-down | 57 → 0 before public launch | Registry count (CI-readable) |
| Core Web Vitals "Good" rate | LCP < 2s, CLS < 0.1, TBT < 200ms on mobile emulation | Lighthouse CI + consent-gated real-user CWV |
| Accessibility | 0 axe violations (WCAG 2.2 AA) on public pages; AAA on checkout/consent/funeral | Playwright axe scans |
| Checkout completion (post-launch) | ≥ industry baseline for test-card funnel | Plausible funnel (consented) |
| Seller onboarding completion | ≥ 70% of started applications submitted | Audit trail |
| Erasure SLA | 100% within `GDPR_ERASURE_SLA_DAYS` | Compliance queue metrics |
| Test health | ≥ 80% branch coverage floors; e2e green on stack | CI |

## 9. Sustainability Plan Post-Grant

- **Cost structure:** self-hosted infrastructure (~VM + storage) and
  Stripe's transaction fees are the only recurring platform costs; no
  per-seat SaaS dependencies.
- **Revenue path:** server-side platform commission on orders (already the
  designed settlement model); funeral vertical remains free/lead-gen by
  ethical commitment.
- **Open source:** AGPL-3.0 — the platform can serve as public
  infrastructure for other community marketplaces; contributions return
  through the same compliance gates.
- **Roadmap:** Phase-2 semantic search (pgvector), seller analytics,
  diocese procurement (requires ADR), `ru` locale (requires ADR) — see
  `docs/CHANGELOG.md` post-MVP roadmap.
- **Governance:** ADR process, assumption register, and CODEOWNERS review
  gates survive personnel changes; documentation (this package) is the
  onboarding corpus.

---

**Supporting documents:** [ARCHITECTURE.md](./ARCHITECTURE.md) ·
[TESTING.md](./TESTING.md) · [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) ·
[SECURITY.md](./SECURITY.md) · `docs/COMPLIANCE_MATRIX.md`
