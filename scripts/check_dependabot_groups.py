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
                  (they must land alone and promptly); a family's members agree on
                  the group handling a given update-type and that group declares
                  every pattern of the route (a lone `vitest` major is unsatisfiable
                  against `@vitest/coverage-v8` — verified ERESOLVE); AND a family's
                  minor/patch route is a DIFFERENT group from its major route, so a
                  security patch can never wait on a major release.
4. major ceiling — a name whose major is blocked by an upstream constraint must be
                  `ignore:`d and must appear in NO major group. Grouped-and-ignored,
                  grouped-only, and neither (an unsatisfiable single-package major PR
                  that stays red forever) are each reported. PR #154 is the measured
                  case: `eslint` 10 cannot load with `eslint-config-next` 16.

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

# Coupled families, described PER UPDATE-TYPE, because the two routes legitimately have
# different members: minor/patch can group a whole family, while a major may only group
# packages whose majors are actually compatible. Members cannot be bumped apart
# (verified ERESOLVE) and a grouped PR is atomic, so patch must never wait on a major
# (G20) and an impossible major must never be grouped at all (G19, PR #154).
FAMILIES: dict[str, dict[str, dict[str, tuple[str, ...]]]] = {
    "vitest": {
        "major": {
            "patterns": ("vitest", "@vitest/*"),
            "members": ("vitest", "@vitest/mocker", "@vitest/coverage-v8"),
        },
        "patch": {
            "patterns": ("vitest", "@vitest/*"),
            "members": ("vitest", "@vitest/mocker", "@vitest/coverage-v8"),
        },
    },
    "next-toolchain": {
        # Major ring = the version-locked pair only: eslint-config-next@16.3.8
        # depends on @next/eslint-plugin-next@16.3.8 exactly.
        "major": {
            "patterns": ("next", "eslint-config-next"),
            "members": ("next", "eslint-config-next"),
        },
        "patch": {
            "patterns": ("next", "eslint", "eslint-config-next", "@eslint/*"),
            "members": ("next", "eslint", "eslint-config-next", "@eslint/js"),
        },
    },
}

# Majors blocked by an upstream ceiling, not by choice. eslint-config-next@16 bundles
# eslint-plugin-react 7.37.5, whose newest published peer is still eslint "^3 .. ^9.7",
# and ESLint 10 removed context.getFilename(); measured on PR #154 the plugin cannot
# even load. Such a name must have no major route and must be covered by `ignore:`, so
# deleting the ignore cannot silently recreate #154.
MAJOR_CEILING = ("eslint", "@eslint/js")
MAJOR_IGNORE_TYPE = "version-update:semver-major"


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


def _ignored_major_patterns(ignores: list | None) -> set[str]:
    """dependency-name patterns whose major updates are ignored."""
    names: set[str] = set()
    for rule in ignores or []:
        if MAJOR_IGNORE_TYPE not in (rule.get("update-types") or []):
            continue
        declared = rule.get("dependency-name")
        if isinstance(declared, str):
            names.add(declared)
        elif isinstance(declared, list):
            names.update(declared)
    return names


def check_major_ceiling(
    groups: dict[str, dict], ignores: list | None, problems: list[str]
) -> None:
    """A ceiling-blocked major must be ignored, not grouped, and never neither."""
    ignored = _ignored_major_patterns(ignores)
    for name in MAJOR_CEILING:
        route = matching_groups(groups, name, "major")
        covered = any(fnmatch.fnmatchcase(name, pat) for pat in ignored)
        if route and covered:
            fail(
                problems,
                f"{name}: major is BOTH routed to {route} and ignored; delete one — an "
                "ignored update can never reach that group, so the config claims an "
                "arrangement it will never produce",
            )
        elif route and not covered:
            fail(
                problems,
                f"{name}: major routes to {route} with no ignore; that combination is "
                "unbuildable (eslint-plugin-react peers eslint <=9.7 and ESLint 10 "
                "removed context.getFilename — PR #154 proved it)",
            )
        elif not route and not covered:
            fail(
                problems,
                f"{name}: major has no group and no ignore, so dependabot will open an "
                "unsatisfiable single-package major PR that stays red forever",
            )


def check_families(
    groups: dict[str, dict], ignores: list | None, problems: list[str]
) -> None:
    for family, routes in FAMILIES.items():
        chosen: dict[str, tuple[str, ...]] = {}
        for route_name, spec in routes.items():
            utype = "major" if route_name == "major" else "patch"
            members = spec["members"]
            hits = {tuple(matching_groups(groups, m, utype)) for m in members}
            if len(hits) != 1:
                fail(
                    problems,
                    f"{family}: members disagree on which group handles {utype} "
                    f"{hits}; a grouped PR is atomic, so members that must move "
                    "together cannot be split across PRs",
                )
            chosen[route_name] = next(iter(hits)) if len(hits) == 1 else ()

            # The group owning a route must declare EVERY pattern of that route.
            # Otherwise narrowing a group silently drops a sibling back to a
            # single-package PR and resurrects the verified ERESOLVE failure.
            for gname in chosen[route_name]:
                declared = set(groups.get(gname, {}).get("patterns") or [])
                missing = set(spec["patterns"]) - declared
                if missing:
                    fail(
                        problems,
                        f"{family}: group '{gname}' handles {utype} but does not "
                        f"declare {sorted(missing)}; that sibling would be raised alone",
                    )

        majors = chosen.get("major", ())
        patches = chosen.get("patch", ())
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

    check_major_ceiling(groups, ignores, problems)


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
    check_families(npm_groups, npm.get("ignore"), problems)

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
    from the always-green `make lint` recorded as gap G3. A control case is included
    so the inverse failure — a checker that always reports problems — is caught too.
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
    ceiling_groups = {
        "ring-major": {
            "patterns": ["next", "eslint-config-next"],
            "update-types": ["major"],
        },
        "ring-patch": {
            "patterns": ["next", "eslint", "eslint-config-next", "@eslint/*"],
            "update-types": ["minor", "patch"],
        },
    }
    ceiling_ignores = [
        {"dependency-name": "eslint", "update-types": [MAJOR_IGNORE_TYPE]},
        {"dependency-name": "@eslint/*", "update-types": [MAJOR_IGNORE_TYPE]},
    ]

    cases: list[tuple[str, bool, bool]] = []
    problems: list[str] = []
    check_families(hostage, None, problems)
    cases.append(("patch held hostage by major", bool(problems), True))

    problems = []
    check_no_ambiguity(ambiguous, ["vitest"], "self-test", problems)
    cases.append(("two groups match one update", bool(problems), True))

    problems = []
    check_discrete(grouped_sensitive, ["dompurify"], "self-test", problems)
    cases.append(("security control got grouped", bool(problems), True))

    problems = []
    check_major_ceiling(
        {"ring": {"patterns": ["eslint"], "update-types": ["major"]}}, None, problems
    )
    cases.append(("ceiling major grouped with no ignore", bool(problems), True))

    problems = []
    check_major_ceiling(
        {"ring": {"patterns": ["next"], "update-types": ["major"]}}, None, problems
    )
    cases.append(("ceiling major grouped nowhere and unignored", bool(problems), True))

    problems = []
    check_major_ceiling(
        {"ring": {"patterns": ["eslint"], "update-types": ["major"]}},
        ceiling_ignores,
        problems,
    )
    cases.append(("ceiling major both grouped and ignored", bool(problems), True))

    problems = []
    check_major_ceiling(ceiling_groups, ceiling_ignores, problems)
    cases.append(("control: correct arrangement stays silent", bool(problems), False))

    ok = True
    for label, detected, want in cases:
        verdict = "DETECTED" if detected else "silent"
        if detected != want:
            ok = False
            verdict += (
                " <- WRONG (expected " + ("detection" if want else "silence") + ")"
            )
        print(f"self-test {label}: {verdict}")
    print(
        "self_test "
        + (
            "OK - the gate can fail and can pass"
            if ok
            else "FAILED - the gate is not trustworthy"
        )
    )
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    return run()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
