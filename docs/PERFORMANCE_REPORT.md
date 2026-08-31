# Performance Report

**Target:** Core Web Vitals "Good" for all metrics on simulated 4G
(Lighthouse mobile throttling). Budget sources of truth:
`frontend/scripts/lighthouse-budget.json` (CI-enforced) and the Playwright
runtime suite. Engineering context:
[TECHNICAL_SPECIFICATION.md](TECHNICAL_SPECIFICATION.md).

## 1. Benchmarks — Budget vs Verified Gates

| Metric | Google "Good" | CI budget (Lighthouse) | Verified gate | Enforcement |
| --- | --- | --- | --- | --- |
| LCP | ≤ 2.5s | **≤ 2000ms** | ≤ 2000ms on catalog grid (4G sim) | Lighthouse CI job fails over budget; `e2e/performance.spec.ts` measures via PerformanceObserver |
| CLS | ≤ 0.1 | **≤ 0.1** | Skeleton geometry == final geometry | Budget job + CLS-safe skeleton contract |
| INP | ≤ 200ms | TBT ≤ **200ms** (lab proxy) | — | Budget job |
| TTFB | ≤ 800ms | covered by Speed Index budget | Static pages pre-rendered; dynamic pages stream | Build mode (77/77 static pages) |
| FCP | ≤ 1.8s | **≤ 1800ms** | — | Budget job |
| Speed Index | — | **≤ 3000ms** | — | Budget job |
| JS per page | — | scripts ≤ **300KB**, total ≤ **1200KB** | **529KB total gzipped; largest chunk 58.4KB (framework)** | `npm run analyze:bundle` (fails > 150KB/chunk) |

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
  over a 7-day window triggers review; budgets in CI are the pre-release
  gate so regressions ship to nobody.
- **Ops:** container healthchecks, disk/memory alerts
  (`scripts/monitoring.sh`), Lighthouse CI artifacts retained per build.

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

*CI wiring: `.github/workflows/ci.yml` (Lighthouse job fails on budget
exceedance) · bundle gate: `frontend/scripts/bundle-analyze.ts` ·
test detail: [TESTING_STRATEGY.md](TESTING_STRATEGY.md).*
