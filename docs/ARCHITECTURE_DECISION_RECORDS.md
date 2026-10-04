# Architecture Decision Records

**Scope:** Consolidated decision registry for grant reviewers. Engineering
detail for ADR-0001…0010 lives in [TECH_DECISIONS.md](TECH_DECISIONS.md);
this document adds the platform-level and security-governance decisions,
continuing the existing numbering (no collisions).

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

## ADR-0018 — Risk acceptance: `braces` advisory in the frontend lint toolchain

**Context.** `trivy fs --include-dev-deps` reports **`braces` 3.0.3 —
CVE-2026-93687 (HIGH, Denial of Service via stack overflow)** as a transitive of
the ESLint chain `eslint-config-next → @next/eslint-plugin-next → fast-glob →
micromatch`. As of 2026-10-03 **no patched release exists** (`npm view braces
version` = 3.0.3; Trivy status "affected", fixed-version blank;
[AVD](https://avd.aquasec.com/nvd/cve-2026-93687)), and it is **not** carried in
GitHub Dependabot's advisory DB (open alerts are dompurify/vitest only). `braces`
is a **dev-only** package (`package-lock.json` `"dev": true`) reachable only
through the lint toolchain; the production `runner` image copies only
`.next/standalone`, `.next/static` and `public` and even strips npm
(`frontend/Dockerfile`), so `braces` never ships and has no runtime/attacker
surface.

**Decision.** Accept the residual risk for the **build/lint surface** and keep it
out of the **blocking** gate: the trivy CRITICAL/HIGH build gate is scoped to
production dependencies (no `--include-dev-deps`) so an unpatchable dev-only
advisory cannot cause a denial-of-pipeline. To keep the risk *visible rather than
silent*, CI additionally runs a **non-blocking** (`--exit-code 0`) dev-inclusive
trivy SARIF report that surfaces dev-only CRITICAL/HIGH (including this one) as
code-scanning alerts. Remediate by bumping `braces` immediately once an upstream
fix is published; do not vendor a patch or silently override the advisory.

**Consequences.** (+) The shipped artifact is unaffected (dev-only, absent from
the runner image). (+) The pipeline is not blocked by a vulnerability that has no
fix. (+) The finding stays auditable as an open code-scanning alert rather than
hidden. (−) A lint-time-only DoS remains in the dev toolchain until upstream
ships a fix — accepted given zero runtime exposure and a trusted dev/CI
environment. **Review:** re-check for an upstream `braces` fix at the next
security review (target 2027-01) or on any environment change; retire this
exception once a patched version is adopted.

**Status:** Accepted 2026-10-03 (recorded per owner authorization; sole maintainer).

## ADR-0019 — `JOL` identifier freeze-map, and deferral of the consumer-brand rename

**Context.** The repository, organisation and Django/Node packages are named
`jolarca`, but **46 tracked files still carry the string `JOL Marketplace`** —
measured 2026-10-05 by `git grep -lI 'JOL Marketplace'`: 17 under `frontend/`,
14 under `docs/`, 2 under `backend/`, and 13 across root, `nginx/` and
`scripts/`. An infrastructure-level rename was executed on 2026-08-31 (incident
`JOL-RENAME-20260831-01`, merged as PR #20) covering package names, compose
project and image names, database and bucket names, host paths and fallback
URLs. **That rename is recorded in no ADR**, and its scope boundary was never
written down, which is why the branding layer it deliberately or accidentally
left behind cannot now be distinguished from an oversight.

Two classes of `JOL`-prefixed identifier are **load-bearing rather than
cosmetic**, and renaming either would cause a production incident:

1. **Persisted order numbering.** `orders_app/services.py:58` derives the next
   sequence via `Order.objects.filter(number__startswith="JOL-<year>-")`. If the
   prefix changes, that filter matches **zero existing rows**, `seq` resets to
   `offset`, and the first new order collides with an existing `unique=True`
   order number — a 500 on the checkout money path. The function's own docstring
   warns of exactly this failure. `migrations/0001_initial.py:42` also documents
   the format in a **shipped migration**, which must never be edited.
2. **HMAC wire-protocol headers.** `X-JOL-Caller`, `X-JOL-Timestamp` and
   `X-JOL-Signature` (`payments_app/internal_auth.py:40-42`,
   `internal_forward.py:78-79`) are the internal payment-API authentication
   contract and the signed per-product webhook forwarding envelope. They are
   identifiers on the wire, not branding; renaming them breaks every caller,
   including the sibling `jol-hub` platform.

A third class must be **kept as-is** because it names a *different* product:
`.env.example:33`, `docker-compose.dev.yml:5,26` and `.sops.yaml:1` reference the
**JOL Church / `jol-hub`** platform that shares the host, and the `.sops.yaml`
cross-project segregation rule is intentional.

The remaining class is the **consumer brand**, and it is not a documentation
problem. It includes `frontend/src/app/layout.tsx:123` (the HTML `<title>`
default *and* template), `frontend/src/app/manifest.ts:10` (PWA manifest name),
`frontend/src/app/[locale]/page.tsx:49,72` (SEO `siteName` and JSON-LD),
`frontend/src/components/site-footer.tsx:13` (visible footer), and
`frontend/messages/{en,et,lt,lv}.json` — four locales, one of which carries the
copyright line `"© 2026 JOL Marketplace. All rights reserved."`
`frontend/e2e/seo.spec.ts:114` asserts the manifest name, and because
`frontend-playwright-smoke` is `if: false` (QODER.md §8 G4) **CI would not catch
that assertion breaking**.

**Decision.**

1. **The wire-protocol headers and the persisted order-number prefix are frozen
   permanently.** They are not branding and are excluded from any future rename,
   regardless of what the brand is decided to be. The same applies to the shipped
   migration's `help_text` and to the sibling `jol-hub` / JOL Church references.
2. **No global search-and-replace of `JOL` is permitted.** Any future rename must
   work from this classification, class by class.
3. **The consumer-brand question is deferred to the owner and is explicitly NOT
   decided by this ADR.** It is entirely possible that `jolarca` is the
   repository/organisation identity while `JOL Marketplace` remains the intended
   consumer-facing brand; nothing in the repository states which is
   authoritative, and this record will not invent a decision. What is defective
   is the *ambiguity*, not necessarily the divergence.
4. **If and when the brand is decided to change**, the sequence is: amend this
   ADR with the decision and its rationale → execute the brand class only →
   regenerate `docs/api/openapi.yaml` and `frontend/src/generated/api.ts` via
   `make api-schema`, because `settings/base.py:167` sets the OpenAPI `TITLE` and
   a title change *is* a contract change (and `frontend-openapi-drift` is now a
   required context, §8 G22) → update `frontend/e2e/seo.spec.ts:114` in the same
   commit → provide **translated** equivalents for all four locales rather than
   substituting the string → prove the order-number sequence still advances
   against a database that already holds `JOL-<year>-` rows. SEO and copyright
   impact must be assessed before the change ships, not after.

**Consequences.** (+) The two paths to a production incident are closed off in
writing, so a well-intentioned cleanup cannot reach them. (+) The scope boundary
that PR #20 never recorded now exists, so the residual divergence is a known,
classified state rather than an unexplained inconsistency. (+) The brand question
is surfaced as the owner's decision with its real cost attached — legal
(copyright notice in four languages), SEO (`<title>`, JSON-LD, manifest) and
i18n — instead of being executed silently as a hygiene task. (−) The repository
remains visibly inconsistent between `jolarca` and `JOL Marketplace` until the
owner decides; this is accepted, because a wrong rename of a copyright notice or
an SEO title is materially worse than a visible inconsistency. (−) The e2e
assertion that guards the brand string is in a disabled job, so the guard is
nominal until §8 G4 is closed. **Review:** revisit when the owner rules on the
consumer brand, or when §8 G4 re-enables the Playwright suite, whichever is
first.

**Status:** Accepted 2026-10-05 as to items 1–2 (the freeze-map). Item 3 is
recorded as **deferred to the owner**, not decided.

---

*Spec-to-registry mapping for reviewers: spec labels ADR-001…ADR-007
correspond to ADR-0011…ADR-0017 above. System context:
[TECHNICAL_SPECIFICATION.md](TECHNICAL_SPECIFICATION.md).*
