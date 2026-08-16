#!/usr/bin/env bash
# Regression test for scripts/wait_for_services.sh URL parsing and test-mode
# host derivation. Guards the fix for the CI-parity defect where the test
# container waited on localhost:5432 while the DB lived at db:5432.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/wait_for_services.sh"

fail=0
assert_eq() { # expected actual label
  if [[ "$1" != "$2" ]]; then
    echo "FAIL: $3 — expected '$1', got '$2'" >&2
    fail=1
  else
    echo "ok: $3"
  fi
}

# hostport_from_url parsing
assert_eq "db:5432" "$(hostport_from_url 'postgres://jol_test:pw@db:5432/jol_test' 5432)" "postgres URL with credentials"
assert_eq "db:5432" "$(hostport_from_url 'postgres://db/jol_test' 5432)" "postgres URL without port gets default"
assert_eq "redis:6379" "$(hostport_from_url 'redis://redis:6379/1' 6379)" "redis URL with database suffix"
assert_eq "localhost:5432" "$(hostport_from_url 'postgres://jol:p%40ss@localhost:5432/db' 5432)" "localhost URL survives"

# build_test_hosts derives container hostnames from env
out="$(DATABASE_URL='postgres://u:p@db:5432/jol_test' REDIS_URL='redis://redis:6379/0' build_test_hosts)"
assert_eq $'db:5432\nredis:6379' "$out" "test hosts derived from env"

# build_test_hosts is empty when env is unset (host-side no-op path)
out="$(unset DATABASE_URL REDIS_URL; build_test_hosts)"
assert_eq "" "${out//$'\n'/}" "no env yields empty host list"

exit "$fail"
