# QODER.md

Behavioral guidelines for AI-assisted development in the jolarca marketplace.
They exist to reduce common LLM coding failures and to keep changes inside the
project's compliance and architecture boundaries.

**Evidence policy.** Every rule below cites the file that establishes it. If a
rule has no citation, treat it as an opinion, not a control. Where the project
*intends* a control but does not implement it, it is labelled **GAP** and listed
in §8 — never assume a GAP is enforced.

**Last verified against:** `main` @ 2026-10-03 — `Makefile`, `.pre-commit-config.yaml`,
`.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`,
`.github/workflows/security.yml`, `CONTRIBUTING.md`, `README.md`,
`docs/architecture/01-modular-breakdown.md`, `backend/pyproject.toml`,
`backend/tests/unit/test_architecture_boundaries.py`, `frontend/package.json`,
`frontend/vitest.config.mts`, `docker-compose.test.yml`.
Line numbers drift. `Makefile`, `ci.yml` and `CONTRIBUTING.md` change most often,
so they are cited **by target name, CI step/job name, or section name** rather
than by line. Everything else uses line numbers — re-verify one before relying on
it after the referenced file changes.

**Tradeoff.** These guidelines bias toward caution over speed. For a trivial
change (typo, doc fix), use judgment and skip the ceremony.

## Enforcement tiers

| Tier | Meaning | If violated |
|---|---|---|
| **ENFORCED** | A CI job, pre-commit hook, or test fails the build | You will find out automatically |
| **REVIEW-GATED** | Only a human reviewer or the PR checklist catches it | You must self-check before proposing |
| **GAP** | Documented intent, not implemented | Nothing catches it. See §8 |

Check the tier before assuming a rule will be caught for you.

---

# Part I — Agent behavior

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask — do not guess.
- If multiple interpretations exist, present them. Never pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name precisely what is unclear. Ask.
- Name which app(s) under `backend/apps/` the change touches. If it crosses an
  app boundary, confirm the integration goes through the target app's
  `services.py` (`docs/architecture/01-modular-breakdown.md:5-18`).
- State whether the change touches personal data. If yes, Part III applies in
  full.

**Compliance-specific duty:** if asked to implement something that would weaken
a control (skip encryption at rest, log PII, bypass a webhook signature check,
widen a data export, silence a scanner), say so plainly and refuse the silent
path. Do not implement it and leave the reviewer to notice.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios.
- If you wrote 200 lines and 50 would do, rewrite it.
- Prefer the existing primitive over a new one: `core.encryption.EncryptedTextField`
  (`backend/apps/core/encryption.py:42`), `orders_app.state_machine`, an existing
  app's `services.py`. Do not build a parallel mechanism.

Test: *would a senior Django engineer call this overcomplicated?* If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor what isn't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code or a defect, **mention it — don't fix it**.
  Unrelated edits expand the review surface on a compliance-sensitive codebase.

When your changes create orphans:
- Remove imports/variables/functions that **your** change made unused.
- Don't remove pre-existing dead code unless asked.

Test: *every changed line traces directly to the request.*

**Generated files are off-limits.** Never hand-edit (`CONTRIBUTING.md` →
*Architecture rules*):
`backend/requirements/*.txt`, `docs/api/openapi.yaml`,
`frontend/src/lib/api/generated/`, `CHANGELOG.md`, `LICENSE`.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Restate every task as a verifiable goal before writing code:

| Instead of | Restate as | Verify with |
|---|---|---|
| "Add validation" | "Contract test asserting 400 on invalid input, then make it pass" | `make test-contract` (CI-gated since 2026-10-03; needs the dev DB) |
| "Fix the bug" | "Regression test reproducing it, then make it pass" | `make test` |
| "Refactor X" | "Tests pass before **and** after; no behaviour change" | `make test && make typecheck` |
| "Add a PII field" | "`EncryptedTextField` + RoPA annotation + `COMPLIANCE_MATRIX.md` updated + erasure handler registered" | `make check && make test` |
| "Change the API" | "Snapshot regenerated, drift clean both sides" | `make api-schema` then `cd frontend && npm run api:drift` |
| "Add a component" | "Vitest passes at 80% thresholds, tsc clean, prettier clean" | `cd frontend && npm run test:coverage && npm run typecheck && npm run format:check` |
| "Add a dependency" | "`pyproject.toml` edited, lockfiles regenerated, audit clean" | `make lock && make check-secrets` |
| "Cross an app boundary" | "Fitness tests pass with no new baseline entry" | `cd backend && ../.venv/bin/pytest tests/unit/test_architecture_boundaries.py -q` |

For multi-step work, emit a plan first:

```text
1. [step] → verify: [command]
2. [step] → verify: [command]
3. [step] → verify: [command]
```

Strong criteria let you loop independently. Weak criteria ("make it work") force
constant clarification.

**Non-negotiable:** never claim a gate passes without running it and reading the
output. "Should be fine" is not evidence.

---

# Part II — Architecture invariants

jolarca is a Baltic-first (LT/LV/EE/EN) B2C/B2B2C marketplace: Django + DRF
backend, Next.js frontend, PostGIS + Redis, Celery workers, MinIO/S3 media
(`README.md:9-35`).

## Module isolation — ENFORCED

The authority is the forbidden-imports table in
`docs/architecture/01-modular-breakdown.md:5-18`. Read it before touching any
app. Its load-bearing rows:

| App | Public interface | Forbidden |
|---|---|---|
| `core` | models + utilities | importing **ANY** domain app |
| `orders_app` | `services.py`, `state_machine.py` | direct `Order.status` writes outside the state machine |
| `payments_app` | `services.py`, webhook view | `import stripe` **anywhere else in the codebase** |
| `tax_app` | `services.py` | calling Stripe APIs directly (go via `payments_app`) |
| `search_app` | `services.get_backend()` | leaking backend types upward |
| `shipping_app` | `services.py`, webhook view | carrier clients outside `carriers/`; provider detail leaking upward |
| `ai_service_app` | `tasks.py` only | LLM clients outside `providers/`; inference in the request path; bypassing guardrails |
| `bitrix24_integration_app` | `tasks.py` only | being imported by marketplace apps |
| `compliance_app` | `services.py` | deleting financial evidence |

Since 2026-10-03 these are machine-gated by
`backend/tests/unit/test_architecture_boundaries.py` (pure AST over
`backend/apps/**`, no DB, runs inside `make test` and the CI backend test step):

1. **`stripe` is importable only in `payments_app`** — the PCI DSS SAQ-A card-data
   boundary. Verified today: the sole `import stripe` statements are
   `backend/apps/payments_app/services.py:25` and `webhooks.py:30`, and **both
   are function-local**. The test walks the full AST for exactly this reason; a
   module-level-only scan would miss the pattern most likely to be reintroduced.
   The check is import-based, not substring-based: `stripe_account_id`
   (`sellers_app/models.py:39`) and the sanctioned
   `payments_app.services.stripe_tax_calc` call (`tax_app/services.py:35`) are
   legitimate and must not trip it.
2. **`zeep` is importable only in `tax_app`** — the EU VIES SOAP client
   (`backend/pyproject.toml:28`), used at `tax_app/vies_client.py:146-147`.
3. **`core` imports no domain app** — the base layer must not invert.
4. **`bitrix24_integration_app` is not imported by marketplace apps** — CRM sync
   is outbound-only.
5. **`ai_service_app` is reachable only via `apps.ai_service_app.tasks`** —
   importing `providers` or `guardrails` directly bypasses the PII guardrails
   (`AI_PII_FILTER_ENABLED`). The sanctioned example is
   `products_app/tasks.py:36`.
6. **Request/response modules import no AI or CRM app** — no inference or CRM
   egress on the request path; enqueue to the `ai` Celery queue
   (`README.md:41`, `CONTRIBUTING.md` → *Architecture rules*).

**Cross-app model imports are a shrink-only ratchet, not a prohibition.**
*Architecture rules* in `CONTRIBUTING.md` requires cross-app access via the owning app's `services.py`,
but 16 `(file, target app)` pairs predate that rule and are baselined in
`CROSS_APP_MODEL_BASELINE`. Adding a new pair fails the build; burning one down
fails it too until you delete the stale entry. **Route new calls through
`services.py` — do not add a baseline entry to make a test pass.** `core.models`
is exempt (models + utilities are core's declared public interface).

Rules the fitness test does **not** cover:
- Direct `Order.status` writes (`01-modular-breakdown.md:11`) — statically
  detecting `.status =` is false-positive-prone; behaviour is covered by
  `backend/tests/unit/test_state_machine.py`.
- Carrier and LLM SDK containment — there is no carrier or LLM SDK to contain
  (§8 G10). Those boundaries are a `Protocol` plus client-directory confinement
  (`shipping_app/carriers/`, `ai_service_app/providers/`), which stays
  review-gated; `requests` is shared transport and cannot be confined. See
  `docs/architecture/01-modular-breakdown.md` → *Vendor boundaries*.

## Cross-cutting contracts — REVIEW-GATED

From `01-modular-breakdown.md:34-39`:

- **Webhooks:** verify the signature **FIRST**, persist the raw event, *then*
  dispatch async. Never dispatch before verification.
- **Audit:** every personal-data mutation emits a `jol.audit` structured event.
- **Erasure:** `compliance_app` orchestrates; each owning app registers a handler.
- **Money path is idempotent end-to-end:** `orders_app.services.checkout` →
  `tax_app.calculate_for_order` → `payments_app.create_payment_intent`
  (`01-modular-breakdown.md:35-36`).
- **Fail-closed:** `GDPR_PROCESSING_HALTED=1` stops all mutating traffic with 503
  (`README.md:43`; `backend/project/settings/base.py:316`; enforced in
  `backend/project/middleware/gdpr_middleware.py:46`; tested in
  `backend/tests/security/test_gdpr_middleware.py`). Never add a bypass, and
  never treat a probe path as a mutation exemption without reading that
  middleware first.

---

# Part III — Compliance (GDPR · SOC 2 Type II · ISO 27001)

Compliance targets are declared in `README.md:13-15`: GDPR (Art. 17 erasure,
Art. 20 portability, RoPA), ISO 27001-aligned controls, SOC 2 Type II evidence
readiness, PCI DSS SAQ-A with Stripe as the only card-data boundary.

## Personal data — REVIEW-GATED

- New PII fields **MUST** use `core.encryption.EncryptedTextField`
  (`backend/apps/core/encryption.py:42`) and annotate the RoPA classification
  (`CONTRIBUTING.md` → *Architecture rules*).
- Update `docs/COMPLIANCE_MATRIX.md` **in the same PR**.
- **Erasure fan-out:** any new storage of personal data must register a handler
  in `compliance_app.services.ERASURE_REGISTRY`
  (`backend/apps/compliance_app/services.py:23`; registration at `:28`).
  Missing handlers are computable (`:115`) — add a model holding PII without
  registering it and erasure is silently incomplete. That is an Art. 17 defect,
  not a style issue.
- Never log, echo, or place PII into test fixtures, error messages, or docs.
  `backend/tests/contract/test_seller_storefront_api.py:51-52` asserts `email`,
  `phone`, `vat_number` and `stripe_account_id` never leak from the storefront
  API — and since 2026-10-03 that suite runs in CI (§8 G7 closed), so a leak now
  fails the build rather than merely being unobserved.
- AI features run behind PII guardrails (`ai_service_app/guardrails.py`); do not
  weaken or short-circuit them (`01-modular-breakdown.md:16`).

## PR compliance checklist — REVIEW-GATED

`.github/pull_request_template.md:7-22` is mandatory; reviewers will not merge
without it. It covers PII/encryption, new dependencies, secrets, Stripe
containment, AI-in-request-path, cross-app `services.py`, state machine, erasure
fan-out, OpenAPI snapshot, and migration safety. Plus **Security & privacy notes**
(`:24-26`) and **Rollback plan** (`:28-30`).

Complete the checklist from the *diff*, not from memory of intent.

## Independent review — GAP

`.github/CODEOWNERS:9` is a single wildcard: `* @JourneyOfLife`. The file records
that the org has zero teams (D-10, `:4-5`), and jolarca is a single-operator
project by design. **Consequence:** no second approver exists, so there is no
independent review of `payments_app`, `compliance_app`, `users_app`, `settings/`,
or the workflows. Earlier revisions of this file and `CONTRIBUTING.md` →
*Branching & PR checklist*
asserted per-path Code Owner review; that control does not exist. See §8 G2 for
the required risk acceptance and compensating controls.

---

# Part IV — Secrets

**ENFORCED** — three independent layers:

1. `.gitignore` excludes env, SSL, backup and scratch paths (`.state/` at `:59`).
2. Pre-commit (`.pre-commit-config.yaml`): `detect-private-key` (`:6`),
   `check-added-large-files` (`:5`), Gitleaks v8.23.1 (`:20-23`).
3. CI: the `secrets` job runs `scripts/check_no_secrets.sh` **and**
   `scripts/check_secrets_dir.sh`; `security.yml:29` runs
   `gitleaks detect --source . --no-banner --redact` with full history
   (`fetch-depth: 0`).

Rules:
- No tokens, keys, PEMs, passwords, or `.env` files in code, tests, fixtures, or
  docs. No internal hostnames either (`pull_request_template.md:13`).
- **Never** suggest `git commit --no-verify` or any hook bypass. A blocked hook
  is a finding to report, not an obstacle to route around.
- Runtime credentials come from environment variables only (see `.env.example`).
- Secrets at rest use SOPS (`.sops.yaml`); `secrets/encrypted/` holds ciphertext
  only. Never commit plaintext there.
- If a secret reaches a commit, treat it as compromised: rotate first, purge
  history second, report third. Do not merely delete the line.

---

# Part V — Quality gates

## Backend — `make` targets and their real CI counterparts

| Gate | Local target | CI location | Actual threshold |
|---|---|---|---|
| Lint | `make lint` | backend job, `ruff check .` | **GAP locally** — see §8 G3 |
| Typecheck | `make typecheck` | backend job, `mypy project apps` | ENFORCED, both. Tests are **not** typechecked |
| Tests | `make test` | backend job, "Unit + security + contract tests" | runs `tests/unit tests/security tests/contract` |
| Contract | `make test-contract` | same step as Tests | **ENFORCED since 2026-10-03** (§8 G7). Needs a DB, so it is *not* in `make test` |
| Coverage | — | `--cov-fail-under=20` in that step | **20%, not 80%** — see §8 G1. Measured 68.8% with contract tests included |
| Integration | `make test-integration` | not a CI job (`docker-compose.test.yml:34`) | `tests/integration` only, manual |
| Django checks | `make check` | — | REVIEW-GATED locally |
| OpenAPI drift | `make api-schema` | CI backend job, "OpenAPI drift check" | ENFORCED |
| Secrets | `make check-secrets` | the `secrets` job | ENFORCED |

`Makefile` targets and CI steps are cited by name — see the header's citation rule.

CI installs with `pip install --require-hashes -r requirements/dev.txt` (backend
job, "Install pinned deps") against PostGIS 16-3.4 (that job's `postgres` service)
and `DJANGO_SETTINGS_MODULE=project.settings.test` (its `env` block). Local host
runs source `.env` via `LOAD_ENV` in the recipe shell — Make must not `include`
it, since a `$` or `#` inside a secret would be interpolated or truncated.

For ad-hoc test runs, `.env` is not loaded automatically and it pins
`DJANGO_SETTINGS_MODULE=project.settings.dev`, which pulls in the Redis cache.
Source it, then override:

```bash
set -a && . ./.env && set +a && export DJANGO_SETTINGS_MODULE=project.settings.test
cd backend && ../.venv/bin/python -m pytest tests/unit -q
```

## Frontend

| Gate | CI job | Command |
|---|---|---|
| Typecheck | `frontend-typecheck` | `npx tsc --noEmit` |
| Lint | `frontend-lint` | `npm run lint` (ESLint) |
| Format | `frontend-lint` | `npm run format:check` (Prettier) |
| Unit + coverage | `frontend-unit` | `npm run test:coverage` — **80%** branches/functions/lines/statements (`frontend/vitest.config.mts:56-59`) ENFORCED |
| API drift | `frontend-openapi-drift` | `npm run api:drift` ENFORCED |
| Build | `frontend-build` | `npm run build`, **warnings treated as errors** |
| Standalone CSS | `frontend-build` | `node scripts/verify-standalone.mjs` ENFORCED |
| Lighthouse | `frontend-lighthouse` | **`if: false` — disabled** (§8 G5) |
| Playwright smoke | `frontend-playwright-smoke` | **`if: false` — disabled**; `smoke.spec.ts` only when enabled (§8 G4) |

Node 22 in CI (`ci.yml`, frontend jobs). `README.md:5-6` advertises "coverage ≥80%" and
"lighthouse-budgets enforced" — the first holds for the frontend only, the second
is currently false.

## Security pipeline — `security.yml`

Runs on push to `main`, on PRs, and weekly (`security.yml:10`, cited there as
ISO 27001 A.8.16 monitoring).

| Job | Behaviour |
|---|---|
| `gitleaks` (`:17-29`) | Full-history detect. ENFORCED |
| `trivy` SARIF (`:41-48`) | `severity: CRITICAL,HIGH`, `exit-code: 0` — **reporting only** |
| Trivy dev report (`:59-69`) | `--include-dev-deps --exit-code 0`, distinct SARIF category — **non-blocking by design**, risk accepted in ADR-0018 (`docs/ARCHITECTURE_DECISION_RECORDS.md:190`) |
| Trivy policy gate (`:77-79`) | Production dependency surface, `--exit-code 1`. **ENFORCED** |
| `codeql` (`:81-92`) | `python`, `javascript-typescript`. ENFORCED |
| `dependency-audit` (`:101-115`) | `pip-audit -r base.txt -r prod.txt --strict`; `npm audit --omit=dev --audit-level=high`. ENFORCED |
| `docker-scan` (`:117-126`) | Trivy misconfiguration, `CRITICAL,HIGH`, `exit-code: 1`. ENFORCED |

Do not propose "fixing" the deliberately non-blocking Trivy steps. The
`exit-code: 0` split is intentional: gating on dev-only transitives with no
upstream fix (e.g. `braces` CVE-2026-93687 via `eslint-config-next`) is an
unfixable denial-of-pipeline, and those advisories are absent from Dependabot's
database, so the non-blocking report is the only thing that surfaces them.

---

# Part VI — Dependencies

- Runtime deps go in `backend/pyproject.toml` **only** (`CONTRIBUTING.md` →
  *Adding dependencies*).
- `make lock` regenerates pinned, hash-checked
  `requirements/{base,dev,prod}.txt` via pip-tools `--generate-hashes`.
- PRs editing `requirements/*.txt` directly are rejected (`CONTRIBUTING.md` →
  *Adding dependencies*).
- Attach the requirements diff to the PR (`pull_request_template.md:11-12`).
- New deps must survive `pip-audit --strict` and the Trivy CRITICAL/HIGH gate
  (Part V). A dependency with an unfixable HIGH advisory needs a written risk
  acceptance — the ADR-0018 pattern — not a silenced scan.
- **Adding an SDK changes the boundary rules.** If a new third-party SDK becomes
  the sole client for an external service, add it to `SDK_CONTAINMENT` in
  `backend/tests/unit/test_architecture_boundaries.py` so the containment is
  enforced from day one. This is how the carrier and LLM gaps (§8 G10) should
  eventually be closed — by adding the dependency *and* its gate together.
- Frontend: `npm ci` from `package-lock.json`; the `overrides` in
  `frontend/package.json:19-23` exist for a reason — don't remove them casually.

---

# Part VII — Commits, migrations, rollback

## Conventional Commits — ENFORCED

Format (`CONTRIBUTING.md` → *Commit style*); the CHANGELOG is generated from these:

```
<type>(<scope>): <imperative summary>

type:   feat | fix | docs | style | refactor | perf | test | build | ci | chore | security
scope:  users | sellers | products | orders | payments | tax | shipping | ai | bitrix24
        compliance | core | frontend | infra | docs
```

- Breaking changes: append `!` (`feat(payments)!: ...`) and describe the
  migration in the body.
- **Security fixes reference the internal incident ID only — never the
  vulnerability detail** (`CONTRIBUTING.md` → *Commit style*). Commit messages are public and
  permanent; a CVE-plus-path-plus-version string is an exploit roadmap.
- One concern per PR; branch from `main` (`CONTRIBUTING.md` → *Branching & PR checklist*).

## Migrations — REVIEW-GATED

`pull_request_template.md:21-22`:
- No destructive operations (DROP, TRUNCATE) without explicit approval.
- No table locks on hot tables — use `CREATE INDEX CONCURRENTLY` patterns.
- Every migration must be reversible; describe the down-migration path in the PR.
- Migrations touching a PII column must state the encryption and RoPA impact.

## Rollback — REVIEW-GATED

`pull_request_template.md:28-30` makes the rollback plan mandatory, including
data migrations. **If you cannot describe how to revert the change, the change
is not ready.** Say so instead of inventing a plausible-sounding plan.

---

# Part VIII — Known gaps: do not assume these are enforced

Recorded honestly so no agent — or auditor — reasons from a control that does not
exist. Each open gap needs either implementation or a formal risk acceptance.
Closed entries stay listed: the register is the audit trail.

| # | Status | Documented claim | Reality | Evidence |
|---|---|---|---|---|
| G1 | OPEN | Backend coverage ≥ 80% is **enforced in CI** | The gate is `--cov-fail-under=20`, with an in-file `TODO: raise threshold toward 80%`. Measured 24.57% without contract tests, **68.8%** with them. The ≥80% claim recurs in `docs/TESTING_STRATEGY.md:18,56,72` ("enforced in CI"), `docs/TESTING.md:78`, `docs/GRANT_SUBMISSION.md:157` and `README.md:5`. **The 80→20 downgrade is recorded in no ADR** — unlike the `braces` risk acceptance, which was | CI backend step vs `TESTING_STRATEGY.md:18`, `TESTING.md:78`, `GRANT_SUBMISSION.md:157`, `README.md:5` |
| G2 | OPEN | Per-path Code Owner review of `payments_app`, `compliance_app`, `settings/` | Single wildcard owner; zero teams; no independent review possible | `CODEOWNERS:4-9` vs `CONTRIBUTING.md` → *Branching & PR checklist* |
| G3 | OPEN | `make lint` checks ruff **and** prettier | The recipe ends in `\|\| true` on a left-associative `A && B \|\| true` chain — **the target cannot fail**, ruff errors included. It also never runs `ruff format --check` | `Makefile → lint` |
| G4 | OPEN | Playwright checkout journey is a CI gate | Job is `if: false` (disabled); when enabled it runs `smoke.spec.ts` only | `frontend-playwright-smoke` vs `CONTRIBUTING.md` → *Quality gates* item 6 |
| G5 | OPEN | Lighthouse budgets enforced | Job is `if: false` (disabled) | `frontend-lighthouse` vs `README.md:6` |
| G6 | **CLOSED** 2026-10-03 | App isolation is automatically rejected in CI | Was true — no fitness test existed. Now gated by `backend/tests/unit/test_architecture_boundaries.py`: stripe/zeep containment, `core` layering, bitrix24 and ai_service_app isolation, no AI/CRM on the request path. Cross-app `models` imports are a shrink-only ratchet over 16 baselined pairs | `tests/unit/test_architecture_boundaries.py`, run by `make test` and the CI backend step |
| G7 | **CLOSED** 2026-10-03 | Contract tests are part of the suite | 14 files / 121 tests asserting the PCI SAQ-A Stripe boundary and PII non-leakage ran in **no** target and **no** job. Fixed: the `order` / `shipment` fixtures they requested **had never been written**, so ten tests errored; added them to `tests/conftest.py`, repaired a `OneToOne` reuse bug in `test_shipment_carrier_choices`, and fixed a deferred-FK assertion in `test_tracking_event_requires_shipment`. Joined `tests/contract` to CI via `make test-contract` | `Makefile → test-contract`, `tests/conftest.py`, CI backend test step |
| G8 | OPEN | ADR registry is ADR-0001…0017 | ADR-0018 exists | `README.md:62` vs `docs/ARCHITECTURE_DECISION_RECORDS.md:190` |
| G9 | OPEN | CI badges render | Badges point at `journeyoflife-org/jolarca`; `origin` is `jolarca-dev/jolarca` | `README.md:3-4` |
| G10 | **CLOSED** 2026-10-03 | "Only `shipping_app` imports carrier SDKs. Only `ai_service_app` imports LLM SDKs." | Neither SDK class is a dependency (`pyproject.toml:11-29`). Docs corrected to state the real boundary: `Carrier` / `LLMProvider` protocols with clients confined to `shipping_app/carriers/` and `ai_service_app/providers/`, transport over `requests`. Carrier clients are unwired stubs raising `NotImplementedError`, handled at `shipping_app/services.py:87`. That boundary stays review-gated — `requests` is shared transport and cannot be confined | `CONTRIBUTING.md` → *Architecture rules*, `01-modular-breakdown.md` → *Vendor boundaries* |
| G11 | OPEN | "`ruff check` clean (lint + format)" is a CI gate | `ruff check` does not check formatting, and **no CI job runs `ruff format --check` or pre-commit**. Python formatting is enforced only by the local `ruff-format` hook — per-machine, installed only on 2026-10-01 (a month after most of the suite was committed), and bypassable. Frontend formatting *is* CI-gated (`frontend-lint`) | `CONTRIBUTING.md` → *Quality gates* item 1 vs the ci.yml backend job, `.pre-commit-config.yaml:18` |
| G13 | **CLOSED** 2026-10-03 | A contract test asserts no live Stripe secret key is hardcoded "anywhere" | It shelled out to `grep` from a hardcoded developer-machine absolute path, so it could only ever pass on that one checkout (and would **error**, not fail, in CI), while scanning just `apps/` and `project/`. Rewritten to walk all `backend/**/*.py` in-process, with a non-empty-scan assertion so it cannot pass vacuously. Verified by mutation probe | `tests/contract/test_payments_api.py::TestStripeTestMode::test_no_live_keys_in_codebase` |

**Remediation queue, in priority order** (highest risk per unit of effort first):

1. **G3 + G11 — restore local/CI parity for lint and format.** Split `make lint`
   into `lint-py` (`ruff check` + `ruff format --check`) and `lint-fe`
   (`npm run lint` + `npm run format:check`), each failing loudly, then add
   `ruff format --check .` to the CI backend job. A local gate that always exits 0
   manufactures false confidence before push, and a CI-only gate blindsides people
   at PR time. Note `ruff format` **rewrites** files, so a `ruff check`-clean but
   format-dirty file still breaks the commit. Prerequisite already met: the tree is
   153/153 format-clean, and ruff 0.9.4 and 0.16.x produce identical output.
2. **G2 — record a formal risk acceptance** for single-operator review, in the
   ADR-0018 style: state the compensating controls (branch protection, the G6
   fitness tests, the now-gated contract suite, the mandatory PR checklist) and
   the trigger for revisiting (first hire). Until then the checklist at
   `pull_request_template.md:7-22` is the *only* human review layer, so
   self-verify it against the diff.
3. **G1 — record the gate, then raise it.** No ADR documents the 80%→20%
   downgrade, while `TESTING_STRATEGY.md:18`, `TESTING.md:78` and
   `GRANT_SUBMISSION.md:157` all still describe ≥80% as enforced in CI — and one
   of those is an external funding submission. Write the ADR (the ADR-0018
   pattern: decision, rationale, revisit trigger), correct the three docs, then
   raise `--cov-fail-under` from the figure CI itself reports (contract tests now
   put measured coverage at ~68.8%), not in one jump — an unreachable gate gets
   reverted under pressure, and a silently-lowered one gets forgotten.
4. **G4/G5 — re-enable or stop advertising.** `README.md:6` claims a Lighthouse
   gate that is disabled. Correct the badge or the workflow.
5. **G8/G9 — trivial doc corrections**, batch into one `docs:` commit.

**Closed:** G6, G7, G10 and G13 — all 2026-10-03. When a real carrier or LLM SDK
is adopted, add it to `SDK_CONTAINMENT` in
`backend/tests/unit/test_architecture_boundaries.py` in the same PR — do **not**
re-document a containment rule for a package that is not a dependency.

---

# Definition of done

Before proposing a change as complete:

- [ ] Assumptions stated; ambiguities raised, not silently resolved (§1).
- [ ] Smallest viable diff; no speculative abstraction (§2).
- [ ] Every changed line traces to the request; no drive-by edits (§3).
- [ ] Each step verified by running the command and reading the output (§4).
- [ ] `backend/tests/unit/test_architecture_boundaries.py` passes with **no new
      baseline entry** (§Part II).
- [ ] App boundaries respected; cross-app calls via `services.py` only (§Part II).
- [ ] No new PII field, or it is encrypted + RoPA-annotated + `COMPLIANCE_MATRIX.md`
      updated + erasure handler registered (§Part III).
- [ ] `make check-secrets` clean; no hook bypass suggested (§Part IV).
- [ ] `make test-contract` passes — CI runs it but `make test` does not, because it
      needs a database (§Part V).
- [ ] Relevant gates from §Part V actually executed and passing.
- [ ] Generated files regenerated, not hand-edited (§3, §Part VI).
- [ ] Conventional Commit message; security fixes cite the incident ID only (§Part VII).
- [ ] Migrations reversible; rollback plan written and real (§Part VII).
- [ ] PR compliance checklist completed from the diff (`pull_request_template.md:7-22`).
- [ ] Anything noticed but deliberately not fixed is reported, not silently dropped (§3).
- [ ] No §8 gap was assumed to be a gate.

**These guidelines are working if:** diffs contain fewer unnecessary changes;
fewer rewrites happen due to overcomplication; the PR compliance checklist passes
on first submission; clarifying questions arrive *before* implementation rather
than after mistakes; the §8 register shrinks; and no claim about a control is
ever made without a citation.
