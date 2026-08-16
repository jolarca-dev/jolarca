# Contributing

## Development setup

```bash
git clone <repo> && cd jol-m-marketplace
cp .env.example .env            # fill in CHANGE_ME values
make bootstrap                  # venv + pinned dev dependencies
make sysdeps                    # one-time: GDAL libraries (PostGIS model support)
make dev-up                     # postgis, redis, minio, mailpit, stripe-mock, web, worker, beat, frontend
make migrate && make seed
```

Frontend separately (if not using compose):

```bash
cd frontend && npm ci && npm run dev
```

## Commit style — Conventional Commits (enforced; CHANGELOG is generated from these)

```
<type>(<scope>): <imperative summary>

type:   feat | fix | docs | style | refactor | perf | test | build | ci | chore | security
scope:  users | sellers | products | orders | payments | tax | shipping | ai | bitrix24
        compliance | core | frontend | infra | docs
```

Breaking changes: append `!` (`feat(payments)!: ...`) and describe migration in the body.
Security fixes MUST reference the internal incident ID, never the vulnerability detail.

## Branching & PR checklist

Branch from `main`; one concern per PR. Every PR template includes a **compliance
checklist** — it is not ceremonial. Reviewers: `CODEOWNERS` forces a second
approver on `payments_app`, `compliance_app`, `settings/`, and workflows.

## Quality gates (all enforced in CI)

1. `ruff check` clean (lint + format)
2. `mypy` clean (django plugin, strict for `services.py`)
3. Tests green, coverage ≥ 80% on changed lines
4. OpenAPI snapshot regenerated if API surface changed (`make api-schema`)
5. No secrets (`scripts/check_no_secrets.sh`, Gitleaks)
6. Playwright checkout journey passes (frontend e2e)

## Architecture rules (rejections are automatic)

- Only `payments_app` imports `stripe`. Only `shipping_app` imports carrier SDKs.
  Only `ai_service_app` imports LLM SDKs.
- Cross-app access is via the target app's `services.py` only.
- No AI/inference calls in request/response code — enqueue to the `ai` queue.
- Never hand-edit: `requirements/*.txt`, `docs/api/openapi.yaml`,
  `frontend/src/lib/api/generated/`, `CHANGELOG.md`, `LICENSE`.
- New PII fields: use `core.encryption.EncryptedTextField` and annotate the
  RoPA classification; update `docs/COMPLIANCE_MATRIX.md` in the same PR.

## Adding dependencies

Runtime deps go in `backend/pyproject.toml`, then `make lock` regenerates the
pinned, hash-checked requirement files. PRs that edit `requirements/*.txt`
directly are rejected by CI.
