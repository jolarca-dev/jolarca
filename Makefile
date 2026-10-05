# jolarca — developer task runner
# All targets are non-interactive; CI uses the same targets (parity by design).

SHELL := /bin/bash
COMPOSE_DEV := docker compose -f docker-compose.dev.yml
COMPOSE_TEST := docker compose -f docker-compose.test.yml
PY := $(CURDIR)/.venv/bin/python
PIP := $(CURDIR)/.venv/bin/pip

# Host-side Django targets need .env (DATABASE_URL, DJANGO_SETTINGS_MODULE,
# POSTGRES_*); without it Django silently falls back to 127.0.0.1:5432 with no
# password and fails with "fe_sendauth: no password supplied". Make must NOT
# `include` the file: a secret containing $ or # would be interpolated or
# truncated by Make itself. Source it in the recipe shell instead, so the shell
# parses the values. No-op when .env is absent — CI injects env directly, so
# target behaviour is unchanged there (parity by design).
LOAD_ENV := set -a; if [ -f .env ]; then . ./.env; fi; set +a;

.PHONY: help bootstrap sysdeps dev-up dev-down logs migrate makemigrations seed \
        test test-contract test-integration lint lint-py lint-fe typecheck check lock \
        api-schema check-secrets check-deps-groups check-docs verify wait

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  %-18s %s\n", $$1, $$2}'

bootstrap: ## Create venv, install tooling + dev deps
	python3 -m venv .venv
	$(PIP) install --upgrade pip pip-tools
	$(PIP) install -r backend/requirements/dev.txt
	@echo "Now: cp .env.example .env && make dev-up"

sysdeps: ## OS packages needed on the HOST (GDAL for PostGIS models). Needs sudo.
	sudo apt-get update && sudo apt-get install -y --no-install-recommends gdal-bin libgdal-dev

dev-up: ## Start full local stack (postgis, redis, minio, mailpit, stripe-mock, web, worker, beat, frontend)
	$(COMPOSE_DEV) up --build -d
	bash scripts/wait_for_services.sh

dev-down: ## Stop local stack (volumes preserved)
	$(COMPOSE_DEV) down

logs: ## Tail backend logs
	$(COMPOSE_DEV) logs -f backend worker

migrate: ## Apply migrations (uses DATABASE_URL)
	$(LOAD_ENV) cd backend && $(PY) manage.py migrate

makemigrations: ## Generate migrations
	$(LOAD_ENV) cd backend && $(PY) manage.py makemigrations

seed: ## Seed LT/LV/EE demo data (idempotent)
	$(LOAD_ENV) cd backend && $(PY) ../scripts/seed_data.py

test: ## Unit + security tests (fast, no DB services required)
	cd backend && $(PY) -m pytest tests/unit tests/security -q

# Contract tests need a real database, so they are NOT part of `make test` — but
# CI now runs them (ci.yml), which is why this target exists: without it `make
# test` would stay green while the build failed. LOAD_ENV supplies the DB creds
# from .env, and DJANGO_SETTINGS_MODULE is forced back to `test` because .env
# pins project.settings.dev, which would pull in the Redis cache.
test-contract: ## Contract tests (API/DB + PCI/PII boundary) — needs `make dev-up`
	$(LOAD_ENV) cd backend && DJANGO_SETTINGS_MODULE=project.settings.test $(PY) -m pytest tests/contract -q

test-integration: ## Integration tests against the CI-parity compose topology
	$(COMPOSE_TEST) up -d --build
	bash scripts/wait_for_services.sh test
	$(COMPOSE_TEST) run --rm backend-test
	$(COMPOSE_TEST) down

# The old single `lint` target ended in `|| true` on a left-associative
# `A && B || true` chain, so it exited 0 even when ruff reported errors — a gate
# that can never fail is worse than none, because it manufactures confidence
# before push. Both halves now propagate their exit status, and each runs exactly
# the command CI runs (backend: ruff check + ruff format --check; frontend: npm run
# lint + npm run format:check).
lint-py: ## ruff lint + format check (backend)
	cd backend && $(PY) -m ruff check . && $(PY) -m ruff format --check .
	$(PY) -m ruff check scripts/ && $(PY) -m ruff format --check scripts/

lint-fe: ## ESLint + Prettier check (frontend)
	cd frontend && npm run lint && npm run format:check

lint: lint-py lint-fe ## All lint and format checks (Python + frontend)

typecheck: ## mypy with django plugin
	cd backend && $(PY) -m mypy project apps

check: ## Django system checks (settings, apps, migrations consistency)
	$(LOAD_ENV) cd backend && $(PY) manage.py check

lock: ## Recompile pinned requirements from pyproject (pip-tools, hashes)
	cd backend && $(PY) -m piptools compile --generate-hashes --allow-unsafe --output-file=requirements/base.txt pyproject.toml
	cd backend && $(PY) -m piptools compile --generate-hashes --allow-unsafe --extra=dev --output-file=requirements/dev.txt pyproject.toml
	cd backend && $(PY) -m piptools compile --generate-hashes --allow-unsafe --extra=prod --output-file=requirements/prod.txt pyproject.toml

api-schema: ## Regenerate OpenAPI snapshot + frontend client (never hand-edit)
	$(LOAD_ENV) cd backend && $(PY) manage.py spectacular --file ../docs/api/openapi.yaml --validate
	cd frontend && npm run generate:api

# check_no_secrets.sh audits the **tracked** set (`git ls-files`), which is the
# same set CI sees, so local and CI now answer the identical question — "does git
# carry a credential?". It previously grepped the whole working tree and therefore
# failed on the operator's own gitignored .env.prod, meaning it could never pass
# on a real checkout and trained the operator to ignore it (§8 G15).
check-secrets: ## Scan what git carries for staged secrets
	bash scripts/check_no_secrets.sh
	bash scripts/check_secrets_dir.sh

# Dependabot group semantics are invisible to every other tool here: no job parsed
# .github/dependabot.yml, so a mis-shaped `groups:` set was accepted silently and
# only surfaced days later as a missing or unmergeable PR (QODER.md §8 G20).
# --self-test runs first on purpose: it injects six violations plus one control
# case and requires each to behave, so a neutered checker cannot keep this target
# green — the always-green failure mode recorded as gap G3. (The comment here used
# to claim "three violations" and "no CI job does this"; both were stale, and the
# backend job does invoke it — which is exactly what check_doc_claims.py now
# guards against, so a drifting comment fails the build instead of rotting.)
check-deps-groups: ## Validate dependabot group topology (also runs in CI)
	$(PY) scripts/check_dependabot_groups.py --self-test
	$(PY) scripts/check_dependabot_groups.py

# The structural fix for the 2026-10-05 audit: every code invariant in this repo is
# machine-checked, but the *claims about* those controls were checked by nothing, so
# docs drifted freely and each drift became a new §8 register entry. This gate fails
# when a document asserts a control that configuration does not implement, so the
# next false claim breaks a build rather than being rediscovered by hand weeks later.
# It self-tests first for the same reason as check-deps-groups.
check-docs: ## Fail when docs assert a control that does not exist
	$(PY) scripts/check_doc_claims.py --self-test
	$(PY) scripts/check_doc_claims.py

# One reproducible evidence artifact for every gate this repo claims. Exists because
# agent sessions verified gates by reading terminal output, while /tmp and the shell on
# this host are shared with concurrent sessions on sibling repos - a contaminated
# channel returns plausible WRONG evidence, not an error. Re-running this is the audit.
verify: ## Run every fast gate and write a dated evidence report to .state/
	@out=.state/verify-$$(date +%Y%m%dT%H%M%S)-$$$$.txt; \
	{ echo "generated: $$(date -Is)"; \
	  echo "branch:    $$(git rev-parse --abbrev-ref HEAD) @ $$(git rev-parse --short HEAD)"; \
	  echo "remote:    $$(git remote get-url origin)"; \
	  echo "dirty:     $$(git status --porcelain | wc -l) path(s)"; echo; \
	  for t in lint-py check-secrets check-docs check-deps-groups test; do \
	    printf '%-18s ' "$$t"; \
	    if $(MAKE) --no-print-directory $$t >/dev/null 2>&1; then echo PASS; else echo FAIL; fi; \
	  done; \
	} > "$$out" 2>&1; echo "report: $$out"; \
	grep -q FAIL "$$out" && { echo VERIFY_FAILED; exit 1; }; echo "VERIFY OK"

wait: ## Block until local services are reachable
	bash scripts/wait_for_services.sh
