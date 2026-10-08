# JOL Marketplace — Incident Response

How we classify, respond to, and communicate production incidents on
`marketplace.gyvenimo-kelias.lt`. Pairs with [RUNBOOK.md](./RUNBOOK.md)
(the *how to fix* side); this document is the *how to behave* side.

---

## 1. Severity definitions

| Severity | Name             | Definition                                                                                                   | Examples |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| **P1**   | Critical         | Money path broken, site down, or personal data at risk. Revenue stops or GDPR exposure begins.               | Checkout 5xx for all users; payment webhook endpoint dead; full outage; DB corruption; suspected PII leak; erasure SLA at risk of breach |
| **P2**   | Major degradation| Core flows impaired but a workaround exists, or a significant feature is down for everyone.                  | Search returns errors; email delivery halted (order confirmations queued); one locale broken; seller dashboard down while storefront works |
| **P3**   | Minor            | Limited impact, workaround trivial, no data risk.                                                            | One broken image; admin UI glitch; a single user's cart edge case; non-blocking warning spam in logs |

Classification rule: **payment + PII ⇒ P1.** When torn between two levels,
pick the higher one; downgrading is cheap, under-responding is not.

GDPR note: any suspected personal-data breach additionally triggers the
Art. 33 72-hour notification clock — treat as P1 even if the site "works".

## 2. Response times

| Severity | Acknowledge | First mitigation | Resolution target |
| -------- | ----------- | ---------------- | ----------------- |
| P1       | 15 min      | 1 h (rollback, feature off, maintenance page) | 4 h |
| P2       | 1 h         | 4 h              | 1 business day    |
| P3       | 4 h         | next maintenance window | 1 week      |

"Acknowledge" means a human has seen the alert and said so (status page
entry or internal channel) — not necessarily a fix.

Standing mitigation order for P1: **roll back** (`scripts/deploy.sh
--rollback`) → restart the failing service → fail closed with a maintenance
message. Debugging comes after users are unblocked.

## 3. Detection → declaration flow

1. `scripts/health-check.sh` (every 5 min, alerts after 3 consecutive
   failures) or `scripts/monitoring.sh` (every 15 min) fires via
   `MONITOR_WEBHOOK_URL` / `MONITOR_EMAIL`; or a user reports.
2. Operator confirms the signal (one probe from the VM: `scripts/health-check.sh`
   with `--json-only`, which reports without touching alert state).
3. Severity assigned per §1; incident clock starts at acknowledgement.
4. If P1: status page entry within 30 min; internal log opened (§4.2).
5. Mitigation applied; status updated every 30 min (P1) / 2 h (P2).
6. Resolution → all-clear update → post-mortem within 3 business days
   (mandatory for P1, recommended for P2).

## 4. Communication templates

### 4.1 User-facing status page

**P1 — investigating:**

> **Marketplace checkout is currently unavailable**
> We are aware that orders cannot be completed and are working on it.
> Your cart is safe; no payments have been taken for failed orders.
> Next update within 30 minutes.

**P1 — mitigation in place:**

> **Service partially restored**
> Checkout is working again. If you attempted a payment during the outage
> and received an error, you have NOT been charged — please try again.
> We are monitoring closely.

**P1 — resolved:**

> **Resolved**
> The issue affecting checkout between HH:MM and HH:MM (EET) is resolved.
> No completed payments were affected. A full explanation will follow in
> our post-mortem. We apologize for the disruption.

**P2 — generic:**

> **Degraded service: <feature>**
> <feature, e.g. Product search> is currently unavailable. Browsing and
> checkout are unaffected. We expect restoration within <timeframe>.

Rules: never speculate about cause in the first message; never include
internal hostnames, stack traces, or user data; always state whether money
or data was affected — that is the only question buyers actually have.

### 4.2 Internal log (Slack / channel `#incidents`)

Open one thread per incident; keep it chronological:

```
[P1] 2026-08-22 checkout 5xx — started 14:03 EET
14:03 health-check alert: backend failing 3 consecutive runs
14:07 @operator acknowledged, severity P1 (money path)
14:12 cause hypothesis: failed migration in 14:00 deploy
14:15 mitigation: scripts/deploy.sh --rollback
14:21 checkout verified working (test order JOL-2026-XXXXXX)
14:25 status page: resolved
14:26 post-mortem scheduled (due 2026-08-27)
```

Rule: timestamps + facts first, opinions labeled as hypotheses.

## 5. Post-mortem template

Copy to `docs/post-mortems/YYYY-MM-DD-<slug>.md`. Blameless by rule:
processes and systems get fixed, people do not get named as causes.

```markdown
# Post-mortem: <incident title>

- **Date / duration:** YYYY-MM-DD, HH:MM–HH:MM (EET), <n> minutes
- **Severity:** P1 / P2
- **Affected users/services:** <who could not do what>
- **Data impact:** none / <precise statement, incl. PII assessment>
- **Financial impact:** <orders lost or delayed, if estimable>

## Summary
<3–5 sentences: what happened, in plain language.>

## Timeline (EET)
- HH:MM first signal (which alert/user report)
- HH:MM acknowledged, severity assigned
- HH:MM mitigation applied
- HH:MM resolved, verified how

## Root cause
<The technical chain, precisely. Distinguish trigger vs underlying cause.>

## What went well
<e.g. alert fired within 5 minutes; rollback restored service in 6 minutes>

## What went badly
<e.g. runbook step was wrong; no alert covered this path>

## Action items
| Action | Owner | Due | Tracking |
| ------ | ----- | --- | -------- |
| <fix>  | <who> | <date> | <issue/commit> |

## Detection gap check
- Could this have been caught by health-check.sh? If not, what probe is added?
- Did monitoring thresholds fire before users noticed?
```

Review cadence: action items are checked at the next maintenance window;
a post-mortem whose actions never land is itself a P3 incident.

---

## 6. Incident and advisory identifiers

Security fixes must cite an internal incident ID and never the vulnerability
detail (`CONTRIBUTING.md` → *Commit style*, restated in `QODER.md` §Part VII).
Until 2026-10-06 nothing produced one: this file defined no format, no register
existed, and the file itself was in neither list of documents the doc gate reads
(`GOVERNANCE_FILES` / `LIVE_CLAIM_FILES` in `scripts/check_doc_claims.py`), so an
ID quoted in a commit could not be checked for existence at all. Recorded as
**G33** in `QODER.md` §8. This section is the producer.

### 6.1 Format

`JOL-RENAME-20260831-01` (ADR-0019) used this shape ad hoc, before any rule
existed to define it. It becomes a convention here:

    JOL-<CLASS>-<YYYYMMDD>-<NN>

| Token | Rule |
| ----- | ---- |
| CLASS | `SEC` authentication, authorisation or secret exposure · `DEP` dependency supply chain · `PII` personal-data breach (also starts the Art. 33 clock, §1) · `AVAIL` outage or degradation · `DATA` data integrity or loss · `PROC` a control that did not do what it claimed · `RENAME` legacy: the one identifier minted before this section existed, kept so §6.2 can cite ADR-0019 truthfully. `scripts/check_advisory_register.py` enforces membership in exactly this set, so a new class is a change to this row first. |
| YYYYMMDD | the date the incident or advisory was **declared**, in the operator's zone (`Europe/Vilnius`). `QODER.md` §Part VIII → *Clocks* exists because one event can carry two dates either side of midnight UTC, so state the zone whenever a timestamp is not local. |
| NN | sequence within class and date, starting `01` |

An ID is assigned in §6.2 **before** it is cited anywhere. Surfaces a citation
may not touch — all four are public and permanent, and a pushed branch cannot be
scrubbed without a rename plus remote delete: branch name, commit subject,
commit body, PR title and PR body. This document and `QODER.md` §8 are where the
detail lives: they are the record the ID points at, so they name packages and
advisories deliberately, and a commit that cites an ID here is not expected to
restate them.

### 6.2 Register

Append-only. Never rewrite an ID or a declared date; correct the record by
adding a dated note to its own row. Severity uses §1.

| ID | Declared | Class | Severity | Status | What it refers to |
| -- | -------- | ----- | -------- | ------ | ----------------- |
| JOL-RENAME-20260831-01 | 2026-08-31 | predates this format | — | closed, merged as PR #20 | the `JOL Marketplace` → `jolarca` rename at infrastructure level; ADR-0019 in `docs/ARCHITECTURE_DECISION_RECORDS.md` holds the identifier freeze-map for what must never be renamed |
| JOL-PROC-20261006-01 | 2026-10-06 | PROC | P3 | closed by this section | §Part VII mandated a citation to an artifact that had no producer, and the document that would hold it was outside every gate list — G33 |
| JOL-DEP-20261006-01 | 2026-10-06 | DEP | P3 | **fixed 2026-10-06** — merged as `8b0b897` (#178); `main`'s own run of that commit reports `dependency-audit` and `trivy` both success. The row was written while the fix was still unmerged, when this cell read "open, fix in review"; §6.2 is append-only, so the stale wording is preserved inside the note rather than overwritten. | *source-map-js* 1.2.1 in `frontend/package-lock.json`; advisory GHSA-68fv-2mgg-jv7q (HIGH, event-loop denial of service through indexed source-map section offsets), patched upstream in 1.2.2. Surfaced by the two production-scoped gates in `.github/workflows/security.yml` — the *Trivy CRITICAL/HIGH policy gate (production dependencies)* step and the *npm audit (frontend)* step of the `dependency-audit` job — and **not** by Dependabot, which holds no alert for this package in any state; that asymmetry is G34. Transitive only: no range in `frontend/package.json` changes. Exposure is build-time, not runtime — the `runner` stage of `frontend/Dockerfile` copies `.next/standalone`, `.next/static` and `public` and starts `node server.js`, so the package is absent from the shipped image. |
| JOL-PROC-20261006-02 | 2026-10-06 | PROC | P3 | open, fix in review | the interactive-shell toolchain control did not do what it claimed. Nothing in this repository activated `.venv`: measured 2026-10-06, `git grep -nI 'activate' -- '*.md' Makefile scripts '*.yml'` matched **no** tracked file, so `CONTRIBUTING.md`'s setup block ended at `make bootstrap`, which only *creates* the venv. With it inactive, hand-typed `ruff` resolved to `~/.local/bin/ruff` at **0.16.5** while `backend/requirements/dev.txt` and CI pin **0.16.6**, and bare `python` was absent from `PATH` altogether. Every Makefile gate stayed green through this — `$(PY)` is an absolute path under `$(ROOT)`, and `make verify` reported PASS on all seven gates on the same commit — which is why §8 G14's detector cannot see it: it is always invoked as `.venv/bin/python …`, so it checks the interpreter it is handed. Recorded as §8 **G37**. *Appended 2026-10-06: **closed**, merged as #182; automatic activation followed in #186 (tracked `.envrc` plus the host direnv hook), which superseded the row's no-`.envrc` decision* |
| JOL-PROC-20261006-03 | 2026-10-06 | PROC | P3 | open, fix in review | `.github/workflows/deploy-production.yml` published `backend:latest` and `frontend:latest` — with SBOM and SLSA provenance, under `environment: production` on the build job — and only a *downstream* job said the rollout is not implemented. The workflow therefore placed the irreversible side effect ahead of the step that admits it, the same defect §8 G17 recorded for staging, and its comment described a control its ordering did not implement. **Latent, not current:** `git ls-remote --tags origin` returns no `v*`, so the workflow has never run. Fixed by position, not by intent: a `refuse-publish` job now fails first, `build-and-push` depends on it and declares no environment, and the mutable `:latest` tag is gone. Recorded as §8 **G18** / queue item 5. *Appended 2026-10-06: **closed**, merged as #183* |
| JOL-PROC-20261006-04 | 2026-10-06 | PROC | P3 | open, fix in review | the documentation-truth gate could not see most of the documentation. `scripts/check_doc_claims.py` selected its input through two hand-maintained lists and nothing detected a file absent from them: measured 2026-10-06 on `main` @ `8585510`, **31 of 51** tracked Markdown files were in neither list, so `docs/RUNBOOK.md`, `docs/SECURITY_POSTURE.md`, `docs/API_CONTRACT.md`, `docs/TECHNICAL_SPECIFICATION.md`, `docs/architecture/`, `docs/runbooks/` and `secrets/encrypted/README.md` were invisible to every check — the third occurrence of the hole that §8 G30 and §8 G32 each patched once by appending the offending file. Widening the scope surfaced seven live defects in those files (a generated-client path truncated by its extension, the same phantom path inside the API contract's own diagram, a sibling repository's file cited as a path of this one, three citations that folded a CLI flag into the path token, and a 2026-08 audit row naming a spec path that no longer resolves); all seven are corrected in the same change, and the scope is now derived from `git ls-files` rather than remembered, with a new check on the exemption map. Recorded as §8 **G38** |
| JOL-DEP-20261007-01 | 2026-10-07 | DEP | P3 | **closed 2026-10-07** — instance half merged as `78e255a` (#190); the structural half is carried by #191, the pull request whose own commit writes this cell, and no squash sha is quoted for it because one cannot be known before the merge that creates it. §6.2 is append-only, so the wording this replaces, `open, fix in review`, is preserved here instead of being silently dropped. | `@stripe/stripe-js` and `@stripe/react-stripe-js` are peer-coupled and cannot be bumped apart, yet `.github/dependabot.yml` files them as two discrete PRs. Measured from npm's own resolver: `@stripe/react-stripe-js@6.12.0` peers `@stripe/stripe-js >=9.16.0 <10.0.0`, so a Stripe.js **10** bump alone is unsatisfiable (`ERESOLVE … Conflicting peer dependency: @stripe/stripe-js@9.17.0`), and `@stripe/react-stripe-js@7.0.0` peers `>=10.0.0 <11.0.0`, so the mirror image fails too — neither half can go green alone; only the pair moves. Reached while landing #139: after #143 (`react-stripe-js` 6.9.0 → 6.12.0) merged, #139 turned `DIRTY` because the two edit **adjacent lines** of `frontend/package.json`, and Dependabot then refused to rebase it — "this PR has been edited by someone other than Dependabot" — because `gh pr update-branch` had put non-Dependabot merge commits on its branch. `@dependabot recreate` cleared the conflict and **re-resolved to the newest release**, turning a 9.13 → 9.17 minor into a 9.17 → **10.0.0** major: same PR number, different substance, on the payment boundary. Remedied by moving both together: the lock resolves `@stripe/stripe-js` **10.0.0** + `@stripe/react-stripe-js` **7.0.0**, `npm ci` exit **0**, `tsc --noEmit` exit **0**, `eslint .` exit **0**, **267** tests in 22 files pass, the diff is confined to `frontend/package.json` and `frontend/package-lock.json`, and the optional-peer `@swc/helpers@0.5.23` entry (§8 G19) is **retained**, so no lock repair was needed. Application code touches only `loadStripe`, the `Stripe` and `StripeElementsOptions` types, `useStripe` and `useElements`, all typechecking unchanged. **Not closed by CI:** `frontend-playwright-smoke` is `if: false` (§8 G4), so no end-to-end checkout ran; verifying Elements and checkout by hand stays outstanding, because this boundary is what keeps the merchant out of CHD scope under PCI DSS SAQ-A. Recorded as §8 **G39**. **Structural note, same date, appended under §6.2:** the text above records the instance; the arrangement that produced it is closed in #191. `.github/dependabot.yml` gains `stripe-js-major` and `stripe-js-patch`, each declaring **both** names, while `@stripe/*` stays excluded from `weekly-minor-patch` — so a Stripe change is still one named PR and still never part of the catch-all, but it is now a PR that can resolve. `scripts/check_dependabot_groups.py` moves the pair out of `MUST_STAY_DISCRETE` into `FAMILIES` **in the same commit**, because each half on its own fails the other gate: config-only exits **1** with 6 findings, checker-only exits **1** with 2, both together exit **0**. The gate also gained two self-test probes, one per side, so a future edit that narrows a route back to one member is detected rather than filed as another unsatisfiable PR. **Claims this note does not make:** no dependency version moves in #191, and no stripe pull request has been generated by dependabot against the new config yet — the checker mirrors GitHub's documented group semantics, not dependabot's implementation, so the first such PR is the test. The PCI duty in the row above is unchanged: manual verification of Elements and checkout is still outstanding, because `frontend-playwright-smoke` is `if: false` (§8 G4) |
| JOL-PROC-20261007-01 | 2026-10-07 | PROC | P3 | open, no gate covers it | the label-based security-review routing that `.github/dependabot.yml` asserts has never actually applied. All four `labels:` sites request `security-review` — three of them with `dependencies`, the github-actions one with `ci` — and both of those extra labels were created only on 2026-10-07, while the request has been in the tree since the repository's first commit `2d9109e` (2026-08-16). Measured at 00:56 local over the whole history on that date (`--state all`, author `app/dependabot`): of **124** dependabot pull requests, **0** carry `security-review` and **0** carry `ci`; each landed with `dependencies` (pip ones also `python`), and the github-actions PR #135 arrived with **no label at all**, losing both of its requested names. GitHub drops an unknown label instead of refusing the update, so the control degraded silently for seven weeks with every gate green: `make check-deps-groups` asserts group topology and, by its own docstring, no GitHub-side state, while `scripts/check_doc_claims.py` resolves backticked **paths** and never platform objects — `git grep -nI 'labels' main -- scripts/ .github/workflows/ Makefile`, pinned to `main`, returns **no hits**. **Correction inside this row:** earlier on 2026-10-07 this record asserted that dependabot "errors on every PR" because of the missing labels. That was written without measuring it, and the census contradicts it — 124 pull requests did open — so the real failure mode is silence, which is the worse outcome for a control whose only function is visibility. Whether dependabot's own run log records a per-update label error was not checked and is not claimed here. Both labels now exist (`gh api repos/jolarca-dev/jolarca/labels/security-review` and `/labels/ci` each → HTTP **200**), created by the operator. **The observation this row said was outstanding arrived while it was being written:** the 00:56:30 census above read 124 pull requests and **0** carrying `security-review`; at 01:03:08 dependabot opened **#192** (`chore(deps): Bump the weekly-minor-patch group in /backend with 5 updates`) with `labels=[dependencies, security-review]`; at 01:09:14 a re-measure read **1 of 125**. So the config's request does take effect, and #192 is the first pull request in this repository's history to carry the label. Both counts are recorded with their timestamps rather than collapsed into one number, because two readings seven minutes apart are exactly the drift this register keeps being caught by — and the gap that survives the correction is not the label but the absence of any assert that a named label exists. Recorded as §8 **G40** |
| JOL-PROC-20261008-01 | 2026-10-08 | PROC | P3 | open, fix in review | the repository's own gate runner **could not run in the workflow this project prescribes**. `ROOT` is derived from the Makefile's own location rather than the invocation directory — deliberately, because a second decoy virtualenv under `backend/` once rebound `$(PY)` that way, and it is now asserted by `scripts/check_toolchain.py` — and `PY` and `PIP` were built from it as plain immediate assignments. A **linked worktree** has no `.venv` of its own, and `.gitignore` matches `.venv/` at any depth, so the missing interpreter is invisible to `git status`; every gate invoked from one therefore resolved to a nonexistent path and died with the **shell's** exit 127 rather than a gate verdict. Measured 2026-10-08 in a worktree under `.state/`: `make -C <worktree> check-docs` printed `/bin/bash: line 1: <worktree>/.venv/bin/python: No such file or directory` then `make: *** [Makefile:154: check-docs] Error 127`. Two consequences make this a control failure and not an inconvenience. **(1)** Worktree isolation is the house way to cut a PR — the codified lock repair in `scripts/repair-dependabot-lock.sh` works "in a throwaway worktree" and says so in `docs/runbooks/dependabot-lock-peer-repair.md` — so the standard path hit the trap, and it was hit twice in one session: the same 127 had to be *disclosed* in PR #194's body and again in PR #196's, while the artefact itself stayed unfixed. A finding that only ever reappears in a PR body is a finding that has not been triaged. **(2)** The obvious escape hatch does not exist, and its direction is the inverse of the shell convention every operator expects: a makefile assignment **beats a variable inherited from the environment**, so `PY=<venv> make …` silently kept using the broken path (verified with `make -n`, which still printed the worktree interpreter) and only `make PY=<venv> …`, a command-line assignment, overrode it. Fixed by resolution order instead of by documentation: an explicit `PY`/`PIP` now wins from either surface, else this checkout's own venv, else the venv of the checkout that owns the shared git directory (via `git rev-parse --path-format=absolute --git-common-dir`, measured returning the parent's `.git` from inside a linked worktree; git 2.43.0 supports the flag). The fallback keeps the authoritative interpreter authoritative because `scripts/check_toolchain.py` still compares the interpreter it is handed against the lock pins, so aiming `PY` at a decoy fails loudly. `bootstrap` is pinned to the same-root venv path in the same change: with a fallback interpreter in place, a worktree `make bootstrap` would otherwise have executed the **parent checkout's** pip and installed dev dependencies into the parent venv while creating a stray local one. **Not claimed as fixed:** interactive activation remains checkout-local — `scripts/activate.sh` resolves the venv beside the file it was sourced from and `.envrc` uses a relative `.venv` — so in a worktree each still reports "no interpreter … run 'make bootstrap' first". That is a loud, accurate message rather than a silent pass, and changing it touches §8 G37's decision surface, so it is left alone here. No §8 gap row is minted: the defect is closed by this same change and the incident register carries it. *Appended 2026-10-08: **closed**, merged as #197 — squash `ad8b9e4` on `main`, parent `26b7b19`. The wording above is preserved unchanged because §6.2 is append-only. Proof that the landed bytes are the tested bytes: the squash tree `065d889ff6cfa78f822c6d8107a20f0cd2d9800b` is identical to the attested head `50cdb2a`'s tree, and all twelve required contexts passed on that head. The fix then proved itself in exactly the workflow it was written for — every gate for this closure note was run from a **linked worktree with no `PY` given** and `make check-docs` exited **0**, where the same invocation returned exit 127 before the merge.* **Epilogue, same date, recorded because it is this row's own failure mode one level up:** while this note was being prepared the host's root partition filled (100 %, 0 bytes available). It did not announce itself as an error — command output came back empty for *every* command including `echo`, and redirected probe files were written as 0 bytes, so the session looked like a broken tool rather than a full disk until `git status` named it: `index.lock write error. Out of diskspace`. Cause measured: Docker's `data-root` was migrated to the large disk, but `docker info` reports `driver-type io.containerd.snapshotter.v1`, so image layers and build cache still live on `/`; `docker builder prune --keep-storage 2GB -f` reclaimed **6.29 GB** (cache 8.58 GB → 2.291 GB) and moved `/` to 4.3 GB available, with images, containers and volumes left untouched by design. Collateral, disclosed: an aborted `npm install --package-lock-only` under `node:22` had already truncated a **scratch** lock file to 0 bytes in a throwaway worktree — the commit, the branch and `origin` were unaffected, and `git diff --numstat` reported the emptiness as `0 9794` rather than as a missing file. The durable fix, moving the containerd root off `/`, needs docker and containerd stopped, so it is an outage-window decision and stays open |
