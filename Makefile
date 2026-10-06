# jolarca — developer task runner
# All targets are non-interactive. CI runs the same checks, but invokes the gate scripts
# and tools directly rather than `make`, and check-toolchain has no CI counterpart (§8 G14).

SHELL := /bin/bash
COMPOSE_DEV := docker compose -f docker-compose.dev.yml
COMPOSE_TEST := docker compose -f docker-compose.test.yml
# ROOT is derived from this Makefile's own location, not from the invocation
# directory. $(CURDIR) changes under `make -C`, which would silently rebind
# $(PY) - and a decoy backend/.venv (ruff 0.16.3 / mypy 2.3.0 / django 5.2.17 against
# the pinned 0.16.6 / 2.3.1 / 6.1.1) existed until it was removed on 2026-10-05; it was
# invisible to `git status` because .gitignore matches .venv/ at any depth. scripts/check_toolchain.py
# enforces the invariant; `make bootstrap` rebuilds the one true venv.
# Activation is a separate concern and is tracked too (QODER.md §8 G37): type
# `source scripts/activate.sh`, run `make shell`, or let direnv load the repo's
# .envrc — which needs the one-time host hook plus `direnv allow` per checkout.
ROOT := $(patsubst %/,%,$(dir $(realpath $(firstword $(MAKEFILE_LIST)))))
PY := $(ROOT)/.venv/bin/python
PIP := $(ROOT)/.venv/bin/pip

# Host-side Django targets need .env (DATABASE_URL, DJANGO_SETTINGS_MODULE,
# POSTGRES_*); without it Django silently falls back to 127.0.0.1:5432 with no
# password and fails with "fe_sendauth: no password supplied". Make must NOT
# `include` the file: a secret containing $ or # would be interpolated or
# truncated by Make itself. Source it in the recipe shell instead, so the shell
# parses the values. No-op when .env is absent — CI injects env directly, so
# target behaviour is unchanged there (parity by design).
LOAD_ENV := set -a; if [ -f .env ]; then . ./.env; fi; set +a;

.PHONY: help shell bootstrap sysdeps dev-up dev-down logs migrate makemigrations seed \
        test test-contract test-integration lint lint-py lint-fe typecheck check lock \
        api-schema check-secrets check-toolchain check-deps-groups check-docs check-advisories verify wait

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  %-18s %s\n", $$1, $$2}'

# Gate targets below are immune to PATH drift because $(PY) and $(PIP) are absolute
# paths under $(ROOT). An *interactive* shell has no such guarantee: before §8 G37
# nothing in the repository activated .venv at all, so hand-typed `ruff` resolved to
# ~/.local/bin/ruff (0.16.5) while CI ran the pinned 0.16.6 — a local "pass" measured
# against tools CI does not run, with every green gate agreeing with it.
shell: ## Interactive shell with the pinned .venv active (source scripts/activate.sh)
	@. ./scripts/activate.sh && exec bash -i

bootstrap: ## Create venv, install tooling + dev deps
	python3 -m venv .venv
	$(PIP) install --upgrade pip pip-tools
	$(PIP) install -r backend/requirements/dev.txt
	@echo "Now: source scripts/activate.sh  (or: make shell)  ·  cp .env.example .env && make dev-up"

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
# Fails when the interpreter running the gates is not the one the lock pins, or a
# stray .venv exists (gitignored at any depth, so invisible to git status). G14.
check-toolchain: ## Assert interpreter == lock pins and no stray venv
	$(PY) scripts/check_toolchain.py

check-docs: ## Fail when docs assert a control that does not exist
	$(PY) scripts/check_doc_claims.py --self-test
	$(PY) scripts/check_doc_claims.py

# §8 G35: the production gates name advisories, but nothing linked a named advisory to an
# incident record, so docs/INCIDENT_RESPONSE.md §6.2 existed only because an operator wrote in
# it by hand -- measured 2026-10-06, when a HIGH arrived with no Dependabot alert and the ID
# was minted manually. This fails when a change removes a production-scoped advisory without
# a §6.2 row naming the package and cited in the change set, and when an ID is cited anywhere
# in the governance docs without a row. Same self-test discipline as the two above: exit 2 is
# "cannot verify", never a pass.
check-advisories: ## Fail when an advisory is silenced without an incident record (also runs in CI)
	$(PY) scripts/check_advisory_register.py --self-test
	$(PY) scripts/check_advisory_register.py

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
	  for t in check-toolchain lint-py check-secrets check-docs check-deps-groups check-advisories test; do \
	    printf '%-18s ' "$$t"; \
	    if $(MAKE) --no-print-directory $$t >/dev/null 2>&1; then echo PASS; else echo FAIL; fi; \
	  done; \
	} > "$$out" 2>&1; echo "report: $$out"; \
	grep -q FAIL "$$out" && { echo VERIFY_FAILED; exit 1; }; echo "VERIFY OK"

wait: ## Block until local services are reachable
	bash scripts/wait_for_services.sh
