# Technical decisions (ADRs)

Format: context → decision → consequences. Status: accepted unless noted.

## ADR-0001 — Monorepo with domain-bounded Django apps
**Context:** Marketplace spans 11 domains with strict compliance boundaries.
**Decision:** Single repo; per-domain apps; cross-app access via `services.py` only;
`payments_app` is the only Stripe importer; AI runs only in Celery `ai` queue.
**Consequences:** Enforced in review + CODEOWNERS; import-linter contracts to follow.

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
