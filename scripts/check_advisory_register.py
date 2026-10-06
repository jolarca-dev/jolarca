#!/usr/bin/env python3
"""Fail when a dependency advisory is silenced without an incident record.

QODER.md §8 G35 records the gap this closes: the two production-scoped gates in
.github/workflows/security.yml name advisories, but nothing linked a named advisory to a
row in docs/INCIDENT_RESPONSE.md §6.2, so the register existed only because an operator
wrote in it by hand. Measured 2026-10-06: a HIGH reached the merge path with no Dependabot
alert at all, and the ID was minted by hand.

Two rules, split by how each can be decided:

1. STRUCTURAL, offline and always. Each register row is well-formed (ID shape, known
   class, real declared date, unique ID), and every incident ID cited in the governance
   docs exists in the register. A cited-but-unregistered ID is a fabricated record, the
   exact failure §Part VII exists to prevent.

2. ATTRIBUTION, pull requests only, needs network. If a change REMOVES a production-scoped
   advisory from the frontend lockfile, the removal must be attributed to a register row of
   class DEP or SEC that names the package as a marked identifier, and that row's ID must appear
   in the change's commit messages or the PR title/body. "Removed" is decided by running the same
   `npm audit --omit=dev --audit-level=high` invocation the gate runs, against the base and head
   trees fetched from the platform.

Exit codes: 0 verified clean, 1 violated, 2 CANNOT VERIFY. A skip never reads as a pass:
skips are printed, and a missing input returns 2.

Usage: check_advisory_register.py [--self-test]
Environment: ADV_REG_BASE_SHA, ADV_REG_HEAD_SHA, ADV_REG_PR_NUMBER, GITHUB_REPOSITORY.
The attribution half calls the platform API through `gh`, so in CI the step must export
GH_TOKEN (or GITHUB_TOKEN); without a token `gh` refuses the request and the check reports
CANNOT and exits 2 rather than passing.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTER_PATH = REPO_ROOT / "docs" / "INCIDENT_RESPONSE.md"
ID_RE = re.compile(r"JOL-[A-Z]{2,6}-\d{8}-\d{2}")
CITED_IN = (
    "QODER.md",
    "CONTRIBUTING.md",
    "docs/SECURITY.md",
    "docs/ARCHITECTURE_DECISION_RECORDS.md",
)


def parse_rows(text: str) -> list[dict[str, str]]:
    """Rows of the §6.2 table. Empty list means the section or its rows are absent."""
    if "### 6.2" not in text:
        return []
    section = text.split("### 6.2", 1)[1]
    rows = []
    for line in section.splitlines():
        if not line.startswith("| JOL-"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6:
            continue
        rows.append(
            {
                "id": cells[0],
                "declared": cells[1],
                "class": cells[2],
                "status": cells[4],
                "text": " ".join(cells),
            }
        )
    return rows


def structural_problems(rows: list[dict[str, str]]) -> list[str]:
    problems: list[str] = []
    if not rows:
        return ["advisory-register: §6.2 has no parseable rows -- register missing or restructured"]
    seen: dict[str, int] = {}
    for row in rows:
        ident = row["id"]
        if not ID_RE.fullmatch(ident):
            problems.append(
                f"advisory-register: {ident} does not match JOL-<CLASS>-<YYYYMMDD>-<NN>"
            )
            continue
        klass = ident.split("-")[1]
        # The set is the one §6.1 of docs/INCIDENT_RESPONSE.md declares, RENAME included: it is
        # the legacy class of the single ID minted before that section existed, and a checker
        # that rejects the register it documents is a denial of pipeline, not a control.
        if klass not in {"SEC", "DEP", "PII", "AVAIL", "DATA", "PROC", "RENAME"}:
            problems.append(
                f"advisory-register: {ident} class {klass!r} is not a class §6.1 declares"
            )
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["declared"]):
            problems.append(
                f"advisory-register: {ident} declared date {row['declared']!r} is not a date"
            )
        elif not 1 <= int(row["declared"][5:7]) <= 12 or not 1 <= int(row["declared"][8:10]) <= 31:
            problems.append(
                f"advisory-register: {ident} declared date {row['declared']} is out of range"
            )
        if not row["status"]:
            problems.append(f"advisory-register: {ident} has an empty status cell")
        seen[ident] = seen.get(ident, 0) + 1
    for ident, n in sorted(seen.items()):
        if n > 1:
            problems.append(f"advisory-register: {ident} appears {n} times in §6.2; IDs are unique")
    return problems


def cited_ids(root: Path = REPO_ROOT) -> set[str]:
    out: set[str] = set()
    for rel in CITED_IN:
        path = root / rel
        if path.is_file():
            out.update(ID_RE.findall(path.read_text(encoding="utf-8")))
    return out


def unregistered_citation_problems(rows: list[dict[str, str]], cited: set[str]) -> list[str]:
    registered = {r["id"] for r in rows}
    return [
        f"advisory-register: {ident} is cited in the governance docs but absent from §6.2 "
        f"-- cite a registered ID or add the row first"
        for ident in sorted(cited - registered)
    ]


def gh_text(args: list[str]) -> str | None:
    """Run gh api, or return None. A missing binary is a None, never a silent pass."""
    exe = shutil.which("gh")
    if exe is None:
        return None
    try:
        proc = subprocess.run([exe, "api", *args], capture_output=True, text=True, timeout=240)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return proc.stdout if proc.returncode == 0 else None


def fetch_manifests(repo: str, ref: str, dest: Path) -> bool:
    for name in ("package-lock.json", "package.json"):
        # gh api accepts exactly one positional: the endpoint. The revision has to ride in the
        # query string -- passing ref=SHA as a second argument is rejected as "1 arg(s)".
        raw = gh_text([f"repos/{repo}/contents/frontend/{name}?ref={ref}"])
        if raw is None:
            return False
        try:
            dest.joinpath(name).write_bytes(base64.b64decode(json.loads(raw)["content"]))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            return False
    return True


def prod_advisories(frontend_dir: Path) -> set[str] | None:
    """Package names the gate would flag, or None when the audit could not be decided."""
    exe = shutil.which("npm")
    if exe is None:
        return None
    try:
        proc = subprocess.run(
            [exe, "audit", "--omit=dev", "--audit-level=high", "--json"],
            cwd=frontend_dir,
            capture_output=True,
            text=True,
            timeout=900,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    try:
        return set(json.loads(proc.stdout or "{}").get("vulnerabilities", {}))
    except json.JSONDecodeError:
        return None


MARKED_TOKEN_RE = re.compile(r"[*`]{1,2}([a-z][a-z0-9._-]{2,})[*`]{1,2}")


def owned_packages(row: dict[str, str]) -> set[str]:
    """Packages the row claims, taken only from MARKED identifiers.

    Narrow on purpose: matching every lowercase word in the row would let prose collide with a
    package name (a row that says "once the build fails" would own the `once` package), which
    hides findings. Reading only marked identifiers can raise a finding that a plain-prose row
    would have silenced -- the fail-closed direction -- so write package names in backticks or
    emphasis in §6.2.
    """
    return set(MARKED_TOKEN_RE.findall(row["text"]))


def attribution_problems(
    rows: list[dict[str, str]], base: str, head: str, repo: str, pr: str | None
) -> tuple[list[str], str]:
    with tempfile.TemporaryDirectory() as tmp:
        bdir, hdir = Path(tmp) / "b", Path(tmp) / "h"
        bdir.mkdir()
        hdir.mkdir()
        if not (fetch_manifests(repo, base, bdir) and fetch_manifests(repo, head, hdir)):
            return [], "CANNOT(fetch failed)"
        vul_b, vul_h = prod_advisories(bdir), prod_advisories(hdir)
        if vul_b is None or vul_h is None:
            return [], "CANNOT(npm audit could not be decided)"
        removed = sorted(vul_b - vul_h)
        if not removed:
            return [], "OK(no production advisory removed)"
        owners: dict[str, str] = {}
        for row in rows:
            if row["class"] not in ("DEP", "SEC"):
                continue
            for pkg in owned_packages(row):
                owners.setdefault(pkg, row["id"])
        messages = (
            gh_text(
                [
                    f"repos/{repo}/compare/{base}...{head}",
                    "--jq",
                    '[.commits[].commit.message] | join("\\n")',
                ]
            )
            or ""
        )
        if pr:
            messages += "\n" + (
                gh_text([f"repos/{repo}/pulls/{pr}", "--jq", '[.title, .body] | join("\\n")']) or ""
            )
        problems = []
        for pkg in removed:
            ident = owners.get(pkg)
            if ident is None:
                problems.append(
                    f"advisory-register: this change removes the production advisory in {pkg!r} "
                    f"but no §6.2 row of class DEP or SEC names it as a marked identifier "
                    f"(backticks or emphasis) -- mint the ID or mark the package"
                )
            elif ident not in messages:
                problems.append(
                    f"advisory-register: {pkg!r} is covered by {ident}, but that ID appears in no "
                    f"commit message or the PR text, so the fix is unattributable (§Part VII)"
                )
        return problems, f"VIOLATION({len(problems)})" if problems else f"OK(removed {removed})"


def run() -> int:
    problems: list[str] = []
    if not REGISTER_PATH.is_file():
        print(
            f"::error::advisory-register: {REGISTER_PATH} missing -- cannot verify",
            file=sys.stderr,
        )
        return 2
    rows = parse_rows(REGISTER_PATH.read_text(encoding="utf-8"))
    problems += structural_problems(rows)
    problems += unregistered_citation_problems(rows, cited_ids())

    base = os.environ.get("ADV_REG_BASE_SHA")
    head = os.environ.get("ADV_REG_HEAD_SHA")
    repo = os.environ.get("GITHUB_REPOSITORY")
    verdict = "SKIPPED(not a pull_request event: no base/head to attribute)"
    if base and head and repo:
        extra, verdict = attribution_problems(
            rows, base, head, repo, os.environ.get("ADV_REG_PR_NUMBER")
        )
        if verdict.startswith("CANNOT"):
            print(
                f"::error::advisory-register: {verdict} -- refusing to report a pass",
                file=sys.stderr,
            )
            return 2
        problems += extra

    for p in problems:
        print(f"::error::{p}", file=sys.stderr)
    if problems:
        print(f"advisory_register: FAILED -- {len(problems)} problem(s)")
        return 1
    print(f"advisory_register: clean -- {len(rows)} registered ID(s), attribution {verdict}")
    return 0


def self_test() -> int:
    good = [
        {
            "id": "JOL-DEP-20261006-01",
            "declared": "2026-10-06",
            "class": "DEP",
            "status": "fixed",
            "text": "JOL-DEP-20261006-01 *source-map-js* 1.2.1 advisory",
        },
        {
            "id": "JOL-RENAME-20260831-01",
            "declared": "2026-08-31",
            "class": "RENAME",
            "status": "closed",
            "text": "legacy rename",
        },
        {
            "id": "JOL-XYZ-20261006-01",
            "declared": "2026-10-06",
            "class": "XYZ",
            "status": "open",
            "text": "undeclared class, well-shaped ID so the class rule runs",
        },
    ]
    cases: list[tuple[str, bool, bool]] = [
        ("well-formed rows raise nothing", bool(structural_problems(good[:1])), False),
    ]
    cases.append(
        (
            "undeclared class is detected",
            any("is not a class" in p for p in structural_problems(good[2:])),
            True,
        )
    )
    cases.append(
        (
            "duplicate ID is detected",
            any("appears 2 times" in p for p in structural_problems(good + [good[0]])),
            True,
        )
    )
    cases.append(
        (
            "bad declared date is detected",
            any(
                "out of range" in p
                for p in structural_problems([dict(good[0], declared="2026-13-45")])
            ),
            True,
        )
    )
    cases.append(
        (
            "empty status is detected",
            any("empty status" in p for p in structural_problems([dict(good[0], status="")])),
            True,
        )
    )
    cases.append(
        (
            "unparseable register is detected",
            any("no parseable rows" in p for p in structural_problems([])),
            True,
        )
    )
    cases.append(
        (
            "cited ID with no row is detected",
            bool(unregistered_citation_problems(good[:1], {"JOL-SEC-19990101-01"})),
            True,
        )
    )
    cases.append(
        (
            "control: a registered citation stays silent",
            bool(unregistered_citation_problems(good, {"JOL-DEP-20261006-01"})),
            False,
        )
    )
    # The narrowing that keeps attribution fail-closed: a marked identifier owns a package, prose
    # never does. Both halves are probes, because a one-sided test would pass on a checker that
    # simply returned no owners at all.
    cases.append(
        ("marked identifier owns its package", "source-map-js" in owned_packages(good[0]), True)
    )
    cases.append(
        (
            "prose cannot own a package",
            "once"
            in owned_packages(
                {
                    "id": "JOL-DEP-20261006-02",
                    "declared": "2026-10-06",
                    "class": "DEP",
                    "status": "open",
                    "text": "the fix landed once the build was green",
                }
            ),
            False,
        )
    )

    problems = structural_problems(parse_rows(REGISTER_PATH.read_text(encoding="utf-8")))
    cases.append(("control: the shipped register is structurally clean", bool(problems), False))
    cases.append(
        (
            "control: legacy RENAME class stays silent",
            any("is not a class" in p for p in structural_problems(good[:2])),
            False,
        )
    )
    cases.append(
        (
            "control: every shipped citation is registered",
            bool(
                unregistered_citation_problems(
                    parse_rows(REGISTER_PATH.read_text(encoding="utf-8")), cited_ids()
                )
            ),
            False,
        )
    )

    ok = True
    for label, detected, want in cases:
        verdict = "DETECTED" if detected else "silent"
        if detected != want:
            ok = False
            verdict += f" <- WRONG (expected {'detection' if want else 'silence'})"
        print(f"self-test {label:<44}: {verdict}")
    print(
        "self_test "
        + ("OK - the gate can fail and can pass" if ok else "FAILED - the gate is not trustworthy")
    )
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    return run()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
