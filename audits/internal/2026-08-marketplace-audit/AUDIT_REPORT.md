# jol-marketplace — Independent Audit Report (2026-08)

**Audit ID:** 2026-08-marketplace-audit · **Date:** 2026-08-15 · **Auditor:** independent audit team (Principal App Auditor / Sr. Payments Engineer / Lead Security Engineer / GDPR Auditor)
**Object:** local repository `jolarca` (canonical public name: `jol-marketplace`), AGPL-3.0, Django/DRF backend + Next.js frontend
**Governing specs:** Master Prompt v2.0 (quality gates §9, stub policy §10), Repository Strategy & Build Plan (file tree §2, build order)
**Repo state at audit:** branch `main`, **zero commits** (all files untracked/staged only).

---

## 1. Executive summary

The repository contains an unusually disciplined *scaffold*: clean module boundaries,
fail-closed configuration validation, honest sanctioned-stub registers, and compliance
documentation that actually points at real files. Several of its security invariants
are real and were verified live (Stripe boundary containment, ORM-only access,
encryption-at-rest ciphertext, AI PII redaction, production refuse-to-boot validation).

However, the self-reported claim **"tree complete, all tests green" is false**.
Every enforced CI gate fails when re-run from a clean environment:

- `docker compose -f docker-compose.dev.yml up` **does not boot** (frontend image build fails: `npm ci` with no lockfile).
- `next build` **fails** (broken CSS import in the locale layout).
- `ruff` 42 errors · `mypy` 7 errors · pytest **coverage 36.56% vs the enforced ≥80% gate**.
- The integration-test step can never pass (waits for `localhost:5432` from inside a container) and the integration suite is **empty**.
- Three runtime CRITICALs were proven against the live stack: **registration 500s**, **the append-only AuditLog can never be written**, and **the Stripe webhook pipeline crashes on both forged AND valid events**.
- With the shipped `.env`, checkout calls **live api.stripe.com** with a placeholder key and dies; the provisioned `stripe-mock` is wired to nothing.

**Final verdict (Master Prompt §9):** **NO — jol-marketplace is not 100% done.**
Blocking findings: AUD-01 … AUD-09 (see register). Gate 1 (fresh-machine boot) fails,
four CI gates fail, and three critical-path code paths crash on their happy path.

### Verdict per dimension

| Dim | Area | Verdict | Headline |
|---|---|---|---|
| A | Conformance | **PASS-WITH-FINDINGS** | All 11 mandated apps present; LICENSE intact; version drift (Django 5.2 vs spec 4.2, Next 15 vs 14); frontend page surface mostly absent |
| B | Clean-machine functional | **FAIL** | Documented quickstart does not boot; ruff/mypy/coverage/integration gates all red |
| C | Stubs & completeness | **FAIL** | Stubs are listed and loud (good), but two webhook handlers silently no-op (behavioral fakes) and Art. 20 export is absent and unlisted |
| D | Security (ASVS L2) | **PASS-WITH-FINDINGS** | Strong config posture; password validators never enforced; no login/2FA/reset endpoints; forged webhook → 500 |
| E | Money flow | **FAIL** | Checkout dead with shipped config; webhook pipeline dead; refund handler no-op; no commission split; no VAT-path tests |
| F | GDPR | **FAIL** | AuditLog unwritable; erasure entry point crashes; fan-out covers 1 of N apps; export missing; consent never enforced (encryption-at-rest PASSES) |
| G | Frontend/i18n/SEO | **FAIL** | Build broken; one page exists; no JSON-LD; hardcoded metadata; i18n plumbing itself is sound |
| H | Docs/portfolio fit | **PASS-WITH-FINDINGS** | Docs are unusually truthful; CODEOWNERS teams unverified; non-canonical repo/dir name |

---

## 2. Dimension A — Conformance

### A.1 Tree-diff verdict table (vs Build Plan §2 / mandated component set)

| Designed component | Status | Evidence |
|---|---|---|
| `apps/core` (models, encryption, idempotency, RBAC, pagination, health) | **PRESENT** | `backend/apps/core/*.py` |
| `apps/users_app` | **PRESENT (partial surface)** | models/services/views exist; only `register/` endpoint; no login/logout/2FA/reset/verify |
| `apps/sellers_app` | **PRESENT** | models/services/tasks; VIES stub MVP-S1 (listed) |
| `apps/products_app` | **PRESENT** | models/services/tasks/translations.py; no API surface |
| `apps/orders_app` | **PRESENT** | models/services/views/state_machine/tasks; only `checkout/` endpoint, no cart endpoints |
| `apps/payments_app` | **PRESENT** | models/services/tasks/webhooks/urls |
| `apps/search_app` | **PRESENT** | backends protocol (postgres impl; opensearch stub **unlisted**, see AUD-24) |
| `apps/shipping_app` | **PRESENT** | carriers protocol (DPD/Omniva stubs MVP-H1/H2 listed), HMAC webhook |
| `apps/ai_service_app` | **PRESENT** | guardrails + provider chain; embeddings stub MVP-A2 listed |
| `apps/bitrix24_integration_app` | **PRESENT** | tasks only; stubs MVP-B1/B2 listed |
| `apps/compliance_app` | **PRESENT (functionally broken)** | erasure/export/retention/audit; see AUD-02/06/07 |
| `apps/tax_app` | **EXTRA — documented** | appears in `01-modular-breakdown.md` table + README diagram; acceptable |
| `project/middleware/gdpr_middleware.py` + `csp.py` | **PRESENT** | correct MIDDLEWARE ordering (after auth, before views) |
| Frontend locale pages (catalog/PDP/cart/checkout/account) | **MISSING** | only `[locale]/layout.tsx` + home hero; catalog grid listed MVP-P3, checkout E2E listed MVP-E1; cart/PDP/account unlisted as pages |
| Frontend generated API client | **MISSING** | `src/lib/api/` contains only `.gitignore`; not generated, not generated in CI either |
| `frontend/package-lock.json` | **MISSING** | `npm ci` fails → AUD-12 |
| `docs/` set (ADRs, ASSUMPTIONS, COMPLIANCE_MATRIX, MVP_REMAINING_WORK, ERD, 4× sequences, runbooks) | **PRESENT** | all files exist and are substantive |
| `.github/` (templates, PR template, CODEOWNERS, dependabot, 4 workflows) | **PRESENT** | |
| `docker-compose.dev.yml` / `.test.yml`, Makefile, scripts | **PRESENT** | test topology has a runner bug (AUD-15) |

### A.2 Boundaries, license, README

- Mandated app set: **all 11 apps exist** and are in `INSTALLED_APPS` (`settings/base.py:45-56`). ✔
- `payments_app` is the **only** Stripe importer — verified by grep across `backend/` (zero hits outside). ✔
- Cross-app violations found: `payments_app/tasks.py:56` imports `apps.sellers_app.models` directly (ADR-0001 rule 2 breach) — AUD-25.
- `LICENSE`: intact AGPL-3.0 (header + full text, 34,523 bytes). ✔
- `README.md`: vision/architecture content present and consistent; **H1 is the non-canonical name `jolarca`** — AUD-26.

**Dimension A verdict: PASS-WITH-FINDINGS.**

---

## 3. Dimension B — Clean-machine functional audit (Gate 1)

**Audit environment (documented):** Linux (Ubuntu 24.04 host), Docker 29.7.2 + Compose v5.4.0, Python 3.12.3, Node v22.23.2/npm 10.9.8, network access to PyPI/npm/Docker Hub verified. Host caveat: pre-existing host services on `127.0.0.1:5432/6379` (audit-machine artifact, not a repo defect); worked around with a ports-only compose override (`/tmp/audit-compose-override.yml`). Fresh venv at `/tmp/audit-venv` installed from pinned+hashed `requirements/dev.txt` (`pip install --require-hashes` → exit 0). Frontend probed in a scratch copy (`/tmp/audit-frontend`) to keep the repo pristine.

### B.1 Headline boot test — `docker compose -f docker-compose.dev.yml up`

**Result: FAIL.** Compose aborts the entire `up` during the frontend image build:

```
target frontend: failed to solve: process "/bin/sh -c npm ci" did not complete successfully: exit code: 1
```

Root cause: no `package-lock.json` in `frontend/` (CI also references it as `cache-dependency-path`).
After the auditor workaround (frontend excluded, ports unpublished), the backend stack behaved:

| Step | Result |
|---|---|
| Migrations from **empty volumes** (`down -v`) | **PASS** — all apps applied cleanly (auth, axes, all 11 domain apps) |
| Seed (`scripts/seed_data.py`) | **PASS** — 3 sellers, 3 categories, 9 listings, VAT snapshots; synthetic data only ✔ |
| `GET /healthz/`, `GET /readyz/` | **PASS** — `{"status":"ok"}` / `{"status":"ready"}` |
| `GET /api/schema/` | **PASS** — 200; generated schema **in sync** with `docs/api/openapi.yaml` (diff empty) |
| `POST /api/v1/auth/register/` | **FAIL — HTTP 500** (AUD-01) |
| Frontend boots & renders | **FAIL** — image cannot build (AUD-12); even with `npm install` fallback, `next build` fails (AUD-11) |

Undocumented manual steps required: none beyond the documented `make sysdeps` (GDAL; documented in README/CONTRIBUTING), but the boot still fails *with* all documented steps — this is not a documentation gap, it is broken code.

### B.2 Backend quality gates (re-run, CI-equivalent, inside the repo's own test image)

| Gate | Command | Result |
|---|---|---|
| Unit + security tests | `pytest tests/unit tests/security` | **34 passed** in 0.56s |
| Coverage gate (CI: `--cov-fail-under=80`) | same + coverage | **FAIL — 36.56%** ("Required test coverage of 80% not reached") — AUD-13 |
| Lint | `ruff check .` | **FAIL — 42 errors** (37× E501, F401×2, F841, B904, DJ001, S104, UP035, I001) — AUD-14 |
| Typecheck | `mypy project apps` | **FAIL — 7 errors in 4 files** (incl. `retention.py:40` buyer=None vs non-nullable FK) — AUD-16 |
| Secrets | `scripts/check_no_secrets.sh` | **PASS** — clean; `.env` is byte-identical to `.env.example` (placeholders only; no real credentials anywhere) |
| Integration step | `compose -f docker-compose.test.yml run backend-test` | **FAIL — `TIMEOUT waiting for localhost:5432`** (container sees `db:5432`); suite is also empty — AUD-15 |

The ≥80% gate is genuinely wired in CI (`ci.yml:39`) — the gate is real; **the code simply does not meet it**, and CI would be red on backend (ruff, mypy, coverage) and frontend (npm ci, build) jobs alike.

### B.3 Frontend gates (scratch copy, `npm install` fallback)

| Gate | Result |
|---|---|
| `npm ci` (as documented & in CI) | **FAIL** — no lockfile (AUD-12) |
| `tsc --noEmit` | **PASS** (strict, noUncheckedIndexedAccess) |
| `next build` | **FAIL** — `Module not found: Can't resolve '../styles/globals.css'` in `[locale]/layout.tsx` (actual path `src/styles/globals.css`) — AUD-11 |
| Playwright "checkout journey" | cannot run (build broken); spec is a homepage smoke anyway (MVP-E1 listed) — AUD-21 |

**Dimension B verdict: FAIL.**

---

## 4. Dimension C — Stub & completeness hunt

Marker sweep (`TODO|FIXME|XXX|HACK|NotImplementedError|placeholder…`) across backend + scripts.
Every `NotImplementedError` carries an MVP ticket id and raises loudly, consistent with ADR-0007. Cross-check vs `docs/MVP_REMAINING_WORK.md`:

| Stub | Location | Listed? | Critical path? |
|---|---|---|---|
| MVP-U2 TOTP | `users_app/services.py:69` | ✔ | yes (auth/2FA) → AUD-18 |
| MVP-S1 VIES | `sellers_app/services.py:52` | ✔ | yes → AUD-19 |
| MVP-T2 Stripe Tax | `payments_app/services.py:99` | ✔ | yes (payments) → AUD-19 |
| MVP-T3 reverse charge | `tax_app/services.py:75` | ✔ | yes → AUD-19 |
| MVP-T4 OSS aggregation | `tax_app/tasks.py:13` | ✔ | yes → AUD-19 |
| MVP-Y1 split payouts | `payments_app/services.py:36` | ✔ | yes → AUD-20 |
| MVP-H1/H2 carriers | `shipping_app/carriers/*` | ✔ | webhook/label paths |
| MVP-P1 images | `products_app/tasks.py:11` | ✔ | no |
| MVP-A2 embeddings | `providers/{selfhosted,commercial}.py` | ✔ | no |
| MVP-B1/B2 Bitrix24 | `bitrix24_integration_app/tasks.py` | ✔ | no |
| OpenSearch backend "Phase 2" | `search_app/backends/opensearch.py` | **✘ unlisted** | no → AUD-24 |

**Behavioral stubs (returns success without doing work — the worst class):**

- `payments_app/tasks.py:37 handle_charge_refunded` — loads the event, does nothing, returns success. Tracked as MVP-Y2 but **violates ADR-0007's own claim** ("Nothing pretends to succeed"). Refunds never touch `PaymentRecord.refunded_amount` or order state → AUD-08.
- `payments_app/tasks.py:47 handle_connect_account_updated` — reads `SellerProfile`, writes nothing (MVP-Y3) → AUD-08.
- `compliance_app/tasks.py:22 nightly_retention_sweep` — writes one AuditLog row (which itself crashes, AUD-02) and performs **no retention processing** (MVP-C2 comment) → AUD-09.
- `DataExport` (Art. 20) — model exists, **no generator, no task, no endpoint, and not listed** in MVP_REMAINING_WORK. COMPLIANCE_MATRIX honestly calls it a "job skeleton", but the stub register omits it → AUD-07.

**Dimension C verdict: FAIL** (behavioral fakes in webhook handlers + unlisted export gap), with credit: the loud-stub discipline is otherwise real.

---

## 5. Dimension D — Security (OWASP ASVS L2 spot-verification)

| Check | Result | Evidence |
|---|---|---|
| DEBUG default | **PASS** | `env_bool("DJANGO_DEBUG", default=False)`; dev opts in loudly |
| SECRET_KEY handling | **PASS** | production refuses boot <50 chars (validated + unit-tested); dev fallback labeled & warned |
| ALLOWED_HOSTS | **PASS** | production requires explicit set, rejects loopback (tested) |
| Env-driven config, no secret fallbacks | **PASS** | `settings/env.py` typed accessors; `validation.py` refuse-to-boot |
| Hardcoded credentials repo-wide | **PASS** | `.env` ≡ `.env.example` (CHANGE_ME only); `check_no_secrets.sh` clean; gitleaks in CI |
| JWT config | **N/A — DEVIATED** | no JWT/token auth at all; SessionAuthentication only, and **no login endpoint exists** → sessions are unreachable via API → AUD-17 |
| django-axes | **PASS (config)** | enabled, lockout 5/15min, middleware last; dev disables it loudly; no test coverage of lockout |
| TOTP requires verified email | **FAIL** | TOTP is stub MVP-U2; no email-verification concept exists at all → AUD-18 |
| Password strength | **FAIL** | `AUTH_PASSWORD_VALIDATORS` configured but **never executed**: `UserManager.create_user` calls `set_password` directly and the register serializer only checks `min_length=12`. CommonPassword/numeric/similarity validators are dead config → AUD-10 |
| GDPR middleware ordering | **PASS** | after `AuthenticationMiddleware`, before views (`base.py:59-73`) |
| GDPR middleware proofs (consent/audit/fail-closed) | **PARTIAL** | kill-switch + request-id tested; **consent is never enforced server-side anywhere**; audit emission is structlog-only and the durable AuditLog is unwritable (AUD-02) |
| ORM-only | **PASS** | zero `.raw(`/`.extra(` hits |
| DRF input validation | **PASS** | serializers with `is_valid(raise_exception=True)` on all endpoints |
| XSS | **PASS** | no `dangerouslySetInnerHTML`; React escaping by default |
| CSRF | **PASS (design)** | CsrfViewMiddleware + SessionAuthentication; webhooks `csrf_exempt` justified by signature/HMAC verification |
| CSP | **PASS** | Django `csp.py` middleware + mirrored Next.js headers (`next.config.ts`) |
| Rate limiting auth/register/reset | **PARTIAL** | global anon 60/min + user 300/min only; no tighter per-endpoint throttles; login/reset endpoints absent → AUD-17 |
| Idempotency-Key on order/payment creation | **PASS** | checkout requires the header (400 without); fingerprint conflict detection implemented |
| Forged webhook handling | **FAIL** | 500 instead of 400 (AUD-04); DEBUG page leaks settings in dev |

**Dimension D verdict: PASS-WITH-FINDINGS.**

---

## 6. Dimension E — Money-flow audit

| Check | Result | Evidence |
|---|---|---|
| Stripe boundary containment | **PASS** | grep: `import stripe` only in `payments_app` |
| No PAN/CVC anywhere | **PASS** | grep models/serializers/logs: zero card-field patterns; PaymentRecord stores ids+amounts only (SAQ-A consistent) |
| Webhook signature verification | **PASS (crypto) / FAIL (behavior)** | `construct_event` with secret — but forged → 500 (AUD-04), valid → 500 (AUD-03) |
| Webhook idempotency (event-id dedupe) | **design PASS / untestable live** | `get_or_create` on unique `event_id`; concurrent race window before `processed_at` set; **no replay test exists** (conftest: "MVP tests are non-DB") → AUD-22 |
| Replay negative test performed by audit | **BLOCKED by AUD-03** | valid signed event (generated with repo's `whsec_` secret via `WebhookSignature.generate_signature_header`) → `TypeError: Object of type Event is not JSON serializable` |
| Commission split (destination charges) | **MISSING** | `create_payment_intent` has no `transfer_data`/application fee; MVP-Y1 listed → AUD-20 |
| Integer cents / EUR lock | **PASS** | `int(order.total_gross * 100)` at the Stripe call; `Order.currency` default "EUR"; amounts Decimal(12,2) |
| Rounding rules | **PARTIAL** | `quantize(0.01)` (banker's rounding) in tax_app; documented nowhere explicit; no rounding tests |
| VAT: domestic B2C | **PASS (live-verified)** | checkout LT: net 90.00 → VAT 18.90 (21%) → gross 108.90 ✔ |
| VAT: cross-border B2C OSS capture | **MISSING** | `calculate_for_order(order_items=[], ...)` — item/seller origins discarded; no OSS capture; MVP-T4 listed → AUD-19 |
| VAT: B2B reverse charge | **STUB** | `reverse_charge_check` raises NotImplementedError (MVP-T3) → AUD-19 |
| VAT: invalid-VAT fallback test | **MISSING** | no VAT test cases exist at all → AUD-19 |
| Order state machine | **PASS (live-verified)** | illegal `delivered→pay` rejected with `InvalidTransition`; terminal states edgeless; audit event emitted per transition |
| Refund path updates order + transaction | **FAIL** | `handle_charge_refunded` is a no-op (AUD-08); `refund()` service exists but nothing reconciles |
| Carrier protocol + HMAC webhook | **PASS (code)** | `compare_digest` HMAC; status map drives state machine; **zero fixture tests** → AUD-22 |
| Parcel-locker persistence | **PASS (schema)** | `Shipment.locker_id` persisted |
| Checkout with shipped `.env` | **FAIL** | `sk_test_CHANGE_ME` passes the configured-check, calls **live api.stripe.com** → 401 `AuthenticationError` → whole atomic checkout rolls back. `stripe-mock` runs on :12111 but nothing sets `stripe.api_base`/`STRIPE_API_BASE` → AUD-05 |
| Checkout sanctioned fallback | **PASS (live-verified)** | with key unset: order created PENDING, idempotent replay returns same order (1 row only) ✔ |

**Dimension E verdict: FAIL.**

---

## 7. Dimension F — GDPR & data protection

| Check | Result | Evidence |
|---|---|---|
| PII encrypted at rest — raw-SQL proof | **PASS** | wrote profile via ORM, read via `psql` bypassing ORM: column holds `gAAAAABqf68…` (120-char Fernet token), no plaintext. Implementation is **Fernet (app-layer), not pgcrypto** — substitution documented in ADR-0004; pgcrypto extension provisioned in `init-extensions.sql` |
| ERD annotation ↔ model match | **PASS** | ERD names exactly `full_name|phone|date_of_birth|street_address` → matches `UserProfile` fields |
| Fail-closed encryption | **PASS** | empty key → `EncryptionNotConfigured`; rotation via MultiFernet tested. Caveat: `.env` ships `FIELD_ENCRYPTION_KEY=CHANGE_ME` which is **invalid** (not empty) → raw `ValueError` on first PII write in the default dev stack (documented generation command exists in `.env.example`) |
| Consent ledger | **BROKEN** | `ConsentRecord` append-only guard blocks its **own creation** (AUD-01) — the ledger can never be written |
| Consent enforced server-side | **FAIL** | no middleware/view checks consent for non-essential processing; banner message keys exist, banner component does not |
| Audit log | **BROKEN** | `AuditLog.objects.create` raises on every insert (AUD-02); COMPLIANCE_MATRIX "Audit trail" row is currently fiction |
| Erasure entry point | **BROKEN** | `erase_user_data()` → `request_erasure()` → AuditLog write → `ValueError` (live-verified) |
| Erasure fan-out coverage | **FAIL** | registry covers **users_app only** (`verify_registry` hardcodes `expected={"users_app"}` — tautological test); no handlers for orders linkage, products/seller content, media storage; sequence diagram 05 implies more |
| Erasure handler behavior | **PASS (users_app)** | live-verified: email → `erased-<pk>@invalid`, `is_active=False`, unusable password, profile rows deleted; order financials untouched (anonymize-don't-delete preserved) |
| Erasure task durability | **FAIL** | `execute_erasure` crashes on its final AuditLog write after saving status=completed → Celery retries loop to dead-letter; `run_erasure_fanout` never succeeds |
| Consent history handling | **FINDING** | `erase_users` deletes all `ConsentRecord` rows; the receipt records only counts — consent evidence vanishes (AUD-27) |
| Data export (Art. 20) | **MISSING** | `DataExport` model only; no generator/endpoint; unlisted → AUD-07 |
| Retention | **BROKEN/STUB** | sweep writes only an audit row; `anonymize_order_history` sets `buyer=None` on a non-nullable PROTECT FK (mypy flags it; would `IntegrityError` at runtime) — MVP-C2 listed → AUD-09 |
| AI PII pre-filter | **PASS (live-verified)** | synthetic PII (email/phone/11-digit code) → all `[REDACTED]`; disabling the flag → `PIIBlocked` fail-closed |
| AI outbound audit logging | **PASS (code)** | `log_outbound` on success and failure paths → `AIRequestLog` |
| AI graceful degradation | **PASS** | no providers configured → task ends FAILURE with `ProviderError` (loud), retried then dead-lettered; no silent success |
| Machine-translation flagging | **MISSING** | no `is_machine_translated` marker in model or UI strings |
| Catalog translation persistence | **BROKEN** | modeltranslation fields never materialize (`hasattr(ProductListing,'title_lt') == False`; no translated columns in migrations) → `translate_listing_content` cannot save; ADR-0003 claim false in practice → AUD-23 |

**Dimension F verdict: FAIL** (encryption-at-rest and AI guardrails genuinely pass; the accountability machinery — consent ledger, audit log, erasure orchestration, export — is broken or missing).

---

## 8. Dimension G — Frontend, i18n & SEO

- Page surface: layout + home hero only. No catalog grid (MVP-P3 listed), no PDP, no cart/checkout/orders/seller/account pages.
- **Build broken** (AUD-11); **no lockfile** (AUD-12); E2E "checkout journey" is a homepage-render smoke labeled as such in comments (MVP-E1) but named `checkout.spec.ts` and advertised as the checkout gate in CI (`ci.yml:73`) → AUD-21.
- Zero hardcoded UI strings in components ✔ (all via `useTranslations`), but **layout metadata is hardcoded English** (`title/description`) — not localized per locale (gate #6 finding, AUD-28).
- Locales: lt/lv/et/en all present, **8 keys each, perfectly parallel** — no missing-key fallbacks ✔.
- Type safety: `strict: true` + `noUncheckedIndexedAccess`; `tsc --noEmit` passes ✔.
- Generated API client: config exists (`openapi-ts`), output dir gitignored, but **client is absent and no CI step generates it** — README invariant #4 ("CI artifacts") is unimplemented → AUD-29.
- SEO: locale-prefixed routing ✔, `robots.ts` + `sitemap.ts` with hreflang ✔ — but sitemap advertises `/cart /checkout /orders /seller /account` which **do not exist** (404s for crawlers) → AUD-30. No JSON-LD (Product/Offer/Organization) anywhere.
- Accessibility: no Radix/shadcn primitives in dependencies (Tailwind only); cannot demonstrate WCAG 2.1 AA path → AUD-31.

**Dimension G verdict: FAIL.**

---

## 9. Dimension H — Docs-code consistency & portfolio fit

- Sequence diagrams 02–05 vs code: flows, endpoint paths, queue names and audit event names **match the implementation** (02 notes 2FA as MVP-U2 honestly; 03 names real functions `publish_listing/translate_listing/index_listing`; 04 matches checkout exactly; 05 matches erasure mechanics). Diagrams are truthful — but diagram 05's fan-out implies broader coverage than the code's users_app-only registry (F finding).
- ERD matches models (relationships + encryption annotations) ✔.
- `COMPLIANCE_MATRIX.md`: every row points at a real file ✔ — but two rows currently describe broken controls (audit trail, portability "job skeleton") without saying so → finding folded into AUD-02/07.
- `ASSUMPTIONS.md` covers stack substitutions incl. A-04 (Fernet vs pgcrypto), A-07 (deploy target UNDECIDED — deploy workflows `exit 1` loudly, verified) ✔.
- **CONTRIBUTING drift:** gate #3 says "coverage ≥80% on changed lines", CI enforces total ≥80%; `npm ci` instructions cannot work (no lockfile) → AUD-32.
- **CODEOWNERS:** handles `@jol-infrastructure/{payments,compliance,platform}-owners` — the public org is JourneyOfLife; teams unverifiable and likely nonexistent → branch protection would silently fall open. **CRITICAL pre-push** → AUD-33 (replacement table in checklist).
- **Naming:** repo dir + README H1 + CONTRIBUTING clone path say `jolarca`; canonical public repo is `jol-marketplace` (JourneyOfLife). Internal names are mostly canonical (pyproject, compose project names, package.json) → AUD-26 with rename runbook in checklist.
- Public-repo readiness: issue templates ✔, SECURITY.md with private disclosure ✔, `.example`-domain contacts only, no internal hostnames/IPs/personnel emails (grep verified; `.venv` hits are third-party vendored files, gitignored) ✔.
- Version drift vs audit object spec: Django **5.2** (spec: 4.2), Next **15** (spec: 14), React 19. No ADR records the deviation → AUD-34.
- Repo hygiene: `.idea/*` staged (incl. `jolarca.iml`), `workspace.xml` correctly gitignored; `.pytest_cache` present but gitignored → AUD-35.

**Dimension H verdict: PASS-WITH-FINDINGS.**

---

## 10. Findings register

| ID | Dim | Sev | Location | Claim vs. Evidence | Remediation | Owner |
|---|---|---|---|---|---|---|
| AUD-01 | F/B | **CRITICAL** | `users_app/models.py:82-85` (+ `compliance_app/models.py:29-32` same pattern) | Claim: consent ledger written at registration. Evidence: `POST /api/v1/auth/register/` → 500 `ValueError: ConsentRecord is append-only`. UUID default sets `pk` at instantiation, so the "no updates" guard rejects every INSERT | Use `if not self._state.adding:` (Django idiom) in both `ConsentRecord.save` and `AuditLog.save/delete`; add a DB-backed regression test for each create path | backend |
| AUD-02 | F | **CRITICAL** | `compliance_app/models.py:29-35`; proven via `AuditLog.objects.create(action='audit_probe')` → `ValueError` | Claim: "append-only audit trail" (COMPLIANCE_MATRIX). Evidence: **no AuditLog row can ever be created** → erasure requests crash, retention sweep crashes, durable audit evidence is zero | Same fix as AUD-01; then prove with a DB test that erasure writes its audit rows | backend/compliance |
| AUD-03 | E | **CRITICAL** | `payments_app/webhooks.py:54-57` | Claim: "persist the raw event FIRST". Evidence: valid signed `payment_intent.succeeded` → 500 `TypeError: Object of type Event is not JSON serializable` (`defaults={"payload": event}` stores the SDK object). No Stripe event can ever be processed | Store `event.to_dict()` (or `json.loads(str(event))`); add replay test: send same event twice → single transition, `duplicate_ignored` on second | payments |
| AUD-04 | E/D | **CRITICAL** | `payments_app/webhooks.py:50` | Claim: forged signature → 400 + audit warning. Evidence: forged signature → 500 `SignatureVerificationError` (subclass of `StripeError`, not `ValueError`) | Catch `stripe.SignatureVerificationError` (and generic `stripe.StripeError`) → 400; add negative test | payments |
| AUD-05 | E/B | **CRITICAL** | `.env.example:48`, `payments_app/services.py:20-29`, `docker-compose.dev.yml:73-76` | Claim: dev stack runs against stripe-mock. Evidence: `sk_test_CHANGE_ME` passes the configured-check; SDK calls **live** `api.stripe.com` → 401 → checkout rolls back. Nothing sets `api_base` to `stripe-mock:12111` | Add `STRIPE_API_BASE` env support in `_stripe()`; point dev compose at `http://stripe-mock:12111`; make checkout catch Stripe API errors as a loud 502-ish state, never a silent rollback surprise | payments |
| AUD-06 | F | **CRITICAL** | `compliance_app/services.py:34-52,108-113` | Claim: erasure fan-out across apps (diagram 05). Evidence: registry has users_app only; `verify_registry` hardcodes the same set (tautology); live run: handler anonymizes user, then crashes on final AuditLog write → Celery retry loop | Fix AUD-02; register real handlers for all PII stores; derive `expected` from model introspection (EncryptedTextField/PII scan), not a hardcoded set; DB test: PII gone + financials intact + receipt persisted | compliance |
| AUD-07 | F/C | **HIGH** | `compliance_app/models.py:56-62` | Claim: Art. 20 portability (COMPLIANCE_MATRIX row). Evidence: model only — no generator, no task, no endpoint; **absent from MVP_REMAINING_WORK.md** | Implement export task (JSON/CSV bundle → S3 signed URL) or list as sanctioned stub with ticket id | compliance |
| AUD-08 | E/C | **CRITICAL** | `payments_app/tasks.py:37-58` | Claim (ADR-0007): "Nothing pretends to succeed". Evidence: `handle_charge_refunded` and `handle_connect_account_updated` return success without any write (behavioral fakes in webhook handlers) | Either implement (refund ledger update both records; Connect status mapping) or raise `NotImplementedError` per ADR-0007 so retries/DLQ expose the gap | payments |
| AUD-09 | F/C | **HIGH** | `compliance_app/tasks.py:22-27`, `retention.py:39-41` | Claim: retention sweep anonymizes per policy. Evidence: sweep writes one log row and does nothing; `anonymize_order_history` sets `buyer=None` on a non-nullable PROTECT FK (mypy error confirms) → IntegrityError at runtime | MVP-C2: nullable-buyer migration + real sweep; until then raise loudly | compliance |
| AUD-10 | D | **HIGH** | `users_app/models.py:19-26`, `serializers.py:6-9` | Claim: 4 password validators configured. Evidence: none ever run — `create_user` calls `set_password` directly; serializer only checks length | Run `validate_password()` in `services.register` (or serializer.validate_password); test weak passwords rejected | backend |
| AUD-11 | B/G | **HIGH** | `frontend/src/app/[locale]/layout.tsx:8` | Claim: frontend builds. Evidence: `next build` → `Module not found: '../styles/globals.css'` | Change import to `@/styles/globals.css` (one line) | frontend |
| AUD-12 | B | **HIGH** | `frontend/` (absent `package-lock.json`) | Claim: `npm ci` in CI, Dockerfile, CONTRIBUTING. Evidence: `npm ci` fails; CI `cache-dependency-path` points at nonexistent file; frontend Docker build fails; compose `up` aborts | Generate + commit lockfile with Node 22; verify `npm ci` | frontend |
| AUD-13 | B | **HIGH** | `ci.yml:39` vs tests/ | Claim: ≥80% coverage gate green. Evidence: **36.56%** (gate enforced, code fails it by 43 pts); no DB tests exist at all | Add DB suites: checkout, webhook replay, erasure, encryption raw-SQL, register; or re-scope gate honestly in an ADR | backend |
| AUD-14 | B | **HIGH** | backend-wide | Claim: ruff gate green. Evidence: 42 errors (incl. F401/F841/B904/DJ001 `Order.idempotency_key null=True` CharField) | Fix lint; resolve DJ001 via migration (nullable→default-empty or TextField) | backend |
| AUD-15 | B | **HIGH** | `scripts/wait_for_services.sh:9-12` + `docker-compose.test.yml` | Claim: integration tests run in CI-parity topology. Evidence: `TIMEOUT waiting for localhost:5432` from inside backend-test container (services are `db`/`redis`); suite also empty | Accept `WAIT_HOSTS` or parse DATABASE_URL/REDIS_URL hosts; add real integration tests | infra/backend |
| AUD-16 | B | **HIGH** | mypy output (4 files) | Claim: mypy gate green. Evidence: 7 errors incl. the retention buyer=None bug | Fix type errors (they flag real bugs) | backend |
| AUD-17 | D | **HIGH** | `users_app/urls.py`, DRF settings | Claim: authenticated money path. Evidence: SessionAuthentication with **no login/logout endpoints** → checkout API unreachable over HTTP by any client; no JWT despite spec expectation; no email verification, no password reset | Implement session login/logout (or token auth ADR), verification flow, reset flow; throttle auth endpoints tighter than global | backend |
| AUD-18 | D/C | **HIGH** | `users_app/services.py:63-69` | Master Prompt: no stubs in auth/2FA critical path. Evidence: TOTP is NotImplementedError (listed MVP-U2, loud) | Implement before push or explicitly waive in Master Prompt governance | backend |
| AUD-19 | E | **HIGH** | `tax_app/services.py:68-75`, `tasks.py`, `sellers_app/services.py:46-52` | Claim: OSS/B2B VAT handling. Evidence: reverse charge = stub; OSS aggregation = stub; VIES = stub; checkout discards item origins (`order_items=[]`); **zero VAT test cases** (domestic/OSS/B2B/invalid-VAT) | Implement or gate B2B checkout off; add the four mandated VAT scenario tests | tax |
| AUD-20 | E | **HIGH** | `payments_app/services.py:32-57` | Claim: marketplace commission at charge time. Evidence: no `transfer_data`/application fee anywhere (MVP-Y1 listed) | Implement destination charges + commission model with cent-exact tests | payments |
| AUD-21 | G/B | **MEDIUM** | `frontend/tests/e2e/checkout.spec.ts`, `ci.yml:73` | Claim: "Playwright checkout journey". Evidence: spec renders the homepage in 4 locales (admitted MVP-E1 in comments); no checkout page exists to test | Rename spec or implement journey against payment mock | frontend |
| AUD-22 | E | **HIGH** | `backend/tests/**` | Master Prompt acceptance: replayed webhook, tampered consent, illegal transition negative tests. Evidence: no webhook replay test, no carrier-webhook fixture tests, no DB-backed consent/erasure tests (only unit-level state machine) | Add webhook replay + forgery tests, carrier fixture tests, DB suites | backend |
| AUD-23 | F/G | **HIGH** | `products_app/translations.py` + migrations | Claim (ADR-0003): modeltranslation for catalog. Evidence: `hasattr(ProductListing,'title_lt') == False`; no translated columns in migrations; `save(update_fields=['title_lt'])` would raise | Fix registration timing/migrations (makemigrations after registration loads); add test asserting translated columns exist | backend |
| AUD-24 | C | **MEDIUM** | `search_app/backends/opensearch.py` | Unlisted stub ("Phase 2", no MVP id) | Add to MVP_REMAINING_WORK or implement | search |
| AUD-25 | A/H | **MEDIUM** | `payments_app/tasks.py:56` | ADR-0001: cross-app via services only. Evidence: direct `sellers_app.models` import | Route through `sellers_app.services` | payments |
| AUD-26 | H | **MEDIUM** | README H1, repo dir, CONTRIBUTING | Canonical name `jol-marketplace`; actual `jolarca` | See rename runbook in PRE_PUSH_CHECKLIST | infra |
| AUD-27 | F | **MEDIUM** | `compliance_app/services.py:42` | Erasure deletes ConsentRecord rows; receipt stores only counts → consent evidence lost | Retain hashed consent evidence or snapshot into receipt per RoPA decision | compliance |
| AUD-28 | G | **MEDIUM** | `[locale]/layout.tsx` metadata | Gate #6 zero hardcoded strings: title/description hardcoded English | Localize metadata per locale | frontend |
| AUD-29 | G/H | **MEDIUM** | `frontend/src/lib/api/`, `ci.yml` frontend job | README invariant #4: generated client as CI artifact. Evidence: no client, no CI generation step | Add `npm run generate:api` to CI + wire client into pages | frontend |
| AUD-30 | G | **MEDIUM** | `sitemap.ts:5` | Sitemap lists `/cart /checkout /orders /seller /account` — all 404 | Generate from real routes only | frontend |
| AUD-31 | G | **LOW** | `package.json` | WCAG path claimed via shadcn/Radix; neither in dependencies | Adopt Radix primitives with first real components | frontend |
| AUD-32 | H | **LOW** | CONTRIBUTING vs ci.yml | "≥80% on changed lines" vs total coverage; `npm ci` docs | Align docs with CI | docs |
| AUD-33 | H | **CRITICAL (pre-push)** | `.github/CODEOWNERS` | Placeholder-ish org handles `@jol-infrastructure/*-owners`; public org is JourneyOfLife; unverified teams = protection silently open | Replacement table in PRE_PUSH_CHECKLIST; verify teams exist before enabling protection | infra |
| AUD-34 | A/H | **MEDIUM** | `pyproject.toml`, `package.json` | Spec says Django 4.2 / Next 14; actual Django 5.2.17 / Next 15.5 with no ADR | Record substitution ADR or pin to spec | leads |
| AUD-35 | H | **LOW** | `.idea/*` staged | IDE metadata incl. `jolarca.iml` staged for a public repo | Ignore `.idea/` wholesale; unstage | infra |
| AUD-36 | E | **MEDIUM** | `payments_app/webhooks.py:54-68` | `processed_at` set at dispatch (not completion); concurrent duplicate events both pass `is_processed` check before either saves | Set a processing claim atomically (select_for_update/unique state) and mark completion from the task | payments |
| AUD-37 | E | **MEDIUM** | `orders_app/services.py:24-28` | `_next_order_number` = `count()+1` — concurrent checkouts collide (unique constraint then 500) | DB sequence or retry-on-IntegrityError | orders |
| AUD-38 | F/D | **MEDIUM** | gdpr_middleware | Audit acceptance: consent enforced server-side + fail-closed when missing. Evidence: middleware implements halt-switch + correlation only; consent never consulted anywhere | Define consent gate for non-essential processing (or document legal basis per purpose in an ADR) | compliance |
| AUD-39 | B | **LOW** | `sellers_app/tasks.py:20-29` | `sweep_stale_submissions` defined but absent from `CELERY_BEAT_SCHEDULE` (never runs); also nulls `submitted_at` as "re-arm" | Wire into beat or remove | sellers |
| AUD-40 | D | **LOW** | `settings/dev.py:17` | `ALLOWED_HOSTS` includes `0.0.0.0` (ruff S104); dev-only, labeled | Remove `0.0.0.0` | backend |

---

## 11. Evidence appendix (commands & outputs)

Environment: Ubuntu 24.04 host · Docker 29.7.2 / Compose v5.4.0 · Python 3.12.3 · Node v22.23.2 · audit venv `/tmp/audit-venv` (pinned+hashed install exit 0) · frontend scratch copy `/tmp/audit-frontend`. Host artifacts: pre-existing `127.0.0.1:5432/6379` services worked around with a ports-only compose override; documented here per Gate-1 honesty requirement.

1. **Secrets:** `bash scripts/check_no_secrets.sh` → `check_no_secrets: clean.`; `diff .env .env.example` → identical (placeholders only).
2. **Pristine boot:** `docker compose -f docker-compose.dev.yml up -d` → `target frontend: failed to solve: "/bin/sh -c npm ci" ... exit code: 1` (whole `up` aborts).
3. **Workaround boot:** override (ports unpublished, frontend excluded) → all 8 services healthy; backend log: all migrations `Applying … OK` from `down -v` state.
4. **Probes:** `/healthz/`→`{"status":"ok"}` · `/readyz/`→`{"status":"ready"}` · `/api/schema/` 200, `diff` vs snapshot → **in sync**.
5. **Seed:** `python seed_data.py` → `Seed complete: 3 sellers, 3 categories, 9 listings, VAT snapshots.`
6. **Register:** `curl -X POST /api/v1/auth/register/` → 500; `Exception Value: ConsentRecord is append-only; create a new record instead.`
7. **Append-only probes:** `AuditLog.objects.create(...)` → `ValueError: AuditLog is append-only; updates are forbidden.` · `ConsentRecord.objects.create(...)` → `ValueError` (both creations impossible).
8. **Checkout (shipped key):** shell checkout → `stripe._error.AuthenticationError: Invalid API Key provided: sk_test_*****E_ME` against `https://api.stripe.com` (atomic rollback; order not created).
9. **Checkout (key unset):** `ORDER: JOL-2026-000001 pending net=90.00 vat=18.90 gross=108.90 EUR` · `REPLAY SAME KEY: REPLAYED-OK` · `ORDERS TOTAL: 1` · illegal `delivered→pay` → `InvalidTransition: Event 'pay' is not allowed from status 'delivered'.`
10. **Webhooks:** signed with repo secret via `stripe.WebhookSignature.generate_signature_header` → FORGED: 500 (SignatureVerificationError) · VALID: 500 `Exception Value: Object of type Event is not JSON serializable` (json/encoder.py) · `StripeWebhookEvent` rows: 0.
11. **Encryption raw-SQL:** after ORM write, `psql -c "SELECT left(full_name,30), length(full_name) FROM users_app_userprofile"` → `gAAAAABqf68iA_WxZ-Q3FtBFXju8po…` (len 120), no plaintext.
12. **Invalid key behavior:** with shipped `FIELD_ENCRYPTION_KEY=CHANGE_ME` → `SAVE-FAILED: ValueError Fernet key must be 32 url-safe base64-encoded bytes.`
13. **AI guardrails:** `protect(synthetic PII)` → `…[REDACTED] or [REDACTED], personal code [REDACTED].` · `AI_PII_FILTER_ENABLED=False` → `PIIBlocked: …refusing outbound AI call (fail-closed).` · translate task with no providers → EagerResult `FAILURE: ProviderError('OPENAI_API_KEY is not configured.')`.
14. **modeltranslation:** `hasattr(ProductListing, 'title_lt')` → `False`; `fields: ['title', 'description']`; migrations contain no translated columns.
15. **Erasure:** `erase_user_data(u)` → `ValueError AuditLog is append-only…`; direct `execute_erasure`: user anonymized (`erased-<pk>@invalid`, inactive, 0 profile rows) but request crashes on final audit write.
16. **Gates:** pytest `34 passed` + `FAIL Required test coverage of 80% not reached. Total coverage: 36.56%` · `ruff check .` → `Found 42 errors.` · `mypy project apps` → `Found 7 errors in 4 files` · integration step → `TIMEOUT waiting for localhost:5432`.
17. **Frontend:** `npm ci` → exit 1 (no lockfile) · `npm install` OK · `tsc --noEmit` exit 0 · `next build` → `Module not found: Can't resolve '../styles/globals.css'`.
18. **Boundary greps:** `import stripe` outside payments_app → none · `.raw(/.extra(` → none · PAN/CVC patterns → none · `dangerouslySetInnerHTML` → none · internal hostnames/personnel emails → none (`.example` domains only).

---

## 12. Final verdict (one sentence)

**Is jol-marketplace 100% done per its own Master Prompt §9? — NO**: fresh-machine boot fails (AUD-11/12), three critical-path runtime crashes (AUD-01/02/03/04), checkout dead with shipped config (AUD-05), all four enforced CI gates red (AUD-13/14/15/16), and the GDPR accountability machinery — consent ledger, audit log, erasure orchestration, Art. 20 export — is broken or missing (AUD-06/07/09/38).
