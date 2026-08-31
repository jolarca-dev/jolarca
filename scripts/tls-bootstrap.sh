#!/usr/bin/env bash
# =============================================================================
# JOL Marketplace — TLS bootstrap (first boot on a fresh VM).
#
# Let's Encrypt cannot issue until the domain resolves AND nginx answers the
# ACME HTTP-01 challenge on :80 — but nginx refuses to start without a cert.
# This script breaks the cycle: it writes a self-signed ("snakeoil") cert for
# the domain into ./ssl/ so the stack can come up, and creates the certbot
# webroot. Run certbot afterwards; install the real cert into ./ssl/ and
# reload nginx.
#
# Idempotent: never overwrites existing certs (real or snakeoil).
#
# Usage:
#   scripts/tls-bootstrap.sh            # uses DOMAIN from .env.prod
#   DOMAIN=example.com scripts/tls-bootstrap.sh
# =============================================================================
set -euo pipefail

ENV_FILE=".env.prod"
SSL_DIR="./ssl"
WEBROOT="./certbot-webroot"

log() { printf '\033[1;34m[tls-bootstrap]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[tls-bootstrap] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v openssl >/dev/null 2>&1 || fail "openssl not found"

# Domain: explicit env wins; otherwise read .env.prod.
if [[ -z "${DOMAIN:-}" && -f "${ENV_FILE}" ]]; then
  DOMAIN="$(grep -E '^DOMAIN=' "${ENV_FILE}" | head -1 | cut -d= -f2- || true)"
fi
[[ -n "${DOMAIN:-}" ]] || fail "DOMAIN unset and not found in ${ENV_FILE}"

mkdir -p "${SSL_DIR}" "${WEBROOT}"

if [[ -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
  log "certs already present in ${SSL_DIR} — leaving them untouched."
  openssl x509 -in "${SSL_DIR}/fullchain.pem" -noout -subject -enddate
  exit 0
fi

log "generating self-signed snakeoil cert for ${DOMAIN} (90d)"
openssl req -x509 -nodes -newkey rsa:2048 -days 90 \
  -keyout "${SSL_DIR}/privkey.pem" \
  -out "${SSL_DIR}/fullchain.pem" \
  -subj "/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN}" \
  >/dev/null 2>&1
chmod 600 "${SSL_DIR}/privkey.pem"

log "snakeoil cert written — nginx can start; run certbot to replace it:"
log "  certbot certonly --webroot -w \$(pwd)/${WEBROOT#./} -d ${DOMAIN}"
