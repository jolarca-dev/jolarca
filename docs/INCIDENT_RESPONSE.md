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
| JOL-PROC-20261006-02 | 2026-10-06 | PROC | P3 | open, fix in review | the interactive-shell toolchain control did not do what it claimed. Nothing in this repository activated `.venv`: measured 2026-10-06, `git grep -nI 'activate' -- '*.md' Makefile scripts '*.yml'` matched **no** tracked file, so `CONTRIBUTING.md`'s setup block ended at `make bootstrap`, which only *creates* the venv. With it inactive, hand-typed `ruff` resolved to `~/.local/bin/ruff` at **0.16.5** while `backend/requirements/dev.txt` and CI pin **0.16.6**, and bare `python` was absent from `PATH` altogether. Every Makefile gate stayed green through this — `$(PY)` is an absolute path under `$(ROOT)`, and `make verify` reported PASS on all seven gates on the same commit — which is why §8 G14's detector cannot see it: it is always invoked as `.venv/bin/python …`, so it checks the interpreter it is handed. Recorded as §8 **G37** |
