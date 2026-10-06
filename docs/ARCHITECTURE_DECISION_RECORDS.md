# Architecture Decision Records

**Scope:** The single decision registry for this repository. The first seven records
were consolidated here from `docs/TECH_DECISIONS.md` on 2026-10-05; that file is now a
pointer plus a summary table. This document previously claimed that engineering detail
for ADR-0001…0010 lived in `docs/TECH_DECISIONS.md`, which was false for three of the
ten: **ADR-0008, ADR-0009 and ADR-0010 have no record anywhere in the repository**
(measured: `grep -oE '^## ADR-[0-9]{4}'` over all of `docs/` yields 0001-0007 and
0011-0020 only). They are listed below as absent rather than reconstructed, because
inventing a decision record is the fabrication failure mode this repository's §8
register exists to prevent (see the G12 NEVER-ISSUED precedent).

**Format:** Context → Decision → Consequences. **Status:** Accepted.

## Registry Overview (engineering ids — full records below)

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

## ADR-0001 — Monorepo with domain-bounded Django apps
**Context:** Marketplace spans 11 domains with strict compliance boundaries.
**Decision:** Single repo; per-domain apps; cross-app access via `services.py` only;
`payments_app` is the only Stripe importer; AI runs only in Celery `ai` queue.
**Consequences:** Review-gated only. CODEOWNERS is a single wildcard and branch
protection reports `require_code_owner_reviews=false`, so it enforces nothing — see
QODER.md §8 G2 and ADR-0020; import-linter contracts to follow.

## ADR-0002 — AGPL-3.0 licensing
**Context:** Organization policy for public-facing platform code.
**Decision:** AGPL-3.0, never modified. Network-use copyleft acknowledged: if the
platform is ever offered to third parties for self-hosting, source must ship.
**Consequences:** Legal review required before bundling incompatible dependencies.

## ADR-0003 — Dual i18n: DB content vs UI strings
**Context:** Catalog content is authored per-listing; UI chrome is static.
**Decision:** `django-modeltranslation` for catalog (lt/lv/et/en columns);
`next-intl` messages for UI. The two systems are never unified.
**Consequences:** Two translation workflows; documented in CONTRIBUTING.

## ADR-0004 — Field-level encryption with Fernet; pgcrypto migration path
**Context:** GDPR Art. 32 defense-in-depth for PII at rest.
**Decision:** `core.EncryptedTextField` (Fernet, key rotation via MultiFernet,
fail-closed without key). Trade-off: ciphertext not queryable. Searchable
encrypted columns migrate to pgcrypto PGP functions (extension provisioned).
**Consequences:** No LIKE/filters on encrypted columns; analytics uses derived
non-PII columns.

## ADR-0005 — Object storage: MinIO in dev, S3-compatible in prod
**Context:** Media + documents + invoice PDFs need private signed access.
**Decision:** `django-storages` S3 API against MinIO (dev) / managed S3 (prod).
Dev compose uses `latest` tag; production MUST pin release tags.
**Consequences:** Signed URLs by default (`AWS_QUERYSTRING_AUTH=True`).

## ADR-0006 — Django admin retained, edge-restricted
**Context:** Ops tooling vs attack surface.
**Decision:** Keep admin; production gates it behind edge IP allowlist + SSO.
CSP and rate limits apply.
**Consequences:** Deploy topology must enforce the gate before GA.

## ADR-0007 — Sanctioned stubs over silent fakes
**Context:** MVP scope cannot implement every integration at scaffold time.
**Decision:** Unfinished integrations raise `NotImplementedError("MVP-*")` with a
ticket id tracked in `docs/MVP_REMAINING_WORK.md`; config-gated features raise
`*NotConfigured`. Nothing pretends to succeed.
**Consequences:** Callers must handle the loud-failure states explicitly.

## ADR-0008 — Frontend scope: storefront, seller dashboard, moderation backoffice

**Status: NO RECORD.** No `## ADR-0008` decision text exists in any tracked file; the
title above is transcribed from the Registry Overview table, which is the only place the
*title* appears.

**Correction (2026-10-06).** This section originally asserted that "`git grep -n
'ADR-0008'` returns this file's overview row only". **That was false, and it had not been
run.** Measured on `main`: `git grep -l 'ADR-0008'` returns **6 files**, five of them
frontend source — `frontend/src/app/[locale]/admin/layout.tsx:17`,
`frontend/src/app/[locale]/funeral-services/page.tsx:28`,
`frontend/src/components/client/funeral/service-card.tsx:4`,
`frontend/src/lib/api/contract-gaps.ts:194,292`,
and `frontend/src/lib/funeral.ts:2`. The id is load-bearing in shipped code: those
comments assert the funeral vertical is *directory and lead generation only, not
e-commerce* and that the admin surface is role-gated, and cite this ADR as the authority
for both. So the absent record is not a documentation gap — it is the only written basis
for two architectural boundaries that code already depends on. Recorded as absent rather
than reconstructed; if the owner holds the original decision, append it here with its
date and source.

## ADR-0009 — Frontend compliance & UX posture (sacred-modern)

**Status: NO RECORD — but the decision is substantively documented elsewhere.** There is
no `## ADR-0009` record; the substance survives as `docs/DESIGN_SYSTEM.md`, and ADR-0016's
context below paraphrases it.

**Measured 2026-10-06, superseding the "three documents" figure this section first
carried — which was a count of `docs/` only and understated the exposure by an order of
magnitude.** `git grep -l 'ADR-0009' main` returns **26 tracked files**:

| Area | Files | Examples |
| --- | --- | --- |
| `docs/` | 3 | `docs/EXECUTIVE_SUMMARY.md:20`, `docs/POST_MVP_ROADMAP.md:9`, `docs/TESTING_STRATEGY.md:58` |
| `backend/` | 3 | `backend/apps/search_app/views.py:3`, `backend/apps/products_app/views.py:174`, `backend/apps/sellers_app/serializers.py:4` |
| `docs/api/` | 1 | `docs/api/openapi.yaml:302` |
| `frontend/` | 18 | `frontend/lighthouserc.js:2`, `frontend/src/lib/security.ts:45`, `frontend/src/styles/tokens.css:2` |
| registry | 1 | this file's overview row |

Production code cites this id for its privacy posture ("the main query travels as a JSON
BODY via POST", "phone, address never leave private surfaces"), for the Stripe origin
allowlist that holds the merchant at SAQ-A scope, and for the "sacred-modern" design
language. **Each of those citations resolves to a title, not to a decision text.** Do not
treat this section as the decision text.

## ADR-0010 — Risk acceptance: js-yaml advisory in codegen toolchain

**Status: NO RECORD — the acceptance itself is recorded.** `docs/SECURITY.md:70`
(Dependency Supply Chain) carries the substantive risk-acceptance row and
`docs/SECURITY_POSTURE.md:53` cites the id, so the acceptance is documented; the ADR
text is not. Per this repository's convention a dev-only advisory acceptance is
recorded as an ADR **and** a `docs/SECURITY.md` §3 row — only the second half exists.
Reconstructing the first half from the security row is possible but is a decision for
the owner, not for a docs PR.

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
GitHub Dependabot's advisory DB (open alerts are dompurify/vitest only).
**Correction (2026-10-06): that clause is false and was never run.** Dependabot
raised alert **#38** for `braces` in the npm ecosystem and it now sits in
`auto_dismissed`; `state=open` returns 0 alerts and the full inventory is 38 rows
(34 npm, 4 pip), measured 2026-10-06. So Dependabot *did* carry it. What survives
is the consequence, not the reason: an auto-dismissed alert opens no fix PR, and
**why** #38 was dismissed is not established here. The decision itself does not
change — `braces` still has no patched release and does not ship — and the
non-blocking trivy dev report stays the durable tracker, because unlike the
alert it does not disappear on its own. Recorded as G34.
`braces`
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

## ADR-0020 — Risk acceptance: single-operator change control and deployment evidence

**Context.** ISO 27001 A.5.15 / SOC 2 CC6.2 / PCI Req. 7 assume separation between
the person who changes code and the person who authorises it. jolarca has one
maintainer and no team, so that separation is structurally unavailable, and
`docs/COMPLIANCE_MATRIX.md` had been mapping those clauses to two controls that do
not exist. Verified against configuration and the GitHub API on 2026-10-05:

- `.github/CODEOWNERS` is a single wildcard `* @JourneyOfLife`; branch protection
  reports `require_code_owner_reviews: false` and `required_approving_review_count: 0`.
  The file is inert, not merely coarse-grained (§8 G2).
- Exactly one environment, `staging`, with `protection_rules: []` and
  `can_admins_bypass: true`; no `production` environment exists. An approval gate on
  a single-admin repo is self-grantable, so it would satisfy the letter of CC8.1
  without any independent sign-off (§8 G18).
- Setting `required_approving_review_count: 1` is **not** available as a fix: GitHub
  does not allow self-approval, and `enforce_admins: true` means the sole operator
  would be unable to merge anything.

What *is* enforced, and was re-verified rather than assumed:

- Twelve required status checks (`backend`, `secrets`, `gitleaks`, `trivy`, `codeql`,
  `dependency-audit`, `docker-scan`, `frontend-typecheck`, `frontend-lint`,
  `frontend-unit`, `frontend-openapi-drift`, `frontend-build`), `strict: true`, with
  `allow_squash_merge` the only merge mode, force-push and branch deletion blocked,
  and `delete_branch_on_merge` on. *(Amended 2026-10-06 by owner instruction: this bullet
  read eleven with `strict: false` — the state measured when ADR-0020 was written — and the
  change that closes §8 G21's fix 2 and §8 G36 falsified it. The risk accepted here is
  unchanged: no second approver exists. What moved is the automated half, which is the
  compensating control this ADR leans on, so it is stated rather than quietly restated.)*
- `scripts/check_doc_claims.py` (CI-required, via the `backend` job) fails the build
  when documentation asserts a control configuration does not implement, and runs a
  self-test first so it cannot become an always-green gate.
- Self-testing AST boundary tests for app isolation, a dependabot topology gate, and
  a standalone-bundle boot check.
- Images are published only with immutable `staging-<sha>` / release tags.

Separately, the staging environment's deployment log is **not** usable as evidence
for this period: both staging jobs previously declared `environment: staging`, so a
*build* job recorded about 58 `success` deployment entries for deployments that
never happened (111 objects, 2 per merged SHA across 58 SHAs). Those labels are now
removed, but GitHub does not delete deployment records, so the false history remains
permanently visible on a public repository (§8 G26).

**Decision.** Accept the residual risk of absent segregation of duties and absent
deployment approval gates, on the basis that the enforced automated gate set above is
the compensating control, and that adding a nominal approval gate would create a
false record rather than a real control. Correct `COMPLIANCE_MATRIX.md` to state what
exists instead of what does not. This acceptance covers **only** the human-approval
dimension. It does **not** accept, and explicitly excludes:

- the production `:latest` publish path, which must be disabled before the first
  `v*` tag rather than approved by a self-grantable gate (§8 G18, queue item 5);
- presenting the pre-2026-10-05 staging deployment history as evidence of
  deployments (§8 G26);
- treating CODEOWNERS as a review control in any document.

**Consequences.** (+) The compliance matrix stops asserting controls that do not
exist, which is itself the defect class this repo's §8 register exists to catch.
(+) The compensating controls are enumerated and re-verified, so the acceptance is
reviewable rather than a rubber stamp. (+) No fake approval gate is created to
satisfy an auditor's checkbox. (−) Segregation of duties remains unmet, and on a
single-operator repository it cannot be met by configuration; the residual risk is
real, not mitigated. (−) Automated gates are enforced by the same person they would
otherwise constrain. **Review:** mandatory on the first additional maintainer or
contractor with merge rights, and at the next security review regardless - at which
point real review, a `production` environment with a required reviewer who is not the
author, and deployment approval become implementable rather than nominal.

**Status:** Accepted 2026-10-05 (recorded per owner authorization; sole maintainer).

## ADR-0021 — Backend coverage gate: recorded at 20%, with a ratchet rule

**Context.** The backend coverage gate is `--cov-fail-under=20`
(`.github/workflows/ci.yml:97`). It was never *decided* at that value. The flag shipped at
**80** in the initial commit `2d9109e` (#1, 2026-08-16) and was lowered to **20** in
`22117ff` (#45, 2026-09-03) — a commit titled "revert: restore original api.ts (OpenAPI
snapshot incomplete for catalog)", so the downgrade rode inside an unrelated revert and
was recorded nowhere. Three documents went on describing ≥80% as enforced in CI
(`QODER.md` §8 G1), one of them an external funding submission. Contract tests joined the
same command in `b4b0483` (#131, 2026-10-04), which added the in-file rationale and a
`TODO: raise threshold toward 80%` while leaving the value at 20. Measured on this tree on
2026-10-05, with the command that produces each figure:

| Test set | Coverage | Tests | Command |
| --- | --- | --- | --- |
| unit + security | **24%** (3012 statements, 2282 missed) | 41 | `pytest tests/unit tests/security -q --cov=. --cov-report=term` with `DJANGO_SETTINGS_MODULE=project.settings.test` |
| unit + security + contract (CI's set) | **69%** (3012 statements, 941 missed) | 162 | the same command with `tests/contract` added |

The 69% corroborates the 68.8% that `ci.yml:98-103` records from 2026-10-03. It is
restated here as a measurement rather than a citation even though the two are only days
apart, because a suite that changes daily makes a quoted figure stale faster than a
quoted line number does.

**Decision.** Record the gate as 20% — retroactively, since that has been the configured
value since #45 — and adopt a ratchet rule in place of a target date: **whenever CI's own
reported coverage exceeds `--cov-fail-under` by 10 points or more, the PR that observes it
raises the flag to measured − 5.** Taking the figure from CI rather than from a local run
is the rule `ci.yml:101` already states; the 5-point margin absorbs per-run variation so
the gate cannot be tripped by one deleted test. This ADR changes no configuration: the
flag is still 20.

**Consequences.** (+) The 80→20 downgrade finally has a record, its mechanism is named (an
unrelated revert PR, which is how a gate value changes without anyone deciding to change
it), and the three documents that restated ≥80% were corrected in the same branch as this
ADR. (+) The ratchet is self-triggering: it needs no owner and no calendar entry, which is
precisely what a "raise it later" TODO lacks on a single-maintainer repository. (−) **The
rule is already triggered and nothing has been done about it.** Measured 69% against a gate
of 20% is 49 points of slack, so about 70% of the covered statements could be deleted and
CI would still pass. The next CI edit must therefore raise the flag to 64 (69 − 5) or state
why not; that edit is a configuration change on protected `main` and belongs to the owner,
not to this ADR, which is why it is recorded here as an obligation rather than applied.
(−) The frontend floor is a different mechanism — 80% over 17 named modules in
`frontend/vitest.config.mts` — and is out of scope: it is not comparable to a backend
aggregate and must never be quoted as though it were. (−) Coverage is a proxy. A raised
gate makes deletion visible; it does not make any assertion meaningful.

**Status:** Accepted 2026-10-05 (recorded retroactively; sole maintainer).

**Applied 2026-10-06 — the obligation above is discharged, at a different value than it
planned.** `--cov-fail-under` went from 20 to **63**, not 64. The rule takes the figure **CI
reports**, and CI's own `backend` job logged `Required test coverage of 20% reached. Total
coverage: 68.56%` (run `37476183729`, head `6ba1b14`), so `measured − 5` is 63.56 → **63**. The
64 written above subtracted 5 from the *local* 69% measurement — the very number this ADR says
not to use. The two are within a point, so neither value is load-bearing; the difference is
recorded because letting "64" stand would make a CI measurement and a local one interchangeable
in the rule that exists to keep them apart. **G1 stays OPEN:** 63% is not the ≥80% originally
advertised, and coverage is a proxy — a raised floor makes deletion visible, it does not make
any assertion meaningful.

## ADR-0022 — Risk acceptance: Playwright checkout journey and Lighthouse budgets are not CI gates

**Context.** Two `ci.yml` jobs are switched off by condition rather than by deletion:
`frontend-lighthouse` and `frontend-playwright-smoke` both carry `if: false`. Measured
2026-10-06 on `main`, both report `skipped` on every run. What they would have produced is
real and unrun: **43 `test()` declarations across 14 Playwright spec files × 3 projects**
(buyer/seller/funeral journeys, checkout, consent, GDPR, a11y, security headers) and
`frontend/scripts/lighthouse-budget.json`, the budget file that **no invoker anywhere**
references — `git grep -nE 'lighthouse-budget|bundle-analyze|analyze:bundle' -- .github/ Makefile`
returns zero hits, the finding recorded as §8 **G32**. `docs/TESTING_STRATEGY.md` §4 and
`docs/PERFORMANCE_REPORT.md` now state "None in CI" per metric, and the `README.md:6` badge
says the Lighthouse gate is disabled. **A corrected badge is not a working gate** — §8 G4 and
G5 stayed OPEN because the substance was still missing, and §8 G32 closed only the false claim.

**Decision.** Accept the risk for as long as the platform has no real transactions to protect,
and record the acceptance instead of leaving two disabled jobs unexplained. Enabling them today
would produce a permanently red or permanently pending pipeline for reasons that are not the
tests' quality: the Lighthouse job needs a reachable built target, the Playwright job needs the
compose stack, and `smoke.spec.ts` is the only spec the disabled job is written to run — so
"enable Playwright" would not even execute the 43-declaration suite. Re-enable when the work
exists to make them green, in this order: (1) make `frontend-build` a required context
(§8 **G21** fix 2, the owner's call), (2) wire the Lighthouse job to a build artifact and the
budget file so the budget has an invoker, (3) run the checkout journey against CI services, not
only `smoke.spec.ts`.

**Compensating controls actually in place** (stated as measurements, not intentions): 267 Vitest
tests across 22 files, gated by the required `frontend-unit` context; `frontend-openapi-drift`
required, so the backend↔frontend contract cannot drift silently (§8 G22); `frontend-typecheck`
and `frontend-lint` required; the standalone-server CSS guard
(`frontend/scripts/verify-standalone.mjs`) runs on every PR in `frontend-build`, though that job
is **not** a required context — which is precisely why step (1) above precedes this acceptance
being called a mitigation. Backend contract tests assert the PCI SAQ-A Stripe boundary and PII
non-leakage (§8 G7). No automated control covers visual regressions, real-browser checkout
flows, or Core Web Vitals.

**Consequences.** (+) The gap has a dated owner decision, a revisit trigger and an ordering, so
it cannot silently become permanent the way the `--cov-fail-under` downgrade did (ADR-0021).
(+) CI stays honest: nothing is claimed that does not run. (−) A regression that only appears in
a real browser — checkout, consent UX, a11y, CSS delivery — can reach `main` undetected. (−) A
Core Web Vitals regression is unmeasured, so the performance budgets are aspirational until step
(2) lands. (−) The accepted risk sits on the same single-operator surface as ADR-0020: whoever
accepts it is also whoever would notice the regression by hand. **Review:** before any production
launch, before the first real carrier or payment integration, and whenever `frontend-build`
becomes a required context. **§8 G4 and G5 stay OPEN** — an accepted risk is not an enforced gate.

**Status:** Accepted 2026-10-06 (recorded per owner authorization in this session; sole maintainer).


---

*Spec-to-registry mapping for reviewers: spec labels ADR-001…ADR-007
correspond to ADR-0011…ADR-0017 above. System context:
[TECHNICAL_SPECIFICATION.md](TECHNICAL_SPECIFICATION.md).*
