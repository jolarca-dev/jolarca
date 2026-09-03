#!/usr/bin/env bash
# Block until local services accept connections. Usage: wait_for_services.sh [test]
#
# Test mode is CI-parity: docker-compose.test.yml exposes NO host ports, so
# readiness is derived from DATABASE_URL / REDIS_URL when those are set
# (i.e. we are inside the test container: db:5432, redis:6379). When they are
# unset (host side), compose depends_on + healthchecks already gate startup,
# so the wait is a documented no-op instead of probing unreachable localhost.
set -euo pipefail

MODE="${1:-dev}"

# postgres://user:pw@host:port/db -> host:port ; redis://host:port/N -> host:port
hostport_from_url() {
  local u="$1" default_port="${2:-5432}"
  u="${u#*://}"      # strip scheme
  u="${u#*@}"        # strip credentials (if any)
  u="${u%%/*}"       # strip path/database
  [[ "$u" == *:* ]] || u="${u}:${default_port}"
  printf '%s' "$u"
}

build_test_hosts() {
  local hosts=()
  if [[ -n "${DATABASE_URL:-}" ]]; then
    hosts+=("$(hostport_from_url "$DATABASE_URL" 5432)")
  fi
  if [[ -n "${REDIS_URL:-}" ]]; then
    hosts+=("$(hostport_from_url "$REDIS_URL" 6379)")
  fi
  printf '%s\n' "${hosts[@]:-}"
}

wait_for() {
  local hostport="$1" host="${1%%:*}" port="${1##*:}" elapsed=0
  while ! (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; do
    sleep 2
    elapsed=$((elapsed + 2))
    if (( elapsed >= TIMEOUT )); then
      echo "TIMEOUT waiting for ${hostport}" >&2
      return 1
    fi
  done
  echo "ok: ${hostport}"
}

main() {
  local MODE="$1" hosts=()
  TIMEOUT="${WAIT_TIMEOUT:-120}"

  if [[ "$MODE" == "test" ]]; then
    mapfile -t hosts < <(build_test_hosts)
    if [[ ${#hosts[@]} -eq 0 || -z "${hosts[0]:-}" ]]; then
      echo "test mode: no DATABASE_URL/REDIS_URL set — compose healthchecks gate readiness; nothing to wait for."
      return 0
    fi
  else
    # Dev mode: host-mapped ports of docker-compose.dev.yml. Defaults are
    # offset from 5432/6379/8000 so other local services can run concurrently.
    hosts=(
      "localhost:${POSTGRES_PORT:-5433}"
      "localhost:${REDIS_HOST_PORT:-6380}"
      "localhost:${MINIO_PORT:-9000}"
      "localhost:${BACKEND_PORT:-8010}"
    )
  fi

  for hp in "${hosts[@]}"; do
    wait_for "$hp"
  done
  echo "All services reachable."
}

# Allow sourcing for unit tests without executing the wait loop.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "${1:-dev}"
fi
