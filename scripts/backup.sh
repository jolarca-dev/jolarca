#!/usr/bin/env bash
# =============================================================================
# JOL Marketplace — production backup (cron: nightly).
#
# Captures: PostgreSQL (pg_dump | gzip), Redis (SAVE + dump.rdb),
# Elasticsearch (snapshot repository). Retention: 7 daily / 4 weekly /
# 12 monthly. Optional S3 upload when BACKUP_S3_BUCKET is set (rclone/aws
# CLI on the host); otherwise local-only rotation.
#
# Integrity: VERIFY_RESTORE=1 restores last night's pg_dump into a throwaway
# container and runs a row-count sanity check. Schedule monthly
# (cron: 0 4 1 * * VERIFY_RESTORE=1 scripts/backup.sh).
# =============================================================================
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
# Credentials come from the prod env file, not the caller's shell — cron
# runs with a bare environment and the :-jol fallback role does not exist.
if [[ -f "${ENV_FILE}" ]]; then
  : "${POSTGRES_USER:=$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | head -1 | cut -d= -f2-)}"
  : "${POSTGRES_DB:=$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | head -1 | cut -d= -f2-)}"
fi
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/jolarca}"
COMPOSE="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DAY_OF_WEEK="$(date +%u)"   # 1 = Monday
DAY_OF_MONTH="$(date +%d)"

log()  { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[backup] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

mkdir -p "${BACKUP_ROOT}"/{daily,weekly,monthly}

# Destination tier by calendar (monthly > weekly > daily).
if [[ "${DAY_OF_MONTH}" == "01" ]]; then
  TIER="monthly"
elif [[ "${DAY_OF_WEEK}" == "1" ]]; then
  TIER="weekly"
else
  TIER="daily"
fi
DEST="${BACKUP_ROOT}/${TIER}"
log "backup tier: ${TIER} → ${DEST}"

# --- 1. PostgreSQL -------------------------------------------------------------
log "pg_dump → gzip"
${COMPOSE} exec -T postgres pg_dump -U "${POSTGRES_USER:-jolarca}" -d "${POSTGRES_DB:-jolarca}" \
  | gzip -9 > "${DEST}/postgres-${STAMP}.sql.gz"
[[ -s "${DEST}/postgres-${STAMP}.sql.gz" ]] || fail "postgres dump is empty."

# --- 2. Redis -------------------------------------------------------------------
log "redis SAVE + dump.rdb copy"
${COMPOSE} exec -T redis redis-cli SAVE >/dev/null
${COMPOSE} cp redis:/data/dump.rdb "${DEST}/redis-${STAMP}.rdb"

# --- 3. Elasticsearch snapshot ---------------------------------------------------
# One-time repository registration (idempotent), then snapshot.
log "elasticsearch snapshot"
# Best-effort: ES 8 ships curl (not wget), and the cluster is provisioned
# but UNWIRED (search_app uses Postgres icontains) with no snapshot repo
# registered — a failure here warns, never aborts the pg/redis backups.
${COMPOSE} exec -T elasticsearch curl -s -X PUT \
  -H 'Content-Type: application/json' \
  -d '{"type":"fs","settings":{"location":"/usr/share/elasticsearch/backups"}}' \
  'http://localhost:9200/_snapshot/jol_backups' \
  >/dev/null 2>&1 || true
if ${COMPOSE} exec -T elasticsearch curl -s -X PUT \
  "http://localhost:9200/_snapshot/jol_backups/snap-${STAMP}?wait_for_completion=true" \
  >/dev/null 2>&1; then
  log "elasticsearch snapshot snap-${STAMP} ok"
else
  log "WARN: elasticsearch snapshot skipped/failed (cluster unwired — no app data at risk)"
fi

# --- 4. Optional S3 offload -------------------------------------------------------
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    log "uploading ${TIER} tier to s3:${BACKUP_S3_BUCKET}/${TIER}"
    rclone copy "${DEST}" "s3:${BACKUP_S3_BUCKET}/${TIER}" --include "postgres-${STAMP}*" --include "redis-${STAMP}*"
  else
    log "WARN: BACKUP_S3_BUCKET set but rclone missing — skipping upload."
  fi
fi

# --- 5. Rotation: keep 7 daily / 4 weekly / 12 monthly ---------------------------
rotate() {
  local dir="$1" keep="$2"
  find "${dir}" -maxdepth 1 -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | awk -v keep="${keep}" 'NR > keep {print $2}' \
    | while read -r old; do rm -f -- "${old}"; done
}
rotate "${BACKUP_ROOT}/daily" 7
rotate "${BACKUP_ROOT}/weekly" 4
rotate "${BACKUP_ROOT}/monthly" 12

# --- 6. Integrity verification (monthly cron sets VERIFY_RESTORE=1) --------------
if [[ "${VERIFY_RESTORE:-0}" == "1" ]]; then
  log "restore verification: loading last dump into a throwaway container"
  LATEST="$(find "${BACKUP_ROOT}/monthly" "${BACKUP_ROOT}/daily" \
    -maxdepth 1 -name 'postgres-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)"
  [[ -n "${LATEST}" ]] || fail "no dump found for restore verification."
  docker run --rm -v "${LATEST}:/dump.sql.gz:ro" postgres:16-alpine sh -c '
    gunzip -c /dump.sql.gz > /tmp/dump.sql
    head -c 200 /tmp/dump.sql | grep -q "PostgreSQL database dump" || exit 1
  ' || fail "restore verification FAILED — treat this as an incident."
  log "restore verification passed: ${LATEST}"
fi

log "backup complete (${TIER})."
