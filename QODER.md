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
`README.md`, `docs/CHANGELOG.md`, `docs/README.md`,
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
`frontend/src/generated/api.ts`, `LICENSE`. **Not** `docs/CHANGELOG.md` — nothing
generates it (§8 G24); the root stub once listed here was deleted on 2026-10-05
(§8). The path previously cited here,
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
| Coverage | — | `--cov-fail-under=63` in that step | **63%, not 80%** — raised from 20 on 2026-10-06 by ADR-0021's ratchet; see §8 G1. CI reported 68.56% at run `37476183729` |
| Integration | `make test-integration` | not a CI job (`docker-compose.test.yml:34`) | `tests/integration` only, manual |
| Django checks | `make check` | — | REVIEW-GATED locally |
| OpenAPI drift | `make api-schema` | CI backend job, "OpenAPI drift check" | ENFORCED |
| Secrets | `make check-secrets` | the `secrets` job | ENFORCED — scans `git ls-files`, i.e. the same set CI sees (§8 G15) |
| Doc claims | `make check-docs` | backend job, "Doc-claims check" | **ENFORCED since 2026-10-05** — fails when a doc asserts a control configuration does not implement. Preceded by `--self-test`, because an always-green gate is worse than none (G3). **Blocking behaviour was verified, not assumed**: probe PR #168 injected one falsified sentence, turned the required `backend` job red at that step while the step before it stayed green, and left `mergeable=MERGEABLE` with `mergeStateStatus=BLOCKED`. **CI-only** — it is not a pre-commit hook, so a false claim can still be *committed* locally without complaint and first surfaces on the PR; `git commit` is not where you find out |
| Toolchain | `make check-toolchain` | not in CI - CI installs from the lock, so it is correct by construction | **ENFORCED locally 2026-10-05** - `scripts/check_toolchain.py` fails if the interpreter differs from the `dev.txt` pins or a stray `.venv` exists (§8 G14). Runs first in `make verify` |
| Advisory → record | `make check-advisories` | `dependency-audit` job, "Advisory-to-incident-record linkage (§8 G35)" | **ENFORCED since 2026-10-06** — fails when a change removes a production-scoped advisory that no §6.2 incident record names and cites (§8 G35). Preceded by `--self-test`. Exit 2 means *cannot verify* and fails the step, so an unreachable API or a missing `gh` token reads as red, never as green; unlike `check-docs` the attribution half is not offline, it fetches both trees and re-runs the gate's own `npm audit` |

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
| Standalone CSS | `frontend-build` | `node scripts/verify-standalone.mjs` (step cwd is `frontend/`; repo path is `frontend/scripts/verify-standalone.mjs`) ENFORCED |
| Lighthouse | `frontend-lighthouse` | **`if: false` — disabled** (§8 G5) |
| Playwright smoke | `frontend-playwright-smoke` | **`if: false` — disabled**; `smoke.spec.ts` only when enabled (§8 G4) |

Node 22 in CI (`ci.yml`, frontend jobs). `README.md:5-6` previously advertised
"coverage ≥80%" and "lighthouse-budgets enforced"; **both badges were corrected
on 2026-10-05** to state the enforced backend gate (20% then, 63% since 2026-10-06) and the disabled
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
| Trivy dev report (`:59-69`) | `--include-dev-deps --exit-code 0`, distinct SARIF category — **non-blocking by design**, risk accepted in ADR-0018 (`docs/ARCHITECTURE_DECISION_RECORDS.md:269-302`) |
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
generator consumes these commits either** — `docs/CHANGELOG.md` is a
hand-maintained sprint record (§8 G24). The root `CHANGELOG.md` stub that stopped at
the repository scaffold was deleted on 2026-10-05 rather than backfilled (§8). This
section was previously
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
  **Scope, stated because it was previously only implied:** the surfaces the rule
  covers are the branch name, the commit subject, the commit body, and the PR
  title plus body — a pushed branch is exactly as permanent as a commit and
  cannot be scrubbed once merged without a rename plus remote delete. The ID is
  minted in `docs/INCIDENT_RESPONSE.md` §6 (format in §6.1, register in §6.2)
  **before** the fix is committed; inventing one inside the commit message is
  fabrication, and a repo that mandates an ID with no producer invites exactly
  that. Detail belongs in the record the ID points at — §6.2, §8 below, and
  `docs/ARCHITECTURE_DECISION_RECORDS.md` — which name packages and advisories
  deliberately (as the existing ADR-0018 row and the `trivy` job comments in
  `.github/workflows/security.yml` already do). **Nothing machine-checks the
  citation:** zero `commit-msg` hooks in `.pre-commit-config.yaml` and zero
  commitlint references under `.github/workflows/`, measured 2026-10-06, so this
  stays review-gated like the commit format itself.
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

**Clocks.** Register dates are the operator's local date (`Europe/Vilnius`: UTC+3 in
summer, UTC+2 in winter). Anything cited from GitHub — API timestamps, Actions logs, a
PR's `mergedAt` — is UTC, so one instant can legitimately be written on two different
days: the #174 squash merge reads `2026-10-06T01:01:07+03:00` in `git log` and
`2026-10-05T22:01:07Z` in the API. **Say "UTC" explicitly whenever a timestamp is not
local.** Do not assume a container's offset either — measured at one instant on 2026-10-06,
this stack runs three: `dev-backend` `TZ=UTC` (from `.env` through `env_file`),
`prod-backend` `TZ=Europe/Vilnius`, `prod-nginx` with `TZ` unset defaulting to UTC. Correlating
one audit trail across those writers needs each writer's zone, not a guessed one.

| # | Status | Documented claim | Reality | Evidence |
|---|---|---|---|---|
| G1 | OPEN | Backend coverage ≥ 80% is **enforced in CI** | The gate is `--cov-fail-under=20`, with an in-file `TODO: raise threshold toward 80%`. Measured 24.57% without contract tests, **68.8%** with them. The ≥80% claim recurred in `docs/TESTING_STRATEGY.md` (three places, each reading "enforced in CI"), `docs/TESTING.md` §2 and `docs/GRANT_SUBMISSION.md:157` — the last an **external funding submission**. **The 80→20 downgrade was recorded in no ADR until 2026-10-05 — it is now ADR-0021**, unlike the `braces` dev-only acceptance, which was recorded as ADR-0018 (this cell previously ended mid-sentence at "which was" — repaired 2026-10-05). *Doc side corrected 2026-10-05 (t9):* `docs/TESTING_STRATEGY.md` §1 is now the single home of both figures, citing `.github/workflows/ci.yml:97` and `frontend/vitest.config.mts:55-60`, and the inventory counts were re-measured rather than inherited (41 backend unit+security, 121 contract, 267 Vitest tests across 22 files, 43 e2e `test()` declarations across 14 spec files) with the reproducing command beside each; `docs/TESTING.md` links instead of restating and no longer contradicts it (it claimed 164 tests and 7 spec files); four `FALSIFIED` entries make the false strings unrepeatable in any live-claim file; the `README.md:5` badge already stated the enforced 20% gate. Three neighbouring false claims in the same paragraphs went with them: the pipeline diagram sent Lighthouse, Playwright and a nonexistent bundle-size gate into the merge gate, and the file asserted that deploys are health-gated with migrations before traffic and a rollback tag. **ADR-0021 records the decision retroactively**, with both figures measured on this tree (24% without contract tests; **69%** with them — 3012 statements, 941 missed, 162 tests) and a ratchet rule: when CI's reported coverage exceeds the flag by ≥10 points, the PR that observes it raises the flag to measured − 5. **The gap stays OPEN:** the flag is still 20, the ratchet is already triggered (49 points of slack, so roughly 70% of the covered statements could be deleted and CI would still pass), and raising it is a configuration change on protected `main` belonging to the owner, not to a docs PR. `docs/GRANT_SUBMISSION.md` is **annotated, not edited** — it is the record of what was sent to a funder — so its ≥80% row still stands, with the divergence disclosed beneath it. **Flag raised 2026-10-06, ratchet applied:** `ci.yml:97` now runs `--cov-fail-under=63`. The value comes from CI's own reported figure (`Total coverage: 68.56%`, run `37476183729`) minus 5, which is what the rule says; ADR-0021's own text named **64**, derived from a local 69% measurement, and the arithmetic is recorded in that ADR rather than quietly following the older number. **The gap still stays OPEN:** 63% is not the ≥80% the documents originally claimed, the flag can only be enforced upward by whoever writes the tests, and a coverage floor makes deletion visible — it does not make any assertion meaningful. | CI backend step vs `docs/TESTING_STRATEGY.md` §1, `docs/TESTING.md` §2, `docs/GRANT_SUBMISSION.md:157`; `README.md:5` corrected; coverage measured locally 2026-10-05 with `pytest tests/unit tests/security tests/contract --cov=.` → TOTAL 3012 statements / 941 missed = 69%, and 24% for the unit+security subset; commits `0708bc5` (claims) and `58cccec` (ADR-0021) |
| G2 | OPEN | Per-path Code Owner review of `payments_app`, `compliance_app`, `settings/` | Single wildcard owner; zero teams; no independent review possible. **Worse than first recorded:** the protection API reports `require_code_owner_reviews: false` and `required_approving_review_count: 0`, so CODEOWNERS is not wired to branch protection at all — **inert, not merely coarse**. `enforce_admins: true`, so the operator cannot bypass required *checks*; there is simply no review requirement to bypass. *Doc side corrected 2026-10-05:* `CONTRIBUTING.md` no longer claims a forced second approver and `CODEOWNERS:2-3` no longer claims GitHub enforces the file. **The gap stays OPEN** — it needs the risk acceptance in queue item 7, not a doc edit. Do **not** close it by setting `required_approving_review_count: 1`: one operator cannot approve their own PR, so with `enforce_admins: true` that makes `main` unmergeable | `CODEOWNERS:1-9`; `gh api repos/jolarca-dev/jolarca/branches/main/protection` → `require_code_owner_reviews`, `required_approving_review_count`, `enforce_admins`, `dismiss_stale_reviews` (2026-10-05) |
| G3 | **CLOSED** 2026-10-04 | `make lint` checks ruff **and** prettier | The old recipe ended in `\|\| true` on a left-associative `A && B \|\| true` chain — **the target could not fail**, ruff errors included. Split into `lint-py` (`ruff check` + `ruff format --check`) and `lint-fe` (`npm run lint` + `npm run format:check`); `lint` runs both and each propagates its exit status | `Makefile → lint-py`, `lint-fe`, `lint` |
| G4 | OPEN | Playwright checkout journey is a CI gate | Job is `if: false` (disabled); when enabled it runs `smoke.spec.ts` only. *Advertising half corrected 2026-10-05:* `CONTRIBUTING.md` → *Quality gates* item 6 now states it is not a gate and warns against citing it as frontend coverage, and `docs/CHANGELOG.md` Sprint 8 records that the 45-scenario suite is not what the disabled job would run. **The gap stays OPEN** — the checkout journey is still untested in CI | `frontend-playwright-smoke` (`if: false`) vs `CONTRIBUTING.md` → *Quality gates* item 6 |
| G5 | OPEN | Lighthouse budgets enforced | Job is `if: false` (disabled). *Advertising half corrected 2026-10-05:* the `README.md:6` badge no longer claims "budgets enforced", and `docs/CHANGELOG.md` Sprint 7 now states the gate is off. **The gap stays OPEN** — the budgets are still measured nowhere; `frontend/scripts/lighthouse-budget.json` has no CI invoker | `frontend-lighthouse` (`if: false`); `README.md:6` and `docs/CHANGELOG.md` corrected |
| G6 | **CLOSED** 2026-10-03 | App isolation is automatically rejected in CI | Was true — no fitness test existed. Now gated by `backend/tests/unit/test_architecture_boundaries.py`: stripe/zeep containment, `core` layering, bitrix24 and ai_service_app isolation, no AI/CRM on the request path. Cross-app `models` imports are a shrink-only ratchet over 16 baselined pairs | `tests/unit/test_architecture_boundaries.py`, run by `make test` and the CI backend step |
| G7 | **CLOSED** 2026-10-03 | Contract tests are part of the suite | 14 files / 121 tests asserting the PCI SAQ-A Stripe boundary and PII non-leakage ran in **no** target and **no** job. Fixed: the `order` / `shipment` fixtures they requested **had never been written**, so ten tests errored; added them to `tests/conftest.py`, repaired a `OneToOne` reuse bug in `test_shipment_carrier_choices`, and fixed a deferred-FK assertion in `test_tracking_event_requires_shipment`. Joined `tests/contract` to CI via `make test-contract` | `Makefile → test-contract`, `tests/conftest.py`, CI backend test step |
| G8 | **CLOSED** 2026-10-05 | ADR registry is ADR-0001…0017 | ADR-0018 exists, so the range was stale. Fixed by **removing the volatile count from the README** rather than bumping 0017→0018: a hardcoded range over a registry that only grows drifts again on the next ADR, which is how this gap arose. `README.md:62` now reads "Consolidated ADR registry" with no range, leaving the registry file as sole authority. **Superseded in place 2026-10-05 (t9):** that README table no longer exists — it was replaced by a pointer to `docs/README.md`, whose registry row likewise names no range — so the cell this gap closed is gone while the remedy stands: the registry file is still the sole authority, and C4 now scans it directly. Verified ADR-0001…ADR-0018 all present | `README.md` doc table; `grep -oE 'ADR-[0-9]{4}' docs/ARCHITECTURE_DECISION_RECORDS.md \| sort -u` → 0001–0018 |
| G9 | **CLOSED** 2026-10-05 | CI badges render | Both badge image URLs and their link targets pointed at `journeyoflife-org/jolarca`; `origin` is `jolarca-dev/jolarca`, so both rendered as **broken images on the repository front page**. Corrected in place at `README.md:3-4` as a 1:1 line replacement, so the eight line-number citations into `README.md` — including `README.md:41` inside `test_architecture_boundaries.py`'s assertion messages — did not drift | `README.md:3-4`; `git remote -v` → `jolarca-dev/jolarca` |
| G10 | **CLOSED** 2026-10-03 | "Only `shipping_app` imports carrier SDKs. Only `ai_service_app` imports LLM SDKs." | Neither SDK class is a dependency (`pyproject.toml:11-29`). Docs corrected to state the real boundary: `Carrier` / `LLMProvider` protocols with clients confined to `shipping_app/carriers/` and `ai_service_app/providers/`, transport over `requests`. Carrier clients are unwired stubs raising `NotImplementedError`, handled at `shipping_app/services.py:87`. That boundary stays review-gated — `requests` is shared transport and cannot be confined | `CONTRIBUTING.md` → *Architecture rules*, `01-modular-breakdown.md` → *Vendor boundaries* |
| G11 | **CLOSED** 2026-10-04 | "`ruff check` clean (lint + format)" is a CI gate | `ruff check` does not verify formatting, and **no CI job ran `ruff format --check` or pre-commit** — Python formatting was enforced only by the local hook (per-machine, installed 2026-10-01, bypassable) while the frontend had a real gate. Added a "Format check (ruff format)" step to the CI backend job and corrected the doc claim. Verified the whole tree is format-clean at the CI-pinned ruff **0.16.6** | ci.yml backend job, `Makefile → lint-py`, `CONTRIBUTING.md` → *Quality gates* item 1 |
| G12 | **NEVER ISSUED** | — | **Numbering hole, recorded so the register's sequence stays auditable.** Rows run G1–G11 then G13–G21: no G12 has ever existed. Verified 2026-10-05 by `git grep -n 'G12'` across all tracked `.md`/`.yml`/`.py` — zero hits outside vendored `.venv` noise — and G12 appears in neither the register nor the "Closed:" summary. **Whether the number was skipped or an entry was later removed is not recoverable from the repository**, and this row deliberately does not guess: inventing a plausible G12 would be precisely the fabricated-record failure mode this register exists to prevent. Retired as never-issued. If the owner recalls a withdrawn finding, **amend this row** rather than reusing the number for new content | `git grep -n 'G12'` → 0 tracked hits; register sequence G11→G13 |
| G13 | **CLOSED** 2026-10-03 | A contract test asserts no live Stripe secret key is hardcoded "anywhere" | It shelled out to `grep` from a hardcoded developer-machine absolute path, so it could only ever pass on that one checkout (and would **error**, not fail, in CI), while scanning just `apps/` and `project/`. Rewritten to walk all `backend/**/*.py` in-process, with a non-empty-scan assertion so it cannot pass vacuously. Verified by mutation probe | `tests/contract/test_payments_api.py::TestStripeTestMode::test_no_live_keys_in_codebase` |
| G14 | **CLOSED** 2026-10-05 | A green local run means CI will be green | The local `.venv` had silently drifted from the pinned lock: `dev.txt` prescribes **ruff 0.16.6 / mypy 2.3.1 / Django 6.1.1 / DRF 3.18.1 / stripe 15.6.1**, the venv held **ruff 0.16.3 / mypy 2.3.0** and older runtime packages. Every local "pass" before that was corrected was measured against tools CI does not run. **Detector added 2026-10-05:** `scripts/check_toolchain.py` (`make check-toolchain`, run first in `make verify`) compares the interpreter's own `importlib.metadata` versions against the `backend/requirements/dev.txt` pins and fails on any stray `.venv`. The one known divergence source was removed the same day: `backend/.venv` held ruff 0.16.3 / mypy 2.3.0 / **django 5.2.17** against the pinned 0.16.6 / 2.3.1 / 6.1.1, and `.gitignore` matches `.venv/` **at any depth**, so it was invisible to `git status` and to every gate. Demonstrated non-vacuous by state flip: check-toolchain exited 1 with the stray present, 0 after removal, with all 86 parsed pins matching in both runs. `PY`/`PIP` no longer depend on `$(CURDIR)` (which rebinds under `make -C` and resolved to the stale venv when invoked from `backend/`); they derive from the Makefile's own location. **Residual, honestly scoped:** the detector runs only when invoked - it is not a pre-commit hook and not a CI step, because CI installs from the hash-pinned lock and so is correct by construction. It is therefore a local-trust repair, not an enforced gate. | `scripts/check_toolchain.py` (`make check-toolchain`, run first in `make verify`); the active interpreter's own `importlib.metadata` versions against the `backend/requirements/dev.txt` pins; state flip measured 2026-10-05 — exit **1** with the stray backend venv present (ruff 0.16.3 / mypy 2.3.0 / django 5.2.17 against pinned 0.16.6 / 2.3.1 / 6.1.1), exit **0** after its removal, with all 86 parsed pins matching in both runs; `make lint-py` and a CI step now cover `scripts/` (#171) |
| G15 | **CLOSED** 2026-10-05 | `make check-secrets` is a green gate | It **could not pass on any real checkout**. `check_no_secrets.sh` grepped the whole working tree, so it flagged the operator's own gitignored, untracked `.env.prod` — measured on `main`: `./.env.prod:30:STRIPE_SECRET_KEY=sk_test_…` → exit 1, while the identical CI step passed because CI never checks out gitignored files. **The root cause was a scope mismatch, not a pattern problem**: one command, two different measurement sets, which also broke the Makefile's own "CI uses the same targets (parity by design)" rule. Fixed by scanning what git carries (`git ls-files`, or `--staged` for the index), so local and CI now answer the identical question — "does git carry a credential?" — which is the only question this script can answer; history remains Gitleaks' job. Proven by four mutation cases, not by reading the diff: **(a)** passes on a real checkout where the old logic failed; **(b)** still FAILS on a planted `sk_test_…` and a planted `AKIA…` in both `all` and `--staged` modes, so the gate was repaired rather than silenced; **(c)** exits **2**, not 0, on an empty file set outside a git repo; **(d)** exits **2** on a tracked-but-unreadable file — the case the old `grep -rI` silently skipped and then reported "clean", i.e. the always-green defect G3 | `make check-secrets` before/after on `main`; planted-key probes; isolated-repo probes in `/tmp` for cases (c) and (d); `git ls-files` vs `git check-ignore --no-index` on `.env.prod` |
| G16 | **CLOSED** 2026-10-05 | The `prettier` pre-commit hook formats only what the project wants formatted | The hook ran prettier from the **repo root** while prettier resolves `.prettierignore` relative to **cwd**, so `frontend/.prettierignore`'s `src/generated` exclusion never applied and the hook **rewrote committed generated output**. Measured on `main` 2026-10-05: **1323 insertions / 1323 deletions** on `frontend/src/generated/api.ts`, and the hook **FAILED the commit** while doing it — the register recorded 134/134 at first sighting, so the drift had grown unobserved for two days. Fixed with `args: [--ignore-path, frontend/.prettierignore, --no-error-on-unmatched-pattern]`. **The second flag was necessary and was found only by testing**: `--ignore-path` alone leaves the generated client alone but exits 1 with `No files matching the given patterns were found` whenever every passed file is ignored — which would have broken precisely the `make api-schema` commits that touch only generated output. Verified on four cases: generated client untouched and Passed; all-ignored list Passed; a genuinely malformed `frontend/*.ts` **still fails and reformats** (gate repaired, not neutered); a mixed set formats only the real files | `pre-commit run prettier --files` before/after on `frontend/src/generated/api.ts`, `frontend/package-lock.json` + `frontend/messages/en.json`, a planted malformed file, and a mixed set; `frontend/.prettierignore` lines 9-13 |
| G17 | **CLOSED** 2026-10-05 | A red workflow means something broke | `Deploy Staging` failed on **every** push to `main` by design: the rollout step ran `exit 1` ("fail loudly until the deploy target is implemented — no silent no-ops", pending `docs/ASSUMPTIONS.md` §A-07). Verified 9/9 consecutive failures. The defect was **placement, not intent** — the step sits in a `deploy` job with `needs: build-and-push`, so it fired *after* the irreversible side effect: each merge already publishes `ghcr.io/.../{backend,frontend}:staging-<sha>`. A permanent red X is as unactionable as G3's permanent green one, and it hid genuine image-build failures behind the stub's own expected failure. **Fixed as a warning that exits 0 — but only together with three measures that stop the new green from lying**, because a bare `exit 0` would have swapped one false signal for a worse one: the job's display name is now `staging rollout - NOT IMPLEMENTED (stub, nothing deployed)` (GitHub renders that as the check line), the step emits `::warning title=Staging rollout not implemented::`, and it writes a `## No staging deployment performed` step summary stating the run "is evidence that images were built and attested, **not** evidence that anything was deployed". Both `environment:` declarations were also removed — see §8 **G26**, which is what made the red X load-bearing. Validated before merge: YAML parses with no job declaring an environment, and the step body was executed locally with `GITHUB_STEP_SUMMARY` set → exit **0**, warning on stdout, summary text captured. The **production** rollout step deliberately still runs `exit 1`: it pushes `:latest`, and a green production run would read as a release that never happened (it has also never run — no `v*` tags). Not a required check before or after, so nothing about merge protection changed | `.github/workflows/deploy-staging.yml`; local YAML + step-execution probe; `gh run list --workflow 'Deploy Staging'` (3/3 `failure` before); protection API contexts list (deploy jobs absent) |
| G18 | OPEN | Production deploys require a manual approval gate | Asserted in a code comment (`deploy-production.yml:14`: "REQUIRED: manual approval gate before any prod action") but **absent in configuration**: the GitHub API reports exactly one environment, `staging`, with `protection_rules: []` and `deployment_branch_policy: null`; **no `production` environment exists at all**. Tagging `v*` would therefore auto-create it unprotected and push `:latest` production images plus SBOM/provenance with **no human approval**, and only then fail on the stub `exit 1`. **Weaker than it looks even if configured**: `can_admins_bypass` defaults to `true` and the sole developer is the org owner, so an environment approval here is self-grantable — it satisfies the letter of SOC 2 CC8.1 without any independent sign-off (same root as G2). **Latent, not current**: `git ls-remote --tags` returns no `v*` tags, so this workflow has never run. Note the comment reads as verified evidence and is not — the register's core failure mode | `deploy-production.yml:12-14,42-54` vs `gh api repos/.../environments` and `/orgs/jolarca-dev` (`free` plan; repo is public, so protection rules are available). **In-repo half landed 2026-10-06** (incident `JOL-PROC-20261006-03`): the publish no longer precedes the admission — a `refuse-publish` job fails first, `build-and-push` now `needs:` it and declares no environment, and the mutable `:latest` tag is removed, leaving per-release immutable tags only. Verified by parsing the workflow and executing the guard step body: job order `refuse-publish → build-and-push → deploy`, `environment` present on `deploy` only, **two** pushed tag lines both suffixed `${{ github.ref_name }}` and none ending `:latest`, guard exit **1** with `::error::` on stdout. The first `:latest` assertion written here was **vacuous** — it matched tag lines with `^\s+ghcr\.io/` against *stripped* lines, so it saw an empty list and passed; corrected to match the stripped lines themselves, where the list renders as two. A control that can only pass is the G3 class, caught in the probe rather than the config. **The `deploy-production.yml:12-14,42-54` citations above are superseded by this note, not renumbered** — the file grew and the jobs are now cited by name, the drift §8 G21 warns about. **G18 stays OPEN:** the approval gate itself is a platform object that does not exist, and an environment a sole org owner can self-approve is not independent sign-off |
| G19 | OPEN | Dependency updates reach `main` | **20** dependabot PRs were open early on 2026-10-04 with **none merged**; **11** remained at the end of that day — #125 is **merged**, and dependabot superseded the rest of the singles on its own. Three failure causes were then separated by measurement rather than assumed. (a) **Fan-out:** `.github/dependabot.yml` had no `groups:` key, so each weekly cycle opens one PR per package. (b) **Peer-drop and coupled families — two distinct failure causes, initially conflated by me.** Taking #125 as the probe: `gh pr update-branch 125` merged `main` into the branch, after which `backend` went **fail → pass (1m59s)**, so that failure genuinely was staleness. The four `frontend-*` jobs failed **identically before and after** — `npm ci` EUSAGE "Missing: `@swc/helpers@0.5.23` from lock file", dying in 7–9 s. Reproduced locally against #125's own `package.json` + `package-lock.json` (no CI involved): `npm ci --dry-run` exits 1. Dependabot's own lock edit drops a required entry, and updating the branch does not restore it — the precise mechanism is given below, and it is **not** the one this entry first stated. All **9** open npm branches were then triaged locally — for each, its own `package.json` + `package-lock.json` into a throwaway dir and `npm ci --dry-run`: **8 DEFECT (5 peer-drop, 3 `ERESOLVE`), 1 OK**. **Staleness is not the cause at all:** every branch measured `behind=0`, i.e. already current with `main`. The real mechanism is narrower than it looked — the dropped entry is `node_modules/next-intl/node_modules/@swc/helpers@0.5.23`, declared **`"optional": true, "peer": true`**. Dependabot's lock edit omits optional peers; `npm ci` still requires them for sync, so it reports `Missing`. (A `jq` scan of `.dependencies` finds no referencer, which is how this entry first mislabelled the entry an orphan — peers live in a different field.) Two further claims of mine were falsified by the same run: that regenerating `main`'s lock would prune the orphan (`npm install --package-lock-only` on `main` returned *up to date* and produced a **byte-identical** lock, 0 lines changed), and that `next@15.5.26` demanded `0.5.23` (it pins `0.5.15`; the hoisted entry is untouched throughout). **The repair is proven and minimal:** running `npm install --package-lock-only` on the branch re-inserts that one block — 11 lines added, 0 removed, **no package version moves** (`dompurify` holds the bumped 3.4.16; `next`, `next-intl`, `@stripe/*`, `vitest` unchanged) — `npm ci --dry-run` then exits 0, and pushing it flipped `frontend-lint`/`typecheck`/`openapi-drift` from fail to **pass**; #125 was merged on that basis, so `main` now carries `dompurify` **3.4.16** and `npm ci --dry-run` there exits 0. A second, unrelated cause accounts for the other three defects: they are **coupled families split into single-package PRs**, each individually unsatisfiable. Measured, not inferred — `vitest-5.0.3` dies on `ERESOLVE: While resolving: @vitest/coverage-v8@4.1.10 / Found: vitest@5.0.3` (mirrored for `coverage-v8-5.0.3`), and `eslint-10.11.0` dies on `ERESOLVE: While resolving: eslint-config-next@15.5.23 / Found: eslint@10.11.0`. Because `eslint-config-next` is peer-coupled to **both** `next` and `eslint`, the toolchain is a ring: a `next` group and an `eslint` group would each still be unsatisfiable alone, so they are one `next-toolchain` group. Both families are now grouped **with** majors, disjointly, and excluded from the catch-all. Minor/patch grouping can never rescue them — my first version of this fix split `next` from `eslint` and was wrong until the `eslint` branch was measured. **Correction to this entry:** its first revision asserted every sampled red signal was a staleness artifact and cited `frontend/package-lock.json:2655` as proof. That citation supported a different version than the error named — it is `@swc/helpers@0.5.15`, not `0.5.23` — and the blanket conclusion was falsified by re-running #125. Kept visible so the register does not perpetuate the error, and it is the same class of mistake G18 records: a claim that reads as verified but was not. **Volatile count — do not quote a bare number:** a re-check ~40 minutes later found 14 dependabot PRs, with #107–#113 closing **unmerged** at 2026-10-03T23:24–23:30Z, immediately after `groups:` landed in #134. **State after #146 (2026-10-04, verified the next day):** dependabot consumed the config and group PRs exist per family — #150 npm catch-all, #144 pip, #148 `vitest`, #149 `next-toolchain`. **#149 appeared to validate the ring:** it moved `next` 15.5.26 → **16.3.8** alongside `eslint` and `eslint-config-next`, its lock was locally consistent, and its only red was one `frontend-lint` failure, which this entry called "a genuine, actionable signal." **That characterisation was wrong and is retracted below** — the "lint failure" was `eslint` 10 failing to *load* the react plugin, i.e. a crash, not a rule violation: structural noise wearing a lint label. **This gap stays OPEN because the peer drop recurs:** #148 and #150 were generated *after* four branches were repaired and already measure `swc0.5.23=0`, so the 11-line repair is a **per-PR weekly tax, not a fix**. Two questions are deliberately left unanswered rather than guessed: whether the optional peer is required at all at a newer `next-intl` (the only datum, #136 at 4.14.8, is inconclusive because dependabot had already dropped the entry there), and whether grouping actually resolves the vitest `ERESOLVE` (#148 dies on the peer drop before `npm ci` can reach the peer conflict). **One more correction of mine:** #144 was reported as the npm group PR; it is `dependabot/pip/…`, and the npm group PR that was repaired is **#136**, since closed and superseded by #150. The four ring singles this entry told the operator to close (#137, #138, #140, #142, plus #141) were **already closed by dependabot**, so no `close` was run — claiming that action would have been theatre. Counts here are date-stamped for exactly this reason: 20 → 14 → 11 inside one day. Record dates and mechanism, never a bare tally. **Superseded pointers after #152 and #156 (2026-10-04):** the group PRs named above (#148, #149) no longer exist — dependabot closed them when the `update-types` split landed and re-raised **#153** (`vitest-major`, 2 updates), **#154** (`next-toolchain-major`, 3 updates), **#155** (`next-toolchain-patch`) and **#150** (npm catch-all, 10 updates). #154 and #155 confirm both routes work as designed; #153 is still red on this gap's peer drop, which is why G19 remains OPEN. G20's advisory is closed — see that row — so the remaining risk here is throughput, not exposure. **Ring premise corrected (2026-10-04, later same day):** #152 claimed that because `eslint-config-next` peers both `next` and `eslint`, all three majors must rise together. A peer range is a **ceiling**, not a licence to raise both — `eslint-config-next@16` vendors `eslint-plugin-react@7.37.5` (peers `^3 … ^9.7`) and ESLint 10 removed `context.getFilename()`, so that composition cannot load a config at all: `Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function`, measured on #154. That PR is therefore permanently unbuildable; `next-toolchain-major` now lists only the version-locked pair, `eslint`/`@eslint/*` majors are `ignore:`d under a stated revisit trigger, and `scripts/check_dependabot_groups.py` asserts the relation (grouped-and-ignored, grouped-only and grouped-nowhere each fail, with a control case so a checker that only ever errors is caught too). **The cure itself is measured:** `next` + `eslint-config-next` 16.3.8 with `eslint` at 9.39.5 yields `peer: true` entries **1 → 0**, so the nested entry dependabot deletes no longer exists — but it is unmerged pending the `eslint-plugin-react-hooks` 7 decision in queue item 3(2), which is why this gap stays OPEN and the 11-line repair remains the operative control, now codified as `scripts/repair-dependabot-lock.sh` — self-testing, worktree-isolated, push-refusing on any version move, and dry-run verified on #150/#153/#155 (each exactly 11 lines added, 0 removed) | `.github/dependabot.yml`, `gh pr update-branch 125`, `gh pr checks 125`, `gh run view --log-failed --job 111316504982`, local `npm ci --dry-run` per branch for all 9 open npm PRs, `jq` inspection of the lock's `packages` tree, repair commit `b2f5bc6` on the dompurify branch, `#125` squash `25ee444` on `main` with `dompurify` 3.4.16 + `npm ci --dry-run` exit 0 + CI and Security runs `success` on that SHA, `gh pr list --state all` for the #136–#150 dispositions, re-triage of #148/#149/#150 (only #149 OK, `next` 16.3.8) |
| G20 | **CLOSED** 2026-10-04 | A published advisory is patched promptly | **Two alerts sat on the default branch at registration, both one advisory:** `GHSA-82fw-gwwq-j7x9` / **CVE-2026-84373** — "Vitest: Path Traversal / Arbitrary File Read via `@vitest/mocker` Redirect Mock", **medium, CVSS 5.9**, reported against `vitest` and `@vitest/mocker` in `frontend/package-lock.json`, **open since 2026-09-09 (25 days)** with `fixed_at: null` **at that time** and never updated. `main` carries **4.1.10**; the advisory's vulnerable range is `>= 2.1.0, < 4.1.11` and `first_patched_version` is **4.1.11** — so the fix is a **patch bump inside the current major**, not the 5.x major dependabot kept proposing. The gap is self-inflicted and recent: #146 routed `vitest` + `@vitest/*` into a single group **including** `major` (to kill the permanently-red `ERESOLVE` singles), but a group PR is **atomic**, so the security patch now arrives only as part of the major-bump PR — #148, which is red on G19's peer drop and is exactly the PR this repo cannot merge casually. **A control that makes a CVE wait on a major is worse than the noise it removed.** Fix: split the family into two groups differing only in `update-types` — one `minor`+`patch` (so 4.1.11 lands alone and promptly), one `major` (so the coupled 5.x move still resolves atomically); apply the same split to `next-toolchain`, whose patch fixes are hostage to the same mechanism. Note what this entry corrects — and then got wrong itself: it first claimed `dompurify` was the live exposure, then "corrected" that to "`dompurify` has no open alert; it was a hardening bump with no advisory outstanding on `main`." **Both framings were off.** Alert #37 reads `state=fixed`, `fixed_at=2026-10-04T12:06:39Z` — the moment #125 merged — so #125 *was* an advisory fix. The accurate statement is narrower than the one first written: at the time of the query it had no *open* alert precisely because #125 had already closed it. Recorded as its own lesson: a `state=open` query answers "what is outstanding now", not "was there ever an advisory", and this register drew the stronger conclusion from the weaker evidence. **Closure (2026-10-04).** Fixed by #156: `vitest` and `@vitest/coverage-v8` raised to **4.1.11** with the declared ranges moved to `^4.1.11`, so a clean install cannot resolve back below the fix. `main` @ `bd32d73` reports **0 open alerts**, and the two vitest alerts close as #27 (`@vitest/mocker`) and #28 (`vitest`): `state=fixed`, `fixed_at=2026-10-04T14:22:13Z`, `dismissed_at=null`, `reason=null` — closed by the version fix, not by dismissal or auto-dismissal, which is the only closure that counts as ISO 27001 A.8.32 evidence. The structural cause went with it: #152 split each family into `-major` and `-patch` groups differing only in `update-types`, and dependabot's next evaluation produced **#155 `next-toolchain-patch`** (`@eslint/eslintrc 3.3.6 → 3.3.7`) — direct proof that a patch can now arrive without waiting on a major. Exposure window: opened 2026-09-09, closed 2026-10-04, **25 days**. What remains open is **G19**, not this: the optional-peer drop still reddens freshly generated group PRs (#153 `vitest-major` fails all four `frontend-*` jobs), and whether grouping resolved the vitest `ERESOLVE` is still unknown, because the peer drop kills `npm ci` before it reaches the peer conflict. | `gh api /repos/.../dependabot/alerts?state=open` (2 records, `security_advisory.severity=medium`, `cvss.score=5.9`, `created_at=2026-09-09T13:21:48Z`, `fixed_at=null`), `security_vulnerability.vulnerable_version_range` `>= 2.1.0, < 4.1.11`, `first_patched_version=4.1.11`, `jq` on `frontend/package-lock.json` (both packages at 4.1.10), `gh run view --log-failed --job 111456665230` (#154 plugin load failure), `npm view eslint-config-next@16.3.8 peerDependencies` and `npm view eslint-plugin-react peerDependencies.eslint`, and a local `chore/next-16-flat-config` tree where `jq` reports `peer: true` = 0 with `npm ci`, `tsc`, 267 tests, `next build` and prettier all exit 0, `.github/dependabot.yml` `groups.vitest.update-types` as shipped in #146, re-queried `dependabot/alerts`: `state=open` → **0**, `state=closed` → #27 and #28 `state=fixed fixed_at=2026-10-04T14:22:13Z dismissed_at=null reason=null`, #37 `dompurify state=fixed fixed_at=2026-10-04T12:06:39Z`; `main` @ `bd32d73` lock at 4.1.11 with CI and Security both `success`; `gh pr view 155` for the patch-route PR |
| G21 | OPEN | `CONTRIBUTING.md:55` — “**Quality gates**” (`:52` until the 2026-10-05 t9 edits moved it; before that `:39`, “Quality gates (all enforced in CI)”) | The gate that verifies the **shipped bundle** is neither required nor independent. `frontend/scripts/verify-standalone.mjs` — the only check that boots the production `server.js` and asserts a real stylesheet is served — has exactly **one** invoker: the "Standalone server CSS verification" step of the `frontend-build` job. Two properties then mask it. **(1)** `frontend-build` is **not** among the required contexts — **eleven** since 2026-10-05, when §8 G22 added `frontend-unit` and `frontend-openapi-drift` but not this job — so it may fail or be skipped and `main` still accepts the merge. **(2)** It `needs: [frontend-typecheck, frontend-lint, frontend-unit]`, so a **lint** failure suppressed the runtime check entirely, though the two signals are unrelated. **Decoupled 2026-10-06: the job now needs only `frontend-typecheck` and `frontend-unit`, with that reason stated inline at the `needs:` line in `.github/workflows/ci.yml`.** Measured reason it mattered: on 2026-10-06, four of fifteen open PRs reported `build=skipping` — #150, #153, #155 and **#161**, the Next-16 toolchain upgrade — and on **#161** `frontend-lint` was the **only** failing context, so CI could not answer whether the v16 bundle builds or boots while the backlog's central question was exactly that. Live on 2026-10-04: PR **#161** reports `fail frontend-lint` with `skipping frontend-build` while every other job passes. Consequence: a PR whose only real defect is bundle wiring looks identical to one with a trivial style violation, and the white-screen guard can go unexecuted on merged code. A latent second instance, now fixed by **#162**: the pre-#162 guard matched only `/_next/static/css/*.css`, while Next 16 emits `/_next/static/chunks/*.css`, so it would have failed **closed on a healthy v16 build** — shown by running both selector implementations against fixtures for each layout, where the old one finds nothing on v16 and the new one finds the sheet on v15 *and* v16 while still finding nothing on a genuinely stylesheet-less page (so the hardening did not disarm it). **Fix 1 of 2 applied 2026-10-06** (the `needs:` decoupling). **Fix 2 is not: `frontend-build` is still absent from the required contexts** — re-measured `strict: false`, 11 contexts, `frontend-build` not among them. The order is load-bearing, because a **skipped** job reports `skipping`, not `failure`, and GitHub counts a required context in that state as satisfied — documented Actions behaviour, **not measured on this repo**, and it is the reason the two fixes are sequenced rather than shipped together: had the context been added while `frontend-lint` was still in `needs:`, those four lint-red PRs would have shown a green-looking bundle guard that provably never ran. **Fix 2 is held for the owner deliberately, not by omission:** `frontend-build` carries one demonstrated non-reproducible failure on `main` — `0ee87ff`, a docs-only commit (`QODER.md` + `scripts/check_doc_claims.py`), failed the webpack step with `TypeError: Cannot read properties of null (reading '1')` even though its `frontend/` tree hash is byte-identical (`30572a05…`) to the green run immediately before it and the lock carried the same two `@swc/helpers` entries; the five later `main` runs are green. Requiring a job with that profile turns a runner flake into a blocked merge — survivable by re-running, but it must be a knowing trade-off. Until fix 2 lands, **a green PR is not evidence that the bundle serves CSS** | the `frontend-build` job block in `.github/workflows/ci.yml` (its `needs:` line and the `Standalone server CSS verification` step — deliberately cited by symbol, not by line number, because `7da7dbb` and `a5bb9c8` shifted this file on 2026-10-05 and this row's earlier `ci.yml:172` citation had silently become a bare `with:`); `grep -rn verify-standalone` over `.github/`, `Makefile`, `frontend/Dockerfile`, `frontend/package.json`, `scripts/`, `.pre-commit-config.yaml` → one hit; `gh api repos/.../branches/main/protection` (contexts list, `frontend-build` absent, `strict: false`); `gh pr checks <n>` over all 15 open PRs on 2026-10-06 (`build=skipping` on #150/#153/#155/#161); `gh run view 37244404277` (step list: build step `failure`, guard `skipped`; log: webpack `TypeError … reading '1'`); `git rev-parse 0ee87ff:frontend` == `7da7dbb:frontend` == `30572a05…`; fix 2 still pending as of 2026-10-06 — re-measured 11 required contexts, `frontend-build` not among them, `strict=false` (G36) — while the decoupling itself is on `main` as `726b4ad`, where it proved itself the first time lint actually failed: on #161's refreshed head `frontend-lint` reported failure and `frontend-build` reported success, where the old coupling would have skipped it. That is the exact masking this row was written about. |
| G22 | **CLOSED** 2026-10-05 | A failing frontend test, or a drifted API contract, blocks the merge | **Neither did.** The required-context list held exactly **nine** entries — `backend`, `secrets`, `frontend-typecheck`, `frontend-lint`, `gitleaks`, `trivy`, `codeql`, `dependency-audit`, `docker-scan` — while `ci.yml` also defines `frontend-unit` (the whole Vitest suite at 80% thresholds) and `frontend-openapi-drift` (the backend↔frontend contract). Both **ran on every PR and blocked nothing**, so `main` could accept a merge with every frontend test red, or with a hand-edited `openapi.yaml`. That second case silently falsified `README.md:42` ("hand-edits fail CI (drift gate)") — a claim that became true only as of this fix. **Not previously registered:** G21 covers `frontend-build` alone, and Part V's tables marked both jobs "ENFORCED", which under this file's own tier definition means *the job fails the build* — true — while a reader would take it to mean *the merge is blocked* — false. Part V now states the distinction explicitly. **Fixed** by adding both contexts, preserving `strict: false` and all nine originals (→ eleven), verified by re-reading the API. Pre-checked green across the **last five** `main` CI runs so the change could not deadlock pending merges; neither job has a `needs:` or an `if:`, so both always run and cannot be skipped into permanent-pending | `gh api .../branches/main/protection/required_status_checks` before (9 contexts) and after (11, `strict: false`); `ci.yml` job ids `frontend-unit`, `frontend-openapi-drift`; `gh run view <id> --json jobs` × 5 main runs, both `success`; `README.md:42` |
| G23 | OPEN | The repository is consistently named `jolarca` | **The `JOL Marketplace` → `jolarca` rename is incomplete, and no ADR records it.** Verified 2026-10-05: `grep -niE 'rename\|rebrand\|JOL-RENAME'` across `ARCHITECTURE_DECISION_RECORDS.md`, `TECH_DECISIONS.md`, `ASSUMPTIONS.md` and both changelogs → **0 hits**, so an identity change reaching the public API title, transactional email and order numbering was executed with no decision record. Current split: `README.md:1` and this file say `jolarca`, while **46 tracked files still carry `JOL Marketplace`** (measured 2026-10-05, `git grep -lI 'JOL Marketplace'`: 17 `frontend/`, 14 `docs/`, 2 `backend/`, 13 root/`nginx`/`scripts`). `backend/project/settings/base.py:167` sets the OpenAPI `TITLE` to `"JOL Marketplace API"` (propagated into generated `docs/api/openapi.yaml:3` and the frontend client), and `backend/apps/users_app/tasks.py:16` sends real users an email subjectlined `"Welcome to JOL Marketplace"`. **The residual class is the live consumer brand, not stale documentation** — it includes `frontend/src/app/layout.tsx:123` (HTML `<title>` default *and* template), `frontend/src/app/manifest.ts:10` (PWA manifest name), `frontend/src/app/[locale]/page.tsx:49,72` (SEO `siteName` + JSON-LD), `frontend/src/components/site-footer.tsx:13` (visible footer) and `frontend/messages/{en,et,lt,lv}.json`, one of which carries the copyright line `"© 2026 JOL Marketplace. All rights reserved."` `frontend/e2e/seo.spec.ts:114` asserts the manifest name — and because `frontend-playwright-smoke` is `if: false` (§8 G4), **CI would not catch that assertion breaking**. An infrastructure rename *was* executed 2026-08-31 (incident `JOL-RENAME-20260831-01`, PR #20: packages, compose project/images, DB and bucket names, host paths, fallback URLs) but recorded in no ADR, so its scope boundary was never written down and the branding layer it left behind cannot be distinguished from an oversight. **Finishing this naively breaks production two independent ways, which is why it is registered rather than fixed in a docs PR.** (1) Order numbers are **persisted data**: `orders_app/services.py:58` derives the next sequence from `filter(number__startswith="JOL-<year>-")`, so renaming the prefix makes that filter match **zero existing rows**, `seq` resets to `offset`, and the first new order collides with a `unique=True` number — **a 500 on the checkout money path**, the exact failure the function's own docstring warns about; `migrations/0001_initial.py:42` also encodes the format in a shipped migration that must never be edited. (2) `X-JOL-Caller` / `-Timestamp` / `-Signature` are **HMAC wire-protocol header constants** (`payments_app/internal_auth.py:40-42`, `internal_forward.py:78-79`), not branding — renaming them breaks internal payment auth and signed per-product webhook forwarding for every caller. A third class must be **kept, not renamed**: `.env.example:33`, `docker-compose.dev.yml:5,26` and `.sops.yaml:1` reference the sibling **JOL Church / jol-hub** platform that shares the host. **Correction to this row (2026-10-05, same session).** This entry first called local branch `chore/rename-jolarca` (`714ac91`, incident `JOL-RENAME-20260831-01`) an *unmerged* branch and a clobber landmine. **That was false and is retracted.** PR **#20** merged that exact head OID — its `headRefOid` is `714ac91c1b04536b62863d53da2dcbc4b92ffd5a`, byte-identical to the local tip — on **2026-08-31T20:41:23Z**, and the resulting commit `7d4f60e2` **is an ancestor of `main`** (`git merge-base --is-ancestor` exit 0). The 46-file `git diff main <branch>` that appeared to prove divergence is a **two-dot** diff: it reports main's *subsequent* work as deletions on the branch side, so it is not evidence of unmerged content at all. The branch is an ordinary stale merged branch, prunable with an undo anchor, and **not** a hazard. Recorded rather than silently edited because it is this register's own core failure mode (see G18): a claim that read as verified and was not. **The rest of this row is unaffected** — the branding split, the absent ADR, and both production hazards were each verified directly against the working tree and the GitHub API, never against that branch. **Remedy — now recorded as ADR-0019 (2026-10-05).** The freeze-map is **accepted**: `X-JOL-*` wire-protocol headers, the persisted `JOL-<year>-` order prefix, the shipped migration's `help_text`, and the sibling `jol-hub` / JOL Church references are **frozen permanently** and excluded from any future rename; no global `sed` is permitted. **The consumer-brand rename is DEFERRED to the owner and deliberately NOT executed.** *Retraction of the advice that produced this row:* it originally recommended executing the RENAME class once an ADR existed, on the belief that the class was ~25 document titles plus two code sites. Measured, it is **46 files including a copyright notice in four languages, the HTML `<title>`, JSON-LD and the PWA manifest** — a legal, SEO and i18n decision, not a hygiene task. Executing it would also have broken `frontend/e2e/seo.spec.ts:114` **silently**, since the job that runs it is disabled. It is entirely possible `jolarca` is the repository identity while `JOL Marketplace` remains the intended consumer brand; nothing in the repository says which is authoritative, and **the ambiguity is the defect, not necessarily the divergence**. Queue item 10 gives the sequence to follow if the owner decides to rename | `git grep -nI 'JOL'` over tracked files; `orders_app/services.py:53-62`; `payments_app/internal_auth.py:40-42`; `internal_forward.py:78-79`; `settings/base.py:167`; `docs/api/openapi.yaml:3`; `users_app/tasks.py:16`; `migrations/0001_initial.py:42`; `git diff --name-only main chore/rename-jolarca`; ADR/decision grep → 0 hits |
| G24 | **CLOSED** 2026-10-05 | Four controls asserted in contributor-facing documentation | **None of the four existed.** **(a)** `CONTRIBUTING.md:20` headed Conventional Commits "(**enforced**; CHANGELOG is generated from these)" and this file's §Part VII tiered it **ENFORCED** — no `commit-msg` hook is installed (the five pre-commit repos are pre-commit-hooks, ruff, ruff-format, gitleaks, prettier) and no commitlint runs in any workflow, so it contradicted this file's own tier definition at *Enforcement tiers*. **(b)** The same line here, plus `docs/CHANGELOG.md:3-5,127`, called `CHANGELOG.md` machine-generated — **no generator is wired to any make target or workflow**, and the file is a 14-line scaffold stub (it had grown to 26 lines by the commit that recorded this row, and was still 26 when it was deleted) while `main` carries ~164 merged PRs — **that count was wrong and is corrected here: `main` carries 75 merged PRs**, with 83 closed unmerged and 16 open, highest PR number 174. Measured 2026-10-06 by two independent methods that agree: paged `pulls?state=all` counted where `merged_at` is non-null, and the first-parent log of `main` counted commits ending in a `(#NN)` reference. ~164 was the highest PR *number* read as a merged count — the bare-tally error this file's own G19 warns against. Compounded: because §3 and `CONTRIBUTING.md` also listed it as never-hand-edit, the release history could not be recorded by **any** sanctioned route. **(c)** `CONTRIBUTING.md:81` and §Part VI claimed "PRs that edit `requirements/*.txt` directly are **rejected by CI**" — no such guard exists; the only `requirements` references in any workflow are `pip install --require-hashes` and `pip-audit`. **The most dangerous of the four**, being the claimed protection for the hash-pinned supply chain that G14 and G19 both depend on. **(d)** Both never-hand-edit lists pointed at `frontend/src/lib/api/generated/` — **a path that does not exist**; the real client is `frontend/src/generated/api.ts` (1 tracked file), which `README.md:42` cited correctly. Same rule in three places, correct in one: the duplication-drift mechanism behind G1. All four corrected at source, §Part VII retiered to **REVIEW-GATED**, and `CHANGELOG.md` removed from both never-hand-edit lists with a note on why. **(b) is corrected, not solved** — the changelog is still a stub; backfill it or delete it | `.pre-commit-config.yaml` (5 repos, no `commit-msg`); `grep -rniE 'commitlint\|commit-msg\|conventional'` over `.github/`, `scripts/`, `frontend/package.json`, `backend/pyproject.toml` → 0; same for `changelog` → 0; `grep -n requirements .github/workflows/*.yml` → install + `pip-audit` only; `ls frontend/src/lib/api/generated` → no such directory; `git ls-files 'frontend/src/generated/*'` → `api.ts` |
| G25 | **CLOSED** 2026-10-05 | `scripts/` tooling is linted and format-checked like the rest of the repo | **No CI gate looks at `scripts/*.py`.** `make lint-py` is `cd backend && ruff check . && ruff format --check .`, and the CI backend job's "Lint (ruff)" and "Format check (ruff format)" steps both run under `working-directory: backend` — so `scripts/` is outside both. The pre-commit `ruff` and `ruff-format` hooks carry **no `files:` filter**, so they *do* cover it. Net effect: **local commits and CI enforce different trees**, the same local↔CI scope asymmetry as G11 and G15. Measured 2026-10-05: `ruff check scripts/` → **10 errors, 9 auto-fixable**, all pre-existing (e.g. `seed_data.py:32` imports `User` for side effects); `ruff format --check scripts/` → clean. Consequence: a quality **gate** living in `scripts/` — including `check_doc_claims.py` (this PR) and `check_dependabot_groups.py` / `repair-dependabot-lock.sh` (#164) — can accumulate lint debt, or even a formatting regression that blocks every local commit while CI stays green forever. **Deliberately not widened here:** pointing `lint-py` at `scripts/` would fail immediately on those 10 pre-existing violations, mixing an unrelated cleanup into a gate-integrity PR (§3 — mention, don't fix). Two clean fixes: burn down the 10 then widen the target, or add a `lint-tools` target that CI runs and make it a required context. | `Makefile → lint-py`; `ci.yml` backend job `working-directory: backend` + its two ruff steps; `.pre-commit-config.yaml:13-18` (no `files:` filter); `ruff check scripts/` → 10 errors; `ruff format --check scripts/` → 3 files clean. **Closed 2026-10-05** by #171 plus the single-rule-set follow-up: root `ruff.toml` was added and `lint-py` + a CI step now cover `scripts/`; `backend/pyproject.toml` no longer declares its own `line-length`/`target-version`/`select`/`ignore` but inherits them with `extend = "../ruff.toml"`, adding only `DJ`, `S311` and the Django per-file ignores — so the 100-vs-88 disagreement cannot come back. Measured, not assumed: `ruff check`+`ruff format --check` clean over `backend/` (153 files) and `scripts/` (4 files); the one finding the shared set surfaced in `backend/` was real (`EXE001`, `manage.py` had a shebang without the exec bit) and was fixed by setting the bit |
| G26 | OPEN | The GitHub environment deployment log is "audit log of every deploy (SOC 2 CC8.1)" | **It recorded ~58 deployments that never happened.** Both jobs in `deploy-staging.yml` declared `environment: staging`, and GitHub creates a *deployment* object plus a status for any job that declares an environment. Measured 2026-10-05 on `main`: **111 deployment objects** on the `staging` environment, exactly **2 per merged SHA across 58 distinct SHAs**, and of the 12 most recent **6 carry a `success` status and 6 a `failure`** — the split is mechanical: `build-and-push` always succeeds and posts `success`, the stub `deploy` always failed and posted `failure`. So the environment history asserted a **successful staging deployment on every merge** while no staging target existed (`ASSUMPTIONS.md` §A-07 UNDECIDED) — and the workflow comment cited that very log as SOC 2 CC8.1 evidence. This is the runtime twin of the false claims §8 G24 recorded in prose, and it is why G17's red X could not simply be deleted: it was the only marker distinguishing the honest job from the fabricated one. **Partly fixed 2026-10-05:** neither job declares an environment any more, so no *new* false records are produced. **Not fixed and not fixable in place:** GitHub deployment records cannot be deleted, so the ~58 false `success` entries remain permanent, externally visible evidence on the repository. **Residual remediation required — DONE 2026-10-05:** `docs/COMPLIANCE_MATRIX.md:24` had mapped ISO **A.5.15** / SOC 2 **CC6.2** to "CODEOWNERS + environment approval gates on deploys" — **both halves of that evidence do not exist** (CODEOWNERS is inert per G2; no approval gate exists per G18/G26). That row is where an auditor will look, and it must be corrected, but not as a silent one-liner: removing a claimed control from a compliance matrix should be paired with the ADR-plus-`docs/SECURITY.md`-row risk-acceptance pattern already used for ADR-0018, so the disclosure and the compensating control land together. Also state plainly wherever deployment evidence is cited that environment deployment history predating 2026-10-05 is generated by a **build** job and is **not** evidence of any deployment; the real controls are the container registry plus `git log`. `deploy-production.yml`'s "REQUIRED: manual approval gate" comment **is** corrected (it now states the `environment:` line is not an approval gate), but both jobs still declare `environment: production`, which is what creates the environment and its deployment records on the first `v*` tag — see G18, still open | `gh api .../deployments?environment=staging --paginate` (111 objects, 58 distinct SHAs, 2 per SHA); `.../deployments/<id>/statuses` (6 success / 6 failure of last 12); `gh api .../environments` (only `staging`, `protection_rules: []`, `can_admins_bypass: true`); `deploy-staging.yml` before/after; `docs/ASSUMPTIONS.md` §A-07 |
| G27 | OPEN | One ADR registry, and every id in it has a record | **The registry was split across two files and three ids had no record at all.** Measured on `main` @ `fc216de`: `## ADR-0001` through `## ADR-0007` lived in `docs/TECH_DECISIONS.md` while `## ADR-0011` through `## ADR-0020` lived in `docs/ARCHITECTURE_DECISION_RECORDS.md`, and `grep -oE '^## ADR-[0-9]{4}' docs/*.md` returned **no heading for ADR-0008, 0009 or 0010** — their titles existed only in the overview table. **That framing understated the finding, and one measurement supporting it was fabricated — corrected here on 2026-10-06.** Re-measured with `git grep -l <id> main`: **ADR-0008 is cited by 6 files**, five of them frontend source asserting that the funeral vertical is directory-and-lead-generation-only and that the admin surface is role-gated; **ADR-0009 by 26 files**, including `backend/apps/search_app/views.py`, `backend/apps/products_app/views.py`, `backend/apps/sellers_app/serializers.py`, `docs/api/openapi.yaml` and `frontend/lighthouserc.js`, cited for the privacy posture and the Stripe origin allowlist that holds SAQ-A scope; **ADR-0010 by 3 files**, two outside the registry. The "four documents" and "three documents" figures were counts of `docs/` only. Worse: the ADR-0008 `NO RECORD` section this branch wrote asserted that its own grep "returns this file's overview row only" — **that sentence was written without running the command, and it was false.** Three ids with no decision text are cited by production code, so the absent records are not a documentation tidiness problem. The registry's own Scope sentence asserted that engineering detail for the first ten ids lived in `docs/TECH_DECISIONS.md`, which was false for exactly those three, and both that sentence and the Registry Overview heading were **live C4 violations** the moment the file entered gate scope. Worse for audit purposes: `registry_max()` read only the second file, so C4 computed the registry's extent from half a registry, and `docs/TECH_DECISIONS.md` was in `LIVE_CLAIM_FILES` but **not** `GOVERNANCE_FILES` — a file full of ADR headings that C2 and C4 never scanned (G26's scope asymmetry, one directory over). **Fixed 2026-10-05 on the t9 branch:** every record in one file, ids contiguous, the moved block asserted **byte-identical** against `git show HEAD:docs/TECH_DECISIONS.md` rather than eyeballed; `docs/TECH_DECISIONS.md` is now a pointer plus a summary table whose Record column states whether a decision text exists; both files joined `GOVERNANCE_FILES` in the same commit as the two C4 fixes, so no commit landed red; C4 control on the pointer exits 1. **Not fixed, and not fixable by editing docs:** ADR-0008/0009/0010 have no decision text. They are recorded as `**Status: NO RECORD.**` with the evidence of absence and the cross-references that do survive (`docs/DESIGN_SYSTEM.md` for 0009, `docs/SECURITY.md:70` for 0010), following the G12 NEVER-ISSUED precedent, because writing a decision record from a title is the fabrication this register exists to prevent. Reconstructing them is an owner decision | `grep -oE '^## ADR-[0-9]{4}' docs/*.md` before and after; git grep -l on main → 'ADR-0008' 6 files, 'ADR-0009' 26 files, 'ADR-0010' 3 files (re-measured 2026-10-06; the earlier "4 citing docs" and "2" figures counted `docs/` only and were replaced, not re-stated); the three NO RECORD sections at `docs/ARCHITECTURE_DECISION_RECORDS.md:79-104`; `scripts/check_doc_claims.py` `GOVERNANCE_FILES` and `registry_max()`; commits `1670427` (consolidation) and `58cccec` (registry max 21) |
| G28 | **CLOSED** 2026-10-05 | The repository has one changelog and it is maintained | **Two files claimed the role and neither could honour it.** The root stub was 26 lines whose entries stopped at the repository scaffold while `main` carried **75 merged PRs** — this row first said "roughly 170", which was the highest PR *number* read as a merged count; measured 2026-10-06: 75 merged + 83 closed unmerged + 16 open = 174, with no generator wired to any make target or workflow; `docs/CHANGELOG.md` is a sprint-by-sprint narrative, not a release log. G24(b) had already corrected the stub's false generated-from-commits claim and recorded the file's own verdict — backfill it or delete it — but left both files in place, so the ambiguity outlived the correction. **Fixed by deletion**, the option the file itself named: the root stub removed; seven live references repointed rather than left dangling (`CONTRIBUTING.md:35-38,115`, `QODER.md:16,98,428-429`, `docs/CHANGELOG.md:3-7,134`); its `LIVE_CLAIM_FILES` entry dropped with it; and register rows that quote the old wording left exactly as written, because they are history. **A gate defect surfaced by the deletion and fixed with it:** a listed input that no longer exists was silently skipped by C3, C4 and C6 (each `continue`s past an unreadable file), so a deleted document left the gate's scope while the run still printed "clean" — G15's fail-open class in a different checker. `assert_inputs_present()` now raises `CannotVerify` (exit 2) and a self-test probe keeps it honest; the negative control that exposed this had asserted the opposite behaviour, and was wrong. **Residual, unchanged:** `docs/CHANGELOG.md` is still a sprint narrative, `git log` plus the PR list remain the authoritative release history, and no generator exists or is claimed | `git rm CHANGELOG.md` in commit `4f4ac3f`; mentions of the root path (no `docs/` prefix) outside `docs/` → 2, both dated notes recording the deletion (`CONTRIBUTING.md:37` and this row's own §8 text), and 0 presenting the file as present; `scripts/check_doc_claims.py` `assert_inputs_present()`; control: re-adding the deleted path exits **2** with `CANNOT VERIFY`, reverted to **0** |
| G29 | **CLOSED** 2026-10-05 | A reader can find every document, and no document is unreachable | **There was no inventory and reachability was accidental.** `docs/` held 37 Markdown files across five directories with no index (`docs/README.md` absent); `README.md` linked 15 of them, so the four sequence diagrams under `docs/architecture/` had **zero inbound references** from any tracked file, and `docs/RUNBOOK.md`, `docs/INCIDENT_RESPONSE.md` and `docs/API_CONTRACT.md` had one each. Two consequences: a reader could not reach a quarter of the documentation, and nothing detected the drift — the same duplication mechanism as G1 and G24, since contested topics were restated in two or three files each with no declared owner (coverage floors in three files, incident response in four, ADR numbering in two). **Fixed:** `docs/README.md` is now the single inventory *and* the authority map naming one owner per contested topic; it is in `GOVERNANCE_FILES` and `LIVE_CLAIM_FILES`, so C2 turns every path it lists into an existence check (a rename without an index update fails `make check-docs`), the inventory is provably exhaustive by a `diff` against `find docs -name '*.md'`, and C3/C6 check its claims; `README.md` keeps five grouped entry points and a pointer, because two indexes drift. Reciprocal topical links added for the orphans, and incident response now names one procedure of record instead of three competing ones. **Verified:** zero documents with 0 inbound references; the four sequence diagrams went 1 → 2 inbound; C2 and C6 controls on the index each exit 1 | inbound-reference tables before and after (`.state/t5refs-before.txt`, `.state/t5refs-after.txt`); exhaustiveness `diff` empty (38 of 38 docs cited, none unlisted); commits `cea6331` (index) and `8376fdc` (reciprocal links); C2 control → `C2 path: cited path does not exist -> docs/README.md:139` |
| G30 | **CLOSED** 2026-10-05 | The doc gate checks the claims a document makes, not only the paths it cites | **It checked claims in one list and paths in another, and the gap between them shipped a false control claim.** C2 (cited paths) scans `GOVERNANCE_FILES`; C3 (falsified claims) and C6 (`make` targets) scan `LIVE_CLAIM_FILES`. `docs/README.md` joined the first list only, so the new index stated that `LICENSE` is generated by `make license` — **a target that does not exist**: `git grep -n 'make license' main` returns zero hits on `main`. Pinned to a rev deliberately: the unpinned "zero hits anywhere in the repository" this row first carried became false the moment the row itself quoted the phrase, and it now returns exactly one hit — this row. The Makefile defines 25 targets, none named `license`. `LICENSE` is static AGPL-3.0 text committed at `add3b7b`. The claim came from no file at all; it was written from a `CONTRIBUTING.md` passage that does not exist — the exact G24 failure mode, introduced by the branch whose purpose was doc truth and missed by the gate built to catch it. **Fixed:** the index joined `LIVE_CLAIM_FILES`; its generated-artifacts rows now state what `make api-schema` really writes and that the directory's guard note is hand-written; `LICENSE` moved to the root-documents table with its real status (no generator, so never-hand-edit is a review-gated rule with no regeneration route behind it); and `docs/api/README.md`'s claim to be produced by that target — said about itself — corrected. **Proven by re-injecting the shipped claim:** control A appends the `make license` sentence and the gate exits 1 with a C6 finding naming the target; control B injects a falsified phrase and exits 1 with a C3 finding naming the index; both revert to 0. **Residual, deliberate:** `docs/GRANT_SUBMISSION.md` stays out of `LIVE_CLAIM_FILES` — it is a frozen external submission whose quoted claims would fail a denylist forever — so C3/C6 check nothing in it, and the annotation under its KPI table is the compensating control | commit `7f86139`; `git grep -n 'make license' main` → 0 hits, on HEAD → 1 hit (this row); Makefile target list (25, no `license`); `git log --oneline -1 -- LICENSE` → `add3b7b`; controls A and B exit 1 → 0 with zero residue |
| G31 | **CLOSED** 2026-10-05 | The gap register's own structure is machine-checked, so a malformed row cannot pass as a record | **Two structural defects in this table were invisible to every gate, and one was committed by the person extending the gate.** (a) The G14 row carried four pipes where its neighbours carry six: it was missing both its Evidence cell and its terminating pipe, so a CLOSED gap rendered with an empty Evidence column — reading as "no evidence recorded" — while C5's contiguity check passed, its ID parsed and the Closed summary agreed. Found only by an out-of-band table checker written for this branch. (b) An edit on this branch wrapped the G8 row across five physical lines; GitHub would have rendered the first line as the row and the rest as stray prose. **Both are now caught by C5:** contiguity (existing) plus a new per-row cell-count assertion against the header, which ignores pipes escaped as `\|` because several rows' `grep` patterns legitimately contain them. Two self-test probes cover them, so a future edit that breaks either fails `make check-docs` before it can be committed. G14's Evidence cell is filled from facts its own Reality column already stated — the detector, the pin comparison, the measured state flip with both exit codes, and #171's widening of `lint-py` to `scripts/` — with nothing invented to fill a column. G8's row is one line again, and its superseded claim about `README.md:62` is annotated rather than silently renumbered. **Remedy extended the same day, because this row over-claimed.** C5 reads `QODER.md` only, so it gates the register and nothing else; and a row that loses its *leading* pipe evades both of its assertions everywhere, because the line stops starting with `\|` and therefore leaves the table run — contiguity sees a shorter table and a cell-count check sees a well-formed one. That happened on this branch: an edit to `docs/GRANT_APPLICATION.md` dropped the pipe from a risk-register row, and the only thing that noticed was a human reading the diff, *after* this row had been written about exactly that class. A scan of all 51 tracked Markdown files then found a third variant that no instrument had ever looked at: `audits/internal/2026-08-marketplace-audit/AUDIT_REPORT.md:227` carried unescaped pipes inside a code span, so one GDPR audit row rendered as six columns against its header's three; escaped to `\|`, which changes how it renders and not what it found. **C7 now covers all three classes over every tracked Markdown file** — structural, so it deliberately scans `git ls-files '*.md'` rather than the two claim lists, because G30 and G32 were both documents nobody remembered to add to a list. Measured before landing: 0 problems across the 19 gate-scope files and 1 across all 51, so C7 went in green rather than as a denial of pipeline | commits `9c3896e`, `4aa0095` and this one; `scripts/check_doc_claims.py` `check_register` cell-count block and its two probes, plus `check_tables` (C7) and its three; self-test PASS 16 probes; measured before the fix: `QODER.md:487` 4 pipes against 6 on rows 486 and 488; the wrapped-row state was caught live by C5 ("found 2 [(472, 481), (486, 503)]") and independently by C4, because a wrapped continuation line no longer starts with a row marker and loses the register-row exemption; C7 control re-breaks `AUDIT_REPORT.md:227` → exit **1** naming row 227, restored → exit **0** |
| G32 | **CLOSED** 2026-10-05 | Performance budgets and Lighthouse reports are enforced in CI | **They are enforced nowhere, and the document that said so sat outside every gate list.** `docs/PERFORMANCE_REPORT.md` called `frontend/scripts/lighthouse-budget.json` "(CI-enforced)", named a "Budget job" as the Enforcement for CLS, INP, FCP and Speed Index, said the Lighthouse CI job "fails over budget" for LCP, that "budgets in CI are the pre-release gate so regressions ship to nobody", that "Lighthouse CI artifacts [are] retained per build", and footed itself "CI wiring: `.github/workflows/ci.yml` (Lighthouse job fails on budget exceedance) · bundle gate: `frontend/scripts/bundle-analyze.ts`". Measured 2026-10-05: `frontend-lighthouse` is `if: false` (`ci.yml:227-232`), `frontend-playwright-smoke` is `if: false` (`:258-263`), and `git grep -nE 'lighthouse-budget\|bundle-analyze\|analyze:bundle' -- .github/ Makefile` returns **zero** hits — the only definition anywhere is `frontend/package.json:17`. The analyzer itself is real and does exit 1 over its 150KB/chunk budget, so the false word was "gate", not "analyzer". `docs/GRANT_APPLICATION.md` restated three of them: as a risk mitigation (R3 "CI budget fails builds; runtime LCP test; bundle gate"), as milestone evidence (M5 "CWV budgets green — Lighthouse CI report") and in its footer ("Lighthouse artifacts"). **Root cause is G30's scope hole one document over:** all three files were in neither `GOVERNANCE_FILES` nor `LIVE_CLAIM_FILES`, so C2/C3/C4/C6 observed nothing in them, and this branch had already declared its citation sweep complete. Found at Task 9's final diff review, not by a gate — which is the part worth remembering: the instrument that found it was a human reading a diff. **Fixed:** the Enforcement column now reads "None in CI" per metric with the job condition cited beside it, a dated header note discloses the measurement, and the footer is corrected; the report joined **both** lists; three `FALSIFIED` entries make the strings unrepeatable; and the authority map names it the single home for performance budgets and their enforcement status. Both grant documents joined `GOVERNANCE_FILES` so their new annotations' citations are existence-checked, and deliberately **not** `LIVE_CLAIM_FILES`, because a submitted document quotes the claim it diverges from and a denylist pointed at frozen external text can never pass (G30's residual). `docs/GRANT_APPLICATION.md` is **annotated, not edited**, the rule already applied to `docs/GRANT_SUBMISSION.md`. **G4 and G5 stay OPEN:** this closed a false claim, not a missing gate — an Enforcement column reading "None in CI" is not a working Lighthouse job, and whoever submitted that application still has not been told | `git grep -nE 'lighthouse-budget\|bundle-analyze\|analyze:bundle' -- .github/ Makefile` → 0 hits; `.github/workflows/ci.yml:227-232,258-263` both `if: false`; `frontend/scripts/bundle-analyze.ts:16` (`BUDGET_BYTES = 150 * 1024`) with `process.exit(1)` at `:67`; table scan over all 51 tracked `.md` → 1 malformed table, 0 across the 19 gate-scope files; C3 controls re-inject `(CI-enforced)` and `fails over budget` → both exit **1** naming `docs/PERFORMANCE_REPORT.md:110`; C2 control injects a phantom path into `docs/GRANT_APPLICATION.md` → exit **1** naming `:134`; all three restored byte-identical (sha256) → exit **0** |
| G33 | **CLOSED** 2026-10-06 | Security fixes cite an internal incident ID, never the vulnerability detail (`CONTRIBUTING.md` → *Commit style*, §Part VII) | **The rule mandated a citation to an artifact nothing produced.** `docs/INCIDENT_RESPONSE.md` defined no ID format and held no register; the only ID this repo ever used (`JOL-RENAME-20260831-01`, ADR-0019) was ad hoc; and that document sits in **neither** `GOVERNANCE_FILES` nor `LIVE_CLAIM_FILES` in `scripts/check_doc_claims.py`, so no gate could confirm a cited ID exists. Measured cost 2026-10-06: a lockfile fix that turned two red required checks green could not be committed without inventing an identifier. | §6.1 defines `JOL-<CLASS>-<YYYYMMDD>-<NN>` (declared date is operator-local, per §Part VIII → *Clocks*); §6.2 is an append-only register seeded with the rename ID plus `JOL-PROC-20261006-01` and `JOL-DEP-20261006-01`; `docs/INCIDENT_RESPONSE.md` is added to both gate lists so its citations and tables get checked; §Part VII and `CONTRIBUTING.md` now name the four surfaces (branch name, commit subject, commit body, PR title and body) and say the detail belongs in the record, not the message. **Still nothing machine-checks the citation:** 0 `commit-msg` hooks in `.pre-commit-config.yaml`, 0 commitlint references under `.github/workflows/`, measured 2026-10-06 — which is why this is a register row rather than a gate. **Widening the scope then found two defects inside the record itself:** §3 cited `scripts/health-check.sh --json-only` as a single backticked token, which C2 reads as a path that does not exist (the flag is real and exits before the state and alert path at `scripts/health-check.sh:125` — the citation *form* was the defect), and §5 told responders to copy post-mortems to `docs/post-mortems/`, a directory that had never been created; **C2 did not flag the missing directory**, the same non-literal-path blind spot already recorded for brace globs, so a human widening the list found it. Both fixed in the same commit: citation split, placeholder added. |
| G34 | **CLOSED** 2026-10-06 | Dev-only npm advisories are absent from Dependabot's advisory DB, so the non-blocking trivy dev report is the only thing that surfaces them (both comment sites in the `trivy` job, and ADR-0018) | **False, and never run: Dependabot did raise a `braces` alert.** #38 is `braces`, npm ecosystem, state `auto_dismissed`. Inventory measured 2026-10-06: 38 alerts (34 npm, 4 pip), `state=open` → 0. The ADR's *decision* survives on other evidence (no patched release; absent from the `runner` image); only its justification was fiction — and a false justification is how an accepted risk silently stops being revisited. | Corrected with a dated block in ADR-0018 and at both `trivy` comment sites, which now cite the alert number instead of an absence. **`state=any` is not a valid value for this endpoint: it returns 0 rows**, and an earlier "no alert in any state" reading in this session came from that artifact rather than from data — the paginated parameterless listing is the one to trust. **Why #38 was auto-dismissed is not established here.** |
| G35 | **CLOSED** 2026-10-06 | Trivy, npm audit and Dependabot together cover advisories affecting this tree | **A production-scoped HIGH arrived with no Dependabot alert at all:** `source-map-js` appears in none of the 38 alerts, while the two production-scoped gates flagged it and both `dependency-audit` and `trivy` are required contexts (measured 2026-10-06). The record is the weaker half: nothing links a red gate to `docs/INCIDENT_RESPONSE.md` §6.2, so the incident register exists because an operator wrote in it by hand. | `JOL-DEP-20261006-01` was minted by hand for precisely that reason. What remains is one check, not a refactor: assert that every advisory named by a production gate has an ID in §6.2 before its fix merges. **Automated 2026-10-06:** `scripts/check_advisory_register.py` runs as a step of the required `dependency-audit` job and under `make check-advisories`. It decides two things. Structurally, every §6.2 ID must be well-formed, unique, carry a real declared date and use a class §6.1 declares, and every ID cited in the governance docs must have a row — a cited-but-unregistered ID is the fabricated record §Part VII exists to prevent. By attribution, if a change *removes* a production-scoped advisory, computed by running the gate's own audit against the base and head trees fetched from the platform, then a §6.2 row of class DEP or SEC must name that package **and** its ID must appear in the change's commit messages or PR text. Limits, stated rather than implied: npm production scope only, so a removed advisory in `backend/requirements/*.txt` is not covered; a row must name the package as a **marked identifier** (backticks or emphasis) — plain prose cannot own a package, because a row saying "once the build was green" would otherwise silence the check, and the narrowing can raise a finding but never hide one; the attribution half calls the API through `gh`, which needs `GH_TOKEN` exported in the step (mapped from `secrets.GITHUB_TOKEN`, and the first CI step in this repo to do it — without it every PR would report CANNOT and fail, the G18/ADR-0018 denial-of-pipeline shape); exit 2 means cannot-verify and fails the job. Controls, all executed 2026-10-06: baseline over **real history** — `a38c7d5` → `8b0b897`, the actual #178 delta — exits **0** reporting `OK(removed ['source-map-js'])`, so the fix that exposed this gap now satisfies the check retroactively; stripping the package name from the §6.2 row exits **1** naming `source-map-js`; stubbing the change set so no message cites the ID exits **1** on the attribution branch; a duplicated ID is caught offline; `--self-test` reports **13** probes, "the gate can fail and can pass"; the register was restored byte-identical (sha256 `cbdfa9e54d8c9784`). Required contexts re-measured after the change: 11, including `dependency-audit`. Two defects the instrument found in itself while being built, both fixed here: the marked-identifier probe's fixture named its package in plain prose, so that probe reported the opposite of what it claimed until the fixture was corrected — the narrowing is only provable with a probe on **each** side; and the CI step was written twice, leaving a step with `env:` and no `run:`, caught by parsing the workflow and counting the job's steps (6, the last named above) rather than by eye. `GH_TOKEN` is now mapped in that step: this is the repository's first CI call to the platform API, and `gh` refuses to run without a token, which would have made every pull request red. |
| G36 | OPEN | Required status checks mean a merge cannot land on a tree that was not tested | **Half true: 11 contexts are required, but `strict=false`, so a branch need not be up to date with `main` before it merges.** Measured 2026-10-06 from the protection API: `required_status_checks.strict=false`, and the contexts are backend, codeql, dependency-audit, docker-scan, frontend-lint, frontend-openapi-drift, frontend-typecheck, frontend-unit, gitleaks, secrets and trivy. **`frontend-build` is absent, which is §8 G21's fix 2** — one API call, deliberately not taken. Green checks therefore attest to the tree as of the last push, not to the merge result | Demonstrated the same day while refreshing six stale PRs: #120, #150, #153 and #155 reached `dependency-audit` and `trivy` success only after taking current `main` into their own trees; #91 and #159 could not be refreshed at all (merge conflicts, `DIRTY`). #150 had reported `dependency-audit` success at 2026-10-04T19:17Z while its own lockfile still resolved the version `main` fixed on 2026-10-06 — a true verdict about a past tree, which is exactly how it gets read as present assurance. Turning `strict` on costs one CI run per base move and is the owner's call; it is registered so that no one reads a green tail as a tested merge. Measured: `gh api repos/jolarca-dev/jolarca/branches/main/protection` → `strict=false` with 11 contexts; lockfiles read per PR through the contents API at `c6aec0a02`, `96e9562c3` and `d1752422e` → 1.2.1 while `main` held 1.2.2; `mergeStateStatus` after update-branch → `BLOCKED` for the four refreshed PRs and `DIRTY` for #91 and #159 |
| G37 | **CLOSED** 2026-10-06 | An activated `.venv` is how a developer on this project gets the pinned toolchain (`CONTRIBUTING.md` → *Development setup*; `backend/manage.py` told the reader to "Activate the project venv (make bootstrap)") | **Nothing in the repository activated it, and no document ever said to.** Measured 2026-10-06 on clean `main` @ `6ee5fc2`: `git grep -nI 'activate' -- '*.md' Makefile scripts '*.yml'` matched **zero** tracked files, so the setup block ended at `make bootstrap` — which only *creates* `.venv` — while `backend/manage.py:18` pointed at that same target as if it activated. Consequences observed on this host, not inferred: `VIRTUAL_ENV` was unset in **all ten** live interactive shells; no `activate`, `cd()` wrapper or direnv hook exists in `~/.bashrc`, `~/.profile` or PyCharm's `bash-integration.bash` (which does `source ~/.bashrc`), and `direnv` is installed at `/usr/bin/direnv` but **unhooked and never allowed** (no `~/.local/share/direnv/allow`, no `.envrc`); the `(.venv)` label seen in earlier sessions came from a hand-typed `source .venv/bin/activate` plus an interactively-defined `cd()` function recorded in the IDE tab histories (`jolarca-history:928-930`, `jolarca-history1:991-993`, `jolarca-history2:809-811`) — per-process state that dies with its shell, which is why the label reads as a disconnect. The material part is not the label: with no activation, `ruff` resolves to `~/.local/bin/ruff` at **0.16.5** against the **0.16.6** pinned in `backend/requirements/dev.txt` and run by CI, and bare `python` is absent from `PATH` — so a hand-typed lint verdict is measured with a tool CI does not run. **Every gate missed it, exactly as §8 G14 predicted of its own detector:** `make verify` reported PASS on all seven gates on this same commit, because `$(PY)`/`$(PIP)` are absolute paths under `$(ROOT)` and `check_toolchain.py` is always invoked as `.venv/bin/python …`, i.e. it checks the interpreter it is handed and cannot see shell `PATH`. | Remedy is in-repo and tracked: `scripts/activate.sh` sources the venv's own `bin/activate` (so a rebuilt or relocated venv needs no change here), refuses execution instead of silently no-op'ing, drops a foreign active venv first, and then **proves** resolution instead of asserting it — `python`, `ruff`, `mypy`, `pytest`, `django-admin` must each resolve under `.venv/bin` or the script says so on stderr, because a PATH re-order after activation is precisely the failure this row records. `make shell` wraps it for a fresh shell; `CONTRIBUTING.md:8` and `README.md:49` gained the activation step as **1:1 line replacements** so the pinned citations into those files (`README.md:5-6`, `:41`, `:43`) did not drift, and `backend/manage.py`'s hint now names a command that actually activates. Probes: sourced-from-root and sourced-from-`backend/` both resolve `python`+`ruff` into the venv (exit **0**); `bash scripts/activate.sh` refuses (exit **2**); a double source leaves **1** `.venv/bin` entry in `PATH`; the negative control — activate, then `PATH=$HOME/.local/bin:$PATH`, then activate again — takes the "NOT resolving from .venv" branch, so the assertion is demonstrably capable of failing rather than always-green. **Scoped honestly:** the durable *automatic* half cannot live in this repository. Prompt labels and auto-activation are shell state, so a fresh clone still needs either a one-time host hook (`eval "$(direnv hook bash)"` plus `direnv allow`, or PyCharm → Settings → Tools → Terminal → *Activate virtualenv*, which needs a valid module SDK — and the IDE's `jolarca-backend.iml` still names the deleted backend-directory decoy venv this row's own §8 G14 removed, an untracked file no PR can fix). What the repo now carries is the tracked entry point and the proof, so "is my shell on the pinned toolchain" is answerable in one command instead of by looking for a prompt label. Incident `JOL-PROC-20261006-02` (§6.2) |

**Remediation queue, in priority order** (highest risk per unit of effort first):

> **Sequencing note (2026-10-05).** This queue is ordered by *risk per unit of
> effort*, **not by severity**. Item 10 (**G23**, the incomplete rename) is the
> highest-severity open finding in this register and the only one that can cause
> a production incident — but it is also the most expensive, so it sorts last.
> Read item 10 first when deciding what *not* to touch.

1. **G1 — the record is done; raising the gate is not, and it is already overdue.**
   ADR-0021 (2026-10-05) records the 80%→20% downgrade, names its mechanism — the
   value changed inside an unrelated revert PR, `22117ff` (#45), which is how a gate
   moves without anyone deciding to move it — and states both figures as measurements
   taken on this tree (**24%** unit+security, **69%** with CI's own contract set). The
   two `docs/` restatements are corrected and now cite `.github/workflows/ci.yml:97`
   and `frontend/vitest.config.mts:55-60`, and four `FALSIFIED` entries make the old
   strings unrepeatable in any live-claim file. `docs/GRANT_SUBMISSION.md` was
   **annotated, not edited** — it is the record of what was sent to a funder, and
   notifying whoever submitted it is still outstanding (item 9).
   **Applied 2026-10-06, from CI's own figure:** `--cov-fail-under` is now **63**, not 20 —
   CI's `backend` job logged `Total coverage: 68.56%` at run `37476183729`, so the ratchet
   gives 68.56 − 5 → **63**. The **64** planned above came from the local 69% measurement,
   while the rule says to take the figure CI reports; this is the PR that touched `ci.yml`,
   which is what the obligation named. Do not read the raise as closing G1: 63 is still below
   the documented target and a floor only makes deletion visible. Ratchet again when CI
   reports 10+ points above 63 — and never by jumping to 80, since an unreachable gate gets
   reverted under pressure and a silently-lowered one gets forgotten, the second being
   exactly what happened here.
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
   `frontend-build` runs the only check that boots the shipped bundle and is not a required
   context, so until 2026-10-06 it was also skipped whenever lint failed — which is why on #161
   the guard had never executed at all. **Partly overtaken by events, corrected 2026-10-06:** of
   the two options below, the first is taken — #176 (`726b4ad`) dropped `frontend-lint` from
   `frontend-build`'s `needs:`, and #161's refreshed head is the proof (`frontend-lint` failure
   and `frontend-build` success on the same commit); #162 is merged, so the guard no longer
   encodes Next 15's CSS directory. What remains is the second option only — adding
   `frontend-build` to the required contexts (G21 fix 2), together with G36's `strict` — and both
   are owner calls, not one-line edits anyone should make unprompted.
4. **G15 + G16 — DONE 2026-10-05.** Both failed for the same structural reason: a
   local check looking at more than it should, producing output no one can act on
   and training the operator to ignore the gate. Both are closed with mutation
   evidence, not by reading a diff — and **neither was closed by silencing it**: a
   planted `sk_test_…`/`AKIA…` still fails `make check-secrets`, and a genuinely
   malformed `frontend/*.ts` still fails the prettier hook.
   - **G15**: `check_no_secrets.sh` now audits `git ls-files` (or `--staged`), so it
     scans the same set CI does and fails **closed** (exit 2) when it cannot observe
     its inputs rather than reporting a false "clean".
   - **G16**: the hook now passes `--ignore-path frontend/.prettierignore`. Adding
     `--no-error-on-unmatched-pattern` was required and was discovered only by
     testing: without it the hook exits 1 whenever every passed file is ignored,
     which would have broken `make api-schema` commits.
5. **G18 — stop the unreviewed production publish, in code not just settings.**
   **In-repo half DONE 2026-10-06** (`JOL-PROC-20261006-03`): the workflow now fails
   *before* it publishes, so the guard is upstream of the irreversible side effect, and
   `:latest` is gone — the control this item named as the one that actually holds.
   Create the `production` environment with a required reviewer — feasible because
   the repo is public, so protection rules are available on the free plan. But do not
   stop there: `can_admins_bypass` defaults to `true` and there is one admin, so the
   approval is self-grantable. A workflow cannot bypass its own steps the way a role
   bypasses an environment gate, which is why the code change landed first and the
   platform object remains the weaker, still-outstanding half.
6. **G17 — DONE 2026-10-05, but the premise was incomplete.** The plan here said
   "move `exit 1` to a `::warning::` that exits 0". Doing *only* that would have made
   things worse, not better: both jobs declared `environment: staging`, so GitHub was
   already recording a **`success` deployment for a build job** on every merge (§8
   **G26** — 111 deployment objects, 2 per SHA across 58 SHAs, 6 `success` in the last
   12). The permanent red X was therefore load-bearing: it was the only marker telling
   the honest `deploy` job apart from the fabricated one, and deleting it would have
   left two green "staging deployments" per merge and nothing contradicting them. So
   the fix shipped as four coupled parts: warn and exit 0 **plus** a job display name
   that reads `staging rollout - NOT IMPLEMENTED (stub, nothing deployed)`, **plus** a
   step summary stating the run is evidence of a build, not a deploy, **plus** removal
   of both `environment:` declarations. Production's `exit 1` is left in place on
   purpose — it pushes `:latest`, so a green production run would read as a release
   that never happened.
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
   G24, and **G1's three restatements went with them** (t9, 2026-10-05):
   `docs/TESTING_STRATEGY.md` §1 is now the single home of both coverage figures,
   `docs/TESTING.md` links to it instead of restating it, and the two files no
   longer disagree about test counts. What is left is not a doc edit but a
   notification, and it is the reason this item stays listed:
   **`docs/GRANT_SUBMISSION.md` was annotated, not corrected.** It describes an
   *external funding submission*, so its ≥80% row still stands with the divergence
   disclosed beneath it rather than being quietly rewritten. Do not edit a document
   that has already been sent to a third party — tell whoever submitted it, because
   an in-repo annotation cannot retract what was sent.
10. **G23 — the incomplete rename. Highest severity, and the only finding here
    that can cause a production incident.** **Now governed by ADR-0019
    (2026-10-05), which changes what should be done.** The freeze-map is decided
    and accepted: `X-JOL-*` wire-protocol headers, the persisted `JOL-<year>-`
    order prefix, the shipped migration `help_text` and the sibling `jol-hub`
    references are frozen permanently, and no global `sed` is permitted. **The
    consumer-brand rename is deferred to the owner and must not be executed as a
    hygiene task** — measured at **46 files**, that class includes a copyright
    notice in four languages, the HTML `<title>` and template, JSON-LD `siteName`
    and the PWA manifest, so it carries legal, SEO and i18n consequences, and it
    would break `frontend/e2e/seo.spec.ts:114` **silently** because the job
    running it is `if: false` (§8 G4). **What remains actionable without a brand
    decision:** none of the rename itself. The owner's decision is the
    precondition. Steps 1–2 are **done** — ADR-0019 records the decision boundary
    and the freeze-map. *If* the brand is ruled to change, the remaining sequence
    is: **(1)** amend ADR-0019 with the brand decision and its rationale.
    **(2)** re-classify every remaining `JOL` token against ADR-0019's four
    classes, since the inventory will have drifted. **(3)** execute the **brand
    class only** — 46 files, including the four locale files and the SEO surfaces
    — then `make api-schema` to regenerate `docs/api/openapi.yaml` **and**
    `frontend/src/generated/api.ts`, because `settings/base.py:167` sets the
    OpenAPI `TITLE` and a title change *is* a contract change
    (`frontend-openapi-drift` is now required, §8 G22). Verified feasible:
    `manage.py spectacular` reproduces the committed snapshot **byte-identically**
    (0 diff lines) with no database. **(3b)** update
    `frontend/e2e/seo.spec.ts:114` in the **same** commit, and supply
    **translated** locale strings rather than substituting the token. **(4)**
    Prove the order-number sequence still advances: create an order against a
    database that already holds `JOL-<year>-` rows and assert no unique
    violation. This is a regression test for the *freeze* — it must pass
    **unchanged**, because the prefix must not have moved. **(5)**
    `chore/rename-jolarca` (`714ac91`) needed no such sequencing: it was merged
    as PR #20 and was pruned 2026-10-05, its undo anchor recorded in PR #165's
    appendix. Steps 3 and 4 are exactly what a global search-and-replace skips,
    and exactly what breaks checkout.
11. **G25 — CLOSED 2026-10-05 — close the local↔CI lint scope gap over `scripts/`.** One-line asymmetry
    with outsized consequences: pre-commit checks `scripts/*.py` but `make lint-py`
    and both CI ruff steps are confined to `backend/`, so the directory holding the
    repo's *gates* is unlinted by CI. Sequence: (1) `ruff check scripts/ --fix` for
    the 9 auto-fixable, then justify or remove the remainder — a fix to
    `seed_data.py`'s imports must not change seeding behaviour, so re-run
    `make seed` against the dev stack to prove it; (2) widen `lint-py` to
    `cd backend && ruff check . && ruff format --check .` plus a repo-root
    `ruff check scripts/`, or add `lint-tools`; (3) only then trust that a
    formatting regression in `scripts/` cannot be simultaneously commit-blocking
    locally and invisible in CI. Do **not** widen the target before step 1 — that
    turns a gate fix into a denial-of-pipeline (the G18/ADR-0018 lesson).
12. **G26 — disclose the fabricated deployment history; it cannot be purged.** *(Matrix row, ADR-0020 and `docs/SECURITY.md` §7 landed 2026-10-05; the item stays listed because the fabricated history is permanent and `deploy-production.yml` still declares `environment: production`.)*
    About 58 `success` records for a staging environment that has never received a
    deployment are permanent, externally visible evidence on a public repository, and
    no GitHub API deletes deployment records. Three things remain:
    **(1)** correct `docs/COMPLIANCE_MATRIX.md:24`, which maps ISO **A.5.15** /
    SOC 2 **CC6.2** to "CODEOWNERS + environment approval gates on deploys" — neither
    control exists (G2, G18, G26). Because this *removes* a claimed control from a
    compliance artifact, pair the correction with the established risk-acceptance
    pattern (an ADR plus a `docs/SECURITY.md` row recording the residual risk and its
    compensating controls), rather than editing the row quietly.
    **(2)** state in that same record that environment deployment history predating
    2026-10-05 is emitted by a **build** job and is not evidence of any deployment;
    the real controls are the container registry plus `git log`.
    **(3)** apply the same `environment:` removal to `deploy-production.yml`, which
    still declares `environment: production` on its build job. Only latent today
    because no `v*` tag exists — but it becomes real the first time someone cuts a
    release, so it must not survive to the first tag.

13. **G35 — CLOSED 2026-10-06 — link a red production gate to a register entry.** *(One check,
    as predicted. `scripts/check_advisory_register.py` now runs inside the required
    `dependency-audit` job and under `make check-advisories`: it fails when a change removes a
    production-scoped advisory that no §6.2 row names, or when the row's ID is cited nowhere in
    the change. Its first real test was retroactive — the delta of #178 itself, attributed to
    `JOL-DEP-20261006-01` — and it then ran for real in CI on #180, where the attribution branch
    reported `OK(no production advisory removed)` on the `pull_request` event and `SKIPPED(not a
    pull_request event)` on `main`'s push, both printed rather than silent. Its limits (npm
    production scope only, marked-identifier package matching, `GH_TOKEN` needed for the
    attribution half, exit 2 on cannot-verify) are recorded in the row instead of being left as a
    surprise.)*

14. **G36 — decide `strict` for branch protection.** *(Owner call, one API field. A branch need
    not be up to date with `main` to merge, so green checks describe the tree at the last push,
    not the merge result — measured as `strict=false` and demonstrated across six PRs in the
    row. The same setting is where §8 G21's fix 2 (`frontend-build` as a required context) would
    be applied, and it stays unapplied because the `0ee87ff` flake profile is still
    unexplained.)*

**Closed:** G3, G6, G7, G10, G11, G13, G14 and G20 — 2026-10-03/04; **G8, G9, G15, G16,
G17, G22, G24, G25, G28, G29, G30, G31 and G32 — 2026-10-05**; **G33, G34, G35 and G37 —
2026-10-06**. **G12 was never issued** (see its row; the number is
retired, not reusable). When a real carrier or
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
