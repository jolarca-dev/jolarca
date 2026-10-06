# Performance Report

**Target:** Core Web Vitals "Good" for all metrics on simulated 4G
(Lighthouse mobile throttling). Budget sources of truth:
`frontend/scripts/lighthouse-budget.json` and the Playwright runtime suite.
Engineering context:
[TECHNICAL_SPECIFICATION.md](TECHNICAL_SPECIFICATION.md).

> **Enforcement status, measured 2026-10-05.** The budgets below are **asserted by
> nothing in CI.** `frontend-lighthouse` is `if: false`
> (`.github/workflows/ci.yml:227-232`) and `frontend-playwright-smoke` is `if: false`
> (`ci.yml:258-263`), and `git grep -nE 'lighthouse-budget|bundle-analyze|analyze:bundle'`
> over `.github/` and `Makefile` returns **zero** hits — so neither the budget file nor
> `frontend/scripts/bundle-analyze.ts` has any invoker outside a developer's terminal.
> This report previously described the budget as CI-enforced and named a "Budget job" as
> the enforcement for four metrics; that was false, and the gates it implied are tracked
> as `QODER.md` §8 **G4** and **G5**, both still OPEN. The numbers themselves are
> unchanged and remain the intended budgets — **what changed is the claim that anything
> checks them.** Re-enabling either job makes the Enforcement column below true again.

## 1. Benchmarks — Budget vs Verified Gates

| Metric | Google "Good" | Budget file (Lighthouse) | Verified gate | Enforcement (measured 2026-10-05) |
| --- | --- | --- | --- | --- |
| LCP | ≤ 2.5s | **≤ 2000ms** | ≤ 2000ms on catalog grid (4G sim) | **None in CI.** `frontend/e2e/performance.spec.ts` measures via PerformanceObserver, but the only job that would run it is `if: false` (§8 G4/G5) |
| CLS | ≤ 0.1 | **≤ 0.1** | Skeleton geometry == final geometry | **None in CI** — the CLS-safe skeleton contract is a code convention, not a gate (§8 G5) |
| INP | ≤ 200ms | TBT ≤ **200ms** (lab proxy) | — | **None in CI** (§8 G5) |
| TTFB | ≤ 800ms | covered by Speed Index budget | Static pages pre-rendered; dynamic pages stream | Build output (77/77 static pages), not a CI gate |
| FCP | ≤ 1.8s | **≤ 1800ms** | — | **None in CI** (§8 G5) |
| Speed Index | — | **≤ 3000ms** | — | **None in CI** (§8 G5) |
| JS per page | — | scripts ≤ **300KB**, total ≤ **1200KB** | **529KB total gzipped; largest chunk 58.4KB (framework)** | `npm run analyze:bundle` exits 1 over 150KB/chunk (`frontend/scripts/bundle-analyze.ts:16`) — **manual only, no CI invoker** |

**Field data:** the consent-gated Web Vitals reporter batches LCP/INP/CLS/
TTFB/FCP to the self-hosted collector (`/api/v1/analytics/vitals/`,
GAP-A01), classified against these thresholds client-side
(`src/lib/vitals.ts`) — field dashboards populate once the collector
endpoint ships.

## 2. Optimization Techniques (implemented)

**Rendering.**
- RSC streaming: home/category sections stream from independent Suspense
  boundaries (`StreamingSection`); no await blocks the page shell —
  proven by `tests/performance/streaming.test.tsx`.
- 77 of 78 routes statically generated; session-gated routes opt into
  dynamic rendering explicitly.

**Images.**
- Built-in optimizer with **sharp** in the standalone image (AVIF served
  first, WebP fallback); device ladder 640–2048 + 16–384 thumb ladder.
- `OptimizedImage` wrapper enforces one `priority` LCP image per page,
  lazy below-fold, context-correct `sizes`, blur placeholders — zero-CLS
  fixed boxes.

**Fonts.**
- `next/font` self-hosts Cormorant Garamond + Inter at build time (no
  runtime third-party requests — GDPR and speed); automatic preload links
  verified in build output; `display: swap` + Georgia/system-ui fallbacks
  prevent FOIT.

**JavaScript & CSS.**
- Island architecture: interactive surfaces are client components; read
  paths ship near-zero JS.
- Tailwind compiles to one immutable stylesheet; token layer adds no
  runtime cost.
- Third-party scripts (Stripe, Plausible, web-vitals) load only after
  explicit user action or consent — never in `<head>`.

**Edge.**
- nginx: HTTP/2, gzip, 1-year immutable static caching,
  `stale-while-revalidate` images, keepalive upstreams.

## 3. Monitoring & Alerting

- **Collection:** web-vitals v4, batched, `sendBeacon` on
  visibilitychange/pagehide; consent is a hard gate — no consent, no
  measurement.
- **Classification:** each metric ships with a good/needs-improvement/poor
  rating using the exact Google thresholds (single vocabulary for field +
  CI).
- **Alert thresholds:** any page with median LCP > 2500ms or CLS > 0.1
  over a 7-day window triggers review. The budgets are **not** a pre-release
  gate today: nothing in CI reads them (§8 G5), so a regression is caught only
  if a human runs Lighthouse or the bundle analyzer before merging.
- **Ops:** container healthchecks, disk/memory alerts
  (`scripts/monitoring.sh`). **No Lighthouse CI artifacts are retained**, because
  the job that would produce them is disabled.

## 4. Scalability Plan

| Trigger | Action | Effort |
| --- | --- | --- |
| App CPU saturation | Add `app` replicas behind nginx upstream (already keepalive-pooled); zero app-level session affinity needed (sessions in Redis) | Low — compose scale |
| DB read growth | PostgreSQL read replica + Django router for catalog reads | Medium |
| Search latency | ES heap bump → then 2-node cluster; index remains rebuildable from PostgreSQL | Medium |
| Static asset pressure | Place a caching reverse proxy/CDN in front of nginx (preserves self-hosting: any S3-compatible cache layer) | Low–Medium |
| Image optimization load | Second `app` replica serves `/_next/image`; optimizer cache is per-replica and cheap to warm | Low |

The single-VM topology is a deliberate Day-100 posture (cost control,
data sovereignty); nothing in the architecture assumes it — every tier is
stateless or externally state-backed (ADR-0012).

---

*CI wiring: `.github/workflows/ci.yml` — the Lighthouse job is `if: false`, so no
budget is asserted in CI (`QODER.md` §8 G5) · bundle analyzer:
`frontend/scripts/bundle-analyze.ts`, invoked manually via `npm run analyze:bundle` ·
test detail: [TESTING_STRATEGY.md](TESTING_STRATEGY.md).*
