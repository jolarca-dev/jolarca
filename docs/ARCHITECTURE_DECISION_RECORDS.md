# Architecture Decision Records

**Scope:** Consolidated decision registry for grant reviewers. Engineering
detail for ADR-0001…0010 lives in [TECH_DECISIONS.md](TECH_DECISIONS.md);
this document adds the seven platform-level decisions taken during the
100-day sprint, continuing the existing numbering (no collisions).

**Format:** Context → Decision → Consequences. **Status:** Accepted.

## Registry Overview (ADR-0001…0010 — engineering registry)

| ID | Decision |
| --- | --- |
| ADR-0001 | Monorepo with domain-bounded Django apps |
| ADR-0002 | AGPL-3.0 licensing |
| ADR-0003 | Dual i18n: DB content vs UI strings |
| ADR-0004 | Field-level encryption (Fernet → pgcrypto path) |
| ADR-0005 | Object storage: MinIO dev / S3-compatible prod |
| ADR-0006 | Django admin retained, edge-restricted |
| ADR-0007 | Sanctioned stubs over silent fakes (contract-gap registry) |
| ADR-0008 | Frontend scope: storefront, seller dashboard, moderation backoffice |
| ADR-0009 | Frontend compliance & UX posture (sacred-modern) |
| ADR-0010 | Risk acceptance: js-yaml advisory in codegen toolchain |

---

## ADR-0011 — Next.js 15 App Router over Pages Router

**Context.** The storefront is content-heavy, SEO-critical, and served from
a modest self-hosted VM. Pages Router would force client-side data fetching
for catalog pages, shipping more JavaScript to every visitor and weakening
Core Web Vitals on 4G — the dominant connection class in our launch markets.

**Decision.** Adopt Next.js 15 App Router with React Server Components.
Catalog, product, and home pages render on the server and stream via
independent Suspense boundaries (`src/lib/streaming.tsx`); interactivity is
island-scoped client components. next-intl provides per-locale static
generation with `setRequestLocale`.

**Consequences.** (+) Near-zero JS for read paths; LCP budgets met with
headroom (see [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md)); SEO via
pre-rendered, hreflang-linked pages. (+) Streaming keeps perceived speed
high even when the API is slow. (−) Team must respect the server/client
boundary — enforced via ESLint and code review. (−) Some ecosystems
(plugins, examples) still assume Pages Router.

**Status:** Accepted.

## ADR-0012 — Self-hosted over SaaS (Proxmox 9.2 VM)

**Context.** Grant conditions require demonstrable data sovereignty; GDPR
review favored keeping personal data within infrastructure the applicant
controls; recurring SaaS platform fees (Vercel, managed search, managed
analytics) would consume a material share of the post-grant operating
budget.

**Decision.** Self-host the full stack on a Proxmox 9.2 VM: Docker Compose
topology with nginx edge (TLS termination, HTTP/2, rate limiting), Next.js
standalone server, Django, PostgreSQL 16, Redis 7, Elasticsearch 8.
No Vercel dependencies anywhere (no `vercel.json`, no Edge Config).
Deployment, backup, monitoring, and rollback are scripted
(`scripts/deploy.sh`, `backup.sh`, `monitoring.sh`).

**Consequences.** (+) Full data custody — supports GDPR Art. 25/32 claims
and grant compliance. (+) Fixed, predictable cost. (−) The project owns
patching, failover, and capacity planning — mitigated by runbooks
(`docs/runbooks/`), health-gated deploys, and automated backups with
monthly restore verification. (−) No CDN: compensated by nginx static
caching and the built-in image optimizer (sharp) — see
[DEPLOYMENT.md](DEPLOYMENT.md).

**Status:** Accepted.

## ADR-0013 — Stripe Connect over custom payment processing

**Context.** Handling card data directly would impose PCI DSS SAQ-D scope —
audits and controls disproportionate to a 100-day grant. Religious
institutions need SEPA and local payout support; trust demands that card
entry visibly occurs in a recognized, certified interface.

**Decision.** Use Stripe Connect (Express accounts) with the embedded
Payment Element. Card data is captured inside Stripe's iframe and never
touches JOL infrastructure — the platform stays at **PCI SAQ-A** scope.
Webhooks (`payments_app` is the only Stripe importer, ADR-0001) drive order
state transitions idempotently.

**Consequences.** (+) PCI scope minimized and documented
([COMPLIANCE_MATRIX.md](COMPLIANCE_MATRIX.md)). (+) SEPA, cards, and
Connect payouts out of the box; refund/chargeback tooling provided.
(−) Stripe dependency: provider outage becomes our outage — mitigated by
the `ai-outage`/`stripe-webhook-failure` runbooks and webhook idempotency.
(−) Per-transaction fees accepted as the price of scope reduction.

**Status:** Accepted.

## ADR-0014 — PostgreSQL (+PostGIS/pgcrypto/pgvector) and Elasticsearch over NoSQL

**Context.** Marketplace data is transactional and relational: orders
reference sellers, products, shipments, and tax regimes; GDPR erasure must
prove completeness across all of them. Search must deliver faceted,
multilingual catalog queries at marketplace latency.

**Decision.** PostgreSQL 16 as the system of record (relational integrity,
PostGIS for funeral-home geography, pgcrypto for the encryption migration
path, pgvector reserved for Phase-2 semantic search), plus Elasticsearch 8
(single-node, internal network) for catalog search. Redis holds sessions
and hot catalog caches.

**Consequences.** (+) ACID transactions across the money path; provable,
complete erasure traversals. (+) Faceted search performance without
denormalizing the write model (indexer task keeps ES in sync).
(−) Two storage systems to operate — accepted; ES is single-node and
rebuildable from PostgreSQL (it is a derived index, never a source of
truth). (−) PostGIS adds host sysdeps (GDAL) — documented in bootstrap.

**Status:** Accepted.

## ADR-0015 — Zustand over Redux for client state

**Context.** Client state is deliberately small: cart, consent, and theme.
Redux's boilerplate and middleware surface would add bundle weight and
maintenance cost for three stores. A hard privacy constraint applies:
**no PII may persist in localStorage** (addresses, names, and contact data
live exclusively in backend sessions and server actions).

**Decision.** Zustand for all client stores (`src/stores/`). Cart entries
hold product IDs and quantities only; buyer details are fetched from the
session at checkout. Consent choices persist (legitimate interest: consent
proof) but carry no identity data. No auth tokens ever touch localStorage —
sessions are httpOnly, `__Host-`-prefixed cookies (see
[SECURITY_POSTURE.md](SECURITY_POSTURE.md)).

**Consequences.** (+) ~1KB dependency, no provider trees, trivially
testable (the stores have dedicated unit suites). (+) The PII-out-of-client
rule is simple to audit because so little lives client-side. (−) No
time-travel devtools — irrelevant at this scale. (−) If Phase-2/3 state
complexity grows (real-time chat), the boundary is re-evaluated then.

**Status:** Accepted.

## ADR-0016 — Tailwind CSS over a component library

**Context.** The sacred-modern design language (ADR-0009) — Cormorant
Garamond display faces, restrained gold/parchment palette, dignified motion
— cannot be achieved by reskinning Material or Ant without fighting the
library. Bundle budgets on 4G rule out shipping an unused-component tax.
WCAG 2.2 AA (AAA on grief-adjacent journeys) requires full control of focus
indicators, contrast, and reduced-motion behavior.

**Decision.** Tailwind CSS compiled to static stylesheets, with a semantic
design-token layer (`src/styles/tokens.css`) including runtime theme
overrides (`.theme-funeral`, `.theme-dark`). Components are owned in-repo
with accessibility baked in (skip links, focus traps, announcer, error
summaries — see [TESTING_STRATEGY.md](TESTING_STRATEGY.md) for axe gates).

**Consequences.** (+) Full design control; zero runtime CSS-in-JS cost;
stylesheets are immutable hashed assets cached one year at the edge.
(+) Token layer keeps the design system coherent across locales/themes.
(−) The team owns every component's a11y contract — enforced by axe-core
unit + e2e suites and manual audits. (−) No free component upgrades —
accepted; stability outranks novelty on grief-adjacent surfaces.

**Status:** Accepted.

## ADR-0017 — Funeral vertical as grief-aware lead generation, not e-commerce

**Context.** Commercializing funeral services directly risks exploiting
grief, invites regulatory scrutiny (consumer-protection rules on distance
selling of funeral contracts vary by member state), and conflicts with the
sacred trust positioning. Yet funeral homes need discovery, and mourners
need dignified information.

**Decision.** The funeral vertical is a **directory and lead-generation
surface**, not a transactional one: funeral homes register profiles
(services, gallery, team, coordinates); listings carry **no prices**; the
UX is grief-aware (no urgency timers, no comparison mechanics, muted
imagery). Commerce remains limited to physical goods sold by funeral homes
through the standard catalog.

**Consequences.** (+) Regulatory exposure minimized; the platform can
launch across LT/LV/EE without per-state funeral-contract compliance work.
(+) Differentiates sharply from horizontal marketplaces — central to the
grant narrative. (−) No take-rate on funeral services; monetization is
subscription/listing-based (Phase 2). (−) Requires ongoing moderation
vigilance — provided by the admin backoffice and documented in
[GDPR_COMPLIANCE.md](GDPR_COMPLIANCE.md).

**Status:** Accepted.

---

*Spec-to-registry mapping for reviewers: spec labels ADR-001…ADR-007
correspond to ADR-0011…ADR-0017 above. System context:
[TECHNICAL_SPECIFICATION.md](TECHNICAL_SPECIFICATION.md).*
