#!/usr/bin/env bash
# CI guard: secrets/ may contain ONLY README files and genuine SOPS ciphertext.
# Plaintext (or anything that is not sanctioned SOPS output) is a policy
# violation. Fails CLOSED if the directory cannot be audited.
#
# Policy sources (all verified present in this repo):
#   - .sops.yaml creation_rules: ^secrets/encrypted/ is a SANCTIONED encrypted
#     root (ADR-003 amendment, Gate 8 GO 2026-08-27); encrypted artifacts are
#     committed here.
#   - secrets/encrypted/README.md: "Files committed here MUST be genuine SOPS
#     output... Plaintext in this directory is a security incident."
#   - QODER.md: "never commit plaintext secrets to secrets/encrypted/".
#
# So the enforced rule is content-based, not name-based: every non-README file
# must be genuine SOPS output. A plaintext secret, a plaintext file masquerading
# behind an encrypted-looking name, or a symlink (exfiltration vector) all fail.
# (Complementary: the same CI job also runs check_no_secrets.sh / gitleaks, which
# catches secret *content* patterns; this guard enforces the structural policy.)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ ! -d "secrets" ]; then
  echo "No secrets/ directory found — OK"
  exit 0
fi

# Enumerate regular files AND symlinks under secrets/, excluding READMEs.
# Capture find's stderr into the result: an unreadable directory must NOT be
# indistinguishable from a clean one (fail closed on scan errors).
if ! listing="$(find secrets/ \( -type f -o -type l \) \
                  ! -name 'README.md' ! -name 'README' 2>&1)"; then
  echo "ERROR: cannot audit secrets/ — failing closed:" >&2
  printf '%s\n' "$listing" >&2
  exit 1
fi
if printf '%s\n' "$listing" | grep -qiE ': (Permission denied|No such file|Not a directory)'; then
  echo "ERROR: secrets/ scan reported errors — failing closed:" >&2
  printf '%s\n' "$listing" >&2
  exit 1
fi

if [ -z "$listing" ]; then
  echo "secrets/ clean — only README files found"
  exit 0
fi

VIOLATIONS=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ -L "$f" ]; then
    echo "VIOLATION: $f is a symlink (exfiltration vector) — not permitted under secrets/"
    VIOLATIONS=1
    continue
  fi
  # Genuine SOPS output always carries a top-level `sops:` (YAML) / "sops":
  # (JSON) metadata block and/or ENC[AES256_GCM,...] value markers.
  if grep -qE '(^sops:|"sops"[[:space:]]*:|ENC\[AES256)' "$f" 2>/dev/null; then
    continue
  fi
  echo "VIOLATION: $f is not genuine SOPS ciphertext (plaintext / unsanctioned file)"
  VIOLATIONS=1
done <<< "$listing"

if [ "$VIOLATIONS" -ne 0 ]; then
  echo ""
  echo "Policy: plaintext / unsanctioned material in secrets/ is PROHIBITED"
  echo "(ADR-003 / .sops.yaml / QODER.md). Only README files and genuine SOPS"
  echo "ciphertext may be committed. If these are meant to be secrets, encrypt"
  echo "them with sops --encrypt. See secrets/encrypted/README.md."
  exit 1
fi

echo "secrets/ clean — only README and genuine SOPS artifacts found"
exit 0
