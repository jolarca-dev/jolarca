# jolarca — developer task runner
# All targets are non-interactive; CI uses the same targets (parity by design).

SHELL := /bin/bash
COMPOSE_DEV := docker compose -f docker-compose.dev.yml
COMPOSE_TEST := docker compose -f docker-compose.test.yml
PY := $(CURDIR)/.venv/bin/python
PIP := $(CURDIR)/.venv/bin/pip

.PHONY: help bootstrap sysdeps dev-up dev-down logs migrate makemigrations seed \
        test test-integration lint typecheck check lock api-schema check-secrets wait

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
	cd backend && $(PY) manage.py migrate

makemigrations: ## Generate migrations
	cd backend && $(PY) manage.py makemigrations

seed: ## Seed LT/LV/EE demo data (idempotent)
	cd backend && $(PY) ../scripts/seed_data.py

test: ## Unit + security tests (fast, no DB services required)
	cd backend && $(PY) -m pytest tests/unit tests/security -q

test-integration: ## Integration tests against the CI-parity compose topology
	$(COMPOSE_TEST) up -d --build
	bash scripts/wait_for_services.sh test
	$(COMPOSE_TEST) run --rm backend-test
	$(COMPOSE_TEST) down

lint: ## ruff (format check + lint)
	cd backend && $(PY) -m ruff check . && cd ../frontend && npx prettier --check . 2>/dev/null || true

typecheck: ## mypy with django plugin
	cd backend && $(PY) -m mypy project apps

check: ## Django system checks (settings, apps, migrations consistency)
	cd backend && $(PY) manage.py check

lock: ## Recompile pinned requirements from pyproject (pip-tools, hashes)
	cd backend && $(PY) -m piptools compile --generate-hashes --output-file=requirements/base.txt pyproject.toml
	cd backend && $(PY) -m piptools compile --generate-hashes --extra=dev --output-file=requirements/dev.txt pyproject.toml
	cd backend && $(PY) -m piptools compile --generate-hashes --extra=prod --output-file=requirements/prod.txt pyproject.toml

api-schema: ## Regenerate OpenAPI snapshot + frontend client (never hand-edit)
	cd backend && $(PY) manage.py spectacular --file ../docs/api/openapi.yaml --validate
	cd frontend && npm run generate:api

check-secrets: ## Scan for accidentally staged secrets
	bash scripts/check_no_secrets.sh

wait: ## Block until local services are reachable
	bash scripts/wait_for_services.sh
