# Security Posture

**Scope:** Threat model, implemented mitigations, compliance mapping,
incident response, and assurance roadmap. Operational controls:
[SECURITY.md](SECURITY.md) · control-to-article matrix:
[COMPLIANCE_MATRIX.md](COMPLIANCE_MATRIX.md) · privacy detail:
[GDPR_COMPLIANCE.md](GDPR_COMPLIANCE.md).

## 1. Threat Model (STRIDE)

| # | Category | Asset / Scenario | Likelihood | Impact | Primary mitigation |
| --- | --- | --- | --- | --- | --- |
| T1 | **Spoofing** | Forged buyer/seller sessions via stolen or squatted cookies | Medium | High | `__Host-`-prefixed session cookies (Secure, HttpOnly, Path=/, no Domain), SameSite=Strict, backend-side validation on every request |
| T2 | **Spoofing** | CSRF on mutating endpoints | Medium | High | Django CSRF double-submit (`X-CSRFToken` from JS-readable cookie), SameSite=Strict as defense-in-depth |
| T3 | **Tampering** | XSS → DOM tampering / session theft | Medium | Critical | Per-request CSP nonces (no `unsafe-inline`/`unsafe-eval`), output encoding by React, nosniff, nginx header floor |
| T4 | **Tampering** | Forged payment webhooks | Low | Critical | Stripe signature verification, idempotent state machine, `payments_app` as sole Stripe importer |
| T5 | **Repudiation** | Disputed orders / admin actions | Medium | Medium | Audit log tables in compliance_app, structured backend logging, x-request-id correlation end-to-end |
| T6 | **Information disclosure** | PII leakage via logs/errors/analytics | Medium | Critical | PII scrubber (`src/lib/sanitization.ts`), logger redaction pipeline, no console in production (ESLint error), no PII in URLs/spans |
| T7 | **Information disclosure** | Secrets baked into images/repo | Low | Critical | `.dockerignore` excludes env files, `check_no_secrets.sh` + Gitleaks CI gate, runtime-only secrets via `.env.prod` |
| T8 | **Denial of service** | Request floods on API/auth | High | Medium | nginx `limit_req` (10r/s burst 20 API, 20r/s burst 40 general), 10MB body cap, timeouts |
| T9 | **Denial of service** | Search/catalog abuse | Medium | Low | Rate limiting + ES on internal network, degrade-safe contract-gap states |
| T10 | **Elevation of privilege** | Buyer accessing seller/admin surfaces | Medium | Critical | Role checks in Django permissions + middleware auth gate + edge-restricted admin (ADR-0006) |
| T11 | **Elevation of privilege** | Dependency supply chain | Medium | High | Lockfile-only installs (`npm ci --ignore-scripts`, pip-tools hashes), Dependabot, security workflow |

## 2. Implemented Mitigations (evidence in repository)

**Transport & edge.** TLS 1.2/1.3 termination at nginx with HSTS
(2y, includeSubDomains, preload), HTTP→HTTPS redirect, HTTP/2,
`server_tokens off`, rate limiting, JSON access logs (no PII beyond IP).

**Content security.** Middleware generates a cryptographic nonce per
request; CSP contains no `unsafe-inline`/`unsafe-eval`; Stripe and
OpenStreetMap are the only frame/script third parties, both user-initiated
flows. Static assets carry a strict nonce-less fallback CSP. Unit + e2e
suites lock the policy (`tests/security/csp.test.ts`,
`e2e/security-headers.spec.ts`).

**Session & cookies.** `__Host-jol_session` / `__Host-jol_csrf`
(production), Secure + HttpOnly (session) + Path=/, SameSite=Strict,
Max-Age aligned to the 14-day TTL. **Zero tokens in localStorage** — the
cart and consent stores carry identifiers and preferences only (ADR-0015).

**Logging & observability.** Production has no console output (ESLint
`no-console: error`); the structured logger redacts emails/phones/Luhn-valid
card fragments/PII keys, hashes user IDs (SHA-256 prefix), never logs query
strings, buffers failed batches (max 100, drop oldest), and adopts the
backend `x-request-id`. The deep scrubber additionally covers LT/LV personal
codes and UUID-like tokens. OTEL spans carry a three-attribute whitelist;
no baggage API exists.

**Dependency auditing.** Dependabot (weekly), `security.yml` workflow,
lockfile-hash installs, documented risk acceptance where advisories are not
actionable (ADR-0010).

## 3. Compliance Mapping

| Requirement | Control | Evidence |
| --- | --- | --- |
| **ISO 27001 A.8** (technological controls) | CSP nonces, hardened cookies, rate limiting, secret scanning, least-privilege networks | `security.yml`, middleware, nginx.prod.conf, this document |
| **SOC 2 CC6** (logical access) | Role-based access, session hardening, audit logging, edge isolation (internal networks) | permissions modules, middleware auth gate, compose topology |
| **GDPR Art. 25** (data protection by design) | Consent-gated analytics, data minimization in logs, field-level encryption, privacy defaults | consent store, logger, ADR-0004 |
| **GDPR Art. 32** (security of processing) | Encryption at rest/in transit, access controls, backup + restore verification, incident process | production settings, backup.sh, §4 below |
| **PCI DSS SAQ-A** | Card data confined to Stripe iframe; platform never stores/transmits PAN | ADR-0013, checkout flow |

## 4. Incident Response

1. **Detection** — monitoring.sh health/threshold alerts (webhook + email),
   Stripe webhook failure runbook, log correlation via x-request-id, GDPR
   kill switch (`GDPR_PROCESSING_HALTED`) for suspected breach containment.
2. **Containment** — flip the processing halt switch; revoke sessions by
   rotating `DJANGO_SECRET_KEY`; edge-block offending IPs; disable the
   affected service via compose.
3. **Eradication** — patch/rollback (`scripts/deploy.sh --rollback`), rotate
   credentials/keys (Fernet MultiFernet rotation supported), re-run secret
   scan.
4. **Recovery** — restore from verified backups (7/4/12 rotation; monthly
   restore drills), replay webhooks from Stripe dashboard, verify via smoke
   tests, then lift the halt switch.
5. **Lessons learned** — post-incident review within 5 working days; update
   runbooks (`docs/runbooks/`), threat model row, and test suites; if
   personal data is affected, execute the Art. 33/34 notification path
   (72h authority notification template in GDPR_COMPLIANCE.md).

## 5. Assurance Roadmap

| Activity | Cadence | Owner |
| --- | --- | --- |
| Third-party penetration test (app + API) | Annual, and after major releases | External firm; budget in GRANT_APPLICATION.md §Budget |
| Automated DAST against staging | Per release (post-MVP, Phase 2) | Engineering |
| Dependency audit (Dependabot + `npm audit` / pip-audit) | Weekly / per CI | Automated |
| Restore drill (backup integrity) | Monthly (`VERIFY_RESTORE=1`) | Ops |
| Access review (roles, admin allowlist) | Quarterly | Compliance |

---

*Header policy and CSP internals: `frontend/src/lib/security.ts` ·
cookie policy: `backend/project/settings/production.py` ·
deployment controls: [DEPLOYMENT.md](DEPLOYMENT.md).*
