#!/usr/bin/env bash
# =============================================================================
# JOL Marketplace — production deploy (single Proxmox 9.2 VM).
#
# Flow: tag previous image (rollback point) → build/pull new image →
#       migrations BEFORE traffic → rolling restart → health gate →
#       smoke test with header verification.
#
# Single-instance note: with one app container the swap causes a brief
# (~seconds) maintenance window; nginx keepalive + health gating keep it
# clean. Add replicas + rolling update when the traffic profile demands.
#
# Usage:
#   scripts/deploy.sh            # build locally + deploy
#   scripts/deploy.sh --pull     # pull prebuilt images instead
#   scripts/deploy.sh --rollback # restore the previous tagged image
# =============================================================================
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
IMAGE_NAME="jol-marketplace/frontend"
HEALTH_TIMEOUT_S=120
COMPOSE="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# The app publishes no ports (nginx is the only ingress), so the gate
# probes the container's own liveness route from inside.
health_ok() {
  ${COMPOSE} exec -T app wget -qO /dev/null http://127.0.0.1:3000/api/health 2>/dev/null
}

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "${ENV_FILE}" ]] || fail "${ENV_FILE} missing — copy .env.prod.example and fill it in."

# --- Rollback path -----------------------------------------------------------
if [[ "${1:-}" == "--rollback" ]]; then
  PREV_TAG="$(docker image ls --format '{{.Tag}}' "${IMAGE_NAME}" | grep '^prev-' | sort -r | head -1 || true)"
  [[ -n "${PREV_TAG}" ]] || fail "no previous image tag found (prev-*) — nothing to roll back to."
  log "rolling back to ${IMAGE_NAME}:${PREV_TAG}"
  IMAGE_TAG="${PREV_TAG}" ${COMPOSE} up -d app
  log "waiting for the rolled-back app to pass the health gate…"
  SECONDS=0
  until health_ok || [[ ${SECONDS} -ge ${HEALTH_TIMEOUT_S} ]]; do
    sleep 2
  done
  [[ ${SECONDS} -lt ${HEALTH_TIMEOUT_S} ]] || fail "rollback health gate timed out."
  log "rollback complete."
  exit 0
fi

# --- 1. Preserve the current image as the rollback point ----------------------
CURRENT_ID="$(docker image ls --format '{{.ID}}' "${IMAGE_NAME}:latest" | head -1 || true)"
if [[ -n "${CURRENT_ID}" ]]; then
  ROLLBACK_TAG="prev-$(date +%Y%m%d-%H%M%S)"
  docker tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${ROLLBACK_TAG}"
  log "current image tagged ${IMAGE_NAME}:${ROLLBACK_TAG} (rollback point)"
fi

# --- 2. Build or pull the new image -------------------------------------------
if [[ "${1:-}" == "--pull" ]]; then
  log "pulling ${IMAGE_NAME}:latest"
  docker pull "${IMAGE_NAME}:latest"
else
  log "building ${IMAGE_NAME}:latest (lockfile-only, no secrets in layers)"
  ${COMPOSE} build app
fi

# --- 3. Migrations BEFORE the app serves traffic ------------------------------
# The Django API owns the schema; run its migrations against the prod DB.
# If the compose project defines a `backend` service, exec there; otherwise
# fall back to the host venv (Makefile parity).
if ${COMPOSE} config --services 2>/dev/null | grep -qx backend; then
  log "running Django migrations (containerized backend)"
  ${COMPOSE} run --rm backend python manage.py migrate --noinput
elif [[ -x backend/manage.py ]] && [[ -d .venv ]]; then
  log "running Django migrations (host venv → DATABASE_URL from ${ENV_FILE})"
  set -a
  # shellcheck source=/dev/null # runtime file; validated above
  source "${ENV_FILE}"
  set +a
  (cd backend && ../.venv/bin/python manage.py migrate --noinput)
else
  fail "no migration path found: define a backend service or provide .venv + backend/manage.py."
fi

# --- 4. Recreate the app (nginx waits on app health via depends_on) -----------
log "recreating app + edge"
${COMPOSE} up -d --no-deps app
${COMPOSE} up -d nginx

# --- 5. Health gate -----------------------------------------------------------
log "waiting for app /api/health (timeout ${HEALTH_TIMEOUT_S}s)"
SECONDS=0
until health_ok; do
  [[ ${SECONDS} -lt ${HEALTH_TIMEOUT_S} ]] || fail "app failed the health gate — run: $0 --rollback"
  sleep 2
done
log "health gate passed."

# --- 6. Post-deploy smoke test --------------------------------------------------
log "smoke test: home page + security headers"
SMOKE_HEADERS="$(wget -SqO /dev/null "https://$(grep '^DOMAIN=' "${ENV_FILE}" | cut -d= -f2)/" 2>&1 || true)"
for header in "Strict-Transport-Security" "X-Frame-Options" "X-Content-Type-Options" "Content-Security-Policy"; do
  grep -qi "${header}" <<<"${SMOKE_HEADERS}" || log "WARN: ${header} missing from smoke response (expected once TLS certs are live)"
done
log "deploy complete — ${IMAGE_NAME}:latest is live."
