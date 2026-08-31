#!/usr/bin/env bash
# =============================================================================
# JOL Marketplace — production monitoring (cron: every 15 min).
#
# Checks: disk space, memory pressure, compose service health. Alerts via
# webhook (MONITOR_WEBHOOK_URL) or mail (MONITOR_EMAIL + sendmail) when
# thresholds are exceeded. Log rotation lives in scripts/log-rotate.sh
# (single owner — this script no longer rotates).
# =============================================================================
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
DISK_THRESHOLD_PCT="${DISK_THRESHOLD_PCT:-85}"
MEM_THRESHOLD_PCT="${MEM_THRESHOLD_PCT:-90}"
COMPOSE="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

ALERTS=()

alert() {
  ALERTS+=("$*")
}

# --- Disk -----------------------------------------------------------------------
DISK_PCT="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')"
if [[ "${DISK_PCT}" -ge "${DISK_THRESHOLD_PCT}" ]]; then
  alert "disk usage ${DISK_PCT}% ≥ ${DISK_THRESHOLD_PCT}% on $(hostname)"
fi

# --- Memory ---------------------------------------------------------------------
MEM_PCT="$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')"
if [[ "${MEM_PCT}" -ge "${MEM_THRESHOLD_PCT}" ]]; then
  alert "memory usage ${MEM_PCT}% ≥ ${MEM_THRESHOLD_PCT}% on $(hostname)"
fi

# --- Container health -------------------------------------------------------------
# Any service not reporting "running"/"healthy" is an alert condition.
while read -r name state health; do
  if [[ "${state}" != "running" ]]; then
    alert "service ${name} is ${state}"
  elif [[ -n "${health}" && "${health}" != "healthy" && "${health}" != "none" ]]; then
    alert "service ${name} health is ${health}"
  fi
done < <(${COMPOSE} ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null || true)

# --- Log rotation -------------------------------------------------------------
# Owned by scripts/log-rotate.sh (daily cron) — kept out of this 15-minute
# probe so monitoring stays read-only.


# --- Dispatch ----------------------------------------------------------------------
if [[ ${#ALERTS[@]} -gt 0 ]]; then
  BODY="$(printf '%s\n' "${ALERTS[@]}")"
  echo "[monitor] ${#ALERTS[@]} alert(s)" >&2
  echo "${BODY}" >&2

  if [[ -n "${MONITOR_WEBHOOK_URL:-}" ]]; then
    wget -qO- --post-data="{\"text\":\"JOL Marketplace alerts:\\n${BODY//$'\n'/\\n}\"}" \
      --header='Content-Type: application/json' "${MONITOR_WEBHOOK_URL}" >/dev/null || true
  fi
  if [[ -n "${MONITOR_EMAIL:-}" ]] && command -v sendmail >/dev/null 2>&1; then
    printf 'Subject: [JOL Marketplace] monitoring alerts\n\n%s\n' "${BODY}" \
      | sendmail "${MONITOR_EMAIL}" || true
  fi
  exit 1
fi

echo "[monitor] all checks passed (disk ${DISK_PCT}%, mem ${MEM_PCT}%)."
