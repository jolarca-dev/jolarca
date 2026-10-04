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
C2 real paths   — every backticked repository path cited in governance docs
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
    "CHANGELOG.md",
    "docs/SECURITY.md",
    "docs/CHANGELOG.md",
    ".github/CODEOWNERS",
    "Makefile",
]

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
]

PATH_ROOTS = ["", "backend"]
PATH_PREFIX = re.compile(
    r"^(?:backend|frontend|docs|scripts|\.github|nginx|secrets|audits|apps)/"
)
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
    ("coverage-%E2%89%A580", "the gate is --cov-fail-under=20; see G1"),
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


def check_origin(problems: list[str]) -> int:
    """C1: badge and link URLs must point at the repository's real remote."""
    try:
        remote = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        raise CannotVerify("cannot read the 'origin' remote")
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
    for f in existing_governance_files():
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
    for f in LIVE_CLAIM_FILES:
        if not (REPO_ROOT / f).is_file():
            continue
        for lineno, line in enumerate(read(f).splitlines(), 1):
            low = line.lower()
            if any(k in low for k in HISTORICAL_MARKERS):
                continue  # a quotation of a retracted claim is legitimate
            for phrase, why in FALSIFIED:
                if phrase.lower() in low:
                    problems.append(
                        f"C3 claim: {f}:{lineno} asserts {phrase!r} — {why}"
                    )
                    hits += 1
    return hits


def registry_max() -> int:
    """Largest ADR number actually present in the registry, or raise."""
    text = read("docs/ARCHITECTURE_DECISION_RECORDS.md")
    nums = [
        int(m.group(1)) for m in re.finditer(r"^## ADR-(\d{4})", text, re.MULTILINE)
    ]
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
    for f in GOVERNANCE_FILES:
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
        for gid, status in zip(ids, statuses):
            if "CLOSED" in status.upper() and gid not in closed_summary:
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

    Only live-claim files are scanned for citations. QODER.md §8 is a remediation
    queue and legitimately *proposes* targets that do not exist yet (G14's
    `make deps-check`); flagging a proposal as a false citation would make this
    check cry wolf, and a checker that cries wolf gets disabled.
    """
    n = 0
    makefile = read("Makefile")
    defined = set(re.findall(r"^([a-zA-Z0-9_-]+):", makefile, re.MULTILINE))
    if not defined:
        raise CannotVerify("Makefile has no targets")

    cited: set[str] = set()
    for f in LIVE_CLAIM_FILES:
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


CHECKS = {
    "C1 origin": check_origin,
    "C2 real paths": check_paths,
    "C3 live claims": check_live_claims,
    "C4 no ADR counts": check_adr_ranges,
    "C5 register integrity": check_register,
    "C6 make targets/CI claims": check_make_targets,
}


def run() -> int:
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
            "## Architecture rules\n"
            "`frontend/src/generated/api_nope2.ts` does not exist.\n",
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
    case(
        "C4 detects volatile count",
        "README.md",
        (
            "Consolidated ADR registry |",
            "Consolidated ADR registry (ADR-0001…0017) |",
        ),
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
    case(
        "C5 detects summary drift",
        "QODER.md",
        (
            # Anchored on the oldest clause of the '**Closed:**' line, not the recent
            # additions: an earlier probe anchored on 'G8, G9, G22 and\nG24' broke the
            # moment that list gained G15/G16. A broken anchor still fails the build
            # ('anchor not found in file') instead of passing silently, which is the
            # correct behaviour — but a probe should not be that brittle.
            "**Closed:** G3, G6, G7, G10, G11, G13 and G20",
            "**Closed:** G3, G6, G7, G10, G11 and G20",
        ),
        check_register,
        True,
        "G13",
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
