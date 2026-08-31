# PRE-PUSH CHECKLIST — jol-marketplace (2026-08 audit)

Ordered runbook. **Do not skip or reorder steps.** Every step lists its exit criteria;
a red exit criterion blocks all later steps. Finding IDs refer to
`AUDIT_REPORT.md` §10.

> Repository note: `main` currently has **zero commits**. Step 4 creates the first
> push of this history — treat it as a publication event (public, AGPL-3.0).

---

## Step 1 — Canonical name: `jol-marketplace` (AUD-26)

The public repo already exists under **JourneyOfLife/jol-marketplace**. This working
copy lives in a dir named `jolarca` and the README H1 regressed to the
non-canonical name.

Rename/merge runbook:
1. Rename the working directory: `mv jolarca jol-marketplace`.
2. Fix name-bearing artifacts:
   - `README.md` H1 → `# jol-marketplace` (extend the original public README —
     **do not replace** the existing vision/architecture content; append/merge).
   - `CONTRIBUTING.md` clone path (`cd jolarca` → `cd jol-marketplace`).
   - `.idea/jolarca.iml` → delete (see Step 3 hygiene).
3. Verify canonical names already correct elsewhere (no action): `backend/pyproject.toml`
   (`jol-marketplace-backend`), `frontend/package.json` (`jol-marketplace-frontend`),
   compose `name: jol-marketplace-dev|test`, deploy images `…/backend|frontend`.
4. Set git remote to the existing public repo: `git remote add origin git@github.com:JourneyOfLife/jol-marketplace.git`.
5. Pull the public history first and **merge/rebase this work onto it** so the
   original README/vision content is preserved (`git fetch origin && git rebase origin/main`
   or a merge commit). Never force-push over the public history.

**Exit criteria:** `grep -rn "jolarca" --exclude-dir=.git --exclude-dir=.venv .` → no hits.

## Step 2 — Real CODEOWNERS teams (AUD-33, CRITICAL)

Current handles point at `@jol-infrastructure/*-owners`. The public org is
**JourneyOfLife**; these teams are unverified and CODEOWNERS with nonexistent teams
silently disables required reviews. Replacement table (create teams in the org first,
then substitute 1:1):

| Path | Current (unverified) | Replace with |
|---|---|---|
| `/backend/apps/payments_app/` | `@jol-infrastructure/payments-owners` | `@JourneyOfLife/payments-owners` |
| `/backend/apps/compliance_app/` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |
| `/backend/apps/users_app/` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |
| `/backend/project/settings/` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |
| `/backend/project/middleware/` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |
| `/backend/apps/core/encryption.py` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |
| `/.github/workflows/` | `@jol-infrastructure/platform-owners` | `@JourneyOfLife/platform-owners` |
| `/.env.example` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |
| `/docker-compose.dev.yml`, `/docker-compose.test.yml` | `@jol-infrastructure/platform-owners` | `@JourneyOfLife/platform-owners` |
| `/docs/COMPLIANCE_MATRIX.md`, `/LICENSE` | `@jol-infrastructure/compliance-owners` | `@JourneyOfLife/compliance-owners` |

**Exit criteria:** `gh api orgs/JourneyOfLife/teams` shows all three teams with ≥2
members each; a test PR touching `payments_app` requests the payments team.

## Step 3 — Public-visibility readiness (Dimension H / gate H33)

1. Hygiene: unstage/ignore IDE metadata — `git rm -r --cached .idea && echo '.idea/' >> .gitignore` (AUD-35); confirm `.pytest_cache/`, `node_modules/`, `.env` already ignored.
2. Secrets: `bash scripts/check_no_secrets.sh` → clean; confirm gitleaks full-history
   scan passes *after* the first push (`security.yml` weekly job + `fetch-depth: 0`).
3. No internal hostnames/IPs/personnel emails: re-run the grep in AUDIT_REPORT evidence #18; only `.example` domains allowed.
4. SECURITY.md private disclosure channel valid (currently `security@jol-infrastructure.example` — replace with a real monitored address before making the repo public).
5. LICENSE intact AGPL-3.0 (verified at audit; re-verify checksum after Step 1 merge).
6. Templates present: bug/feature/security issue templates + PR template with compliance checklist (verified present).

**Exit criteria:** all six items green; security contact is a real monitored inbox.

## Step 4 — Push the audit branch

1. All CRITICAL findings of the register fixed and proven by tests: AUD-01, AUD-02, AUD-03, AUD-04, AUD-05, AUD-06, AUD-08, AUD-33. HIGH findings either fixed or explicitly waived in writing by the payments owner + DPO.
2. Create branch: `git switch -c audit/2026-08-marketplace-audit`.
3. Commit convention: `fix(core): use _state.adding in append-only guards (AUD-01, AUD-02)` etc. — one concern per commit, Conventional Commits enforced.
4. `git push -u origin audit/2026-08-marketplace-audit`.

**Exit criteria:** branch pushed; `git log` shows conventional commits; no `.idea`, no `.env`, no PII-shaped seed data in history (seed is synthetic — verified).

## Step 5 — Branch protection + required checks

Enable on `main` (and audit branch while in review):
- Require PR + **CODEOWNERS review** (works only after Step 2).
- Required status checks: `backend` (ruff, mypy, pytest ≥80% cov, OpenAPI drift, integration), `frontend` (tsc, build, Playwright), `secrets`, `gitleaks`, `trivy`, `codeql`, `dependency-audit`.
- Require branches up-to-date; no force-push; no deletions; signed commits recommended.

**Exit criteria:** a no-op PR cannot merge without all checks green + owner review.

## Step 6 — PR with CI + security workflows green

1. Open PR `audit/2026-08-marketplace-audit → main` using the PR template; fill the compliance checklist truthfully.
2. Watch every job. Known gate failures to have fixed before this step: ruff 42→0 (AUD-14), mypy 7→0 (AUD-16), coverage 36.56%→≥80% (AUD-13), `npm ci` (AUD-12), `next build` (AUD-11), integration runner hosts (AUD-15) + a non-empty integration suite (AUD-22).
3. Security workflows (gitleaks/trivy/codeql/pip-audit/npm audit) green; resolve any new advisory via Dependabot PRs first.

**Exit criteria:** all required checks green on the PR head SHA.

## Step 7 — Sign-offs

- **DPO sign-off (Dimension F):** review AUDIT_REPORT §7 after fixes — consent ledger writable, AuditLog writable, erasure fan-out covers every PII store with a DB test proving *PII gone + financials intact + audit trail written*, Art. 20 export implemented or formally scheduled, consent-enforcement decision documented (AUD-38).
- **Payments owner sign-off (Dimension E):** AUDIT_REPORT §6 after fixes — webhook replay test green (same event twice → no duplicate transition), forgery → 400, refund reconciliation implemented or waived, stripe-mock wiring verified, commission/VAT plan documented (AUD-19/20).

**Exit criteria:** both sign-offs recorded as PR comments by the named owners.

## Step 8 — Merge

1. Squash or merge per team convention (Conventional Commits preserved).
2. Post-merge smoke on the deployed/dev stack: Gate 1 sequence from AUDIT_REPORT §3.1
   (compose up → migrations → seed → `/api/v1` → `/api/schema/` → frontend renders).
3. Confirm OpenAPI snapshot job still green post-merge.

**Exit criteria:** `main` green; fresh-clone quickstart works end-to-end.

## Step 9 — Tag

1. `git tag -s v0.1.0 -m "chore(release): first public audit-clean milestone"` (first tag after the audit; pick the next free semver if history already tags).
2. Pushing `v*` triggers `deploy-production.yml` — it **intentionally fails at rollout** (A-07 sanctioned stub). That is expected; ratify the deploy target before removing the stop-line.
3. Annotate the release notes with the audit report link and the residual-work list (`docs/MVP_REMAINING_WORK.md`).

**Exit criteria:** tag exists; release workflow builds attested images (SBOM + provenance) and fails loudly only at the sanctioned rollout stub.

---

### Residual (non-blocking) backlog at merge time

MEDIUM/LOW items may land post-merge as tracked PRs: AUD-21, AUD-23 … AUD-31, AUD-34 … AUD-40,
plus everything already listed in `docs/MVP_REMAINING_WORK.md` (MVP-* tickets).
