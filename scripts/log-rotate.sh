#!/usr/bin/env bash
# =============================================================================
# JOL Marketplace — log rotation + backup retention (cron: daily, e.g. 02:30).
#
# 1. nginx access/error logs (host dir ./logs/nginx, mounted into the
#    container): rename → gzip → signal nginx to reopen its file handles.
#    Compressed logs kept 30 days.
# 2. Docker container logs: bounded by the json-file driver limits declared
#    in docker-compose.prod.yml (x-logging: max-size 10m / max-file 5). This
#    script VERIFIES that config; if it is missing, say so loudly — silently
#    unbounded container logs are how VMs fill their disks.
# 3. Backups (scripts/backup.sh output): keep 7 daily / 4 weekly / 12 monthly.
#
# Idempotent: every step can run twice in a row with the same result.
# No secrets: operates on file paths only; never reads log contents.
# =============================================================================
set -uo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
NGINX_LOG_DIR="${NGINX_LOG_DIR:-$(pwd)/logs/nginx}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/jolarca}"
KEEP_DAYS="${KEEP_DAYS:-30}"
MIN_ROTATE_BYTES="${MIN_ROTATE_BYTES:-1048576}"   # 1 MiB

log() { printf '\033[1;34m[log-rotate]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[log-rotate] WARN:\033[0m %s\n' "$*" >&2; }
STAMP="$(date +%Y%m%d-%H%M%S)"

# --- 1. nginx logs ---------------------------------------------------------------
if [[ -d "${NGINX_LOG_DIR}" ]]; then
  rotated=0
  for f in "${NGINX_LOG_DIR}"/*.log; do
    [[ -f "${f}" ]] || continue
    size="$(stat -c%s "${f}" 2>/dev/null || echo 0)"
    if [[ "${size}" -ge "${MIN_ROTATE_BYTES}" ]]; then
      mv "${f}" "${f}.${STAMP}"
      gzip -q "${f}.${STAMP}"
      rotated=$((rotated + 1))
    fi
  done
  if [[ "${rotated}" -gt 0 ]]; then
    # Reopen log handles so nginx writes into fresh files. Compose service
    # name is nginx in the prod topology; tolerate the stack being down.
    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
      exec -T nginx nginx -s reopen 2>/dev/null \
      || warn "nginx reopen skipped (stack not running?) — rotated ${rotated} file(s)"
    log "rotated ${rotated} nginx log(s)"
  else
    log "nginx logs below ${MIN_ROTATE_BYTES} bytes — nothing to rotate"
  fi
  # Compressed retention: KEEP_DAYS (default 30).
  find "${NGINX_LOG_DIR}" -name '*.log.*.gz' -mtime "+${KEEP_DAYS}" -delete 2>/dev/null
else
  warn "nginx log dir ${NGINX_LOG_DIR} not found — nothing to rotate"
fi

# --- 2. Docker container-log driver verification ----------------------------------
if docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" config 2>/dev/null \
    | grep -q 'max-size'; then
  log "compose json-file log limits present (max-size/max-file)"
else
  warn "compose has NO json-file max-size limits — container logs are unbounded!"
fi

# --- 3. Backup retention: 7 daily / 4 weekly / 12 monthly ------------------------
keep_latest() { # dir count
  local dir="$1" keep="$2"
  [[ -d "${dir}" ]] || return 0
  # shellcheck disable=SC2012
  ls -1t "${dir}" 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
    rm -rf -- "${dir:?}/${old}"
    log "pruned ${dir}/${old}"
  done
}
keep_latest "${BACKUP_ROOT}/daily" 7
keep_latest "${BACKUP_ROOT}/weekly" 4
keep_latest "${BACKUP_ROOT}/monthly" 12
[[ -d "${BACKUP_ROOT}" ]] || warn "backup root ${BACKUP_ROOT} not found — retention skipped"

log "done"
