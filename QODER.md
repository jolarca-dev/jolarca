# QODER.md

Behavioral guidelines for AI-assisted development in the jolarca marketplace.
These reduce common LLM coding mistakes and enforce project-specific compliance
and architecture rules.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Identify which app(s) the change touches. If it crosses app boundaries,
  verify the integration goes through the target app's `services.py`.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior Django engineer say this is overcomplicated?"
If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

---

## Project-Specific Guidelines — jolarca

jolarca is a GDPR-compliant marketplace (LT/LV/EE) built with Django (backend)
and Next.js (frontend). Every change must respect the compliance and
architecture constraints below.

### Architecture — modular Django apps

The backend is organized into isolated apps under `backend/apps/`. Each app
owns its domain; cross-app coupling is forbidden by design.

**Isolation rules (rejections are automatic in CI):**
- Only `payments_app` imports `stripe`. Only `shipping_app` imports carrier
  SDKs. Only `ai_service_app` imports LLM SDKs.
- Cross-app access is via the target app's `services.py` only. Never import
  models or internals from another app directly.
- No AI/inference calls in request/response code — enqueue to the `ai` queue
  via Celery.
- State transitions use `orders_app.state_machine` — never write order status
  fields directly.

**Erasure fan-out:** New storage of personal data must register a handler in
`compliance_app.services.ERASURE_REGISTRY`. If you add a model that holds PII,
check this.

### Compliance — GDPR and PII

- New PII fields MUST use `core.encryption.EncryptedTextField` and annotate
  the RoPA classification.
- Update `docs/COMPLIANCE_MATRIX.md` in the same PR when adding PII fields.
- Paths under CODEOWNERS compliance review: `payments_app/`, `compliance_app/`,
  `users_app/`, `settings/`, `middleware/`, `core/encryption.py`,
  `.env.example`, `docker-compose.*.yml`.

### Secrets — never in git

- No tokens, keys, PEMs, passwords, or `.env` files — enforced by `.gitignore`,
  pre-commit (Gitleaks + `detect-private-key`), and CI secret scanning.
- Never suggest bypassing pre-commit (`--no-verify`).
- Runtime credentials come from environment variables (see `.env.example`).
- Encrypted secrets at rest use SOPS (`.sops.yaml`); never commit plaintext
  secrets to `secrets/encrypted/`.

### Quality gates — run before proposing changes

These are all enforced in CI. Run locally before committing:

| Gate | Command | What it checks |
|------|---------|----------------|
| Lint + format | `make lint` | ruff (Python), prettier (frontend) |
| Type checking | `make typecheck` | mypy with Django plugin |
| Unit tests | `make test` | Unit + security tests |
| Integration tests | `make test-integration` | Against compose topology |
| Secret scan | `make check-secrets` | `scripts/check_no_secrets.sh` |
| Django checks | `make check` | Settings, apps, migration consistency |
| API schema | `make api-schema` | Regenerate OpenAPI if API changed |

**Coverage:** ≥ 80% on changed lines. Write tests alongside code, not after.

### Dependencies

- Runtime deps go in `backend/pyproject.toml` only.
- Run `make lock` to regenerate pinned, hash-checked `requirements/*.txt`.
- PRs that edit `requirements/*.txt` directly are rejected by CI.
- Never hand-edit: `requirements/*.txt`, `docs/api/openapi.yaml`,
  `frontend/src/lib/api/generated/`, `CHANGELOG.md`, `LICENSE`.

### Commits — Conventional Commits (enforced)

```
<type>(<scope>): <imperative summary>

type:   feat | fix | docs | style | refactor | perf | test | build | ci | chore | security
scope:  users | sellers | products | orders | payments | tax | shipping | ai | bitrix24
        compliance | core | frontend | infra | docs
```

Breaking changes: append `!` (`feat(payments)!: ...`) and describe migration
in the body. Security fixes MUST reference the internal incident ID, never the
vulnerability detail.

### Migrations

- No destructive operations (DROP, TRUNCATE) without explicit approval.
- No table locks on hot tables — use `CREATE INDEX CONCURRENTLY` patterns.
- Every migration must be reversible; describe the down-migration path in the
  PR rollback plan.

### Rollback

Every PR must state how to revert it (mandatory field in the PR template).
If you cannot describe the rollback, the change is not ready.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, compliance checklist items pass on first
submission, and clarifying questions come before implementation rather than
after mistakes.
