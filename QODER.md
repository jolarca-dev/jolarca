# QODER.md

Behavioral guidelines for AI-assisted development in the jolarca marketplace.
They exist to reduce common LLM coding failures and to keep changes inside the
project's compliance and architecture boundaries.

**Evidence policy.** Every rule below cites the file that establishes it. If a
rule has no citation, treat it as an opinion, not a control. Where the project
*intends* a control but does not implement it, it is labelled **GAP** and listed
in §8 — never assume a GAP is enforced.

**Last verified against:** `main` @ 2026-10-05 — `Makefile`, `.pre-commit-config.yaml`,
`.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`,
`.github/workflows/security.yml`, `.github/workflows/deploy-staging.yml`,
`.github/workflows/deploy-production.yml`, `.github/dependabot.yml`, `CONTRIBUTING.md`,
`README.md`, `CHANGELOG.md`, `docs/CHANGELOG.md`,
`docs/architecture/01-modular-breakdown.md`, `backend/pyproject.toml`,
`backend/tests/unit/test_architecture_boundaries.py`, `frontend/package.json`,
`frontend/package-lock.json`, `frontend/vitest.config.mts`, `docker-compose.test.yml`,
plus **live GitHub state** (branch-protection required contexts and review settings,
environments, tags, dependabot alerts, per-job workflow conclusions).
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
`frontend/src/generated/api.ts`, `LICENSE`. **Not** `CHANGELOG.md` — nothing
generates it (§8 G24). The path previously cited here,
`frontend/src/lib/api/generated/`, **does not exist** (§8 G24).

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

**Verified against the protection API 2026-10-05:** `require_code_owner_reviews:
false`, `required_approving_review_count: 0`, `dismiss_stale_reviews: true`
(inert while zero approvals are required). So CODEOWNERS is not merely
coarse-grained — it is **not wired to branch protection at all**, and the file's
own header comment claiming otherwise has been corrected. `enforce_admins: true`,
so the operator cannot bypass the required *checks*; there is simply no review
requirement to bypass. **Do not "fix" this by setting
`required_approving_review_count: 1`** — with `enforce_admins: true` and one
operator who cannot approve their own PR, that makes `main` unmergeable. The
correct control is the recorded risk acceptance in §8 G2.

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
| Lint/format (py) | `make lint-py` | backend job: "Lint (ruff)" + "Format check (ruff format)" | ENFORCED both sides — `ruff check` and `ruff format --check` are separate gates |
| Lint/format (fe) | `make lint-fe` | `frontend-lint`: `npm run lint` + `npm run format:check` | ENFORCED |
| Lint (all) | `make lint` | runs `lint-py` then `lint-fe` | ENFORCED; neither half can exit 0 on a violation |
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

Node 22 in CI (`ci.yml`, frontend jobs). `README.md:5-6` previously advertised
"coverage ≥80%" and "lighthouse-budgets enforced"; **both badges were corrected
on 2026-10-05** to state the enforced backend gate (20%) and the disabled
Lighthouse job, so the README no longer advertises controls that do not exist
(§8 G1, G5, G9).

**"ENFORCED" in the tables above means the job fails the build — not that it
blocks the merge.** Those are different properties. As of 2026-10-05 the required
contexts are **11**: `backend`, `secrets`, `frontend-typecheck`, `frontend-lint`,
`frontend-unit`, `frontend-openapi-drift`, `gitleaks`, `trivy`, `codeql`,
`dependency-audit`, `docker-scan`. `frontend-unit` and `frontend-openapi-drift`
were added that day (§8 G22 — before it, the frontend suite and the API-contract
drift check could fail without blocking anything). `frontend-build` still runs
but does **not** block (§8 G21).

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
- **No CI job rejects a hand-edited `requirements/*.txt`.** This was asserted in
  both `CONTRIBUTING.md` and here; it is false (§8 G24). Review-gated only: a
  lockfile edit without a matching `pyproject.toml` edit is a defect, and it
  undermines the `--require-hashes` install the backend job depends on.
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

## Conventional Commits — REVIEW-GATED

Format (`CONTRIBUTING.md` → *Commit style*). **Not machine-enforced:** no
`commit-msg` hook is installed and no commitlint runs in any workflow. **No
generator consumes these commits either** — `CHANGELOG.md` is a hand-maintained
stub that stops at the repository scaffold (§8 G24). This section was previously
tiered **ENFORCED**, which contradicted the tier definition in *Enforcement
tiers* above:

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
| G1 | OPEN | Backend coverage ≥ 80% is **enforced in CI** | The gate is `--cov-fail-under=20`, with an in-file `TODO: raise threshold toward 80%`. Measured 24.57% without contract tests, **68.8%** with them. The ≥80% claim still recurs in `docs/TESTING_STRATEGY.md:18,56,72` ("enforced in CI"), `docs/TESTING.md:78` and `docs/GRANT_SUBMISSION.md:157` — the last an **external funding submission**. **The 80→20 downgrade is recorded in no ADR**, unlike the `braces` dev-only acceptance, which was recorded as ADR-0018 (this cell previously ended mid-sentence at "which was" — repaired 2026-10-05). *Partial progress 2026-10-05:* the `README.md:5` badge no longer claims ≥80% and now states the enforced 20% gate, so one of the four restatements is corrected; the three docs and the missing ADR are not | CI backend step vs `TESTING_STRATEGY.md:18`, `TESTING.md:78`, `GRANT_SUBMISSION.md:157`; `README.md:5` corrected |
| G2 | OPEN | Per-path Code Owner review of `payments_app`, `compliance_app`, `settings/` | Single wildcard owner; zero teams; no independent review possible. **Worse than first recorded:** the protection API reports `require_code_owner_reviews: false` and `required_approving_review_count: 0`, so CODEOWNERS is not wired to branch protection at all — **inert, not merely coarse**. `enforce_admins: true`, so the operator cannot bypass required *checks*; there is simply no review requirement to bypass. *Doc side corrected 2026-10-05:* `CONTRIBUTING.md` no longer claims a forced second approver and `CODEOWNERS:2-3` no longer claims GitHub enforces the file. **The gap stays OPEN** — it needs the risk acceptance in queue item 7, not a doc edit. Do **not** close it by setting `required_approving_review_count: 1`: one operator cannot approve their own PR, so with `enforce_admins: true` that makes `main` unmergeable | `CODEOWNERS:1-9`; `gh api repos/jolarca-dev/jolarca/branches/main/protection` → `require_code_owner_reviews`, `required_approving_review_count`, `enforce_admins`, `dismiss_stale_reviews` (2026-10-05) |
| G3 | **CLOSED** 2026-10-04 | `make lint` checks ruff **and** prettier | The old recipe ended in `\|\| true` on a left-associative `A && B \|\| true` chain — **the target could not fail**, ruff errors included. Split into `lint-py` (`ruff check` + `ruff format --check`) and `lint-fe` (`npm run lint` + `npm run format:check`); `lint` runs both and each propagates its exit status | `Makefile → lint-py`, `lint-fe`, `lint` |
| G4 | OPEN | Playwright checkout journey is a CI gate | Job is `if: false` (disabled); when enabled it runs `smoke.spec.ts` only. *Advertising half corrected 2026-10-05:* `CONTRIBUTING.md` → *Quality gates* item 6 now states it is not a gate and warns against citing it as frontend coverage, and `docs/CHANGELOG.md` Sprint 8 records that the 45-scenario suite is not what the disabled job would run. **The gap stays OPEN** — the checkout journey is still untested in CI | `frontend-playwright-smoke` (`if: false`) vs `CONTRIBUTING.md` → *Quality gates* item 6 |
| G5 | OPEN | Lighthouse budgets enforced | Job is `if: false` (disabled). *Advertising half corrected 2026-10-05:* the `README.md:6` badge no longer claims "budgets enforced", and `docs/CHANGELOG.md` Sprint 7 now states the gate is off. **The gap stays OPEN** — the budgets are still measured nowhere; `scripts/lighthouse-budget.json` has no CI invoker | `frontend-lighthouse` (`if: false`); `README.md:6` and `docs/CHANGELOG.md` corrected |
| G6 | **CLOSED** 2026-10-03 | App isolation is automatically rejected in CI | Was true — no fitness test existed. Now gated by `backend/tests/unit/test_architecture_boundaries.py`: stripe/zeep containment, `core` layering, bitrix24 and ai_service_app isolation, no AI/CRM on the request path. Cross-app `models` imports are a shrink-only ratchet over 16 baselined pairs | `tests/unit/test_architecture_boundaries.py`, run by `make test` and the CI backend step |
| G7 | **CLOSED** 2026-10-03 | Contract tests are part of the suite | 14 files / 121 tests asserting the PCI SAQ-A Stripe boundary and PII non-leakage ran in **no** target and **no** job. Fixed: the `order` / `shipment` fixtures they requested **had never been written**, so ten tests errored; added them to `tests/conftest.py`, repaired a `OneToOne` reuse bug in `test_shipment_carrier_choices`, and fixed a deferred-FK assertion in `test_tracking_event_requires_shipment`. Joined `tests/contract` to CI via `make test-contract` | `Makefile → test-contract`, `tests/conftest.py`, CI backend test step |
| G8 | **CLOSED** 2026-10-05 | ADR registry is ADR-0001…0017 | ADR-0018 exists, so the range was stale. Fixed by **removing the volatile count from the README** rather than bumping 0017→0018: a hardcoded range over a registry that only grows drifts again on the next ADR, which is how this gap arose. `README.md:62` now reads "Consolidated ADR registry" with no range, leaving the registry file as sole authority. Verified ADR-0001…ADR-0018 all present | `README.md` doc table; `grep -oE 'ADR-[0-9]{4}' docs/ARCHITECTURE_DECISION_RECORDS.md \| sort -u` → 0001–0018 |
| G9 | **CLOSED** 2026-10-05 | CI badges render | Both badge image URLs and their link targets pointed at `journeyoflife-org/jolarca`; `origin` is `jolarca-dev/jolarca`, so both rendered as **broken images on the repository front page**. Corrected in place at `README.md:3-4` as a 1:1 line replacement, so the eight line-number citations into `README.md` — including `README.md:41` inside `test_architecture_boundaries.py`'s assertion messages — did not drift | `README.md:3-4`; `git remote -v` → `jolarca-dev/jolarca` |
| G10 | **CLOSED** 2026-10-03 | "Only `shipping_app` imports carrier SDKs. Only `ai_service_app` imports LLM SDKs." | Neither SDK class is a dependency (`pyproject.toml:11-29`). Docs corrected to state the real boundary: `Carrier` / `LLMProvider` protocols with clients confined to `shipping_app/carriers/` and `ai_service_app/providers/`, transport over `requests`. Carrier clients are unwired stubs raising `NotImplementedError`, handled at `shipping_app/services.py:87`. That boundary stays review-gated — `requests` is shared transport and cannot be confined | `CONTRIBUTING.md` → *Architecture rules*, `01-modular-breakdown.md` → *Vendor boundaries* |
| G11 | **CLOSED** 2026-10-04 | "`ruff check` clean (lint + format)" is a CI gate | `ruff check` does not verify formatting, and **no CI job ran `ruff format --check` or pre-commit** — Python formatting was enforced only by the local hook (per-machine, installed 2026-10-01, bypassable) while the frontend had a real gate. Added a "Format check (ruff format)" step to the CI backend job and corrected the doc claim. Verified the whole tree is format-clean at the CI-pinned ruff **0.16.6** | ci.yml backend job, `Makefile → lint-py`, `CONTRIBUTING.md` → *Quality gates* item 1 |
| G12 | **NEVER ISSUED** | — | **Numbering hole, recorded so the register's sequence stays auditable.** Rows run G1–G11 then G13–G21: no G12 has ever existed. Verified 2026-10-05 by `git grep -n 'G12'` across all tracked `.md`/`.yml`/`.py` — zero hits outside vendored `.venv` noise — and G12 appears in neither the register nor the "Closed:" summary. **Whether the number was skipped or an entry was later removed is not recoverable from the repository**, and this row deliberately does not guess: inventing a plausible G12 would be precisely the fabricated-record failure mode this register exists to prevent. Retired as never-issued. If the owner recalls a withdrawn finding, **amend this row** rather than reusing the number for new content | `git grep -n 'G12'` → 0 tracked hits; register sequence G11→G13 |
| G13 | **CLOSED** 2026-10-03 | A contract test asserts no live Stripe secret key is hardcoded "anywhere" | It shelled out to `grep` from a hardcoded developer-machine absolute path, so it could only ever pass on that one checkout (and would **error**, not fail, in CI), while scanning just `apps/` and `project/`. Rewritten to walk all `backend/**/*.py` in-process, with a non-empty-scan assertion so it cannot pass vacuously. Verified by mutation probe | `tests/contract/test_payments_api.py::TestStripeTestMode::test_no_live_keys_in_codebase` |
| G14 | OPEN | A green local run means CI will be green | The local `.venv` had silently drifted from the pinned lock: `dev.txt` prescribes **ruff 0.16.6 / mypy 2.3.1 / Django 6.1.1 / DRF 3.18.1 / stripe 15.6.1**, the venv held **ruff 0.16.3 / mypy 2.3.0** and older runtime packages. Every local "pass" before that was corrected was measured against tools CI does not run. Nothing in the repo detects venv↔lock drift — `make bootstrap` installs the lock, but no check asserts the venv still matches it | `requirements/dev.txt` pins vs `.venv`; ci.yml "Install pinned deps" uses `--require-hashes` |
| G15 | OPEN | `make check-secrets` is a green gate | It **cannot pass on any real checkout**. `scripts/check_no_secrets.sh` greps the whole working tree (`grep -rI ... .`) and excludes only `.env.example` / `.env.prod.example`, so it flags the operator's own required env files — e.g. a Stripe **test-mode** key in gitignored, untracked `.env.prod`. Consequence: a developer who ever runs it sees a failure they cannot fix, which trains them to ignore the gate (same failure mode as G3). **No leak**: `.env.prod` is untracked and gitignored, and CI's gitleaks — which scans history, the question that actually matters — passes | `make check-secrets`, `scripts/check_no_secrets.sh:14-36` vs `.gitignore` `.env.*` |
| G16 | OPEN | The `prettier` pre-commit hook formats only what the project wants formatted | The hook runs prettier from the **repo root**, and prettier resolves `.prettierignore` relative to **cwd** — so `frontend/.prettierignore`'s `src/generated` exclusion is never applied and the hook **rewrites committed generated files** (observed on `api.ts`: 134 insertions / 134 deletions). Proved not to be a version issue: the project's own prettier **3.9.6** flags `api.ts` when run from the root and reports it clean with `--ignore-path frontend/.prettierignore`. Consequence: the hook produces a diff **no CI gate will ever reproduce** (`npm run format:check` runs inside `frontend/` with the ignore honored), so it silently fights `make api-schema` on every commit that touches frontend files | `.pre-commit-config.yaml:25-29` (`files: ^frontend/`, `rev: v4.0.0-alpha.8`), `frontend/.prettierignore` (`src/generated`), A/B probe above |
| G17 | OPEN | A red workflow means something broke | `Deploy Staging` fails on **every** push to `main` by design: the rollout step runs `exit 1` ("fail loudly until the deploy target is implemented — no silent no-ops", pending `docs/ASSUMPTIONS.md` §A-07). Verified 9/9 consecutive failures on `main`. The defect is **placement, not intent**: the failing step sits in a `deploy` job with `needs: build-and-push`, so it fires *after* real, irreversible side effects — each merge already publishes `ghcr.io/.../{backend,frontend}:staging-<sha>`. A permanent red X is as unactionable as G3's permanent green one: a genuine image-build failure is indistinguishable from the stub, and nobody reads the run. It is not a required check, so it blocks nothing | `deploy-staging.yml:39-53`, run history on `main` |
| G18 | OPEN | Production deploys require a manual approval gate | Asserted in a code comment (`deploy-production.yml:14`: "REQUIRED: manual approval gate before any prod action") but **absent in configuration**: the GitHub API reports exactly one environment, `staging`, with `protection_rules: []` and `deployment_branch_policy: null`; **no `production` environment exists at all**. Tagging `v*` would therefore auto-create it unprotected and push `:latest` production images plus SBOM/provenance with **no human approval**, and only then fail on the stub `exit 1`. **Weaker than it looks even if configured**: `can_admins_bypass` defaults to `true` and the sole developer is the org owner, so an environment approval here is self-grantable — it satisfies the letter of SOC 2 CC8.1 without any independent sign-off (same root as G2). **Latent, not current**: `git ls-remote --tags` returns no `v*` tags, so this workflow has never run. Note the comment reads as verified evidence and is not — the register's core failure mode | `deploy-production.yml:12-14,42-54` vs `gh api repos/.../environments` and `/orgs/jolarca-dev` (`free` plan; repo is public, so protection rules are available) |
| G19 | OPEN | Dependency updates reach `main` | **20** dependabot PRs were open early on 2026-10-04 with **none merged**; **11** remained at the end of that day — #125 is **merged**, and dependabot superseded the rest of the singles on its own. Three failure causes were then separated by measurement rather than assumed. (a) **Fan-out:** `.github/dependabot.yml` had no `groups:` key, so each weekly cycle opens one PR per package. (b) **Peer-drop and coupled families — two distinct failure causes, initially conflated by me.** Taking #125 as the probe: `gh pr update-branch 125` merged `main` into the branch, after which `backend` went **fail → pass (1m59s)**, so that failure genuinely was staleness. The four `frontend-*` jobs failed **identically before and after** — `npm ci` EUSAGE "Missing: `@swc/helpers@0.5.23` from lock file", dying in 7–9 s. Reproduced locally against #125's own `package.json` + `package-lock.json` (no CI involved): `npm ci --dry-run` exits 1. Dependabot's own lock edit drops a required entry, and updating the branch does not restore it — the precise mechanism is given below, and it is **not** the one this entry first stated. All **9** open npm branches were then triaged locally — for each, its own `package.json` + `package-lock.json` into a throwaway dir and `npm ci --dry-run`: **8 DEFECT (5 peer-drop, 3 `ERESOLVE`), 1 OK**. **Staleness is not the cause at all:** every branch measured `behind=0`, i.e. already current with `main`. The real mechanism is narrower than it looked — the dropped entry is `node_modules/next-intl/node_modules/@swc/helpers@0.5.23`, declared **`"optional": true, "peer": true`**. Dependabot's lock edit omits optional peers; `npm ci` still requires them for sync, so it reports `Missing`. (A `jq` scan of `.dependencies` finds no referencer, which is how this entry first mislabelled the entry an orphan — peers live in a different field.) Two further claims of mine were falsified by the same run: that regenerating `main`'s lock would prune the orphan (`npm install --package-lock-only` on `main` returned *up to date* and produced a **byte-identical** lock, 0 lines changed), and that `next@15.5.26` demanded `0.5.23` (it pins `0.5.15`; the hoisted entry is untouched throughout). **The repair is proven and minimal:** running `npm install --package-lock-only` on the branch re-inserts that one block — 11 lines added, 0 removed, **no package version moves** (`dompurify` holds the bumped 3.4.16; `next`, `next-intl`, `@stripe/*`, `vitest` unchanged) — `npm ci --dry-run` then exits 0, and pushing it flipped `frontend-lint`/`typecheck`/`openapi-drift` from fail to **pass**; #125 was merged on that basis, so `main` now carries `dompurify` **3.4.16** and `npm ci --dry-run` there exits 0. A second, unrelated cause accounts for the other three defects: they are **coupled families split into single-package PRs**, each individually unsatisfiable. Measured, not inferred — `vitest-5.0.3` dies on `ERESOLVE: While resolving: @vitest/coverage-v8@4.1.10 / Found: vitest@5.0.3` (mirrored for `coverage-v8-5.0.3`), and `eslint-10.11.0` dies on `ERESOLVE: While resolving: eslint-config-next@15.5.23 / Found: eslint@10.11.0`. Because `eslint-config-next` is peer-coupled to **both** `next` and `eslint`, the toolchain is a ring: a `next` group and an `eslint` group would each still be unsatisfiable alone, so they are one `next-toolchain` group. Both families are now grouped **with** majors, disjointly, and excluded from the catch-all. Minor/patch grouping can never rescue them — my first version of this fix split `next` from `eslint` and was wrong until the `eslint` branch was measured. **Correction to this entry:** its first revision asserted every sampled red signal was a staleness artifact and cited `frontend/package-lock.json:2655` as proof. That citation supported a different version than the error named — it is `@swc/helpers@0.5.15`, not `0.5.23` — and the blanket conclusion was falsified by re-running #125. Kept visible so the register does not perpetuate the error, and it is the same class of mistake G18 records: a claim that reads as verified but was not. **Volatile count — do not quote a bare number:** a re-check ~40 minutes later found 14 dependabot PRs, with #107–#113 closing **unmerged** at 2026-10-03T23:24–23:30Z, immediately after `groups:` landed in #134. **State after #146 (2026-10-04, verified the next day):** dependabot consumed the config and group PRs exist per family — #150 npm catch-all, #144 pip, #148 `vitest`, #149 `next-toolchain`. **#149 appeared to validate the ring:** it moved `next` 15.5.26 → **16.3.8** alongside `eslint` and `eslint-config-next`, its lock was locally consistent, and its only red was one `frontend-lint` failure, which this entry called "a genuine, actionable signal." **That characterisation was wrong and is retracted below** — the "lint failure" was `eslint` 10 failing to *load* the react plugin, i.e. a crash, not a rule violation: structural noise wearing a lint label. **This gap stays OPEN because the peer drop recurs:** #148 and #150 were generated *after* four branches were repaired and already measure `swc0.5.23=0`, so the 11-line repair is a **per-PR weekly tax, not a fix**. Two questions are deliberately left unanswered rather than guessed: whether the optional peer is required at all at a newer `next-intl` (the only datum, #136 at 4.14.8, is inconclusive because dependabot had already dropped the entry there), and whether grouping actually resolves the vitest `ERESOLVE` (#148 dies on the peer drop before `npm ci` can reach the peer conflict). **One more correction of mine:** #144 was reported as the npm group PR; it is `dependabot/pip/…`, and the npm group PR that was repaired is **#136**, since closed and superseded by #150. The four ring singles this entry told the operator to close (#137, #138, #140, #142, plus #141) were **already closed by dependabot**, so no `close` was run — claiming that action would have been theatre. Counts here are date-stamped for exactly this reason: 20 → 14 → 11 inside one day. Record dates and mechanism, never a bare tally. **Superseded pointers after #152 and #156 (2026-10-04):** the group PRs named above (#148, #149) no longer exist — dependabot closed them when the `update-types` split landed and re-raised **#153** (`vitest-major`, 2 updates), **#154** (`next-toolchain-major`, 3 updates), **#155** (`next-toolchain-patch`) and **#150** (npm catch-all, 10 updates). #154 and #155 confirm both routes work as designed; #153 is still red on this gap's peer drop, which is why G19 remains OPEN. G20's advisory is closed — see that row — so the remaining risk here is throughput, not exposure. **Ring premise corrected (2026-10-04, later same day):** #152 claimed that because `eslint-config-next` peers both `next` and `eslint`, all three majors must rise together. A peer range is a **ceiling**, not a licence to raise both — `eslint-config-next@16` vendors `eslint-plugin-react@7.37.5` (peers `^3 … ^9.7`) and ESLint 10 removed `context.getFilename()`, so that composition cannot load a config at all: `Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function`, measured on #154. That PR is therefore permanently unbuildable; `next-toolchain-major` now lists only the version-locked pair, `eslint`/`@eslint/*` majors are `ignore:`d under a stated revisit trigger, and `scripts/check_dependabot_groups.py` asserts the relation (grouped-and-ignored, grouped-only and grouped-nowhere each fail, with a control case so a checker that only ever errors is caught too). **The cure itself is measured:** `next` + `eslint-config-next` 16.3.8 with `eslint` at 9.39.5 yields `peer: true` entries **1 → 0**, so the nested entry dependabot deletes no longer exists — but it is unmerged pending the `eslint-plugin-react-hooks` 7 decision in queue item 3(2), which is why this gap stays OPEN and the 11-line repair remains the operative control, now codified as `scripts/repair-dependabot-lock.sh` — self-testing, worktree-isolated, push-refusing on any version move, and dry-run verified on #150/#153/#155 (each exactly 11 lines added, 0 removed) | `.github/dependabot.yml`, `gh pr update-branch 125`, `gh pr checks 125`, `gh run view --log-failed --job 111316504982`, local `npm ci --dry-run` per branch for all 9 open npm PRs, `jq` inspection of the lock's `packages` tree, repair commit `b2f5bc6` on the dompurify branch, `#125` squash `25ee444` on `main` with `dompurify` 3.4.16 + `npm ci --dry-run` exit 0 + CI and Security runs `success` on that SHA, `gh pr list --state all` for the #136–#150 dispositions, re-triage of #148/#149/#150 (only #149 OK, `next` 16.3.8) |
| G20 | **CLOSED** 2026-10-04 | A published advisory is patched promptly | **Two alerts sat on the default branch at registration, both one advisory:** `GHSA-82fw-gwwq-j7x9` / **CVE-2026-84373** — "Vitest: Path Traversal / Arbitrary File Read via `@vitest/mocker` Redirect Mock", **medium, CVSS 5.9**, reported against `vitest` and `@vitest/mocker` in `frontend/package-lock.json`, **open since 2026-09-09 (25 days)** with `fixed_at: null` **at that time** and never updated. `main` carries **4.1.10**; the advisory's vulnerable range is `>= 2.1.0, < 4.1.11` and `first_patched_version` is **4.1.11** — so the fix is a **patch bump inside the current major**, not the 5.x major dependabot kept proposing. The gap is self-inflicted and recent: #146 routed `vitest` + `@vitest/*` into a single group **including** `major` (to kill the permanently-red `ERESOLVE` singles), but a group PR is **atomic**, so the security patch now arrives only as part of the major-bump PR — #148, which is red on G19's peer drop and is exactly the PR this repo cannot merge casually. **A control that makes a CVE wait on a major is worse than the noise it removed.** Fix: split the family into two groups differing only in `update-types` — one `minor`+`patch` (so 4.1.11 lands alone and promptly), one `major` (so the coupled 5.x move still resolves atomically); apply the same split to `next-toolchain`, whose patch fixes are hostage to the same mechanism. Note what this entry corrects — and then got wrong itself: it first claimed `dompurify` was the live exposure, then "corrected" that to "`dompurify` has no open alert; it was a hardening bump with no advisory outstanding on `main`." **Both framings were off.** Alert #37 reads `state=fixed`, `fixed_at=2026-10-04T12:06:39Z` — the moment #125 merged — so #125 *was* an advisory fix. The accurate statement is narrower than the one first written: at the time of the query it had no *open* alert precisely because #125 had already closed it. Recorded as its own lesson: a `state=open` query answers "what is outstanding now", not "was there ever an advisory", and this register drew the stronger conclusion from the weaker evidence. **Closure (2026-10-04).** Fixed by #156: `vitest` and `@vitest/coverage-v8` raised to **4.1.11** with the declared ranges moved to `^4.1.11`, so a clean install cannot resolve back below the fix. `main` @ `bd32d73` reports **0 open alerts**, and the two vitest alerts close as #27 (`@vitest/mocker`) and #28 (`vitest`): `state=fixed`, `fixed_at=2026-10-04T14:22:13Z`, `dismissed_at=null`, `reason=null` — closed by the version fix, not by dismissal or auto-dismissal, which is the only closure that counts as ISO 27001 A.8.32 evidence. The structural cause went with it: #152 split each family into `-major` and `-patch` groups differing only in `update-types`, and dependabot's next evaluation produced **#155 `next-toolchain-patch`** (`@eslint/eslintrc 3.3.6 → 3.3.7`) — direct proof that a patch can now arrive without waiting on a major. Exposure window: opened 2026-09-09, closed 2026-10-04, **25 days**. What remains open is **G19**, not this: the optional-peer drop still reddens freshly generated group PRs (#153 `vitest-major` fails all four `frontend-*` jobs), and whether grouping resolved the vitest `ERESOLVE` is still unknown, because the peer drop kills `npm ci` before it reaches the peer conflict. | `gh api /repos/.../dependabot/alerts?state=open` (2 records, `security_advisory.severity=medium`, `cvss.score=5.9`, `created_at=2026-09-09T13:21:48Z`, `fixed_at=null`), `security_vulnerability.vulnerable_version_range` `>= 2.1.0, < 4.1.11`, `first_patched_version=4.1.11`, `jq` on `frontend/package-lock.json` (both packages at 4.1.10), `gh run view --log-failed --job 111456665230` (#154 plugin load failure), `npm view eslint-config-next@16.3.8 peerDependencies` and `npm view eslint-plugin-react peerDependencies.eslint`, and a local `chore/next-16-flat-config` tree where `jq` reports `peer: true` = 0 with `npm ci`, `tsc`, 267 tests, `next build` and prettier all exit 0, `.github/dependabot.yml` `groups.vitest.update-types` as shipped in #146, re-queried `dependabot/alerts`: `state=open` → **0**, `state=closed` → #27 and #28 `state=fixed fixed_at=2026-10-04T14:22:13Z dismissed_at=null reason=null`, #37 `dompurify state=fixed fixed_at=2026-10-04T12:06:39Z`; `main` @ `bd32d73` lock at 4.1.11 with CI and Security both `success`; `gh pr view 155` for the patch-route PR |
| G21 | OPEN | `CONTRIBUTING.md:52` — “**Quality gates**” (before 2026-10-05: `:39`, “Quality gates (all enforced in CI)”) | The gate that verifies the **shipped bundle** is neither required nor independent. `scripts/verify-standalone.mjs` — the only check that boots the production `server.js` and asserts a real stylesheet is served — has exactly **one** invoker, `frontend-build` (`ci.yml:195`). Two properties then mask it. **(1)** `frontend-build` is **not** among the required contexts — **eleven** since 2026-10-05, when §8 G22 added `frontend-unit` and `frontend-openapi-drift` but not this job — so it may fail or be skipped and `main` still accepts the merge. **(2)** It `needs: [frontend-typecheck, frontend-lint, frontend-unit]` (`ci.yml:172`), so a **lint** failure suppresses the runtime check entirely, though the two signals are unrelated. Live on 2026-10-04: PR **#161** reports `fail frontend-lint` with `skipping frontend-build` while every other job passes. Consequence: a PR whose only real defect is bundle wiring looks identical to one with a trivial style violation, and the white-screen guard can go unexecuted on merged code. A latent second instance, now fixed by **#162**: the pre-#162 guard matched only `/_next/static/css/*.css`, while Next 16 emits `/_next/static/chunks/*.css`, so it would have failed **closed on a healthy v16 build** — shown by running both selector implementations against fixtures for each layout, where the old one finds nothing on v16 and the new one finds the sheet on v15 *and* v16 while still finding nothing on a genuinely stylesheet-less page (so the hardening did not disarm it). Two candidate fixes, deliberately **not** applied here: drop `frontend-lint` from that `needs:` so an unrelated signal cannot hide the runtime check, and/or add `frontend-build` to the required contexts — the latter is a policy change on protected `main` and is the owner's call. Until one is done, **a green PR is not evidence that the bundle serves CSS** | `ci.yml:172,194-195`; `grep -rn verify-standalone` over `.github/`, `Makefile`, `frontend/Dockerfile`, `frontend/package.json`, `scripts/`, `.pre-commit-config.yaml` → one hit; `gh api repos/.../branches/main/protection` (contexts list, `frontend-build` absent, `strict: false`); `gh pr checks 161` (`fail frontend-lint`, `skipping frontend-build`); fixture probe over v15 / v16 / no-CSS HTML |
| G22 | **CLOSED** 2026-10-05 | A failing frontend test, or a drifted API contract, blocks the merge | **Neither did.** The required-context list held exactly **nine** entries — `backend`, `secrets`, `frontend-typecheck`, `frontend-lint`, `gitleaks`, `trivy`, `codeql`, `dependency-audit`, `docker-scan` — while `ci.yml` also defines `frontend-unit` (the whole Vitest suite at 80% thresholds) and `frontend-openapi-drift` (the backend↔frontend contract). Both **ran on every PR and blocked nothing**, so `main` could accept a merge with every frontend test red, or with a hand-edited `openapi.yaml`. That second case silently falsified `README.md:42` ("hand-edits fail CI (drift gate)") — a claim that became true only as of this fix. **Not previously registered:** G21 covers `frontend-build` alone, and Part V's tables marked both jobs "ENFORCED", which under this file's own tier definition means *the job fails the build* — true — while a reader would take it to mean *the merge is blocked* — false. Part V now states the distinction explicitly. **Fixed** by adding both contexts, preserving `strict: false` and all nine originals (→ eleven), verified by re-reading the API. Pre-checked green across the **last five** `main` CI runs so the change could not deadlock pending merges; neither job has a `needs:` or an `if:`, so both always run and cannot be skipped into permanent-pending | `gh api .../branches/main/protection/required_status_checks` before (9 contexts) and after (11, `strict: false`); `ci.yml` job ids `frontend-unit`, `frontend-openapi-drift`; `gh run view <id> --json jobs` × 5 main runs, both `success`; `README.md:42` |
| G23 | OPEN | The repository is consistently named `jolarca` | **The `JOL Marketplace` → `jolarca` rename is incomplete, and no ADR records it.** Verified 2026-10-05: `grep -niE 'rename\|rebrand\|JOL-RENAME'` across `ARCHITECTURE_DECISION_RECORDS.md`, `TECH_DECISIONS.md`, `ASSUMPTIONS.md` and both changelogs → **0 hits**, so an identity change reaching the public API title, transactional email and order numbering was executed with no decision record. Current split: `README.md:1` and this file say `jolarca`, while **all 25 `docs/*.md` are titled `# JOL Marketplace — …`**, `backend/project/settings/base.py:167` sets the OpenAPI `TITLE` to `"JOL Marketplace API"` (propagated into generated `docs/api/openapi.yaml:3` and the frontend client), and `backend/apps/users_app/tasks.py:16` sends real users an email subjectlined `"Welcome to JOL Marketplace"`. **Finishing this naively breaks production two independent ways, which is why it is registered rather than fixed in a docs PR.** (1) Order numbers are **persisted data**: `orders_app/services.py:58` derives the next sequence from `filter(number__startswith="JOL-<year>-")`, so renaming the prefix makes that filter match **zero existing rows**, `seq` resets to `offset`, and the first new order collides with a `unique=True` number — **a 500 on the checkout money path**, the exact failure the function's own docstring warns about; `migrations/0001_initial.py:42` also encodes the format in a shipped migration that must never be edited. (2) `X-JOL-Caller` / `-Timestamp` / `-Signature` are **HMAC wire-protocol header constants** (`payments_app/internal_auth.py:40-42`, `internal_forward.py:78-79`), not branding — renaming them breaks internal payment auth and signed per-product webhook forwarding for every caller. A third class must be **kept, not renamed**: `.env.example:33`, `docker-compose.dev.yml:5,26` and `.sops.yaml:1` reference the sibling **JOL Church / jol-hub** platform that shares the host. **Live landmine:** unmerged local branch `chore/rename-jolarca` (`714ac91`, incident `JOL-RENAME-20260831-01`) differs from `main` in **30+ files** including `CODEOWNERS`, `ci.yml`, `Makefile`, this file, `settings/base.py`, `requirements/*.txt` and `openapi.yaml`, and predates ~14 commits of main's work — resurrecting it would clobber recent changes. **Remedy:** an ADR plus a freeze-map classifying every `JOL` token as RENAME / FREEZE-wire-protocol / FREEZE-persisted-numbering / KEEP-sibling-product, then execute only the RENAME class and regenerate snapshot + client via `make api-schema`. **Never a global `sed`** | `git grep -nI 'JOL'` over tracked files; `orders_app/services.py:53-62`; `payments_app/internal_auth.py:40-42`; `internal_forward.py:78-79`; `settings/base.py:167`; `docs/api/openapi.yaml:3`; `users_app/tasks.py:16`; `migrations/0001_initial.py:42`; `git diff --name-only main chore/rename-jolarca`; ADR/decision grep → 0 hits |
| G24 | **CLOSED** 2026-10-05 | Four controls asserted in contributor-facing documentation | **None of the four existed.** **(a)** `CONTRIBUTING.md:20` headed Conventional Commits "(**enforced**; CHANGELOG is generated from these)" and this file's §Part VII tiered it **ENFORCED** — no `commit-msg` hook is installed (the five pre-commit repos are pre-commit-hooks, ruff, ruff-format, gitleaks, prettier) and no commitlint runs in any workflow, so it contradicted this file's own tier definition at *Enforcement tiers*. **(b)** The same line here, plus `docs/CHANGELOG.md:3-5,127`, called `CHANGELOG.md` machine-generated — **no generator is wired to any make target or workflow**, and the file is a 14-line scaffold stub while `main` carries ~164 merged PRs. Compounded: because §3 and `CONTRIBUTING.md` also listed it as never-hand-edit, the release history could not be recorded by **any** sanctioned route. **(c)** `CONTRIBUTING.md:81` and §Part VI claimed "PRs that edit `requirements/*.txt` directly are **rejected by CI**" — no such guard exists; the only `requirements` references in any workflow are `pip install --require-hashes` and `pip-audit`. **The most dangerous of the four**, being the claimed protection for the hash-pinned supply chain that G14 and G19 both depend on. **(d)** Both never-hand-edit lists pointed at `frontend/src/lib/api/generated/` — **a path that does not exist**; the real client is `frontend/src/generated/api.ts` (1 tracked file), which `README.md:42` cited correctly. Same rule in three places, correct in one: the duplication-drift mechanism behind G1. All four corrected at source, §Part VII retiered to **REVIEW-GATED**, and `CHANGELOG.md` removed from both never-hand-edit lists with a note on why. **(b) is corrected, not solved** — the changelog is still a stub; backfill it or delete it | `.pre-commit-config.yaml` (5 repos, no `commit-msg`); `grep -rniE 'commitlint\|commit-msg\|conventional'` over `.github/`, `scripts/`, `frontend/package.json`, `backend/pyproject.toml` → 0; same for `changelog` → 0; `grep -n requirements .github/workflows/*.yml` → install + `pip-audit` only; `ls frontend/src/lib/api/generated` → no such directory; `git ls-files 'frontend/src/generated/*'` → `api.ts` |

**Remediation queue, in priority order** (highest risk per unit of effort first):

> **Sequencing note (2026-10-05).** This queue is ordered by *risk per unit of
> effort*, **not by severity**. Item 10 (**G23**, the incomplete rename) is the
> highest-severity open finding in this register and the only one that can cause
> a production incident — but it is also the most expensive, so it sorts last.
> Read item 10 first when deciding what *not* to touch.

1. **G1 — record the gate, then raise it.** No ADR documents the 80%→20%
   downgrade, while `TESTING_STRATEGY.md:18`, `TESTING.md:78` and
   `GRANT_SUBMISSION.md:157` all still describe ≥80% as enforced in CI — and one
   of those is an external funding submission. Write the ADR (the ADR-0018
   pattern: decision, rationale, revisit trigger), correct the three docs, then
   raise `--cov-fail-under` from the figure CI itself reports (contract tests now
   put measured coverage at ~68.8%), not in one jump — an unreachable gate gets
   reverted under pressure, and a silently-lowered one gets forgotten.
2. **G14 — make venv↔lock drift visible.** CI installs from `requirements/dev.txt`
   with `--require-hashes`, so CI is the authoritative toolchain and the local
   venv is the loose end. Re-run `make bootstrap` after every `make lock`; a cheap
   durable guard is a `make deps-check` target that runs
   `pip install --require-hashes -r backend/requirements/dev.txt` and reports
   whether anything was out of date.
3. **G19 — finish the dependency backlog; one defect class is left, and it recurs.**
   Always triage locally first — `npm ci --dry-run` against a branch's own
   `package.json` + `package-lock.json` reproduces the gate in seconds, for free.
   **(1)** Merge #139 and #143 (the `@stripe/*` pair, both `MERGEABLE CLEAN` after the
   repair). CI can clear them but **cannot** clear the PCI question: verify Elements and
   checkout by hand, since that boundary is what keeps the merchant out of CHD scope.
   **(2)** The peer-drop cure is now **measured, not hypothetical — and still not landed.**
   With `next` + `eslint-config-next` at 16.3.8 and `eslint` deliberately held at 9.39.5,
   `next@16` pins `@swc/helpers` 0.5.23 itself, `@swc/core`'s `>= 0.5.17` peer is satisfied
   by the hoisted copy, and `peer: true` lock entries fall **1 → 0** — nothing left for
   dependabot to delete. That branch is unpushed because the same upgrade takes
   `eslint-plugin-react-hooks` 5.2.0 → 7.1.1, whose newly enabled rules report **32 errors
   in 19 files** (20 `set-state-in-effect`, 12 `error-boundaries`, 1 `incompatible-library`
   with React Compiler "Compilation Skipped", 1 `no-location-assign-relative-destination`),
   including `checkout-provider.tsx` and the consent components. Neither hooks rule exists
   on `main`, so these are pre-existing defects made visible, not regressions introduced.
   Decide: remediate first, or land the upgrade with those two rules at `warn` and register
   the debt. Until then the 11-line repair is the operative control, and as of 2026-10-04 it
   is **codified** — `scripts/repair-dependabot-lock.sh` plus
   `docs/runbooks/dependabot-lock-peer-repair.md`. Do not improvise it per PR. The script
   works in a throwaway worktree, proves the defect before and the sync after, refuses to
   push if any existing lock entry changed version or vanished, and dry-runs by default;
   its `--self-test` runs before it touches anything, because a first draft of the guard
   compared whole-line diffs and therefore **rejected every valid repair** (restoring the
   dropped entry is an addition) — caught by running it against real branches, not by reading
   it. Scope is wider than this entry first recorded: re-measured 2026-10-04, **#155 carries
   the defect too**, so all three open npm group PRs (#150, #153, #155) fail identically —
   the peer drop is universal on freshly generated branches, not a two-PR anomaly.
   **(3)** Close #154: it can never go green. `eslint-config-next@16` vendors
   `eslint-plugin-react@7.37.5`, which peers eslint `^3 … ^9.7`, while ESLint 10 removed
   `context.getFilename()` — measured, `Error while loading rule 'react/display-name':
   contextOrFilename.getFilename is not a function`. Re-open the upgrade as the composition
   in (2). `next` + `eslint-config-next` are the version-locked pair; the `eslint` major is
   ceiling-blocked and now `ignore:`d with a revisit trigger (`npm view
   eslint-plugin-react peerDependencies.eslint` must include 10), asserted by
   `make check-deps-groups`.
   **(3b)** Do **not** split the flat-config rewrite out of the upgrade as a
   config-migration PR against `main` — measured impossible. `eslint-config-next@15.5.23`
   has no `exports` map at all, and both subpaths are legacy eslintrc
   (`core-web-vitals.js` = `module.exports = { extends: [require.resolve('.'),
   'plugin:@next/next/core-web-vitals'] }`), so `...coreWebVitals` would spread a plain
   object and `frontend-lint` would die at config load. The `FlatCompat` shim in
   `frontend/eslint.config.mjs` is **load-bearing while `main` stays on v15**; the rewrite
   is an effect of the bump, not a step that can precede it. The genuinely separable pieces
   were extracted instead: the `RelatedProducts` render-vs-catch defect (#163) and this
   repair codification.
   Measured the same day on dependabot's own pair bump **#161** (`next` + `eslint-config-next`
   16.3.8, 2 updates, no eslint major): its `frontend-lint` fails **at config load, under
   ESLint 9.39.5** — `TypeError: Converting circular structure to JSON … property 'react'
   closes the circle`, thrown from `@eslint/eslintrc/lib/shared/config-validator.js:308`
   through `_loadExtendedShareableConfig` (job `111510543956`). So the crash is **not** an
   eslint-10 problem — it is `FlatCompat` reading v16's flat config — and it is a **second,
   distinct** structural blocker from #154's (`context.getFilename()` removal). Practical
   consequence: **#161 can never go green unattended**, because dependabot will not rewrite
   `frontend/eslint.config.mjs`; the config migration is a **prerequisite** of the upgrade,
   not a follow-up. The same PR independently **confirms the cure**: #161's lock reports
   `peer: true` entries **0** with `@swc/helpers` present only hoisted at **0.5.23**, and the
   jobs that run `npm ci` (`frontend-typecheck`, `frontend-unit`, `frontend-openapi-drift`)
   all **pass** — whereas #150/#153/#155 die on the dropped entry. The peer-drop fix is
   therefore verified on a dependabot-generated branch, not only on the local
   `chore/next-16-flat-config` tree this entry first cited.
   **(4)** #153 (`vitest-major`) stays red on the peer drop until repaired; only after that
   can CI answer whether grouping resolved the vitest `ERESOLVE`. If (2) ever lands, the
   peer drop disappears and this stops needing any repair at all.
   **(5)** #91, a 17-day-old "land outstanding WIP" catch-all, should be inspected or
   closed — never merged blind.
   **(6)** **G21 gates the evidence for all of the above, not just this upgrade.**
   `frontend-build` runs the only check that boots the shipped bundle, is not a required
   context, and is skipped whenever lint fails — so on #161 the guard never executed at all.
   Before landing any v16 upgrade: merge #162 (the guard must stop encoding Next 15's CSS
   directory, or it cries wolf on every v16 build) and decide between dropping
   `frontend-lint` from `frontend-build`'s `needs:` and adding `frontend-build` to the
   required contexts. Neither is a dependency change, so it is a one-line CI edit either way.
4. **G15 + G16 — rescope the two mis-scoped local gates.** Both fail for the same
   structural reason: a local check is looking at more than it should, so its output
   is unactionable and trains the operator to ignore it.
   - **G15**: point `check_no_secrets.sh` at what git actually carries
     (`git ls-files`, or the staged set for a hook) instead of the whole tree, so the
     gate becomes passable and keeps its meaning. CI's gitleaks already covers
     history; the local script's question is "am I about to commit a credential",
     not "does my machine have credentials".
   - **G16**: give the prettier hook `args: [--ignore-path, frontend/.prettierignore]`
     or exclude `src/generated` from its `files:` regex, so it stops rewriting
     generated files that the project deliberately excludes. One line either way.
5. **G18 — stop the unreviewed production publish, in code not just settings.**
   Create the `production` environment with a required reviewer — feasible because
   the repo is public, so protection rules are available on the free plan. But do not
   stop there: `can_admins_bypass` defaults to `true` and there is one admin, so the
   approval is self-grantable. The control that actually holds is removing the
   `:latest` tag (and the prod push itself) until §A-07 ratifies a target — a workflow
   cannot bypass its own steps the way a role bypasses an environment gate.
6. **G17 — make the deploy stub visible without making it red.** Keep the refusal to
   no-op silently, but move it from `exit 1` to a `::warning::` annotation that exits
   0, and let the *real* gate be the `production` environment approval from G18. A
   signal that is always firing is a signal nobody watches.
7. **G2 — record a formal risk acceptance** for single-operator review, in the
   ADR-0018 style: state the compensating controls (branch protection, the G6
   fitness tests, the now-gated contract suite, the mandatory PR checklist) and
   the trigger for revisiting (first hire). Until then the checklist at
   `pull_request_template.md:7-22` is the *only* human review layer, so
   self-verify it against the diff.
8. **G4/G5 — re-enable the gates; the advertising half is already done.** As of
   2026-10-05 `README.md:6` no longer claims a Lighthouse gate, item 6 of
   `CONTRIBUTING.md` → *Quality gates* no longer claims a Playwright gate, and
   `docs/CHANGELOG.md` marks both as off. What remains is the substance: both jobs
   are still `if: false`, so the checkout journey is untested in CI and the
   Lighthouse budgets are measured nowhere. Re-enable them or record a risk
   acceptance — **a corrected badge is not a working gate**.
9. **G8/G9 — DONE 2026-10-05**, in the same `docs:` commit that closed G22 and
   G24. What remains of the doc-truth work is **G1's three restatements**
   (`TESTING_STRATEGY.md:18,56,72`, `TESTING.md:78`, `GRANT_SUBMISSION.md:157`).
   **Caution on the third:** `GRANT_SUBMISSION.md` describes an *external funding
   submission*. Do not silently edit a document that has already been submitted
   to a third party — correct the in-repo copy, record the correction, and notify
   whoever submitted it, because an in-repo edit cannot retract what was sent.
10. **G23 — the incomplete rename. Highest severity, and the only finding here
    that can cause a production incident.** Do **not** start with `sed`. Sequence:
    **(1)** Write the ADR (decision, scope boundary, revisit trigger) — there is
    currently no record that the product was ever renamed. **(2)** Build the
    freeze-map: every `JOL` token classified as RENAME (the 25 `docs/*.md` titles,
    `settings/base.py:167` OpenAPI `TITLE`, `users_app/tasks.py:16` email
    subject), FREEZE-wire-protocol (`X-JOL-Caller`/`-Timestamp`/`-Signature`),
    FREEZE-persisted-numbering (the `JOL-<year>-` order prefix, and the shipped
    migration that documents its format), or KEEP-sibling-product (`jol-hub` /
    JOL Church host references, `.sops.yaml` cross-project rule). **(3)** Execute
    the RENAME class only, then `make api-schema` to regenerate
    `docs/api/openapi.yaml` **and** `frontend/src/generated/api.ts` — a title
    change *is* a contract change, and `frontend-openapi-drift` is now a required
    context (§8 G22), so a stale snapshot will block the merge. **(4)** Prove the
    order-number sequence still advances: create an order against a database that
    already holds `JOL-<year>-` rows and assert no unique violation. **(5)** Only
    then delete `chore/rename-jolarca` (`714ac91`), whose 30-file divergence is
    the clobber risk. Steps 3 and 4 are exactly what a global search-and-replace
    skips, and exactly what breaks checkout.

**Closed:** G3, G6, G7, G10, G11, G13 and G20 — 2026-10-03/04; **G8, G9, G22 and
G24 — 2026-10-05**. **G12 was never issued** (see its row; the number is retired,
not reusable). When a real carrier or
LLM SDK is adopted, add it to `SDK_CONTAINMENT` in
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
- [ ] Local green is not done: CI installs a **different** toolchain than the local
      venv holds (see §8 G14), so changes touching gates are not verified until a
      pushed branch has run them. `git status -sb` showing unpushed commits means
      there is no CI evidence yet.

**These guidelines are working if:** diffs contain fewer unnecessary changes;
fewer rewrites happen due to overcomplication; the PR compliance checklist passes
on first submission; clarifying questions arrive *before* implementation rather
than after mistakes; the §8 register shrinks; and no claim about a control is
ever made without a citation.
