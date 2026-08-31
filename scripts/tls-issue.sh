#!/usr/bin/env bash
# JOL Marketplace — Let's Encrypt issuance & install (containerized certbot,
# NO sudo required). Prerequisites:
#   * inbound TCP 80 + 443 open in the Proxmox/hosting firewall
#     (ACME HTTP-01 needs port 80 from the internet; verified blocked on
#     2026-08-23: LE "Timeout during connect", SSL Labs "Unable to connect")
#   * prod stack running (nginx serves /.well-known/acme-challenge/ webroot)
# Re-runnable: renewals use the same webroot; cron handles the steady state.
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-marketplace.gyvenimo-kelias.lt}"
EMAIL="${ACME_EMAIL:-admin@gyvenimo-kelias.lt}"

echo "== issuing for $DOMAIN (webroot via nginx) =="
docker run --rm \
  -v "$PWD/certbot-webroot:/var/www/certbot" \
  -v "$PWD/certbot-webroot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot-webroot/logs:/var/log/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN"

echo "== publishing live pair to ./ssl (nginx mount) =="
cp -L "certbot-webroot/conf/live/$DOMAIN/fullchain.pem" ssl/fullchain.pem
cp -L "certbot-webroot/conf/live/$DOMAIN/privkey.pem" ssl/privkey.pem
chmod 640 ssl/privkey.pem

echo "== nginx -t + reload =="
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T nginx nginx -t
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T nginx nginx -s reload

echo "== certificate =="
openssl x509 -in ssl/fullchain.pem -noout -subject -enddate
echo "TLS issued and nginx reloaded."
