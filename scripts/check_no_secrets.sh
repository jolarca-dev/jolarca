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

# .env.example is the documented template; LICENSE is legal text.
EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next
          --exclude-dir=.venv --exclude=.env.example --exclude=LICENSE
          --exclude=check_no_secrets.sh)

FOUND=0
for pattern in "${PATTERNS[@]}"; do
  # -e: patterns may begin with '-' (e.g. PEM headers) and must not be
  # interpreted as options — a silently-skipped pattern is a false clean.
  if grep -rInE "${EXCLUDES[@]}" -e "$pattern" . ; then
    echo "^^^ potential secret matched: ${pattern}" >&2
    FOUND=1
  fi
done

if [[ "$FOUND" -ne 0 ]]; then
  echo "check_no_secrets: FAILED — remove secrets before pushing." >&2
  exit 1
fi
echo "check_no_secrets: clean."
