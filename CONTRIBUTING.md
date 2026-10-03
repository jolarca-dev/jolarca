# Contributing

## Development setup

```bash
git clone <repo> && cd jolarca
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
3. Tests green — CI runs `tests/unit`, `tests/security` and `tests/contract`
   (`make test`, `make test-contract`; the contract suite needs the dev database,
   so it is not part of `make test`). The coverage gate today is
   `--cov-fail-under=20`; 80% is the target, not the current gate.
4. OpenAPI snapshot regenerated if API surface changed (`make api-schema`)
5. No secrets (`scripts/check_no_secrets.sh`, Gitleaks)
6. Playwright checkout journey passes (frontend e2e)

## Architecture rules

Enforced by `backend/tests/unit/test_architecture_boundaries.py` (runs in
`make test` and CI) unless marked *review-gated*.

- Only `payments_app` imports `stripe` — the backend's sole vendor SDK
  (`backend/pyproject.toml:27`). Only `tax_app` imports `zeep` (VIES SOAP).
- There is **no** carrier SDK and **no** LLM SDK. Carriers sit behind the
  `Carrier` protocol with clients confined to `shipping_app/carriers/`; LLM
  providers sit behind `LLMProvider` with clients confined to
  `ai_service_app/providers/`, transport over plain `requests`. See
  `docs/architecture/01-modular-breakdown.md` → *Vendor boundaries*.
- `core` imports no domain app; `bitrix24_integration_app` is not imported by
  marketplace apps; `ai_service_app` is reachable only via its `tasks.py`.
- No AI/inference calls in request/response code — enqueue to the `ai` queue.
- Cross-app access is via the target app's `services.py` only. *Review-gated:*
  16 pre-existing direct model imports are baselined in the fitness test as a
  shrink-only ratchet — route new calls through `services.py`, don't extend the
  baseline.
- Never hand-edit: `requirements/*.txt`, `docs/api/openapi.yaml`,
  `frontend/src/lib/api/generated/`, `CHANGELOG.md`, `LICENSE`.
- New PII fields: use `core.encryption.EncryptedTextField` and annotate the
  RoPA classification; update `docs/COMPLIANCE_MATRIX.md` in the same PR.

## Adding dependencies

Runtime deps go in `backend/pyproject.toml`, then `make lock` regenerates the
pinned, hash-checked requirement files. PRs that edit `requirements/*.txt`
directly are rejected by CI.
