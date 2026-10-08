#!/usr/bin/env python3
"""Fail when .github/dependabot.yml names a label that does not exist on the platform.

QODER.md §8 G40 records the gap this closes. Every ecosystem in .github/dependabot.yml requests
labels -- measured on the shipped file: four `labels:` sites, eight entries, three distinct names
(dependencies, security-review, ci) -- and the request has been in the tree since the repository's
first commit `2d9109e` (2026-08-16). Measured on 2026-10-07 across the whole history: of 124
dependabot pull requests, 0 carried `security-review`. GitHub drops an unknown label instead of
refusing the update, so a typo or an uncreated label degrades silently forever with every gate
green. The first PR ever to carry the label (#192, 2026-10-07T01:03:08Z) did so because the
operator created the label by hand, not because anything checked.

Two halves, split by how each can be decided:

1. STRUCTURAL, offline and always. The config parses, it still has readable `labels:` sites, and
   no name carries stray whitespace. Zero readable sites is a finding rather than a pass: this
   gate exists to assert something about those sites, and a config whose shape it cannot read is
   checking nothing (the always-green-gate class, §8 G3).

2. PLATFORM, needs network and credentials. Each distinct name is looked up with
   `gh api repos/<repo>/labels/<name>`. An HTTP 404 is a MISSING label and exits 1. Anything else
   that is not a clean answer -- no `gh`, no credentials, a 401/403, a timeout, an empty body --
   is CANNOT VERIFY and exits 2. The two verdicts are never collapsed into one: reading a
   credential or route error as "missing" fabricates a violation, and reading it as clean is the
   silence this gate replaces.

Off CI the platform half is SKIPPED, not passed, so `make verify` stays runnable without
credentials; the skip is printed in the verdict line. DEP_LABELS_FORCE=1 runs the platform half
anywhere credentials exist, which is how this file was verified at all.

Known limit, stated rather than implied: HTTP 404 cannot distinguish "this repository has no such
label" from "this repository does not exist", so a wrong GITHUB_REPOSITORY surfaces as missing
labels rather than as a lookup error. In CI that value comes from the runner, not from a human.

Exit codes: 0 verified clean, 1 violated, 2 CANNOT VERIFY. A skip never reads as a pass.

Usage: check_dependabot_labels.py [--self-test]
Environment: GITHUB_ACTIONS, GITHUB_REPOSITORY, GH_TOKEN or GITHUB_TOKEN, DEP_LABELS_FORCE.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

REPO_ROOT = Path(__file__).resolve().parent.parent
DEP_FILE = REPO_ROOT / ".github" / "dependabot.yml"
REPO_DEFAULT = "jolarca-dev/jolarca"
PREFIX = "dependabot-labels"
NAME = PREFIX.replace("-", "_")

EXISTS = "EXISTS"
MISSING = "MISSING"
CANNOT = "CANNOT"


def dependency_missing_problem(exc: BaseException) -> str:
    """The message for a python that cannot import PyYAML, named instead of guessed at.

    Measured precondition: the `dependency-audit` job of .github/workflows/security.yml installs
    only `pip install pip-audit`, while PyYAML reaches CI through the pinned `dev.txt` in the
    `backend` job. So an enabled step can fail for want of an import -- which is a configuration
    fact about the job, not a verdict about any label, and must not read as a pass.
    """
    return (
        f"{PREFIX}: this step's interpreter has no PyYAML ({type(exc).__name__}: {exc}) -- "
        "the dependency-audit job installs only pip-audit; install the pinned requirements here "
        "or move the step to the backend job (which runs the sibling checkers from dev.txt). "
        "CANNOT VERIFY, not a pass."
    )


def parse_config(path: Path = DEP_FILE) -> object:
    """Parsed YAML. Raises so the caller turns any failure into exit 2, never into a pass."""
    import yaml

    return yaml.safe_load(path.read_text(encoding="utf-8"))


def label_sites(cfg: object) -> list[tuple[str, list[str]]]:
    """One entry per labels: site in the config: (package-ecosystem, [names...]).

    A site is a place in the file a human edits; an entry is a name. The counts differ (four
    sites, eight entries on the shipped file) and conflating them is how §8 G40's own text ended
    up quoting a total that did not add up.
    """
    sites: list[tuple[str, list[str]]] = []
    updates = cfg.get("updates") if isinstance(cfg, dict) else None
    for entry in updates or []:
        if not isinstance(entry, dict) or "labels" not in entry:
            continue
        eco = str(entry.get("package-ecosystem", "?"))
        sites.append((eco, [str(label) for label in entry.get("labels") or []]))
    return sites


def grouped(sites: list[tuple[str, list[str]]]) -> dict[str, list[str]]:
    """Label name -> the ecosystems that request it. One platform lookup per distinct name."""
    out: dict[str, list[str]] = {}
    for eco, labels in sites:
        for name in labels:
            out.setdefault(name, [])
            if eco not in out[name]:
                out[name].append(eco)
    return out


def structural_problems(sites: list[tuple[str, list[str]]]) -> list[str]:
    """Offline findings. Empty is a finding: the gate would be asserting nothing."""
    if not sites:
        return [
            (
                f"{PREFIX}: .github/dependabot.yml has no labels: site this checker can read -- "
                "either restore the labels or remove this gate in the same change, because an "
                "always-green check is worse than none (§8 G3)"
            )
        ]
    flattened = [name for _, labels in sites for name in labels]
    loose = [name for name in flattened if name != name.strip() or not name.strip()]
    if loose:
        return [
            (
                f"{PREFIX}: label name(s) {sorted(set(loose))!r} are empty or padded; dependabot "
                "matches the literal while GitHub trims at creation"
            )
        ]
    return []


def classify_lookup(rc: int, stdout: str, stderr: str) -> str:
    """EXISTS only on a clean answer, MISSING only on an HTTP 404, CANNOT for everything else.

    The order is the whole design. `gh` prints the API status into stderr, so 404 is the platform
    answering a question; a 401/403/5xx, a missing binary or an empty body is not evidence about
    any label and must not be reported as though it were.
    """
    if rc == 0 and stdout.strip():
        return EXISTS
    if "http 404" in stderr.lower():
        return MISSING
    return CANNOT


def verdict_problems(
    name: str, ecosystems: list[str], verdict: str, detail: str, repo: str
) -> list[str]:
    """The single place a verdict becomes a message, so the two sides cannot drift."""
    if verdict == EXISTS:
        return []
    if verdict == MISSING:
        return [
            (
                f"{PREFIX}: {name!r} is requested by .github/dependabot.yml "
                f"({', '.join(ecosystems)}) but does not exist on {repo}, so GitHub drops it and "
                f"no PR is ever labelled -- create it (gh api -X POST repos/{repo}/labels "
                f"-f name={name} -f color=ededed) or remove it from those sites"
            )
        ]
    return [
        (
            f"{PREFIX}: CANNOT verify {name!r} on {repo}: {detail or 'no detail'} -- this is not "
            "a verdict about the label; a token, permission or API failure reads as red, never "
            "as green"
        )
    ]


def have_credentials(exe: str) -> tuple[bool, str]:
    """An env token (the CI path) or a logged-in gh (the operator path). Neither -> CANNOT.

    Ordered on purpose: in CI the step maps GH_TOKEN from secrets.GITHUB_TOKEN, so the job token
    is always what gets used. The fallback exists because a check that has never been seen
    returning 0 outside its own target environment is not yet evidence that it can.
    """
    if os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN"):
        return True, ""
    try:
        proc = subprocess.run(
            [exe, "auth", "status", "--active"], capture_output=True, text=True, timeout=60
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"gh auth status could not be run: {exc}"
    if proc.returncode == 0:
        return True, ""
    return False, "no GH_TOKEN/GITHUB_TOKEN in the environment and gh reports no active account"


def lookup(repo: str, name: str) -> tuple[str, str]:
    """Ask the platform about one label. Returns (verdict, detail)."""
    exe = shutil.which("gh")
    if exe is None:
        return CANNOT, "the gh binary is not installed on this runner"
    cred_ok, detail = have_credentials(exe)
    if not cred_ok:
        return CANNOT, detail
    try:
        proc = subprocess.run(
            [exe, "api", f"repos/{repo}/labels/{quote(name, safe='')}", "--jq", ".name"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return CANNOT, f"gh api did not complete: {exc}"
    return classify_lookup(proc.returncode, proc.stdout, proc.stderr), proc.stderr.strip()[:240]


def platform_mode(env: dict[str, str]) -> str:
    """'ci' when Actions gives a token context, 'force' when the operator asked, else 'skip'."""
    if env.get("DEP_LABELS_FORCE") == "1":
        return "force"
    if env.get("GITHUB_ACTIONS", "").lower() == "true":
        return "ci"
    return "skip"


def describe(sites: list[tuple[str, list[str]]]) -> str:
    entries = sum(len(labels) for _, labels in sites)
    distinct = len(grouped(sites))
    return f"{len(sites)} labels: site(s), {entries} entries, {distinct} distinct name(s)"


def run() -> int:
    if not DEP_FILE.is_file():
        print(f"::error::{PREFIX}: {DEP_FILE} missing -- cannot verify", file=sys.stderr)
        return 2
    try:
        cfg = parse_config()
    except ModuleNotFoundError as exc:  # the job's python may not carry PyYAML; see the helper
        print(f"::error::{dependency_missing_problem(exc)}")
        return 2
    except Exception as exc:  # a config this gate cannot read is not a config that passed
        print(
            f"::error::{PREFIX}: .github/dependabot.yml did not parse ({type(exc).__name__}: {exc})"
        )
        return 2

    sites = label_sites(cfg)
    violations = structural_problems(sites)
    if violations:
        for problem in violations:
            print(f"::error::{problem}", file=sys.stderr)
        print(f"{NAME}: FAILED -- {len(violations)} problem(s)")
        return 1

    names = grouped(sites)
    repo = os.environ.get("GITHUB_REPOSITORY") or REPO_DEFAULT
    mode = platform_mode(dict(os.environ))
    if mode == "skip":
        print(
            f"{PREFIX}: structure OK -- {describe(sites)}; platform check SKIPPED "
            "(not in CI; set DEP_LABELS_FORCE=1 to run it)"
        )
        return 0

    cannot = False
    for name, ecosystems in names.items():
        verdict, detail = lookup(repo, name)
        if verdict == EXISTS:
            print(f"  {name}: exists on {repo}")
        problems = verdict_problems(name, ecosystems, verdict, detail, repo)
        if verdict == CANNOT:
            cannot = True
        violations += problems

    for problem in violations:
        print(f"::error::{problem}", file=sys.stderr)
    if cannot:
        print(f"{NAME}: CANNOT VERIFY -- refusing to report a pass")
        return 2
    if violations:
        print(f"{NAME}: FAILED -- {len(violations)} problem(s)")
        return 1
    print(f"{PREFIX}: clean -- {len(names)} label(s) verified to exist across {len(sites)} site(s)")
    return 0


def self_test() -> int:
    sites = label_sites(parse_config())
    names = grouped(sites)
    cases: list[tuple[str, bool, bool]] = []

    def add(label: str, detected: bool, want: bool) -> None:
        cases.append((label, detected, want))

    # --- classify_lookup: one probe per side, so a checker that answers one way for everything
    # cannot keep the step green.
    add(
        "404 is classified MISSING",
        classify_lookup(1, "", "gh: Not Found (HTTP 404)") == MISSING,
        True,
    )
    add(
        "401 is NOT classified MISSING",
        classify_lookup(1, "", "HTTP 401: Bad credentials") == MISSING,
        False,
    )
    add(
        "a refused connection is NOT MISSING",
        classify_lookup(1, "", "dial tcp: lookup failed") == MISSING,
        False,
    )
    add("an empty 2xx body is not EXISTS", classify_lookup(0, "", "") == EXISTS, False)
    add(
        "control: a named label is EXISTS",
        classify_lookup(0, "security-review\n", "") == EXISTS,
        True,
    )

    # --- verdict_problems: the message must name what an operator can act on.
    missing = verdict_problems("security-review", ["pip", "npm"], MISSING, "", "o/r")
    add(
        "MISSING names the label and its sites",
        bool(missing) and "security-review" in missing[0] and "pip, npm" in missing[0],
        True,
    )
    cannot = verdict_problems("ci", ["github-actions"], CANNOT, "HTTP 403", "o/r")
    add("CANNOT is reported as CANNOT", bool(cannot) and "CANNOT" in cannot[0], True)
    add(
        "control: EXISTS raises no problem",
        bool(verdict_problems("ci", ["github-actions"], EXISTS, "", "o/r")),
        False,
    )

    # --- structural half: emptiness is a finding, the shipped file is not.
    add("no labels: site is a finding", bool(structural_problems([])), True)
    add("control: the shipped sites are clean", bool(structural_problems(sites)), False)
    add(
        "padded label is a finding",
        bool(structural_problems([("pip", [" security-review"])])),
        True,
    )

    # --- the counts this gate is about, asserted against the real file.
    add(
        "shipped config matches the measured shape",
        set(names) == {"dependencies", "security-review", "ci"}
        and len(sites) == 4
        and sum(len(labels) for _, labels in sites) == 8,
        True,
    )
    add("control: no phantom label name", bool(names.get("zz-not-a-label")), False)

    # --- YAML 1.1: a leading @ is a reserved indicator, so quoted names must survive intact.
    # This is the §8 G39 lesson applied to this checker's own input.
    reserved = label_sites({"updates": [{"package-ecosystem": "pip", "labels": ["@ops", "ci"]}]})
    add("quoted @-prefixed label survives", reserved == [("pip", ["@ops", "ci"])], True)

    # --- mode: off CI must skip, in CI must not, and force must override.
    add("off-CI mode is skip", platform_mode({}) == "skip", True)
    add(
        "a missing PyYAML names itself as CANNOT",
        "no PyYAML" in dependency_missing_problem(ModuleNotFoundError("No module named 'yaml'")),
        True,
    )
    add("CI mode is not skip", platform_mode({"GITHUB_ACTIONS": "true"}) == "skip", False)
    add("force overrides the skip", platform_mode({"DEP_LABELS_FORCE": "1"}) == "skip", False)
    add(
        "control: unset GITHUB_ACTIONS is not CI",
        platform_mode({"GITHUB_ACTIONS": ""}) == "skip",
        True,
    )

    ok = True
    for label, detected, want in cases:
        verdict = "DETECTED" if detected else "silent"
        if detected != want:
            ok = False
            verdict += f" <- WRONG (expected {'detection' if want else 'silence'})"
        print(f"self-test {label:<40}: {verdict}")
    tail = "OK - the gate can fail and can pass" if ok else "FAILED - the gate is not trustworthy"
    print(f"self_test {tail} ({len(cases)} probes)")
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    return run()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
