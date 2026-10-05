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

## Commit style — Conventional Commits (convention; not machine-enforced)

```
<type>(<scope>): <imperative summary>

type:   feat | fix | docs | style | refactor | perf | test | build | ci | chore | security
scope:  users | sellers | products | orders | payments | tax | shipping | ai | bitrix24
        compliance | core | frontend | infra | docs
```

Breaking changes: append `!` (`feat(payments)!: ...`) and describe migration in the body.
Security fixes MUST reference the internal incident ID, never the vulnerability detail.

**Nothing machine-checks this format.** `.pre-commit-config.yaml` installs no
`commit-msg` hook and no commitlint runs in any workflow, so the convention is
*review-gated*. `CHANGELOG.md` is likewise **not generated** from these commits:
no generator is wired to any make target or workflow. It is hand-maintained.

## Branching & PR checklist

Branch from `main`; one concern per PR. Every PR template includes a **compliance
checklist** — it is not ceremonial.

**Review is self-review.** `.github/CODEOWNERS` is a single wildcard
(`* @JourneyOfLife`): there are no per-path owners for `payments_app`,
`compliance_app`, `settings/` or workflows. Branch protection sets
`require_code_owner_reviews: false` and `required_approving_review_count: 0`, so
CODEOWNERS is inert and no second approver is required — or possible, with one
operator and `enforce_admins: true`. The PR checklist is therefore the *only*
human review layer: complete it from the diff, not from memory. Tracked as
`QODER.md` §8 G2.

## Quality gates

**Required contexts** — a failure blocks the merge (11 as of 2026-10-05):
`backend`, `secrets`, `frontend-typecheck`, `frontend-lint`, `frontend-unit`,
`frontend-openapi-drift`, `gitleaks`, `trivy`, `codeql`, `dependency-audit`,
`docker-scan`.

**Runs but does not block:** `frontend-build` — the only job that boots the
standalone bundle. It also declares `needs: [frontend-typecheck, frontend-lint,
frontend-unit]`, so a lint failure skips it entirely (§8 G21).

**Disabled (`if: false`):** `frontend-lighthouse`, `frontend-playwright-smoke`
(§8 G4/G5).

1. `ruff check` clean **and** `ruff format --check` clean — lint and formatting are
   separate tools (`make lint` runs both, plus the frontend ESLint and Prettier
   checks)
2. `mypy` clean (django plugin, strict for `services.py`)
3. Tests green — CI runs `tests/unit`, `tests/security` and `tests/contract`
   (`make test`, `make test-contract`; the contract suite needs the dev database,
   so it is not part of `make test`). The coverage gate today is
   `--cov-fail-under=20`; 80% is the target, not the current gate.
4. OpenAPI snapshot regenerated if API surface changed (`make api-schema`)
5. No secrets — `make check-secrets` scans what **git carries** (`git ls-files`),
   the same set CI sees, alongside Gitleaks (which scans history).
6. Playwright checkout journey — **not currently a gate**; the job is `if: false`
   (§8 G4). Do not cite it as coverage for a frontend change.
7. Documentation claims — `make check-docs` fails when a contributor-facing doc
   asserts a control that configuration does not implement (badge org vs `origin`,
   cited paths that do not exist, claims proven false, volatile ADR counts, gap-
   register integrity, cited `make` targets). Runs in the CI backend job, preceded
   by `--self-test`. This gate exists because every code invariant here is
   machine-checked while the *claims about* those controls were checked by nothing,
   so docs drifted and each drift became a new §8 entry.
8. Toolchain parity — `make check-toolchain` fails if the interpreter running the gates does not
   match the `backend/requirements/dev.txt` pins, or if a stray `.venv` exists anywhere in the
   tree (gitignored at every depth, so invisible to `git status`). Local-only by design: CI
   installs from the lock. `make verify` runs it first.

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
- Never hand-edit: `backend/requirements/*.txt`, `docs/api/openapi.yaml`,
  `frontend/src/generated/api.ts`, `LICENSE`. Regenerate instead — `make lock`
  for the pins, `make api-schema` for the snapshot and client. (`CHANGELOG.md`
  was listed here in error: nothing generates it, so it is hand-maintained. The
  previously cited path `frontend/src/lib/api/generated/` does not exist.)
- New PII fields: use `core.encryption.EncryptedTextField` and annotate the
  RoPA classification; update `docs/COMPLIANCE_MATRIX.md` in the same PR.

## Adding dependencies

Runtime deps go in `backend/pyproject.toml`, then `make lock` regenerates the
pinned, hash-checked requirement files. **No CI job rejects a hand-edited
`requirements/*.txt`** — that rule is review-gated only. Check it yourself: a
lockfile edit not accompanied by a matching `pyproject.toml` edit is a defect,
and it undermines the `--require-hashes` install CI depends on.
