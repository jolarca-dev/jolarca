# Technical Specification

**Scope:** System architecture, data flows, API contract, state boundaries,
and caching strategy. Security controls: [SECURITY_POSTURE.md](SECURITY_POSTURE.md) ·
performance engineering: [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md) ·
decisions: [ARCHITECTURE_DECISION_RECORDS.md](ARCHITECTURE_DECISION_RECORDS.md).

## 1. System Architecture

```mermaid
flowchart LR
    subgraph Client["Visitor / Seller / Admin"]
        B["Browser (LT/LV/EN)"]
    end

    subgraph VM["Proxmox 9.2 VM (self-hosted)"]
        subgraph Edge
            NG["nginx 1.27<br/>TLS termination · HTTP/2<br/>rate limiting · static caching"]
        end

        subgraph App["Application tier (internal network)"]
            FE["Next.js 15 standalone<br/>RSC + streaming · port 3000"]
            BE["Django + DRF (Gunicorn)<br/>port 8000"]
            WK["Celery workers<br/>default · email · media · ai · compliance"]
            BT["Celery beat (scheduler)"]
        end

        subgraph Data["Data tier (internal network)"]
            PG["PostgreSQL 16<br/>PostGIS · pgcrypto · pgvector"]
            RD["Redis 7<br/>sessions · cache · broker"]
            ES["Elasticsearch 8<br/>catalog index (derived)"]
            MN["MinIO / S3<br/>media · KYC docs · invoices"]
        end

        subgraph Ext["External (allowlisted only)"]
            ST["Stripe (Payment Element,<br/>Connect, webhooks)"]
            AI["AI providers<br/>(self-hosted first, PII-filtered)"]
            SH["DPD / Omniva (shipping)"]
        end
    end

    B -- "HTTPS 443" --> NG
    NG -- "pages/RSC" --> FE
    NG -- "/api/ passthrough" --> BE
    FE -- "REST /api/v1" --> BE
    BE --> PG
    BE --> RD
    BE --> ES
    BE --> MN
    WK --> PG
    WK --> RD
    WK --> AI
    BE --> ST
    ST -- "signed webhooks" --> BE
    BE --> SH
```

**Network isolation:** only nginx publishes ports. The application and data
tiers run on `internal: true` Docker networks (`docker-compose.prod.yml`).

## 2. Data Flows

### 2.1 Authentication & session

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Next middleware
    participant DJ as Django
    B->>MW: GET /en/account (protected)
    MW->>MW: cookie-presence gate (__Host-jol_session)
    alt no session cookie
        MW-->>B: 302 /en/login?redirect=/en/account
    end
    B->>DJ: POST /api/v1/auth/login/ (credentials)
    DJ-->>B: Set-Cookie __Host-jol_session (HttpOnly, Secure, Strict)
    B->>MW: GET /en/account (with cookie)
    MW->>DJ: RSC server actions validate session per request
```

### 2.2 Catalog browse (streaming)

Home/category pages are server components: the shell renders immediately;
Hero, Categories, and Featured stream from independent Suspense boundaries
with CLS-safe skeletons. No `await` blocks the page shell — sections resolve
in parallel (see `src/app/[locale]/page.tsx`).

### 2.3 Checkout (PCI SAQ-A)

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Next.js
    participant DJ as Django payments_app
    participant ST as Stripe
    B->>FE: cart → checkout page
    FE->>DJ: POST /api/v1/checkout/session/
    DJ->>ST: create PaymentIntent (Connect destination)
    ST-->>DJ: client secret
    DJ-->>B: client secret (publishable key only)
    B->>ST: Payment Element (card data stays in Stripe iframe)
    ST-->>DJ: webhook payment_intent.succeeded (signature-verified)
    DJ->>DJ: idempotent state machine → order confirmed
    DJ-->>FE: order confirmation page
```

### 2.4 Search

Query → `search_app` → Elasticsearch (facets, multilingual). The ES index
is **derived**: a Celery indexer syncs from PostgreSQL, which remains the
source of truth. Until backend endpoints land, the frontend renders
sanctioned unavailable states via the contract-gap registry (ADR-0007) —
never fake data.

### 2.5 Compliance (erasure / portability)

Art. 17 requests enter the admin compliance queue; `compliance_app`
traverses all owning apps (users, orders, sellers, files), applies the
30-day SLA, and writes an audit record. Retention for financial data
follows the 7-year tax-law window before anonymization.

## 3. API Contract Summary

- **Style:** REST, JSON; generated OpenAPI 3.1 snapshot at
  `docs/api/openapi.yaml` (drf-spectacular) — regenerate with `make api-schema`,
  never hand-edit.
- **Versioning:** path prefix `/api/v1/`; breaking changes require `/v2`
  with a deprecation window.
- **Client:** `openapi-fetch` bound to generated `paths` types
  (`frontend/src/generated/api`) — drift is caught by `npm run api:drift`.
- **Contract gaps:** endpoints the frontend needs but the backend has not
  shipped are registered in `frontend/src/lib/api/contract-gaps.ts`
  (GAP-Pxx/Sxx/Lxx/Axx…) and rendered as sanctioned degradation states.
- **Errors:** DRF `detail`/field shapes map to typed frontend errors
  (`ApiError`, `ValidationError`, `PermissionError`); users see friendly
  copy + a trace ID, never internals.

## 4. State Management Boundaries

| State | Owner | Mechanism | PII? |
| --- | --- | --- | --- |
| Catalog, orders, users, sellers | Django (PostgreSQL) | REST API + server components | Yes — encrypted where required |
| Sessions | Django + Redis | `__Host-` httpOnly cookies | No identifiers client-side |
| Cart contents | Zustand (`cart-store`) | localStorage (IDs + quantities only) | No |
| Consent choices | Zustand (`consent-store`) | localStorage (consent proof) | No |
| Theme / locale prefs | Zustand + `jol_locale` cookie | localStorage/cookie | No |
| Checkout identity & addresses | Django session | Server actions at submit | Yes — never client-persisted |

**Rule:** anything that identifies a person lives server-side; client stores
hold identifiers and preferences only (ADR-0015, GDPR Art. 25).

## 5. Caching Strategy

| Layer | Technology | Policy |
| --- | --- | --- |
| Immutable hashed assets (`/_next/static/`) | nginx | 1 year, `immutable`, no access log |
| Optimized images (`/_next/image`) | sharp via Next optimizer + nginx | 1 day + `stale-while-revalidate=604800` |
| HTML pages | Next.js (static generation where session-free; `force-dynamic` where session-gated) | Per-route |
| Sessions & hot catalog | Redis | TTL aligned to session (14d) / catalog freshness |
| Client server-state | TanStack Query | SWR semantics with bounded GC; consent-gated mutations |
| Search index | Elasticsearch | Derived, rebuilt on demand from PostgreSQL |

Edge headers set `Cache-Control` conservatively for API responses
(`no-store` for probes; short TTLs for catalog reads).

---

*Deployment topology detail: [DEPLOYMENT.md](DEPLOYMENT.md) · sequence
diagrams: `docs/architecture/` · ERD: `docs/architecture/06-database-erd.md`.*
