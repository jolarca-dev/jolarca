#!/usr/bin/env bash
# =============================================================================
# JOL Marketplace — service health check (cron: every 5 min).
#
# Probes every service, prints a single JSON document to stdout, and exits
# non-zero if ANY check fails. Alerts fire only after FAIL_THRESHOLD (default
# 3) CONSECUTIVE failed runs, so a single 5-minute blip never pages anyone.
#
# Checks:
#   frontend      HTTP 200 on the localized home via the public edge
#                 (nginx routes /api/ to Django, so the app's /api/health is
#                 NOT edge-reachable — probe a rendered page instead)
#   backend       /healthz/ probed container-internally (Django mounts it at
#                 the root, which the nginx /api/ passthrough does not expose)
#   postgres      pg_isready inside the container
#   redis         redis-cli ping inside the container
#   elasticsearch /_cluster/health inside the container (status green/yellow)
#   worker        celery inspect ping (broker + worker liveness)
#   nginx         nginx -t inside the container + edge /healthz over HTTP
#
# Idempotent: read-only probes; the only state written is the consecutive-
# failure counter in STATE_DIR. Never logs secrets (probes carry no
# credentials — internal tiers are reached via docker exec, not URLs).
#
# Usage:
#   scripts/health-check.sh                 # probe + alert logic
#   scripts/health-check.sh --json-only     # probe only; no state/alerts
# =============================================================================
set -uo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
STATE_DIR="${STATE_DIR:-/var/lib/jol-marketplace}"
STATE_FILE="${STATE_DIR}/health-check-failures"
HTTP_TIMEOUT="${HTTP_TIMEOUT:-10}"

# Edge URLs: default to the public origin; overridable for staging/tests.
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  DOMAIN_DEFAULT="$(grep -E '^DOMAIN=' "${ENV_FILE}" | head -1 | cut -d= -f2- || true)"
fi
DOMAIN="${DOMAIN:-${DOMAIN_DEFAULT:-localhost}}"
FRONTEND_URL="${FRONTEND_URL:-https://${DOMAIN}/en/}"
NGINX_EDGE_URL="${NGINX_EDGE_URL:-https://${DOMAIN}/healthz}"

COMPOSE=(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")

JSON_ONLY=0
[[ "${1:-}" == "--json-only" ]] && JSON_ONLY=1

RESULTS=()   # {"service":…,"status":…,"detail":…} entries
FAILED=0

record() { # service ok|fail detail
  local status="$2" detail="${3:-}"
  detail="${detail//\\/\\\\}"; detail="${detail//\"/\\\"}"  # keep JSON valid
  [[ "${status}" == "fail" ]] && FAILED=$((FAILED + 1))
  RESULTS+=("{\"service\":\"$1\",\"status\":\"${status}\",\"detail\":\"${detail}\"}")
}

http_check() { # service url
  local code
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time "${HTTP_TIMEOUT}" "$2" 2>/dev/null || echo 000)"
  if [[ "${code}" == "200" ]]; then
    record "$1" ok "HTTP 200"
  else
    record "$1" fail "HTTP ${code}"
  fi
}

exec_check() { # service container-service command…
  local svc="$1" csvc="$2"; shift 2
  local detail
  if detail="$("${COMPOSE[@]}" exec -T "${csvc}" "$@" 2>&1)"; then
    record "${svc}" ok "$(echo "${detail}" | head -c 80 | tr '\n' ' ')"
  else
    record "${svc}" fail "$(echo "${detail}" | head -c 80 | tr '\n' ' ')"
  fi
}

# --- Probes --------------------------------------------------------------------
http_check frontend "${FRONTEND_URL}"
# Django mounts healthz at the root; probe inside the container exactly like
# the compose healthcheck does (the public /api/ passthrough cannot reach it).
# Host + X-Forwarded-Proto mirror the compose healthcheck: prod ALLOWED_HOSTS
# rejects loopback and SECURE_SSL_REDIRECT 301s plain-HTTP hops.
exec_check backend backend curl -fsS -o /dev/null \
  -H "Host: ${DOMAIN}" -H "X-Forwarded-Proto: https" \
  http://localhost:8000/healthz/
exec_check postgres postgres pg_isready -q
exec_check redis redis redis-cli ping
# ES passes on green OR yellow (single-node clusters report yellow until
# replicas are possible); red or unreachable fails. The ES 8 image ships
# curl but NOT wget — use curl.
es_health="$("${COMPOSE[@]}" exec -T elasticsearch \
  curl -fsS http://localhost:9200/_cluster/health 2>/dev/null || true)"
if echo "${es_health}" | grep -qE '"status":"(green|yellow)"'; then
  record elasticsearch ok "$(echo "${es_health}" | grep -oE '"status":"[a-z]+"' | head -1)"
else
  record elasticsearch fail "cluster unreachable or red"
fi
exec_check nginx nginx nginx -t
http_check nginx-edge "${NGINX_EDGE_URL}"
# Celery liveness: ping the worker over the broker. `inspect ping` exits
# non-zero when no worker answers within the timeout. Capture first, then
# grep — under pipefail, grep -q's early exit would SIGPIPE celery and
# flip the pipeline status.
worker_ping="$("${COMPOSE[@]}" exec -T worker \
  celery -A project inspect ping --timeout 5 2>/dev/null || true)"
if echo "${worker_ping}" | grep -q pong; then
  record worker ok "celery pong"
else
  record worker fail "no celery pong"
fi

# --- JSON to stdout -------------------------------------------------------------
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '{'
printf '"timestamp":"%s",' "${STAMP}"
printf '"failed_checks":%d,' "${FAILED}"
printf '"checks":[%s]' "$(IFS=,; echo "${RESULTS[*]}")"
printf '}\n'

[[ "${JSON_ONLY}" == "1" ]] && { [[ "${FAILED}" == "0" ]]; exit $?; }

# --- Consecutive-failure accounting ---------------------------------------------
mkdir -p "${STATE_DIR}" 2>/dev/null || STATE_DIR="$(pwd)/.state" && mkdir -p "${STATE_DIR}"
STATE_FILE="${STATE_DIR}/health-check-failures"

if [[ "${FAILED}" == "0" ]]; then
  echo 0 > "${STATE_FILE}"
  exit 0
fi

STREAK="$(cat "${STATE_FILE}" 2>/dev/null || echo 0)"
STREAK=$((STREAK + 1))
echo "${STREAK}" > "${STATE_FILE}"
[[ "${STREAK}" -lt "${FAIL_THRESHOLD}" ]] && exit 1

# --- Alert (only at the threshold run — no repeat pages while broken) -----------
if [[ "${STREAK}" -eq "${FAIL_THRESHOLD}" ]]; then
  MSG="JOL Marketplace: ${FAILED} health check(s) failing for ${STREAK} consecutive runs (${STAMP}). See scripts/health-check.sh output."
  echo "[health-check] ALERT: ${MSG}" >&2
  if [[ -n "${MONITOR_WEBHOOK_URL:-}" ]]; then
    wget -qO- --post-data="{\"text\":\"${MSG}\"}" \
      --header='Content-Type: application/json' "${MONITOR_WEBHOOK_URL}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${MONITOR_EMAIL:-}" ]] && command -v sendmail >/dev/null 2>&1; then
    printf 'Subject: [JOL Marketplace] health checks failing\n\n%s\n' "${MSG}" \
      | sendmail "${MONITOR_EMAIL}" 2>/dev/null || true
  fi
fi
exit 1
