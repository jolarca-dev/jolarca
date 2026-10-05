# JOL Marketplace — Security Documentation

**Version:** 1.0 · **Posture:** PCI DSS SAQ-A · ISO 27001 / SOC 2 Type II orientation
**Audience:** Security auditors, grant technical reviewers

## Table of Contents

1. [Security Headers](#1-security-headers)
2. [Content Security Policy](#2-content-security-policy)
3. [Dependency Supply Chain](#3-dependency-supply-chain)
4. [OWASP Top 10 Mitigations](#4-owasp-top-10-mitigations)
5. [Payments & PCI Scope](#5-payments--pci-scope)
6. [Incident Response Plan](#6-incident-response-plan)
7. [Change and Deployment Controls](#7-change-and-deployment-controls)

---

## 1. Security Headers

Applied per-request by the frontend middleware (`src/lib/security.ts`),
unit-tested in `tests/unit/security.test.ts`:

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS for 2 years |
| `X-Frame-Options` | `DENY` | Legacy clickjacking guard (CSP `frame-ancestors 'none'` is canonical) |
| `X-Content-Type-Options` | `nosniff` | MIME-confusion defense |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No paths/queries leak to third parties |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | No sensor surface |
| `Content-Security-Policy` | nonce-based, §2 | Injection control |

The header set is **locked by tests**: any change requires touching the
security suite, which is codeowner-protected.

## 2. Content Security Policy

Built per request with a **fresh 16-byte cryptographic nonce** (no
`unsafe-inline`, no `unsafe-eval`, no wildcard script origins):

```
default-src 'self';
script-src 'self' 'nonce-<random>' https://js.stripe.com [analytics-origin];
style-src 'self' 'nonce-<random>';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self' <API origin> https://api.stripe.com [analytics-origin];
frame-src https://js.stripe.com https://www.openstreetmap.org;
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Design decisions:

- **Frames are allowlisted to exactly two origins** — Stripe (payment
  element) and OpenStreetMap (funeral maps, mounted only on explicit user
  click). The test suite asserts this exact string, so a third frame origin
  cannot slip in unnoticed.
- The analytics origin is appended to `script-src`/`connect-src` **only
  when configured**; until then the directive stays minimal.
- Fonts are self-hosted (next/font) — `font-src 'self'` is complete.
- `img-src https:` permits the media CDN/S3 origin generically; media is
  served via signed URLs from private buckets (ADR-0005).

## 3. Dependency Supply Chain

| Control | Implementation |
|---|---|
| Lockfile-only installs | CI runs `npm ci` (frontend) and pip-tools hashed pins (backend, `make lock`) — never floating resolution in CI |
| Vulnerability scanning | Security workflow: trivy `CRITICAL/HIGH` **build gate scoped to production dependencies**, plus a **non-blocking dev-inclusive** trivy SARIF report so dev-only advisories still surface as code-scanning alerts; backend `pip-audit --strict` on `base.txt` **and** `prod.txt` (runtime parity); frontend `npm audit --omit=dev --audit-level=high` |
| Secret scanning | Gitleaks (`scripts/check_no_secrets.sh` + CI `secrets` job) |
| Codegen toolchain risk acceptance | `js-yaml 4.x` advisory in the OpenAPI codegen toolchain — dev-only, network-isolated usage; formally accepted in ADR-0010 |
| Frontend lint-toolchain risk acceptance | `braces` CVE-2026-93687 (HIGH) — dev-only transitive of `eslint-config-next`, **no upstream fix**, not present in the shipped runner image; formally accepted in **ADR-0018**; tracked via the non-blocking trivy dev report |
| Updates | Dependabot configured (`.github/dependabot.yml`); security patches prioritized over features |
| Provenance | Production container images are built from committed lockfiles; MinIO pinned to release tags in production (ADR-0005) |

## 4. OWASP Top 10 Mitigations

| # | Risk | Mitigation |
|---|---|---|
| A01 Broken access control | Server-side role checks on every request; UI gates are cosmetic only; admin surfaces edge-restricted (ADR-0006) |
| A02 Cryptographic failures | Fernet field-level encryption (`core.EncryptedTextField`, MultiFernet rotation, fail-closed); TLS 1.2+ everywhere; secrets in env, never code (ADR-0004) |
| A03 Injection | ORM-only data access; rich-text descriptions sanitized before render; CSP blocks inline script injection |
| A04 Insecure design | Contract-gap doctrine forbids fabricated state (ADR-0007); order state machine has explicit transitions only; idempotency on checkout |
| A05 Security misconfiguration | `poweredByHeader: false`, `DJANGO_DEBUG=false` enforced in prod settings, exact-match `ALLOWED_HOSTS`, source maps disabled in production |
| A06 Vulnerable components | Supply-chain controls §3 |
| A07 Auth failures | httpOnly SameSite=Lax session cookies, CSRF double-submit, rate limits on auth endpoints, password strength policy |
| A08 Integrity failures | Signed Stripe webhooks + event-id idempotency; CI artifact pipeline; no unsigned image deploys |
| A09 Logging failures | Audit log on every admin mutation (GAP-M09 endpoint, fire-and-forget but monitored); consent decisions versioned and auditable; **no PII in logs** |
| A10 SSRF | Server-side fetches target only the configured API origin; no user-controlled URLs fetched server-side |

## 5. Payments & PCI Scope

Card data **never touches our infrastructure**:

1. The buyer enters card details inside Stripe's hosted Payment Element
   (`frame-src` allows exactly `js.stripe.com`).
2. Our servers handle only tokenized references (PaymentIntent lifecycle).
3. Webhooks are signature-verified before any processing; event ids
   deduplicate replays.
4. Internal payment endpoints (`urls_internal.py`) are additionally
   authenticated (`internal_auth.py`) and not routed publicly.

This keeps the platform at **SAQ-A** — the lowest self-assessment level —
with Stripe as the sole card-data processor.

## 6. Incident Response Plan

### Severity definitions

| Sev | Definition | Example | Response clock |
|---|---|---|---|
| 1 | Active data exposure / payment compromise | Bucket misconfiguration, webhook forgery | Immediate (< 1 h containment start) |
| 2 | Service-down or degraded with compliance impact | Retention job stalled, consent store corrupt | < 4 h |
| 3 | Isolated defect, no data impact | Failed image optimization variant | Next business day |

### Procedure

1. **Detect** — monitoring (§DEPLOYMENT-7), user report, or audit finding.
2. **Contain** — feature-flag off / route 503 at the edge; for suspected
   PII exposure set `GDPR_PROCESSING_HALTED=true` (kills optional
   processing instantly).
3. **Assess** — data categories affected, records count, cross-border
   exposure. Engage the compliance lead for anything touching personal data.
4. **Notify** — supervisory authority within **72 h** where GDPR Art. 33
   applies; affected users where Art. 34 requires. Template lives with the
   compliance records.
5. **Recover** — restore from verified backups (runbook), replay queues,
   verify audit trail continuity.
6. **Post-mortem** — blameless write-up within 5 working days; remediation
   items land as tracked issues; runbooks updated (existing playbooks:
   `docs/runbooks/ai-outage.md`, `stripe-webhook-failure.md`,
   `restore-from-backup.md`).

Roles: incident commander (on-call operator), compliance lead (GDPR
decisions), communications (user/authority notices). For the grant
period the team is small — the on-call operator holds all three hats, and
escalation to the organization director is mandatory at Sev 1.

---

**Cross-references:** [ARCHITECTURE.md](./ARCHITECTURE.md) ·
## 7. Change and Deployment Controls

**Segregation of duties is not achieved by configuration and is formally accepted as
a residual risk** — see [ADR-0020](ARCHITECTURE_DECISION_RECORDS.md). The repository
has one maintainer; GitHub does not permit self-approval, and `enforce_admins: true`
means requiring an approval would make `main` unmergeable rather than safer.

What is enforced instead, verified 2026-10-05 against the branch-protection API:

| Control | Enforcement |
|---|---|
| Automated gates | 11 required status checks: backend, secrets, gitleaks, trivy, codeql, dependency-audit, docker-scan, frontend-typecheck, frontend-lint, frontend-unit, frontend-openapi-drift |
| Merge discipline | squash only; force-push blocked; branch deletion blocked; `enforce_admins: true` |
| Docs-to-config truth | `scripts/check_doc_claims.py` fails the build when a document asserts a control that configuration does not implement |
| Release evidence | images published under immutable SHA / release tags; SBOM and SLSA provenance on the production build path |

**Not a control, and not to be cited as one:** `.github/CODEOWNERS` is a single
wildcard and `require_code_owner_reviews` is `false`; no `production` environment
exists, and `can_admins_bypass` defaults to `true`, so any environment approval here
would be self-grantable.

**Deployment-log caveat for auditors.** Environment deployment history for `staging`
before 2026-10-05 records about 58 `success` deployments that never occurred - they
were emitted by a *build* job that declared `environment: staging`. The labels are
removed and no new entries are created, but GitHub does not delete deployment
records, so that history remains and must not be relied on as deployment evidence.
Use the container registry tags and `git log` instead. See §8 G26.

[DEPLOYMENT.md](./DEPLOYMENT.md) · [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md)
