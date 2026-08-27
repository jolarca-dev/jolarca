# JOL Marketplace — Executive Summary

**Journey of Life (JOL)** · Baltic-first European marketplace for ecclesiastical goods and grief-aware services · Final sprint deliverable · License: AGPL-3.0

---

## Mission

JOL Marketplace is a European e-commerce platform built for communities that
mainstream marketplaces ignore: **churches, parishes, religious communities,
and bereaved families**. It sells sacred goods — vestments, liturgical items,
devotional articles — through a **sacred-modern** design language, and opens
its funeral vertical to visitors as **mourners, not consumers**: a grief-aware
directory with no prices, no dark patterns, and no urgency mechanics.

## Unique Value

| Dimension | Position |
| --- | --- |
| **Sacred trust layer** | Seller verification (business registry + KYC-lite), listing moderation, and a design doctrine (ADR-0009) that forbids manipulative UX on grief-adjacent surfaces. |
| **GDPR-native by construction** | Consent-gated analytics, field-level encryption, Art. 17 erasure SLA, Art. 20 portability, PII-free logging — see [SECURITY_POSTURE.md](SECURITY_POSTURE.md) and [GDPR_COMPLIANCE.md](GDPR_COMPLIANCE.md). |
| **Self-hosted, data-sovereign** | No Vercel, no third-party analytics by default. Full stack runs on a single Proxmox VM (Docker + nginx) — see [DEPLOYMENT.md](DEPLOYMENT.md). |
| **Multilingual from day one** | Lithuanian, Latvian, Estonian, and English; locale-aware routing, hreflang, and translated error surfaces (LT/LV/EN at launch, ET content-ready). |

## Technical Innovation

- **React Server Components streaming** — home and catalog pages stream
  independent Suspense boundaries with CLS-safe skeletons; no await blocks
  the page shell (see [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md)).
- **AI translation pipeline with PII guardrails** — catalog translation runs
  in an isolated Celery queue with provider abstraction and a PII filter,
  never on the request path.
- **Stripe Connect for religious institutions** — embedded Payment Element
  keeps the platform at **PCI SAQ-A** scope; parishes and suppliers receive
  payouts via Connect Express with EU/SEPA support (ADR-0013).
- **Production security hardening** — per-request CSP nonces, `__Host-`
  cookie prefixing, SameSite=Strict sessions, zero-console production logging
  with PII scrubbing (ISO 27001 A.8 / SOC 2 CC6 aligned).

## Market

- **Launch:** Baltics (LT, LV, EE) — dense Catholic and Lutheran communities,
  underserved by horizontal marketplaces; funeral goods are culturally
  significant and locally sourced.
- **Expansion:** 27 EU member states (see [POST_MVP_ROADMAP.md](POST_MVP_ROADMAP.md)).
- **Segments (TAM → SAM → SOM):** EU religious goods and services is a
  multi-billion-euro annual market (TAM); the addressable online-capable
  Baltic + diaspora segment is estimated in the low hundreds of millions
  (SAM); the 12-month serviceable obtainable target is a five-figure GMV
  base anchored by onboarded parish suppliers and funeral homes
  (SOM — full model in [GRANT_APPLICATION.md](GRANT_APPLICATION.md)).

## Status at Day 100

Working, compliance-grade platform: buyer storefront, cart and Stripe
checkout, seller onboarding with KYC and payouts, admin moderation
backoffice, GDPR compliance queue, search, **254 frontend unit tests +
66 end-to-end scenarios + 32 backend test functions**, deterministic
production build, and a deployed-by-script path with backup, monitoring,
and rollback runbooks.

*Full narrative: [GRANT_SUBMISSION.md](GRANT_SUBMISSION.md) · Decisions: [ARCHITECTURE_DECISION_RECORDS.md](ARCHITECTURE_DECISION_RECORDS.md)*
