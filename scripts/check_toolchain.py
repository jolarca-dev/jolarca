#!/usr/bin/env python
"""Assert the interpreter running the gates is the one the lock pins.

Why this exists
---------------
`PY := $(CURDIR)/.venv/bin/python` is invocation-directory dependent, and this
repository has TWO virtualenvs: `.venv/` (ruff 0.16.6, mypy 2.3.1, django 6.1.1 -
matching `backend/requirements/dev.txt`) and `backend/.venv/` (ruff 0.16.3, mypy
2.3.0, django 5.2.17 - a pre-realignment leftover). `.gitignore`'s `.venv/`
pattern matches at any depth, so the stray one is invisible to `git status` and to
every other gate.

Running a gate on the wrong interpreter is worse than not running it: it reports
PASS. QODER.md §8 G14 recorded exactly this class ("a green local run means CI
will be green") and the fix then was to re-align the venv by hand - which repairs
one instance and prevents none. This checks the invariant instead.

What it verifies
----------------
1. every package pinned in `backend/requirements/dev.txt` that is importable
   reports exactly the pinned version;
2. no second `.venv` exists anywhere in the repository.

Exit codes: 0 pass, 1 a mismatch or a stray venv, 2 cannot verify (pins missing
or unreadable). A vacuous pass is impossible: zero parsed pins exits 2.

Usage: python scripts/check_toolchain.py
"""

from __future__ import annotations

import re
import sys
from importlib import metadata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PINS_FILE = REPO_ROOT / "backend" / "requirements" / "dev.txt"
WATCHED = ("ruff", "mypy", "django", "djangorestframework", "stripe")
PIN_RE = re.compile(r"^([A-Za-z0-9._-]+)==([A-Za-z0-9._!+-]+)")


class CannotVerify(Exception):
    """Raised when an input is missing or unreadable - never a silent pass."""


def canonical(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def read_pins() -> dict[str, str]:
    if not PINS_FILE.is_file():
        raise CannotVerify(f"{PINS_FILE.relative_to(REPO_ROOT)} not found")
    pins: dict[str, str] = {}
    for line in PINS_FILE.read_text(encoding="utf-8").splitlines():
        m = PIN_RE.match(line.strip())
        if m:
            pins[canonical(m.group(1))] = m.group(2)
    if not pins:
        raise CannotVerify("dev.txt parsed to zero pinned packages")
    return pins


def installed(name: str) -> str | None:
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return None


def check_pins(pins: dict[str, str], problems: list[str]) -> int:
    bad = 0
    for pkg in WATCHED:
        want = pins.get(canonical(pkg))
        if want is None:
            problems.append(
                f"toolchain: {pkg} is not pinned in dev.txt - cannot compare"
            )
            bad += 1
            continue
        got = installed(pkg)
        if got is None:
            problems.append(
                f"toolchain: {pkg}=={want} is pinned but not importable in this interpreter"
            )
            bad += 1
        elif got != want:
            problems.append(
                f"toolchain: {pkg} reports {got} but dev.txt pins {want} "
                "- run 'make bootstrap' or use the repo-root .venv"
            )
            bad += 1
    return bad


def check_stray_venvs(problems: list[str]) -> int:
    """Fail if a second .venv exists anywhere under the repo."""
    strays = sorted(
        p.parent.name + "/" + p.name
        for p in REPO_ROOT.glob("**/.venv")
        if p.is_dir() and p != REPO_ROOT / ".venv"
    )
    for s in strays:
        problems.append(
            f"toolchain: stray virtualenv ./{s}/ exists - it is gitignored at any "
            "depth, invisible to git status, and can silently serve the wrong "
            f"interpreter. Remove it (it is rebuildable) or pin recipes to it."
        )
    return len(strays)


def run() -> int:
    pins = read_pins()
    print(f"  interpreter  {sys.executable}")
    print(f"  pins parsed  {len(pins)} from {PINS_FILE.relative_to(REPO_ROOT)}")
    problems: list[str] = []
    n = check_pins(pins, problems) + check_stray_venvs(problems)
    for p in problems:
        print(f"::error::{p}")
    if n:
        print(f"\ncheck_toolchain: FAILED - {n} problem(s)")
        return 1
    print("check_toolchain: interpreter matches the lock, no stray venv.")
    return 0


def main() -> int:
    try:
        return run()
    except CannotVerify as exc:
        print(f"::error::check_toolchain: CANNOT VERIFY - {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
