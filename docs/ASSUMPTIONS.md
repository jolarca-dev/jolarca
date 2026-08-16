# Assumptions register

Every ambiguity encountered during scaffolding and its chosen resolution.
If a resolution changes, update this file in the same PR.

| ID | Ambiguity | Resolution |
|----|-----------|------------|
| A-01 | Which VAT scheme applies to non-VAT sellers? | OSS rules applied at checkout by `tax_app`; seller VAT status from `sellers_app.SellerProfile.vat_number`. |
| A-02 | Where does tax computation live? | Domain data/rules in `tax_app`; Stripe Tax API call inside `payments_app` (single Stripe boundary). |
| A-03 | Idempotency scope | Header `Idempotency-Key` on checkout; Stripe event id on webhooks; `core.IdempotencyRecord` is the store. |
| A-04 | Field encryption vs queryability | Fernet `EncryptedTextField` now (not queryable); pgcrypto PGP path documented for searchable columns. |
| A-05 | Search phase 1 | PostgreSQL icontains → SearchVector+GIN; pgvector/OpenSearch are phase 2 behind the same protocol. |
| A-06 | Locale `ru` | Excluded from MVP; adding it requires an ADR (translation QA + market policy). |
| A-07 | Deployment target runtime | UNDECIDED — GKE Autopilot is the candidate. Deploy workflows build/push attested images and fail loudly at the rollout step until ratified. |
| A-08 | OpenTelemetry | Endpoint-driven opt-in; `opentelemetry-sdk` is a planned dependency, imports are guarded until then. |
| A-09 | Admin surface | Django admin kept for ops; production must restrict at the edge (IP allowlist / SSO) — ADR-0006. |
| A-10 | Erasure vs financial retention | Anonymize-don't-delete: personal identifiers removed, financial facts retained `RETENTION_FINANCIAL_YEARS` (7). |
