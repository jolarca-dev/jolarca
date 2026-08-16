# Compliance matrix

Control → implementation → framework reference. Updated in the SAME PR as the
code that changes it (PR template enforces).

| Control | Implementation (file/module) | GDPR | ISO 27001 | SOC 2 | PCI |
|---|---|---|---|---|---|
| Consent ledger (Art. 7) | `users_app.models.ConsentRecord` (append-only) | Art. 7 | A.5.34 | P4.2 | — |
| Fail-closed processing halt | `project.middleware.gdpr_middleware` + `GDPR_PROCESSING_HALTED` | Art. 32 | A.8.14 | CC7.1 | — |
| PII encryption at rest | `apps.core.encryption.EncryptedTextField` (Fernet, rotation) | Art. 32 | A.8.24 | CC6.1 | Req. 3 analogue |
| Audit trail (append-only) | `compliance_app.models.AuditLog`; `jol.audit` structured logs | Art. 5(2) | A.8.15 | CC7.2 | Req. 10 |
| Erasure (Art. 17) fan-out + SLA | `compliance_app.services` + `tasks` (compliance queue) | Art. 17 | A.5.33 | P4.3 | — |
| Portability (Art. 20) | `compliance_app.models.DataExport` (job skeleton) | Art. 20 | — | P5.2 | — |
| Retention / anonymization | `compliance_app.retention` + beat sweep | Art. 5(1)(e) | A.5.33 | CC1.4 | Req. 3.2 |
| Brute-force lockout | `django-axes` config in `settings.base` | Art. 32 | A.8.5 | CC6.1 | Req. 8 analogue |
| Rate limiting | DRF throttles (`anon 60/min`, `user 300/min`) | Art. 32 | A.8.16 | CC6.6 | — |
| Secret hygiene | `.env.example` only; `scripts/check_no_secrets.sh`; Gitleaks in CI | Art. 32 | A.8.24 | CC6.1 | Req. 8 |
| Webhook authenticity | Stripe signature verification (`payments_app.webhooks`); carrier HMAC (`shipping_app.webhooks`) | — | A.8.28 | CC6.6 | Req. 6 analogue |
| Idempotent money paths | `core.idempotency` + checkout + webhook dedupe | — | A.8.32 | CC8.1 | Req. 6 |
| Order immutability (evidence) | `orders_app.OrderItem` snapshots; invoices immutable | — | A.5.33 | CC7.2 | — |
| No card data on premises | Stripe Elements/PaymentIntents only; `payments_app` stores ids/amounts | Art. 32 | A.8.12 | CC6.x | SAQ-A scope |
| AI PII guardrail + outbound audit | `ai_service_app.guardrails` + `AIRequestLog` | Art. 22/32 | A.8.28 | CC6.6 | — |
| Supply chain | pinned+hashed requirements, Dependabot, Trivy, SBOM+provenance on prod images | — | A.5.19 | CC9.2 | Req. 6.3 |
| Access review surface | CODEOWNERS + environment approval gates on deploys | — | A.5.15 | CC6.2 | Req. 7 |
| Logging isolation | `compliance` Celery queue; `GDPR_PROCESSING_HALTED` exempt probes | Art. 32 | A.8.15 | CC7.2 | — |

**Gaps (tracked in MVP_REMAINING_WORK):** DPIA template, subprocessor register
publication, RoPA export automation, backup restore test evidence.
