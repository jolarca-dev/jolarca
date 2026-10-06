# Technical decisions (ADRs) — pointer

**The ADR registry lives in
[ARCHITECTURE_DECISION_RECORDS.md](ARCHITECTURE_DECISION_RECORDS.md).** The first seven
records were moved there on 2026-10-05 so that one file holds every record and the doc
gate's `registry_max()` reads the same file humans do. This page keeps only the summary
table; the Record column says whether a full decision text exists at all.

| ID | Decision | Record |
| --- | --- | --- |
| ADR-0001 | Monorepo with domain-bounded Django apps | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0001--monorepo-with-domain-bounded-django-apps) |
| ADR-0002 | AGPL-3.0 licensing | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0002--agpl-30-licensing) |
| ADR-0003 | Dual i18n: DB content vs UI strings | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0003--dual-i18n-db-content-vs-ui-strings) |
| ADR-0004 | Field-level encryption (Fernet → pgcrypto path) | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0004--field-level-encryption-with-fernet-pgcrypto-migration-path) |
| ADR-0005 | Object storage: MinIO dev / S3-compatible prod | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0005--object-storage-minio-in-dev-s3-compatible-in-prod) |
| ADR-0006 | Django admin retained, edge-restricted | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0006--django-admin-retained-edge-restricted) |
| ADR-0007 | Sanctioned stubs over silent fakes | [full text](ARCHITECTURE_DECISION_RECORDS.md#adr-0007--sanctioned-stubs-over-silent-fakes) |
| ADR-0008 | Frontend scope: storefront, seller dashboard, moderation backoffice | **no record** — see the registry |
| ADR-0009 | Frontend compliance & UX posture (sacred-modern) | **no record** — substance in `docs/DESIGN_SYSTEM.md` |
| ADR-0010 | Risk acceptance: js-yaml advisory in codegen toolchain | **no record** — acceptance row in `docs/SECURITY.md` §3 |

Anchors are derived from headings, so a re-worded heading silently breaks every link
above; `make check-docs` verifies the paths but not the anchors.
