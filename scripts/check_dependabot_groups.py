#!/usr/bin/env python
"""Check the topology of `groups:` in .github/dependabot.yml.

Why this exists
---------------
Dependabot group semantics are invisible to CI: no job parses this file, so a
mis-specified group set is accepted silently and only shows up as a missing or
malformed pull request days later. QODER.md §8 G20 is the concrete case — a
group that included `major` made a CVE's *patch* fix arrive only inside a
major-version PR, because a grouped PR is atomic.

What it verifies
----------------
1. structure    — keys, group-name length, `update-types` vocabulary, patterns
2. no ambiguity — every (package, update-type) pair resolves to AT MOST ONE
                  group, so matching never depends on declaration order
3. policy       — the repo's deliberate exceptions actually hold:
                  `dompurify` / `@stripe/*` / `django` / `stripe` match NO group
                  (they must land alone and promptly); coupled families are
                  grouped at every type (a lone `vitest` major is unsatisfiable
                  against `@vitest/coverage-v8` — verified ERESOLVE), AND each
                  family's minor/patch route is a DIFFERENT group from its major
                  route, so a security patch can never wait on a major release.

Limits — read before trusting a green run
-----------------------------------------
The matcher mirrors GitHub's *documented* group semantics (patterns, excludes,
update-types, `applies-to`), not dependabot's implementation. The authoritative
verdict is the `.github/dependabot.yml` check reported by `dependabot-api`,
which only appears on dependabot's own evaluations. A green run here means
"internally consistent with policy", never "dependabot accepted this".

Exit codes: 0 pass, 1 policy/invariant violation, 2 cannot verify (missing or
unparsable input). A vacuous pass is impossible by design — absent files,
absent ecosystems and empty group sets all exit 2.

Usage: python scripts/check_dependabot_groups.py [--self-test]
"""

from __future__ import annotations

import fnmatch
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG = REPO_ROOT / ".github" / "dependabot.yml"
LOCK = REPO_ROOT / "frontend" / "package-lock.json"
REQ_GLOB = "backend/requirements/*.txt"

ALLOWED_GROUP_KEYS = {
    "applies-to",
    "patterns",
    "exclude-patterns",
    "update-types",
    "dependency-type",
}
SEMVER_TYPES = ("major", "minor", "patch")
VERSION_UPDATE = "version-updates"
MAX_GROUP_NAME_LEN = 75

# Package names that must never be grouped: they land as single PRs so a
# security control or payment-boundary bump is always reviewed on its own.
MUST_STAY_DISCRETE = ("dompurify", "@stripe/stripe-js", "@stripe/react-stripe-js")
MUST_STAY_DISCRETE_PIP = ("django", "stripe")

# Coupled families: members cannot be bumped apart (verified ERESOLVE), so
# majors must be grouped together; but minor/patch must be a separate group so
# a patch-level security fix is never held hostage to a major release (G20).
FAMILIES: dict[str, tuple[str, ...]] = {
    "vitest": ("vitest", "@vitest/*"),
    "next-toolchain": ("next", "eslint", "eslint-config-next", "@eslint/*"),
}
FAMILY_MEMBERS = {
    "vitest": ("vitest", "@vitest/mocker", "@vitest/coverage-v8"),
    "next-toolchain": ("next", "eslint", "eslint-config-next", "@eslint/js"),
}


def fail(problems: list[str], msg: str) -> None:
    problems.append(msg)


def load_yaml(path: Path) -> dict:
    try:
        import yaml
    except ImportError:
        print("::error::PyYAML missing (declared in backend/requirements/base.txt)")
        sys.exit(2)
    if not path.is_file():
        print(f"::error::{path.relative_to(REPO_ROOT)} not found")
        sys.exit(2)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - report any parse failure as unverifiable
        print(f"::error::{path.relative_to(REPO_ROOT)} did not parse: {exc}")
        sys.exit(2)
    if not isinstance(data, dict):
        print(f"::error::{path.relative_to(REPO_ROOT)} is not a mapping")
        sys.exit(2)
    return data


def npm_names() -> list[str]:
    """Top-level package names, scoped included: @stripe/stripe-js is one name."""
    if not LOCK.is_file():
        print(f"::error::{LOCK.relative_to(REPO_ROOT)} not found")
        sys.exit(2)
    packages = json.loads(LOCK.read_text(encoding="utf-8")).get("packages")
    if not isinstance(packages, dict):
        print("::error::package-lock.json has no 'packages' map (lockfileVersion 1?)")
        sys.exit(2)
    prefix = "node_modules/"
    names = []
    for key in packages:
        if not key.startswith(prefix):
            continue
        tail = key[len(prefix) :]
        if tail.count("/") <= 1 and "node_modules" not in tail:
            names.append(tail)
    return sorted(set(names))


def pip_names() -> list[str]:
    """Distribution names from the pinned requirement files."""
    files = sorted(REPO_ROOT.glob(REQ_GLOB))
    if not files:
        print("::error::no files matched backend/requirements/*.txt")
        sys.exit(2)
    pattern = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)\s*==")
    names = set()
    for path in files:
        for line in path.read_text(encoding="utf-8").splitlines():
            match = pattern.match(line.strip())
            if match:
                names.add(match.group(1).lower())
    return sorted(names)


def group_matches(group: dict, name: str, update_type: str) -> bool:
    """Documented group-matching semantics, restricted to version updates."""
    if group.get("applies-to", VERSION_UPDATE) != VERSION_UPDATE:
        return False
    if group.get("dependency-type") not in (None, ""):
        # dependency-type needs manifest metadata this script does not read.
        return False
    declared = group.get("update-types")
    if declared and update_type not in declared:
        return False
    patterns = group.get("patterns") or []
    if not any(fnmatch.fnmatchcase(name, p) for p in patterns):
        return False
    excludes = group.get("exclude-patterns") or []
    return not any(fnmatch.fnmatchcase(name, p) for p in excludes)


def matching_groups(groups: dict[str, dict], name: str, update_type: str) -> list[str]:
    return [n for n, g in groups.items() if group_matches(g, name, update_type)]


def check_structure(updates: list[dict], problems: list[str]) -> None:
    for entry in updates:
        eco = entry.get("package-ecosystem", "<missing>")
        groups = entry.get("groups")
        if groups is None:
            continue
        if not isinstance(groups, dict) or not groups:
            fail(problems, f"{eco}: 'groups:' present but empty or not a mapping")
            continue
        for name, group in groups.items():
            if len(name) > MAX_GROUP_NAME_LEN:
                fail(
                    problems,
                    f"{eco}: group name '{name}' exceeds {MAX_GROUP_NAME_LEN} chars "
                    "(used in PR titles and branch names)",
                )
            if not isinstance(group, dict):
                fail(problems, f"{eco}: group '{name}' is not a mapping")
                continue
            extra = set(group) - ALLOWED_GROUP_KEYS
            if extra:
                fail(
                    problems, f"{eco}: group '{name}' has unknown keys {sorted(extra)}"
                )
            if group.get("applies-to") not in (
                None,
                VERSION_UPDATE,
                "security-updates",
            ):
                fail(problems, f"{eco}: group '{name}' has a bad applies-to value")
            if not (group.get("patterns") or group.get("dependency-type")):
                fail(problems, f"{eco}: group '{name}' matches nothing (no patterns)")
            for utype in group.get("update-types") or []:
                if utype not in SEMVER_TYPES:
                    fail(
                        problems,
                        f"{eco}: group '{name}' declares unknown update-type '{utype}'",
                    )


def check_no_ambiguity(
    groups: dict[str, dict], names: list[str], label: str, problems: list[str]
) -> None:
    if not names:
        fail(problems, f"{label}: no package names could be read; cannot verify")
        return
    ambiguous = []
    for name in names:
        for utype in SEMVER_TYPES:
            hit = matching_groups(groups, name, utype)
            if len(hit) > 1:
                ambiguous.append((name, utype, hit))
    for name, utype, hit in ambiguous[:12]:
        fail(
            problems,
            f"{label}: '{name}' at {utype} matches {len(hit)} groups {hit}; dependabot "
            "documents first-match-wins ordering and silent suppression when the first "
            "matching group excludes a type, so this depends on declaration order",
        )


def check_discrete(
    groups: dict[str, dict], names: list[str], label: str, problems: list[str]
) -> None:
    for name in names:
        for utype in SEMVER_TYPES:
            hit = matching_groups(groups, name, utype)
            if hit:
                fail(
                    problems,
                    f"{label}: '{name}' at {utype} would be grouped into {hit}, but it "
                    "must stay a single PR (security control / payment boundary)",
                )


def check_families(groups: dict[str, dict], problems: list[str]) -> None:
    for family, patterns in FAMILIES.items():
        members = FAMILY_MEMBERS[family]
        route = {}
        for utype in SEMVER_TYPES:
            hits = {tuple(matching_groups(groups, m, utype)) for m in members}
            if len(hits) != 1:
                fail(
                    problems,
                    f"{family}: members disagree on which group handles {utype} "
                    f"{hits}; a grouped PR is atomic, so members that must move "
                    "together cannot be split across PRs",
                )
            route[utype] = next(iter(hits)) if len(hits) == 1 else ()

        majors = route.get("major") or ()
        patches = route.get("patch") or ()
        if not majors:
            fail(
                problems,
                f"{family}: no group covers major updates; lone majors are "
                "unsatisfiable for this family (verified ERESOLVE)",
            )
        if not patches:
            fail(problems, f"{family}: no group covers patch updates")
        if majors and set(majors) & set(patches):
            fail(
                problems,
                f"{family}: patch and major share group(s) "
                f"{sorted(set(majors) & set(patches))}; a grouped PR is atomic, so a "
                "patch-level security fix would have to wait for a major release "
                "(QODER.md §8 G20 / CVE-2026-84373)",
            )

        # The group that owns a family must declare EVERY member pattern. Without
        # this, narrowing a group's patterns would silently drop a sibling back to a
        # single-package PR and resurrect the verified ERESOLVE failure.
        for utype, route_groups in route.items():
            for gname in route_groups:
                declared = set(groups.get(gname, {}).get("patterns") or [])
                missing = set(patterns) - declared
                if missing:
                    fail(
                        problems,
                        f"{family}: group '{gname}' handles {utype} but does not declare "
                        f"{sorted(missing)}; that sibling would be raised alone",
                    )


def resolve_ecosystem(data: dict, ecosystem: str) -> dict:
    for entry in data.get("updates") or []:
        if entry.get("package-ecosystem") == ecosystem:
            return entry
    print(f"::error::no '{ecosystem}' package-ecosystem in dependabot.yml")
    sys.exit(2)


def run() -> int:
    problems: list[str] = []
    data = load_yaml(CONFIG)
    updates = data.get("updates")
    if not isinstance(updates, list) or not updates:
        print("::error::dependabot.yml has no 'updates' list; cannot verify")
        return 2

    check_structure(updates, problems)

    npm = resolve_ecosystem(data, "npm")
    pip = resolve_ecosystem(data, "pip")
    npm_groups, pip_groups = npm.get("groups") or {}, pip.get("groups") or {}
    if not npm_groups:
        problems.append(
            "npm: no groups configured; the fan-out gap (G19) is unmitigated"
        )
    if not pip_groups:
        problems.append(
            "pip: no groups configured; the fan-out gap (G19) is unmitigated"
        )

    check_no_ambiguity(npm_groups, npm_names(), "npm", problems)
    check_no_ambiguity(pip_groups, pip_names(), "pip", problems)
    check_discrete(npm_groups, list(MUST_STAY_DISCRETE), "npm", problems)
    check_discrete(pip_groups, list(MUST_STAY_DISCRETE_PIP), "pip", problems)
    check_families(npm_groups, problems)

    if problems:
        for p in problems:
            print(f"::error::{p}")
        print(f"dependabot group check FAILED ({len(problems)} problem(s))")
        return 1

    print(
        f"dependabot group check OK: {len(npm_groups)} npm groups, "
        f"{len(pip_groups)} pip groups, "
        f"{len(npm_names())} npm / {len(pip_names())} pip names swept, no ambiguity"
    )
    return 0


def self_test() -> int:
    """Prove the gate can fail, by checking a deliberately broken config.

    Without this, a checker that silently passes everything is indistinguishable
    from the always-green `make lint` recorded as gap G3.
    """
    hostage = {
        "family": {
            "applies-to": "version-updates",
            "patterns": ["vitest", "@vitest/*"],
            "update-types": ["major", "minor", "patch"],
        }
    }
    ambiguous = {
        "a": {"patterns": ["*"], "update-types": ["minor", "patch"]},
        "b": {"patterns": ["vitest"], "update-types": ["patch"]},
    }
    grouped_sensitive = {
        "everything": {"patterns": ["*"], "update-types": ["minor", "patch"]}
    }

    cases = []
    problems: list[str] = []
    check_families(hostage, problems)
    cases.append(("patch held hostage by major", bool(problems), problems))

    problems = []
    check_no_ambiguity(ambiguous, ["vitest"], "self-test", problems)
    cases.append(("two groups match one update", bool(problems), problems))

    problems = []
    check_discrete(grouped_sensitive, ["dompurify"], "self-test", problems)
    cases.append(("security control got grouped", bool(problems), problems))

    ok = True
    for label, detected, found in cases:
        status = "DETECTED" if detected else "MISSED"
        if not detected:
            ok = False
        print(f"self-test {label}: {status} ({len(found)} problem(s))")
    print(
        "self_test " + ("OK - the gate can fail" if ok else "FAILED - gate is vacuous")
    )
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    return run()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
