#!/usr/bin/env bash
# Local pre-push safety net (CI runs Gitleaks; this catches the obvious ones
# before they leave the machine). Exits non-zero on any finding.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PATTERNS=(
  'sk_live_[A-Za-z0-9]{16,}'           # Stripe live secret
  'sk_test_[A-Za-z0-9]{16,}'           # Stripe test secret (still not in git)
  'whsec_[A-Za-z0-9]{16,}'             # Stripe webhook secret
  'AKIA[0-9A-Z]{16}'                   # AWS access key id
  '-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----'
  'xox[baprs]-[A-Za-z0-9-]{10,}'       # Slack tokens
)

# Scope: what git actually carries — not the whole working tree.
#
# CI checks out the repository, so in CI `grep -r .` and `git ls-files` see the
# same set. On a developer machine they do not: the tree also holds gitignored,
# untracked operator files (.env, .env.prod). Grepping those made this gate fail
# on credentials that never leave the machine, so it could never pass on a real
# checkout — and a gate whose failure is unfixable trains the operator to ignore
# it (QODER.md §8 G15; the same failure mode as the closed G3). It also broke the
# Makefile's own "CI uses the same targets (parity by design)" rule: one command,
# two different measurement sets. Scanning the tracked set makes local and CI ask
# the identical question — "does git carry a credential?" — which is the only
# question this script is able to answer. History is Gitleaks' job (security.yml).
#
# Usage: check_no_secrets.sh            audit the tracked set (CI + `make`)
#        check_no_secrets.sh --staged   audit only what is staged (pre-commit)
MODE="${1:-all}"
if [[ "$MODE" != "all" && "$MODE" != "--staged" ]]; then
  echo "check_no_secrets: unknown argument '$MODE'" >&2
  exit 2
fi

if [[ "$MODE" == "--staged" ]]; then
  mapfile -d '' FILES < <(git diff --cached --name-only -z --diff-filter=ACMR)
else
  mapfile -d '' FILES < <(git ls-files -z)
fi

# Fail CLOSED rather than silently passing. A "clean" verdict from a scan that
# inspected nothing is the always-green defect recorded as G3, so an empty set,
# a vanished file and an unreadable file are all exit 2, never exit 0.
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "check_no_secrets: CANNOT VERIFY — empty file set (not a git checkout? nothing staged?)" >&2
  exit 2
fi
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" || ! -r "$f" ]]; then
    echo "check_no_secrets: CANNOT VERIFY — '$f' is listed but missing or unreadable" >&2
    exit 2
  fi
done

# .env.example / .env.prod.example are documented templates; LICENSE is legal text;
# this script necessarily contains the very patterns it hunts.
EXCLUDES=(--exclude=.env.example --exclude=.env.prod.example
          --exclude=LICENSE
          --exclude=check_no_secrets.sh)

FOUND=0
for pattern in "${PATTERNS[@]}"; do
  # -e: patterns may begin with '-' (e.g. PEM headers) and must not be
  # interpreted as options. CRITICAL: grep exits 2 on any read error (e.g. a
  # permission-denied directory) even when it FOUND matches — keying the
  # verdict on grep's exit code therefore produced false "clean" verdicts.
  # Decide on OUTPUT, never on exit status; suppress stderr noise only.
  # Readability of every listed file is asserted above, so a grep exit 2 here
  # cannot mask a finding. NUL-delimited filenames survive spaces in paths.
  if matches="$(printf '%s\0' "${FILES[@]}" \
      | xargs -0 -r grep -IHnE "${EXCLUDES[@]}" -e "$pattern" 2>/dev/null)"; [ -n "$matches" ]; then
    printf '%s\n' "$matches"
    echo "^^^ potential secret matched: ${pattern}" >&2
    FOUND=1
  fi
done

if [[ "$FOUND" -ne 0 ]]; then
  echo "check_no_secrets: FAILED — remove secrets before pushing." >&2
  exit 1
fi
echo "check_no_secrets: clean."
