#!/usr/bin/env python
"""Fail when documentation asserts a control that does not exist.

Why this exists
---------------
Every code invariant in this repository is machine-checked — the AST boundary
tests, the dependabot topology checker, the standalone-CSS guard. But the
*claims about* those controls are checked by nothing, so they drift freely and
each drift becomes a new entry in the QODER.md §8 gap register. A 2026-10-05
audit found six such claims asserted as current fact in contributor-facing
documents (register G1/G2/G8/G9/G21/G24), all of them known, cited and
prioritised already, and none of them fixed at source.

This script is the compensating control. It exists so that the next false claim
fails a build rather than being discovered by a human two days later.

What it verifies
----------------
C1 origin       — every github.com/<org>/<repo> URL in the README matches the
                  real `origin` remote (G9: badges pointed at a retired org, so
                  both rendered as broken images on the front page).
C2 real paths   — every backticked repository path cited in a tracked document
                  exists on disk (G24d: two never-hand-edit lists guarded
                  `frontend/src/lib/api/generated/`, which never existed, while
                  README cited the real `frontend/src/generated/api.ts`).
C3 live claims  — phrases proven false may not reappear asserted as current
                  fact (G24a/b/c, G2, G21).
C4 no counts    — no hardcoded ADR range in prose (G8: the range drifted on the
                  very next ADR; the registry file is the sole authority).
C5 register     — the §8 table is contiguous, every gap ID between min and max
                  either exists or is explicitly marked NEVER ISSUED, and every
                  CLOSED gap appears in the "Closed:" summary. A blank line
                  inside the table silently detaches rows in rendered Markdown,
                  so a compliance register can be wrong on GitHub while looking
                  right in an editor.
C6 make targets — every `make <target>` cited in docs exists, and a Makefile
                  comment claiming "no CI job does this" is actually true.
C7 tables       — every Markdown table git tracks is one contiguous run with
                  exactly one separator row and one cell count per row, and no
                  row has lost its leading pipe. Structural, so it scans all
                  tracked Markdown rather than the claim lists below:
                  G30 and G32 were both documents nobody had remembered to add
                  to a list. A malformed table renders silently wrong on GitHub
                  while looking right in an editor — in an evidence column that
                  reads as "none recorded" (G31).
C8 claim scope  — the exemption map that keeps a document out of C3/C6 must
                  itself hold: each exempt path is still tracked, each carries a
                  written reason, and none is also claim-checked. Scope became
                  derived rather than remembered (§8 G38: 31 of 51 tracked .md
                  files were in neither list), so the failure mode moved from
                  "forgot to add" to "forgot to justify" — and a justification is
                  something a check can falsify.

Limits — read before trusting a green run
-----------------------------------------
- This checks documentation against configuration **in the repository**. It
  cannot see GitHub-side state: branch protection, environment approval rules or
  required contexts are NOT verified here. Where prose states a required-context
  count, only its internal consistency (stated N vs the names listed) is checked.
- C3 is a denylist of *specific falsified strings*. A new false claim worded
  differently will pass. It prevents regression; it does not prove truth.
- C2 resolves a cited path against a small set of roots (repo root, then
  `backend/`). A path that exists but is not the one intended still passes.
- C3's scope is every tracked Markdown file except the names in
  CLAIM_SCOPE_EXEMPT, plus the non-markdown entries of LIVE_CLAIM_FILES. A document
  exempted there is not claim-checked; C8 inspects the exemption, not its wisdom.
- C7 checks structure only. A table whose cells are uniform and contiguous can
  still assert something false; that is C3's job.
- A green run means "these known classes of drift are absent", never
  "the documentation is accurate".
- **CI-only.** This runs in the backend CI job, not as a pre-commit hook, so a false
  claim can be committed locally without complaint and first surfaces on the pull
  request. Deliberate — a whole-tree doc scan firing on every unrelated commit would
  be the G15 failure mode again — but it means `git commit` is not where you find
  out. `make check-docs` is the local equivalent and is fast.

Proven blocking, not merely present (2026-10-05, throwaway PR #168): injecting the
single falsified sentence "PRs that edit `requirements/*.txt` directly are rejected
by CI" into CONTRIBUTING.md turned the **required** `backend` job red at the
"Doc-claims check" step while the preceding "Dependabot group config check" step
stayed green, and left `mergeable=MERGEABLE` with `mergeStateStatus=BLOCKED` — the
content could merge and the gate stopped it. The probe PR was closed unmerged and
its branch deleted. Local mutation matrix (7 injected claims, one per check, in a
disposable worktree): all 7 exit 1; removing QODER.md exits 2 rather than passing.

Exit codes: 0 pass, 1 a claim is contradicted by configuration, 2 cannot verify
(missing input, no git remote, unparsable register). A vacuous pass is
impossible by design: an empty file set, an absent QODER.md or an unreadable
Makefile all exit 2 rather than reporting success.

Usage: python scripts/check_doc_claims.py [--self-test]
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Documents that assert controls as current fact. QODER.md §8 is deliberately
# excluded from C3/C4: a gap register is by design a list of falsehoods that were
# found, so it must be allowed to quote the claim it retracted.
LIVE_CLAIM_FILES = [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    # "CHANGELOG.md" was listed here until 2026-10-05, when the root stub was deleted
    # rather than backfilled: docs/CHANGELOG.md plus `git log` is the change record.
    # The entry had to go with the file - assert_inputs_present() now fails closed on a
    # listed path that no longer exists, so a stale entry is loud instead of silently
    # dropping the document out of every check.
    "docs/SECURITY.md",
    "docs/CHANGELOG.md",
    "docs/ASSUMPTIONS.md",
    "docs/TESTING.md",
    "docs/TESTING_STRATEGY.md",
    # Added 2026-10-05 with G26. The compliance matrix is the document an auditor
    # reads first, and it was the one file outside this list: `CODEOWNERS +
    # environment approval gates on deploys` survived there mapping ISO A.5.15 and
    # SOC 2 CC6.2 to two controls that do not exist, after the identical claim in
    # CONTRIBUTING.md had already been corrected. Scope, not wording, was the defect.
    "docs/COMPLIANCE_MATRIX.md",
    "docs/TECH_DECISIONS.md",
    # Added 2026-10-05 (t9) after the index this branch introduced shipped a false
    # claim: its generated-artifacts table said LICENSE is produced by a make target
    # that does not exist. C6 scans this list only, and the index sat in
    # GOVERNANCE_FILES alone, so the check built to catch exactly that stayed silent.
    # Being in scope for paths (C2) is not the same as being in scope for claims
    # (C3/C6). Tracked as §8 G30.
    "docs/README.md",
    # Added 2026-10-05 (t9) at final review of this branch. The performance report called
    # its Lighthouse budget "CI-enforced", named a "Budget job" as the enforcement for four
    # metrics, and footed itself with "CI wiring: ci.yml (Lighthouse job fails on budget
    # exceedance)" - while frontend-lighthouse is `if: false` and neither the budget file
    # nor bundle-analyze.ts has any invoker in .github/ or the Makefile. It sat in neither
    # list, so no check could see it: the same scope hole as G30, in the next document.
    # Tracked as §8 G32.
    "docs/PERFORMANCE_REPORT.md",
    # Added 2026-10-06 with §8 G33. This document is the producer of the incident IDs
    # that CONTRIBUTING.md and QODER.md §Part VII require every security fix to cite,
    # and it had never been in scope for anything: a falsified claim inside it
    # ("Dev-only npm advisories ... which Dependabot does NOT carry, e.g. braces", in
    # the workflow that pairs with it) and a citation to a directory that does not
    # exist both survived every gate. Being the authoritative record is the reason it
    # must be checked, not a reason to leave it out: its claims are internal and
    # therefore falsifiable, unlike the frozen grant documents above.
    "docs/INCIDENT_RESPONSE.md",
    ".github/CODEOWNERS",
    "Makefile",
    # Workflow comments are contributor-facing claims too. G18 and G26 both began
    # with a comment asserting a control the surrounding config does not implement.
    ".github/workflows/deploy-staging.yml",
    ".github/workflows/deploy-production.yml",
]

# C3/C6 scope is derived from 2026-10-06 (§8 G38): every tracked Markdown file is
# claim-checked EXCEPT one named here, and naming it requires a reason. The two lists
# above are the floor, not the boundary — measured on this tree, 31 of 51 tracked .md
# files sat in neither list, so `docs/RUNBOOK.md`, `docs/SECURITY_POSTURE.md`,
# `docs/API_CONTRACT.md`, `docs/TECHNICAL_SPECIFICATION.md`, all of `docs/architecture/`
# and all of `docs/runbooks/` could cite paths and controls that do not exist without any
# gate noticing. That is the third time the same hole produced a finding: §8 G30 and §8
# G32 were both "a document nobody remembered to add". Exemption is now a written claim
# that C8 checks, instead of an omission that reads as absence of defect. Exempt does NOT
# mean unexamined: these files stay in scope for C2 and C4, because a dated record that
# cites a nonexistent path is still a dead citation.
CLAIM_SCOPE_EXEMPT = {
    "QODER.md": (
        "§8 is a register of falsehoods that were found, so it must be able to quote the "
        "claim it retracts — measured 3 denylist hits that are register prose about absent "
        "controls, plus 2 C6 hits over targets the queue *proposes*"
    ),
    "docs/GRANT_APPLICATION.md": (
        "funded-application text submitted in 2026-09 and annotated rather than edited "
        "(the reasoning already recorded as G30's residual)"
    ),
    "docs/GRANT_SUBMISSION.md": (
        "submitted to a funder as-is; its 1 measured hit at line 189 is the claim the "
        "document's own dated annotation retracts"
    ),
    "docs/archive/STEP20_EXECUTED.md": (
        "dated execution record of a procedure that ran once; C3 would read its plan "
        "voice as a present claim"
    ),
    "audits/internal/2026-08-marketplace-audit/AUDIT_REPORT.md": (
        "dated internal audit from 2026-08 — corrected in place with a note rather than "
        "rewritten, per the convention this repo applies to frozen records"
    ),
    "audits/internal/2026-08-marketplace-audit/CHANGES.md": (
        "companion change log of that same dated audit"
    ),
    "audits/internal/2026-08-marketplace-audit/PRE_PUSH_CHECKLIST.md": (
        "a 2026-08 plan of record. Its three stale claims (CODEOWNERS review, an 80% "
        "coverage floor, up-to-date branches required) were corrected under "
        "JOL-PROC-20261006-04, but the surrounding prose states what the author intended "
        "to enable, which C3 cannot distinguish from a present assertion"
    ),
}

# Everything humans read for rules, including the register (for path/ID checks).
GOVERNANCE_FILES = [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "QODER.md",
    "docs/SECURITY.md",
    "docs/CHANGELOG.md",
    "docs/TESTING.md",
    "docs/TESTING_STRATEGY.md",
    "docs/ARCHITECTURE.md",
    "docs/DEPLOYMENT.md",
    # Added 2026-10-05 (t8). The archive index states how this gate selects its input,
    # so it is in scope; the archived records themselves are deliberately NOT listed —
    # frozen history would fail a denylist of falsified claims forever. Its rule 3
    # documents both halves and the grep that proves them.
    "docs/archive/README.md",
    # Added 2026-10-05 (t9). The index cites every document path in the repository, so
    # C2 becomes an inventory check: a renamed or deleted doc fails the gate instead of
    # leaving a dead link behind.
    "docs/README.md",
    # Added one commit later in the same branch, together with the fixes they expose:
    # the registry was read only by registry_max(), so its own citations and any range
    # it claimed were never checked. That is how two live C4 violations survived in it
    # (its Scope sentence and its Registry Overview heading both named the first ten ids
    # as the registry's extent while ADR-0020 existed) and how three ids came to have no
    # record at all. Tracked as §8 G27.
    "docs/ARCHITECTURE_DECISION_RECORDS.md",
    "docs/TECH_DECISIONS.md",
    # Added 2026-10-05 (t9) with §8 G32. The two grant documents are external funding
    # text whose instruments this branch measured as absent; both now carry a dated
    # annotation citing repository paths, so C2 should verify those citations. They are
    # added here and NOT to LIVE_CLAIM_FILES, for the reason already recorded as G30's
    # residual: a submitted document quotes the claim it is diverging from, and a denylist
    # pointed at frozen external text can never pass. The annotation is the compensating
    # control. docs/PERFORMANCE_REPORT.md is in BOTH lists on purpose - it is an internal
    # report, so its claims are checkable, and its corrected text is written to satisfy
    # the three FALSIFIED entries below rather than to dodge them.
    "docs/PERFORMANCE_REPORT.md",
    "docs/GRANT_APPLICATION.md",
    "docs/GRANT_SUBMISSION.md",
    # Added 2026-10-06 with §8 G33, in BOTH lists for the reason in the LIVE_CLAIM_FILES
    # entry above: §6.2 is now where incident IDs are minted, so a citation there to a
    # nonexistent path or tool is a defect in the record itself, not in prose about it.
    "docs/INCIDENT_RESPONSE.md",
]

PATH_ROOTS = ["", "backend"]
PATH_PREFIX = re.compile(r"^(?:backend|frontend|docs|scripts|\.github|nginx|secrets|audits|apps)/")
BACKTICK = re.compile(r"`([^`\n]+)`")

# Exact strings proven false on 2026-10-05. Reappearing in a live-claim file
# means the control was either removed or never existed.
FALSIFIED = (
    ("generated from Conventional Commits", "no changelog generator exists"),
    ("(all enforced in CI)", "two gates ran but did not block; see G21/G22"),
    ("forces a second approver", "require_code_owner_reviews=false; see G2"),
    ("GitHub enforces this via branch protection", "require_code_owner_reviews=false"),
    ("directly are rejected by CI", "no workflow rejects hand-edited lockfiles"),
    ("frontend/src/lib/api/generated", "that path does not exist; see G24"),
    ("lighthouse-budgets enforced", "frontend-lighthouse is if:false; see G5"),
    ("coverage-%E2%89%A580", "the gate is --cov-fail-under=63 (20 until 2026-10-06); see G1"),
    # Added with G17/G26: deployment claims that the staging workflow does not honour.
    (
        "audit log of every deploy",
        "a build job wrote deployment records that were never deployments; see G26",
    ),
    (
        "rollout gates on the health endpoint",
        "no deploy workflow runs a rollout or a health gate; §A-07 undecided",
    ),
    (
        "fail loudly at the rollout step",
        ("staging warns and exits 0 since 2026-10-05; only production still fails; see G17"),
    ),
    ("deploy-staging.yml → staging VM", "no staging target exists; §A-07 undecided"),
    (
        "manual approval gate before any prod action",
        ("no production environment exists and can_admins_bypass defaults to true; see G18"),
    ),
    # Added with G26 queue item 12: the A.5.15 / CC6.2 evidence row and its two
    # sibling restatements. All three assert a human review or approval control that
    # the branch-protection API reports as absent (re-verified 2026-10-05:
    # require_code_owner_reviews=false, required_approving_review_count=0, one
    # environment `staging` with protection_rules=[] and can_admins_bypass=true).
    # The residual risk is accepted in ADR-0020, not hidden.
    (
        "codeowners + environment approval gates",
        "neither control exists; see G2/G18/G26 and ADR-0020",
    ),
    (
        "environment approval gates",
        "protection_rules=[] on the only environment and can_admins_bypass=true; see G18",
    ),
    (
        "codeowners review",
        "require_code_owner_reviews=false, so CODEOWNERS gates nothing; see G2",
    ),
    (
        "enforced in review + codeowners",
        "CODEOWNERS is inert; review is self-review with one maintainer; see G2",
    ),
    # Added with t9 (2026-10-05), from measured gate values: the backend coverage floor
    # is --cov-fail-under=63 (.github/workflows/ci.yml:97 — it was 20 when this list was
    # written, and ADR-0021's ratchet raised it on 2026-10-06), while 80 is the frontend
    # Vitest threshold and applies only to the 17 modules in coverage.include
    # (frontend/vitest.config.mts:55-60 for the thresholds, :36-54 for that list).
    # Both testing docs restated "80% for both
    # stacks" as enforced; the numbers now have one home in docs/TESTING_STRATEGY.md §1.
    # These entries are deliberately short: the scan is line-based, so a long phrase a
    # writer wraps across two lines evades it - which is how the original
    # "enforced in CI for both stacks" sentence survived in the first place.
    (
        "≥80% coverage floor",
        "the backend gate is --cov-fail-under=63; the 80% floor is frontend-only; see G1",
    ),
    (
        "coverage below 80%",
        "the backend gate is --cov-fail-under=63 (ci.yml:97); see G1",
    ),
    (
        "deploys are health-gated",
        "no deploy workflow runs a rollout or a health gate; see G17/G26",
    ),
    (
        "bundle gate: ≤150kb",
        "no CI job asserts a bundle size; frontend-build only boots the bundle; see G21",
    ),
    # Added with §8 G32 (2026-10-05). docs/PERFORMANCE_REPORT.md asserted a Lighthouse
    # budget gate that does not run: frontend-lighthouse is `if: false`
    # (.github/workflows/ci.yml:227-232), frontend-playwright-smoke is `if: false`
    # (:258-263), and `git grep -nE 'lighthouse-budget|bundle-analyze|analyze:bundle'` over
    # .github/ and Makefile returns zero hits. Each entry below is a fragment of that claim
    # which cannot appear in an honest correction: the corrected sentences say the budget is
    # asserted by nothing, that no job reads it, and that no artifacts are retained.
    (
        "(CI-enforced)",
        "no workflow reads frontend/scripts/lighthouse-budget.json; the job is if:false; see G5",
    ),
    (
        "fails over budget",
        "frontend-lighthouse is if:false, so no job asserts any budget; see G5",
    ),
    (
        "artifacts retained per build",
        "no Lighthouse job runs, so no artifacts exist; see G5",
    ),
)

ADR_RANGE = re.compile(r"ADR-0001[\u2026\-.]+ADR-?0\d{3}|ADR-0001[\u2026\-.]+0?\d{3}\b")
GAP_ID = re.compile(r"^\|\s*(G\d+)\s*\|")
NEVER_ISSUED = "NEVER ISSUED"

# A compliance register legitimately quotes the claim it retracted, and a sprint
# changelog legitimately describes a past state. Without this exemption the gate
# would flag its own audit trail, and a gate that cries wolf gets switched off
# (the failure mode recorded as G3 and G15).
HISTORICAL_MARKERS = (
    "previously",
    "retract",
    "was false",
    "no longer",
    "in error",
    "falsified",
    "first claimed",
    "corrected",
    "was listed here",
    "does not exist",
    "never existed",
    "sprint",
    "opened",
    "at the time",
)


class CannotVerify(Exception):
    """Raised when an input is missing or unreadable — never a silent pass."""


def read(path: str) -> str:
    p = REPO_ROOT / path
    if not p.is_file():
        raise CannotVerify(f"{path} not found")
    try:
        return p.read_text(encoding="utf-8")
    except OSError as exc:
        raise CannotVerify(f"{path} unreadable: {exc}") from exc


def existing_governance_files() -> list[str]:
    return [f for f in GOVERNANCE_FILES if (REPO_ROOT / f).is_file()]


def governance_inputs() -> list[str]:
    """C2/C4 scope: the listed documents plus every tracked Markdown file.

    Derived from `git ls-files` so that a document cannot escape the path and ADR-range
    checks by not having been added to a list — §8 G30, G32 and G38 are three entries
    describing that one hole. Non-markdown inputs stay explicit, because there is no way
    to infer from a filename whether its comments are contributor-facing claims.
    """
    return sorted(set(GOVERNANCE_FILES) | set(tracked_markdown()))


def live_claim_inputs() -> list[str]:
    """C3/C6 scope: every tracked Markdown file except those exempted with a reason.

    `LIVE_CLAIM_FILES` remains the explicit floor — each of its Markdown entries was added
    after a finding proved the document needed it, and its non-markdown entries cannot be
    derived — but the scope is no longer *only* what somebody remembered to append.
    """
    auto = [f for f in tracked_markdown() if f not in CLAIM_SCOPE_EXEMPT]
    return sorted(set(LIVE_CLAIM_FILES) | set(auto))


def assert_inputs_present() -> None:
    """Fail closed when a listed input no longer exists (G15's principle, applied here).

    Every check skips a file it cannot read, so a listed path that was deleted silently
    drops out of C2/C3/C4/C6 while the run still prints "clean" - a false green measured
    against nothing, which is the same failure mode the secrets scanner had before G15.
    A document removed from the tree must be removed from these lists in the same
    commit; the root CHANGELOG.md stub was, on 2026-10-05.
    """
    listed = list(dict.fromkeys([*LIVE_CLAIM_FILES, *GOVERNANCE_FILES]))
    missing = [f for f in listed if not (REPO_ROOT / f).is_file()]
    if missing:
        raise CannotVerify(f"listed input(s) missing from the tree: {', '.join(missing)}")


def check_origin(problems: list[str]) -> int:
    """C1: badge and link URLs must point at the repository's real remote."""
    # Resolve via PATH so the argv[0] is an absolute path (S607) and a missing git
    # is reported as CANNOT VERIFY rather than surfacing as an OSError traceback.
    git = shutil.which("git")
    if git is None:
        raise CannotVerify("git executable not found on PATH")
    try:
        remote = subprocess.run(
            [git, "-C", str(REPO_ROOT), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError) as exc:
        raise CannotVerify("cannot read the 'origin' remote") from exc
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", remote)
    if not m:
        raise CannotVerify(f"origin remote is not a github.com URL: {remote!r}")
    owner, repo = m.group(1), m.group(2)
    readme = read("README.md")
    n = 0
    for found in re.finditer(r"https://github\.com/([^/]+)/([^/)]+?)(?:/|$)", readme):
        if found.group(1) == owner and found.group(2) == repo:
            continue
        if found.group(1) in ("img", "shields"):
            continue
        problems.append(
            f"C1 origin: README cites github.com/{found.group(1)}/{found.group(2)} "
            f"but origin is {owner}/{repo} -> {found.group(0)}"
        )
        n += 1
    return n


def path_exists(token: str) -> bool:
    cleaned = token.strip().rstrip("/")
    for root in PATH_ROOTS:
        if (REPO_ROOT / root / cleaned).exists():
            return True
    return False


def check_paths(problems: list[str]) -> int:
    """C2: every backticked repository path cited in governance docs exists.

    Only literal, repo-root-relative paths are considered, and lines that quote a
    retracted claim are skipped — the register must be able to name a phantom path
    in order to record that it was one.
    """
    missing: set[str] = set()
    for f in governance_inputs():
        for lineno, line in enumerate(read(f).splitlines(), 1):
            low = line.lower()
            if any(k in low for k in HISTORICAL_MARKERS):
                continue
            for token in BACKTICK.findall(line):
                # A citation may carry several line refs: :167, :194-195, :3-5,127.
                token = re.sub(r":\d[\d,\-]*$", "", token).strip()
                if not PATH_PREFIX.match(token):
                    continue
                # Only genuine non-literal syntax is skipped. '.' must NOT be here:
                # every real filename contains one, and an earlier revision that
                # tested for '.' silently skipped all input and reported a false
                # pass — the always-green defect this repo records as G3.
                if any(c in token for c in "*<>${}|") or "..." in token:
                    continue
                if not path_exists(token):
                    missing.add(f"{f}:{lineno}: {token}")
    for m in sorted(missing):
        problems.append(f"C2 path: cited path does not exist -> {m}")
    return len(missing)


def check_live_claims(problems: list[str]) -> int:
    """C3: strings proven false must not be asserted as current fact."""
    hits = 0
    for f in live_claim_inputs():
        if not (REPO_ROOT / f).is_file():
            continue
        for lineno, line in enumerate(read(f).splitlines(), 1):
            low = line.lower()
            if any(k in low for k in HISTORICAL_MARKERS):
                continue  # a quotation of a retracted claim is legitimate
            for phrase, why in FALSIFIED:
                if phrase.lower() in low:
                    problems.append(f"C3 claim: {f}:{lineno} asserts {phrase!r} — {why}")
                    hits += 1
    return hits


def registry_max() -> int:
    """Largest ADR number actually present in the registry, or raise."""
    text = read("docs/ARCHITECTURE_DECISION_RECORDS.md")
    nums = [int(m.group(1)) for m in re.finditer(r"^## ADR-(\d{4})", text, re.MULTILINE)]
    if not nums:
        raise CannotVerify("ADR registry has no '## ADR-NNNN' headings")
    return max(nums)


def check_adr_ranges(problems: list[str]) -> int:
    """C4: no document may assert a CURRENT ADR range that understates the registry.

    Two legitimate cases are skipped, because a checker that cries wolf gets
    switched off — the failure mode recorded as G3 and G15:
      - register rows (`| G8 | ...`), which must quote the claim they retract;
      - historical statements ("ADR register opened (ADR-0001…0006)"), which
        describe a past state and are not claims about the registry today.
    """
    actual = registry_max()
    n = 0
    for f in governance_inputs():
        if not (REPO_ROOT / f).is_file():
            continue
        for lineno, line in enumerate(read(f).splitlines(), 1):
            if line.startswith("| G"):
                continue
            low = line.lower()
            if any(k in low for k in HISTORICAL_MARKERS):
                continue
            m = ADR_RANGE.search(line)
            if not m:
                continue
            bounds = [int(x) for x in re.findall(r"0(\d{3})", m.group(0))]
            if bounds and max(bounds) < actual:
                problems.append(
                    f"C4 adr: {f}:{lineno} claims the registry ends at "
                    f"ADR-{max(bounds):04d} but ADR-{actual:04d} exists — name no "
                    "range in prose (G8: a hardcoded range drifts on the next ADR)"
                )
                n += 1
    return n


def parse_register(text: str) -> tuple[list[str], list[str], list[tuple[int, int]]]:
    """Return (gap IDs, statuses, row-runs) for the §8 table."""
    lines = text.splitlines()
    runs: list[tuple[int, int]] = []
    ids: list[str] = []
    statuses: list[str] = []
    start = None
    for i, line in enumerate(lines, 1):
        if line.startswith("|"):
            if start is None:
                start = i
            m = GAP_ID.match(line)
            if m:
                ids.append(m.group(1))
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                statuses.append(cells[1] if len(cells) > 1 else "")
        elif start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(lines)))
    return ids, statuses, runs


def check_register(problems: list[str]) -> int:
    """C5: register contiguity, ID holes declared, Closed summary agrees."""
    text = read("QODER.md")
    ids, statuses, runs = parse_register(text)
    n = 0
    if not ids:
        raise CannotVerify("no gap rows found in QODER.md — register unreadable")

    register_runs = [r for r in runs if _run_has_ids(text, r)]
    if len(register_runs) != 1:
        problems.append(
            f"C5 register: expected exactly one contiguous gap-table run, "
            f"found {len(register_runs)} {register_runs} — a blank line inside a "
            "Markdown table silently detaches the rows below it"
        )
        n += 1

    # Every row must carry as many cells as the header. A row missing one renders with an
    # empty column on GitHub, which in this table reads as "no evidence recorded" - G14's
    # row lacked both its Evidence cell and its terminating pipe, and no gate could see
    # it: contiguity held, the ID parsed, the summary agreed. Escaped pipes (\|, legal
    # inside a cell and used by several rows' grep patterns) are not separators.
    for start, end in register_runs:
        row_lines = text.splitlines()[start - 1 : end]
        counts = {
            start + k: len(re.split(r"(?<!\\)\|", ln.strip().strip("|")))
            for k, ln in enumerate(row_lines)
        }
        expected = counts[start]
        odd = {ln: c for ln, c in counts.items() if c != expected}
        if odd:
            problems.append(
                f"C5 register: rows {sorted(odd)} carry {sorted(set(odd.values()))} cells "
                f"but the table header carries {expected} — a row missing a cell renders "
                "as an empty column, which reads as 'no evidence recorded'"
            )
            n += 1

    nums = sorted(int(i[1:]) for i in ids)
    holes = [x for x in range(nums[0], nums[-1] + 1) if x not in set(nums)]
    for h in holes:
        problems.append(f"C5 register: G{h} missing but not marked {NEVER_ISSUED}")
        n += 1

    closed_summary = ""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("**Closed:**"):
            # One logical paragraph wrapped over several physical lines. Reading
            # only the first loses the trailing IDs and reported a false "absent
            # from the summary" finding during development.
            j = i
            while j < len(lines) and lines[j].strip():
                closed_summary += lines[j] + " "
                j += 1
            break
    if not closed_summary:
        problems.append("C5 register: no '**Closed:**' summary line found")
        n += 1
    else:
        # Membership is tested on whole tokens, never by substring. `gid not in
        # closed_summary` silently reported G2, G3, G6 and G7 as present whenever the
        # summary contained any of G20/G22/G24/G25/G26 — so a real drift for a short
        # ID was undetectable. Found by making the self-test probe pick its own target
        # row rather than hardcoding one; the hardcoded probe had been sitting on a
        # short-ID-adjacent ID and passing for the wrong reason (the G3 class).
        closed_ids = set(re.findall(r"G\d+", closed_summary))
        for gid, status in zip(ids, statuses, strict=True):
            if "CLOSED" in status.upper() and gid not in closed_ids:
                problems.append(
                    f"C5 register: {gid} is CLOSED in the table but absent from "
                    "the '**Closed:**' summary (the audit trail disagrees with itself)"
                )
                n += 1
    return n


def _run_has_ids(text: str, run: tuple[int, int]) -> bool:
    body = text.splitlines()[run[0] - 1 : run[1]]
    return any(GAP_ID.match(line) for line in body)


def parse_make_targets(makefile: str) -> dict[str, tuple[str, str]]:
    """target -> (declared comment text, recipe text), order preserved."""
    collected: dict[str, list[str]] = {}
    order: list[str] = []
    bucket: str | None = None
    for line in makefile.splitlines():
        m = re.match(r"^([A-Za-z0-9_.-]+):", line)
        if m:
            bucket = m.group(1)
            collected.setdefault(bucket, []).append(line)
            order.append(bucket)
        elif bucket is not None and line.startswith("\t"):
            collected[bucket].append(line)
    return {
        tgt: (
            "\n".join(collected[tgt]),
            "\n".join(row for row in collected[tgt] if row.startswith("\t")),
        )
        for tgt in order
    }


def check_make_targets(problems: list[str]) -> int:
    """C6: contributor docs may not cite an invocable target that does not exist,
    and a Makefile comment asserting 'no CI job does this' must still be true.

    Claim-checked scope (`live_claim_inputs()`) is scanned for citations. QODER.md §8 is
    exempted in CLAIM_SCOPE_EXEMPT and legitimately *proposes* targets that do not exist
    yet (G14's `make deps-check`); flagging a proposal as a false citation would make this
    check cry wolf, and a checker that cries wolf gets disabled.
    """
    n = 0
    makefile = read("Makefile")
    defined = set(re.findall(r"^([a-zA-Z0-9_-]+):", makefile, re.MULTILINE))
    if not defined:
        raise CannotVerify("Makefile has no targets")

    cited: set[str] = set()
    for f in live_claim_inputs():
        if (REPO_ROOT / f).is_file():
            cited.update(re.findall(r"`make ([a-z][a-z0-9-]*)`", read(f)))
    for target in sorted(cited):
        if target not in defined:
            problems.append(
                f"C6 make: contributor docs cite `make {target}` as invocable but "
                "it is not defined in the Makefile"
            )
            n += 1

    wf_files = sorted((REPO_ROOT / ".github" / "workflows").glob("*.yml"))
    if not wf_files:
        raise CannotVerify("no workflows found to test 'no CI job' claims against")
    workflows = "\n".join(w.read_text(encoding="utf-8") for w in wf_files)

    for target, (comment, recipe) in parse_make_targets(makefile).items():
        if "no ci job" not in comment.lower():
            continue
        scripts = re.findall(r"([A-Za-z0-9_]+\.py)", recipe)
        invoked = sorted({s for s in scripts if s in workflows})
        if invoked:
            problems.append(
                f"C6 make: `{target}` is documented as something 'no CI job does', "
                f"but {', '.join(invoked)} IS invoked by .github/workflows — the "
                "comment is stale and understates the enforced gates"
            )
            n += 1
    return n


SEPARATOR_ROW = re.compile(r"^\|[\s\-:|]+\|$")
UNESCAPED_PIPE = re.compile(r"(?<!\\)\|")


def _cell_count(line: str) -> int:
    """Cells in a table row, ignoring pipes escaped as '\\|'.

    An escaped pipe is legal inside a cell and renders as a literal bar; several rows in
    docs/RUNBOOK.md and the 2026-08 audit report carry them inside grep patterns in code
    spans. Counting one as a separator reported well-formed rows as broken - a checker
    false positive, which is how checkers get ignored.
    """
    body = line.strip()
    body = body[1:] if body.startswith("|") else body
    body = body[:-1] if body.endswith("|") else body
    return len(UNESCAPED_PIPE.split(body))


def _outside_fences(text: str) -> list[tuple[int, str]]:
    """(lineno, line) for lines not inside a fenced code block.

    A fence can legitimately contain pipe-leading lines that are not table rows, and
    flagging one would make this check cry wolf - the failure mode recorded as G3 and G15.
    """
    out: list[tuple[int, str]] = []
    fence: str | None = None
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip()
        if fence is None and (stripped.startswith("```") or stripped.startswith("~~~")):
            fence = stripped[:3]
            continue
        if fence is not None:
            if stripped.startswith(fence):
                fence = None
            continue
        out.append((lineno, line))
    return out


def tracked_markdown() -> list[str]:
    """Every Markdown file git tracks, or raise.

    Tracked, not walked: node_modules, .venv and .next all contain Markdown that is not
    this repository's, and a scan that reads them reports defects nobody can fix.
    """
    git = shutil.which("git")
    if git is None:
        raise CannotVerify("git executable not found on PATH")
    try:
        out = subprocess.run(
            [git, "-C", str(REPO_ROOT), "ls-files", "-z", "*.md"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, OSError) as exc:
        raise CannotVerify("cannot list tracked Markdown files") from exc
    files = [f for f in out.split("\0") if f]
    if not files:
        raise CannotVerify("git tracks no Markdown files - refusing to report a clean tree")
    return files


def check_tables(problems: list[str]) -> int:
    """C7: every tracked Markdown table is one run, one separator, one cell count per row.

    Structural rather than claim-based, so it scans every tracked Markdown file instead of
    the two claim lists: a malformed table is a defect wherever it sits, and a list someone
    has to remember to extend is how both §8 G30 and §8 G32 happened. Two failure modes are
    covered because both render silently wrong on GitHub and both were committed by the
    person writing the checker:

      - a blank line inside a table detaches every row below it (§8 G31, a register row
        wrapped across five physical lines);
      - a row that loses its leading '|' leaves the run entirely, so a contiguity check and
        a cell-count check both see a shorter, well-formed table and pass. Measured on this
        branch: an edit to docs/GRANT_APPLICATION.md dropped the pipe from a risk-register
        row, and the only thing that noticed was a human reading the diff.
    """
    n = 0
    for rel in tracked_markdown():
        lines = _outside_fences(read(rel))
        runs: list[list[tuple[int, str]]] = []
        current: list[tuple[int, str]] = []
        for item in lines:
            if item[1].startswith("|"):
                current.append(item)
            elif current:
                runs.append(current)
                current = []
        if current:
            runs.append(current)

        for run in runs:
            first, last = run[0][0], run[-1][0]
            if len(run) < 2:
                problems.append(
                    f"C7 table: {rel}:{first} is a one-line table run — a row detached "
                    "from its header renders as prose, not as a record"
                )
                n += 1
                continue
            seps = [ln for ln, text in run if SEPARATOR_ROW.match(text)]
            if len(seps) != 1:
                problems.append(
                    f"C7 table: {rel}:{first}-{last} carries {len(seps)} separator rows, "
                    "expected exactly 1 — a blank line inside a Markdown table silently "
                    "detaches every row below it"
                )
                n += 1
            counts = {ln: _cell_count(text) for ln, text in run if not SEPARATOR_ROW.match(text)}
            if counts:
                expected = counts[run[0][0]]
                odd = {ln: c for ln, c in counts.items() if c != expected}
                if odd:
                    problems.append(
                        f"C7 table: {rel} rows {sorted(odd)} carry "
                        f"{sorted(set(odd.values()))} cells but the table's own header "
                        f"carries {expected} — a row missing a cell renders as an empty "
                        "column, which in an evidence table reads as 'none recorded'"
                    )
                    n += 1

        # A row that lost its leading pipe is not part of any run, so the checks above
        # cannot see it. Recognise it by shape: it ends with a pipe and carries at least
        # three pipe-separated pieces.
        for lineno, text in lines:
            stripped = text.rstrip()
            if stripped.startswith("|") or not stripped.endswith("|"):
                continue
            if len(UNESCAPED_PIPE.split(stripped)) >= 3:
                problems.append(
                    f"C7 table: {rel}:{lineno} ends with '|' but does not start with one — "
                    "a table row that lost its leading pipe renders as prose and drops "
                    "out of every other table check"
                )
                n += 1
    return n


def check_claim_scope(problems: list[str]) -> int:
    """C8: the exemption map is the only door out of C3/C6, so the door itself is checked.

    Absence used to mean invisibility — §8 G38 measured 31 of 51 tracked Markdown files in
    neither list. Now every tracked document is claim-checked unless it is named in
    CLAIM_SCOPE_EXEMPT, which makes exemption a *stated claim* this check can falsify: the
    path must still be tracked, the reason must be written down, and no file may be both
    claim-checked and exempted. Without this, widening scope by derivation would simply
    move the silent failure from "forgot to add" to "forgot to justify".
    """
    n = 0
    tracked = set(tracked_markdown())
    for path, reason in sorted(CLAIM_SCOPE_EXEMPT.items()):
        if path not in tracked:
            problems.append(
                f"C8 scope: {path} is exempted from C3/C6 but git tracks no such Markdown "
                "file — a stale exemption silences nothing, so it must go with the document"
            )
            n += 1
        if not reason.strip():
            problems.append(
                f"C8 scope: {path} is exempted from C3/C6 with no reason — exemption has to "
                "be a written claim, because an unexplained exemption is exactly how §8 G30 "
                "and G32 read as 'nothing wrong here'"
            )
            n += 1
    for path in sorted(set(CLAIM_SCOPE_EXEMPT) & set(LIVE_CLAIM_FILES)):
        problems.append(
            f"C8 scope: {path} appears in LIVE_CLAIM_FILES *and* CLAIM_SCOPE_EXEMPT — "
            "contradictory scope reads as checked to whichever reader is wrong"
        )
        n += 1
    return n


CHECKS = {
    "C1 origin": check_origin,
    "C2 real paths": check_paths,
    "C3 live claims": check_live_claims,
    "C4 no ADR counts": check_adr_ranges,
    "C5 register integrity": check_register,
    "C6 make targets/CI claims": check_make_targets,
    "C7 table integrity": check_tables,
    "C8 claim scope": check_claim_scope,
}


def run() -> int:
    assert_inputs_present()
    if not existing_governance_files():
        raise CannotVerify("no governance documents found")
    problems: list[str] = []
    counts = {}
    for name, fn in CHECKS.items():
        found = fn(problems)
        counts[name] = found
        status = "ok" if found == 0 else f"{found} violation(s)"
        print(f"  {name:24s} {status}")
    if problems:
        print()
        for p in problems:
            print(f"::error::{p}")
        print(f"\ncheck_doc_claims: FAILED — {len(problems)} contradicted claim(s)")
        return 1
    print("\ncheck_doc_claims: clean (documentation matches configuration)")
    print("note: this is a denylist gate for falsified claim classes; it does NOT")
    print("prove the documentation accurate, and verifies no GitHub-side state.")
    return 0


# --------------------------------------------------------------------------
# self-test
#
# A checker that can never fail is worse than no checker — it manufactures
# confidence. This is the exact defect recorded as G3 and it is why
# check_dependabot_groups.py runs --self-test first; the same discipline applies
# here. Each case injects one violation of one check and requires that check to
# report it, then a control case requires the same check to stay silent. If a
# check stops detecting its own probe, CI fails here before it can go green on
# real input.
# --------------------------------------------------------------------------
def self_test() -> int:
    # (label, behaved_as_required, detail, expect_detection)
    results: list[tuple[str, bool, str, bool]] = []

    def case(label, path, mutation, fn, expect_hit, about):
        """Inject (or not inject) one violation and require the right verdict.

        `about` scopes the verdict to the probe's own finding, so a pre-existing
        real defect elsewhere in the repo cannot masquerade as a passing control
        case — an earlier revision did exactly that and reported the C6 control as
        MISSED for the wrong reason.
        """
        old, new = mutation
        target = REPO_ROOT / path
        if not target.is_file():
            results.append((label, False, "input missing", expect_hit))
            return
        backup = target.read_text(encoding="utf-8")
        try:
            mutated = backup.replace(old, new, 1)
            if mutated == backup:
                results.append((label, False, "anchor not found in file", expect_hit))
                return
            target.write_text(mutated, encoding="utf-8")
            problems: list[str] = []
            try:
                fn(problems)
            except CannotVerify as exc:
                results.append((label, False, f"cannot verify: {exc}", expect_hit))
                return
            hit = any(about in p for p in problems)
            ok = hit if expect_hit else not hit
            detail = next(
                (p for p in problems if about in p),
                problems[0] if problems else "no finding",
            )
            results.append((label, ok, detail[:120], expect_hit))
        finally:
            target.write_text(backup, encoding="utf-8")

    # C1 — a badge pointing at a retired org must be reported.
    case(
        "C1 detects wrong org",
        "README.md",
        (
            "github.com/jolarca-dev/jolarca/actions/workflows/ci.yml/badge",
            "github.com/some-other-org/jolarca/actions/workflows/ci.yml/badge",
        ),
        check_origin,
        True,
        "some-other-org",
    )
    # C2 — a cited path that does not exist must be reported.
    case(
        "C2 detects phantom path",
        "CONTRIBUTING.md",
        ("frontend/src/generated/api.ts", "frontend/src/generated/api_nope.ts"),
        check_paths,
        True,
        "api_nope",
    )
    # C2 control — the same path named as nonexistent must not be flagged: the
    # register has to be allowed to record that a path was a phantom.
    case(
        "C2 accepts a phantom note",
        "CONTRIBUTING.md",
        (
            "## Architecture rules\n",
            ("## Architecture rules\n`frontend/src/generated/api_nope2.ts` does not exist.\n"),
        ),
        check_paths,
        False,
        "api_nope2",
    )
    # C3 — a falsified claim re-asserted must be reported.
    case(
        "C3 detects falsified claim",
        "CONTRIBUTING.md",
        ("## Quality gates\n", "## Quality gates (all enforced in CI)\n"),
        check_live_claims,
        True,
        "(all enforced in CI)",
    )
    case(
        "C3 ignores a retraction",
        "CONTRIBUTING.md",
        (
            "## Quality gates\n",
            "## Quality gates\npreviously said (all enforced in CI), corrected.\n",
        ),
        check_live_claims,
        False,
        "(all enforced in CI)",
    )
    # C4 — a hardcoded ADR range understating the registry must be reported.
    # Anchor chosen at run time, for the reason documented on the C5 probe below: this
    # case hardcoded the literal README.md table cell "Consolidated ADR registry |", and
    # the t9 index work replaced that table with entry points, which killed the probe
    # ("anchor not found in file"). check_adr_ranges reads lines, not tables, so any
    # heading will carry the injected claim — the H1 is the one line README.md is
    # guaranteed to keep.
    readme_h1 = next((ln for ln in read("README.md").splitlines() if ln.startswith("# ")), "")
    if not readme_h1:
        results.append(
            (
                "C4 detects volatile count",
                False,
                (
                    "no '# ' heading in README.md to anchor on - the structure this "
                    "probe needs has changed"
                ),
                True,
            )
        )
    else:
        case(
            "C4 detects volatile count",
            "README.md",
            (readme_h1, f"{readme_h1} — registry ends at ADR-0001…0017"),
            check_adr_ranges,
            True,
            "0017",
        )
    # C4 control — a register row quoting the claim it retracted stays legal.
    case(
        "C4 accepts a register quote",
        "QODER.md",
        (
            "| G12 | **NEVER ISSUED** |",
            "| G12x | historical, registry was ADR-0001…0002 |",
        ),
        check_adr_ranges,
        False,
        "0002",
    )
    # C5 — a blank line detaching register rows must be reported.
    case(
        "C5 detects detached row",
        "QODER.md",
        ("| G24 | **CLOSED** 2026-10-05 |", "\n| G24 | **CLOSED** 2026-10-05 |"),
        check_register,
        True,
        "contiguous",
    )
    # C5 — a CLOSED gap dropped from the summary must be reported.
    # The anchor is chosen at run time, not written down. Three earlier revisions
    # hardcoded it and all three broke: two on the wording of the '**Closed:**'
    # summary line (append-only by design, so every newly CLOSED gap invalidated it)
    # and the third on a specific row's status, which broke the moment that gap was
    # honestly closed by #171. A probe that dies when the work it guards gets done is
    # a probe that will be deleted rather than fixed. Any row currently reading
    # '| Gn | OPEN |' will do: flipping it to CLOSED makes it absent from the summary
    # by construction, exercising the same check with no wording dependency.
    open_rows = re.findall(r"^\|\s*(G\d+)\s*\|\s*OPEN\s*\|", read("QODER.md"), re.MULTILINE)
    if not open_rows:
        results.append(
            (
                "C5 detects summary drift",
                False,
                (
                    "no '| Gn | OPEN |' row available to anchor on - the register "
                    "structure this probe needs has changed"
                ),
                True,
            )
        )
    else:
        gid = open_rows[0]
        case(
            "C5 detects summary drift",
            "QODER.md",
            (f"| {gid} | OPEN |", f"| {gid} | **CLOSED** 2026-01-01 |"),
            check_register,
            True,
            f"{gid} is CLOSED",
        )
    # C5 — a register row missing a cell must be reported. Anchor: the register's own
    # separator, which is the only five-column separator in QODER.md (measured 2026-10-05),
    # so shortening it by one column makes every row disagree with the header without
    # touching a row another probe anchors on.
    case(
        "C5 detects a short row",
        "QODER.md",
        ("|---|---|---|---|---|", "|---|---|---|---|"),
        check_register,
        True,
        "cells",
    )
    # C6 — a citation of a nonexistent make target must be reported.
    case(
        "C6 detects missing target",
        "CONTRIBUTING.md",
        ("`make lock`", "`make lockthatdoesnotexist`"),
        check_make_targets,
        True,
        "lockthatdoesnotexist",
    )
    # C6 control — QODER.md §8 legitimately *proposes* a target that does not
    # exist yet (G14's `make deps-check`). Flagging a proposal would make this
    # check cry wolf, which is how a checker gets switched off. Must stay silent.
    case(
        "C6 ignores a proposal",
        "QODER.md",
        (
            "**Remediation queue, in priority order**",
            "**Remediation queue, in priority order** — run `make deps-checkx` soon",
        ),
        check_make_targets,
        False,
        "deps-checkx",
    )
    # C7 — a blank line inside a table detaches every row below it. Anchored on the index's
    # authority-map header plus separator, which is the only three-column separator in
    # docs/README.md preceded by that exact heading.
    case(
        "C7 detects a detached row",
        "docs/README.md",
        (
            "| Topic | Single home | Links, never restates |\n| --- | --- | --- |\n",
            "| Topic | Single home | Links, never restates |\n| --- | --- | --- |\n\n",
        ),
        check_tables,
        True,
        "separator rows",
    )
    # C7 — a row that loses its leading pipe leaves the run, so contiguity and cell counts
    # both still pass. This is the defect committed on this branch and caught only by a
    # human reading the diff; it is a probe now.
    case(
        "C7 detects a lost leading pipe",
        "docs/README.md",
        ("| Document inventory | ", " Document inventory | "),
        check_tables,
        True,
        "leading pipe",
    )
    # C7 control — an escaped pipe inside a cell is legal and renders as a literal bar.
    # Counting it as a separator is the false positive that makes a table check get
    # switched off; the real tree carries such rows in docs/RUNBOOK.md and in the 2026-08
    # audit report, so this probe and the gate itself must both stay silent. `about` names
    # the file as well as the finding, because C7 scans every tracked Markdown file: with
    # a bare "cells" this control reported FALSE POSITIVE the first time it ran, matching a
    # genuine defect in a QODER.md row rather than anything the probe had injected.
    inventory_row = (
        "| Document inventory | [`docs/README.md`](README.md) (this file) "
        "| `README.md` (entry points only) |\n"
    )
    case(
        "C7 accepts an escaped pipe",
        "docs/README.md",
        (
            inventory_row,
            inventory_row + "| Escaped-pipe control | `grep -E 'a\\|b'` | none |\n",
        ),
        check_tables,
        False,
        "docs/README.md rows",
    )

    # C8 — exemption is the only door out of C3/C6 now that scope is derived, so the door
    # is probed. These patch the map in memory rather than a file, the way the fail-closed
    # probe below does: the tree is never touched, and the map is restored either way.
    saved_exempt = dict(CLAIM_SCOPE_EXEMPT)
    try:
        CLAIM_SCOPE_EXEMPT["docs/NOPE-selftest.md"] = "probe: names an untracked file"
        probs: list[str] = []
        check_claim_scope(probs)
        results.append(
            (
                "C8 detects an exemption naming an untracked file",
                any("NOPE-selftest" in p for p in probs),
                next((p for p in probs if "NOPE-selftest" in p), "no finding")[:120],
                True,
            )
        )
    finally:
        CLAIM_SCOPE_EXEMPT.clear()
        CLAIM_SCOPE_EXEMPT.update(saved_exempt)
    try:
        real = next(iter(CLAIM_SCOPE_EXEMPT))
        CLAIM_SCOPE_EXEMPT[real] = "   "
        probs = []
        check_claim_scope(probs)
        results.append(
            (
                "C8 detects an exemption with no reason",
                any("no reason" in p for p in probs),
                next((p for p in probs if "no reason" in p), "no finding")[:120],
                True,
            )
        )
    finally:
        CLAIM_SCOPE_EXEMPT.clear()
        CLAIM_SCOPE_EXEMPT.update(saved_exempt)
    # C8 control — the real map must stay silent. A stale exemption in the tree makes this
    # report FALSE POSITIVE, which is the intended reading: an unexplained or dead door is
    # a finding, not a configuration detail.
    probs = []
    check_claim_scope(probs)
    results.append(
        (
            "C8 control: real scope is silent",
            not probs,
            (probs[0][:120] if probs else f"{len(live_claim_inputs())} claim-checked input(s)"),
            False,
        )
    )

    # Input presence - a listed path that no longer exists must fail closed rather than
    # be skipped. Probed by appending a phantom entry to the live list in memory: the
    # tree is never touched, and the entry is popped whichever way the probe exits.
    LIVE_CLAIM_FILES.append("docs/NOPE-selftest.md")
    try:
        assert_inputs_present()
    except CannotVerify as exc:
        results.append(
            ("missing input fails closed", "NOPE-selftest" in str(exc), str(exc)[:120], True)
        )
    else:
        results.append(("missing input fails closed", False, "no CannotVerify raised", True))
    finally:
        LIVE_CLAIM_FILES.pop()

    width = max(len(r[0]) for r in results)
    failures = 0
    for label, ok, detail, expect_hit in results:
        # Wording must track intent. A control case that passes means the checker
        # stayed silent; only a detection case that passes "detected".
        verdict = (
            ("detected" if ok else "MISSED")
            if expect_hit
            else ("silent" if ok else "FALSE POSITIVE")
        )
        print(f"  {label:{width}s}: {verdict:14s} {detail}")
        if not ok:
            failures += 1
    if failures:
        print(f"\nself-test: FAILED — {failures} probe(s) not behaving as required")
        return 1
    print(
        f"\nself_test: PASS — {len(results)} probes behaved as required "
        "(each check can still detect its own injected violation)"
    )
    return 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    try:
        return run()
    except CannotVerify as exc:
        print(f"::error::check_doc_claims: CANNOT VERIFY — {exc}")
        print(
            "A vacuous pass is not acceptable: this gate exits 2 when it cannot "
            "observe its inputs, so a missing file cannot read as success."
        )
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
