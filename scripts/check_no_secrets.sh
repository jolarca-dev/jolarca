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

# .env.example / .env.prod.example are documented templates; LICENSE is legal text.
EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next
          --exclude-dir=.venv --exclude=.env.example --exclude=.env.prod.example
          --exclude=LICENSE
          --exclude=check_no_secrets.sh)

FOUND=0
for pattern in "${PATTERNS[@]}"; do
  # -e: patterns may begin with '-' (e.g. PEM headers) and must not be
  # interpreted as options. CRITICAL: grep exits 2 on any read error (e.g. a
  # permission-denied directory) even when it FOUND matches — keying the
  # verdict on grep's exit code therefore produced false "clean" verdicts.
  # Decide on OUTPUT, never on exit status; suppress stderr noise only.
  if matches="$(grep -rInE "${EXCLUDES[@]}" -e "$pattern" . 2>/dev/null)"; [ -n "$matches" ]; then
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
