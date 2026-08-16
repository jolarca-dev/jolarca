# CHANGES.md — audit auto-fix log (2026-08-marketplace-audit)

Policy applied: **auto-fix only TRIVIAL findings**; every auto-fix is logged here with
ID, file, and rationale. CRITICAL/HIGH/MEDIUM findings are never auto-fixed by the
audit — they live in `audits/internal/2026-08-marketplace-audit/AUDIT_REPORT.md` §10
with owners assigned.

## Auto-fixes applied

**None.**

Rationale: every defect confirmed during this audit is either functional (registration,
audit log, webhook pipeline, checkout, erasure), build-blocking (lockfile, CSS import),
or gate-level (ruff/mypy/coverage/integration). None qualifies as TRIVIAL:

- The two one-line candidates — `_state.adding` append-only guards (AUD-01/02) and the
  `../styles/globals.css` import (AUD-11) — are CRITICAL/HIGH severity because of their
  blast radius (consent ledger, audit trail, entire frontend build). They require
  regression tests and owner review, not an auditor drive-by.
- Lint debt (AUD-14, 42 errors) spans 20+ files and includes one schema-relevant rule
  (DJ001 on `Order.idempotency_key`) that would require a migration — owner work.

## Audit-side artifacts created (outside repo source)

| Path | Purpose |
|---|---|
| `audits/internal/2026-08-marketplace-audit/AUDIT_REPORT.md` | Full audit report + findings register + evidence |
| `audits/internal/2026-08-marketplace-audit/PRE_PUSH_CHECKLIST.md` | Ordered pre-push runbook (9 steps) |
| `CHANGES.md` | This log |
| `/tmp/audit-venv`, `/tmp/audit-frontend`, `/tmp/audit-compose-override.yml` | Clean-room probe environments (disposable, not committed) |

## Environment state after audit

- Docker dev/test stacks stopped and volumes removed (`docker compose down -v`).
- No repository source files modified; `git status` matches pre-audit state plus the
  three audit deliverables above (untracked).
- No commits created (audit deliverables staged for the owner to commit per
  PRE_PUSH_CHECKLIST step 4).
