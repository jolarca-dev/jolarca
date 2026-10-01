#!/usr/bin/env bash
# CI guard: secrets/ directory must contain ONLY README files.
# Any other file (encrypted or plaintext) is a policy violation.
# Policy: policy/repo-defaults.yml#data_handling secrets_in_git: "prohibited"
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ ! -d "secrets" ]; then
  echo "No secrets/ directory found — OK"
  exit 0
fi

# Find all files in secrets/ that are NOT README.md
violations=$(find secrets/ -type f ! -name "README.md" ! -name "README" 2>/dev/null)

if [ -n "$violations" ]; then
  echo "ERROR: secrets/ directory contains non-README files:"
  echo "$violations"
  echo ""
  echo "Policy: secrets_in_git is PROHIBITED (policy/repo-defaults.yml#data_handling)"
  echo "If these are SOPS-encrypted files, they still must not be in git."
  echo "See secrets/encrypted/README.md for the SOPS workflow."
  exit 1
fi

echo "secrets/ Directory clean — only README files found"
exit 0
