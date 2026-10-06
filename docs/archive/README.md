# Archived documents — frozen history, not authority

Files here are **historical records**, kept because they are evidence of what was
verified, when, and by whom. They are **not** current statements about this repository.

## Rules

1. **Non-authoritative.** Where an archived file disagrees with `README.md`,
   `CONTRIBUTING.md`, `QODER.md` or anything under `docs/` proper, the archived file is
   wrong by definition — it describes a past state. Never cite one as evidence of a
   present control.
2. **Frozen.** Do not "fix" an archived file to match today's code. Corrections belong in
   a dated note *inside* the file (see the relocation note in
   `audits/internal/2026-08-marketplace-audit/CHANGES.md`), so the original record and
   the reason it changed both survive.
3. **Archived records are outside the documentation gate — deliberately. This file is
   not.** `scripts/check_doc_claims.py` reads two explicit lists (`LIVE_CLAIM_FILES`,
   `GOVERNANCE_FILES`) and globs only `.github/workflows/*.yml`. No archived record is in
   either list, so frozen history is never scanned. This README *is* listed in
   `GOVERNANCE_FILES`, because it asserts how that gate behaves — and an ungated assertion
   about a gate is precisely how §8 G26 survived. Verify both halves with:
   `grep -n "docs/archive" scripts/check_doc_claims.py` (expect exactly one match, this
   file).
   **Do not add any archived record to either list.** The gate is a denylist of falsified
   claim classes; pointed at frozen history it would fail permanently on statements that
   were true when written, and a gate that can never pass is worse than no gate.
4. **Provenance is mandatory.** Every entry below states what it records, when, and which
   PR or commit it belongs to. An archived file without provenance is indistinguishable
   from a stray note and will eventually be mistaken for a live claim — the
   duplication-drift failure recorded as QODER.md §8 G1 and G24.

## Index

| File | Records | Provenance |
|---|---|---|
| `STEP20_EXECUTED.md` | Execution and acceptance evidence for the `/internal/v1` internal payments API: a reproduced contract-suite run (14 contract + 34 unit/security = 48 passed), a live HTTP demo transcript, the C4 webhook-forgery and C5 product-attribution fixes, and an honest deviation note that the suite and implementation landed in the same commit rather than strictly test-first. | PR **#18** — `MERGED` 2026-08-16T23:23:33Z, merge commit `4faef0a3`, head branch `step-20-internal-payment-api` (verified against the GitHub API 2026-10-05). The code it documents still exists: `backend/apps/payments_app/internal_auth.py`, `backend/apps/payments_app/internal_forward.py`, `backend/apps/payments_app/internal_views.py`, `backend/apps/payments_app/urls_internal.py` — spelled out in full because C2 skips tokens containing brace or wildcard syntax, so a glob form would leave that claim unchecked. Relocated from the repository root on 2026-10-05. |

## Provenance caveat for `STEP20_EXECUTED.md` (verified 2026-10-05)

The file also names two predecessors as already merged — STEP 18 `89c4812d` and STEP 19
`85d51489`. **Neither object resolves in this repository**: `git cat-file -t` returns "Not a
valid object name" for both, and nothing in `git log --all` matches a STEP 18/19 commit.
This repository's history begins at `add3b7b` / `2d9109e` (#1, "bring marketplace codebase
under version control"), so those are pre-migration identifiers from the predecessor tree.
PR numbers #19 and #21 in *this* repository are unrelated work (SOPS enablement, CI
`workflow_dispatch`), so the STEP numbering must not be read as PR numbering. Its stated
"Date: 2026-08-17" is consistent with the merge timestamp in local time (UTC+2).

Treat those two citations as **unverified** and do not propagate them into any
authoritative document. This note lives here rather than as an edit to the archived file,
per rule 2 above.
