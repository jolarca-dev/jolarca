# JOL Marketplace — Operations Runbook

Post-launch operations reference for the single-VM production topology
(`marketplace.gyvenimo-kelias.lt`, Proxmox guest, Docker Compose).

Companion documents:

- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — severities, response times,
  communication + post-mortem templates.
- [runbooks/stripe-webhook-failure.md](./runbooks/stripe-webhook-failure.md)
- [runbooks/ai-outage.md](./runbooks/ai-outage.md)
- [runbooks/restore-from-backup.md](./runbooks/restore-from-backup.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md) — first-boot + release procedure.

All commands assume the repo checkout directory on the VM
(`/opt/jol-m/repos/jol-m-marketplace`) as working directory.

---

## 1. Service overview

`docker-compose.prod.yml` runs **8 containers** (Plausible exists in the
file but is deliberately commented out until consent infra v2):

| Service         | Role                                                             | Depends on          |
| --------------- | ---------------------------------------------------------------- | ------------------- |
| `nginx`         | Only ingress: TLS termination, security headers, `/api/` proxy   | app (healthy)       |
| `app`           | Next.js storefront (RSC + client bundles), port 3000 internal    | backend (healthy)   |
| `backend`       | Django API (`/api/v1/`), port 8000 internal                      | postgres, redis     |
| `worker`        | Celery worker (email, erasure, retention, Bitrix24, AI tasks)    | postgres, redis     |
| `beat`          | Celery scheduler (retention sweeps, GDPR SLA timers)             | redis               |
| `postgres`      | Postgres 16 — source of truth (orders, carts, listings, users)   | —                   |
| `redis`         | Celery broker (db 1) + cache (db 0); `allkeys-lru` eviction      | —                   |
| `elasticsearch` | Provisioned for the future ranking upgrade (MVP-Q1); search currently runs on Postgres — see §2.2 | — |

Network tiering: `frontend` network (nginx ⇄ app ⇄ backend) and `backend`
network (`internal: true` — data tier never edge-reachable). Only nginx
publishes host ports (80/443).

Health probes (compose healthchecks): app → `/api/health`; backend →
`/healthz/`; nginx → edge `/healthz`; postgres → `pg_isready`; redis →
`redis-cli ping`; elasticsearch → `_cluster/health`.

---

## 2. Common incidents

### 2.1 "Site returns 502"

nginx cannot reach its upstream (`app` for pages, `backend` for `/api/`).

1. `docker compose -f docker-compose.prod.yml --env-file .env.prod ps`
   — look for `restarting` / `unhealthy` on `app` and `backend`.
2. `docker compose … logs -f backend` (or `app`) — read the last crash.
3. If `app` is unhealthy, the cause is usually `backend` (app health does not
   depend on the API, but RSC pages fail loud) — check backend first.
4. Common causes: failed migration after deploy (run
   `docker compose … exec backend python manage.py migrate`), exhausted DB
   connections (check `postgres` health), OOM (check `docker inspect` /
   `dmesg`).
5. Still 502 with everything healthy? `docker compose … exec nginx nginx -t`
   and `docker compose … logs nginx | tail -50` for upstream errors.
6. Nuclear option (safe, seconds of downtime):
   `docker compose -f docker-compose.prod.yml --env-file .env.prod restart app backend`.

### 2.2 "Search returns no results"

**Reality check:** search currently runs on Postgres (`icontains` in
`apps/search_app`) — Elasticsearch is provisioned but **not wired** yet.

1. Verify the API itself: `curl -s -X POST https://marketplace.gyvenimo-kelias.lt/api/v1/search/ -H 'content-type: application/json' -d '{"q":"amber"}'`.
2. If the API errors: `docker compose … logs backend | grep -i search`.
3. If results are empty for queries that should match: confirm published
   listings exist (`docker compose … exec backend python manage.py shell -c "from apps.products_app.models import ProductListing; print(ProductListing.objects.count())"`).
4. Elasticsearch health (informational until it is wired):
   `docker compose … exec elasticsearch wget -qO- http://localhost:9200/_cluster/health`.
   A red cluster does **not** explain empty search results today — do not
   chase ES first.

### 2.3 "Checkout fails"

Money path: order creation → PaymentIntent → Stripe confirmation →
`checkout.session.completed` / `payment_intent.succeeded` webhook.

1. **Stripe webhook status first**: Stripe Dashboard → Developers → Webhooks →
   check the endpoint for `marketplace.gyvenimo-kelias.lt` for failed
   deliveries (5xx from us, or signature failures).
2. Backend logs for the payment flow:
   `docker compose … logs backend | grep -iE "payment|stripe|order"` and
   `docker compose … logs worker` (webhook processing is async via Celery).
3. If orders exist but stay unpaid: the webhook replay runbook applies —
   [runbooks/stripe-webhook-failure.md](./runbooks/stripe-webhook-failure.md).
4. If order creation itself fails (no PaymentIntent): check backend logs for
   `Tax calculation unavailable` (tax_app) or `Idempotency-Key` conflicts
   (409 = client retried with a changed payload — not a bug).
5. With Stripe unconfigured (no live keys), checkout degrades loudly by
   design — that state is a deployment configuration gap, not an incident.

### 2.4 "Cart not persisting"

**Reality check:** authenticated carts live in **Postgres** (orders_app);
guest carts are a browser localStorage draft (`jol_cart_draft`). Redis is the
Celery broker + cache only — it is *not* the cart store.

1. Authenticated user loses cart → check `backend` logs + Postgres health
   (`docker compose … exec postgres pg_isready`); carts are DB rows.
2. Guest loses cart → client-side: localStorage cleared (private mode,
   consent rejection does not touch it — the draft is necessary-only data).
3. Redis *eviction* (`allkeys-lru`) is still worth watching because it
   affects cache and the Celery broker:
   `docker compose … exec redis redis-cli info memory | grep -E 'used_memory_human|maxmemory_policy'`
   and `docker compose … exec redis redis-cli info stats | grep evicted_keys`.
   Sustained eviction → raise `maxmemory` or accept cold-cache behavior; it
   never loses committed carts or orders.

### 2.5 AI translation / enrichment down

Follow [runbooks/ai-outage.md](./runbooks/ai-outage.md). Listings stay
publishable without AI; enrichment queues retry.

---

## 3. Log locations

| What                | Where                                                        |
| ------------------- | ------------------------------------------------------------ |
| nginx access/error  | `./logs/nginx/` (host, mounted to `/var/log/nginx` in the container) |
| Any service         | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f <service>` |
| Backend API         | `docker compose … logs -f backend` (structured JSON, carries `x-request-id`) |
| Celery jobs         | `docker compose … logs -f worker` / `beat`                   |
| Host-level          | `journalctl -u docker`, `dmesg` (OOM)                        |

Correlating a user report with backend logs: take the `x-request-id` from the
browser network tab (response headers) and grep the backend logs for it.

Retention: `scripts/log-rotate.sh` (daily cron) rotates nginx logs (gzip,
30-day retention) and enforces backup retention; Docker container logs are
bounded by the compose json-file limits (`max-size: 10m`, `max-file: 5`).

---

## 4. Restart procedures

Always with the prod file + env file:

```bash
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
```

| Need                                   | Command                                   | Blast radius |
| -------------------------------------- | ----------------------------------------- | ------------ |
| Single service (non-ingress)           | `$COMPOSE restart worker`                 | seconds of that job queue |
| backend (API blip)                     | `$COMPOSE restart backend`                | ~5–10 s API errors; nginx serves app shell |
| app (storefront blip)                  | `$COMPOSE restart app`                    | ~5–10 s page errors |
| nginx config change                    | `$COMPOSE exec nginx nginx -t && $COMPOSE exec nginx nginx -s reload` | zero downtime |
| TLS cert replaced in `./ssl/`          | `$COMPOSE exec nginx nginx -s reload`     | zero downtime |
| Postgres (last resort)                 | `$COMPOSE restart postgres`               | full outage while healthchecks recover |
| Whole stack                            | `$COMPOSE down && $COMPOSE up -d`         | full outage ~1 min |
| Roll back a bad release                | `scripts/deploy.sh --rollback`            | brief window |

Never `kill -9` postgres; always let the healthcheck-driven restart do it.

---

## 5. Scheduled jobs (cron on the VM)

| Schedule        | Job                                              |
| --------------- | ------------------------------------------------ |
| every 5 min     | `scripts/health-check.sh` (JSON; alerts after 3 consecutive failures) |
| every 15 min    | `scripts/monitoring.sh` (disk/memory/container health) |
| nightly 02:30   | `scripts/log-rotate.sh`                          |
| nightly 03:00   | `scripts/backup.sh`                              |
| 04:00, 1st      | `VERIFY_RESTORE=1 scripts/backup.sh` (monthly restore test) |
| twice daily     | `certbot renew --webroot -w …/certbot-webroot && $COMPOSE exec nginx nginx -s reload` |

Exact crontab (user `jol`, installed 2026-08-23 — the certbot entry is
containerized because the host has no certbot binary; it also copies the
renewed cert into `./ssl/` before reloading nginx):

```cron
*/5 * * * * cd /opt/jol-m/repos/jol-m-marketplace && scripts/health-check.sh >/dev/null 2>>logs/cron.log
*/15 * * * * cd /opt/jol-m/repos/jol-m-marketplace && scripts/monitoring.sh >/dev/null 2>>logs/cron.log
30 2 * * * cd /opt/jol-m/repos/jol-m-marketplace && scripts/log-rotate.sh >>logs/cron.log 2>&1
0 3 * * * cd /opt/jol-m/repos/jol-m-marketplace && scripts/backup.sh >>logs/cron.log 2>&1
0 4 1 * * cd /opt/jol-m/repos/jol-m-marketplace && VERIFY_RESTORE=1 scripts/backup.sh >>logs/cron.log 2>&1
15 3,15 * * * cd /opt/jol-m/repos/jol-m-marketplace && docker run --rm -v $PWD/certbot-webroot:/var/www/certbot -v $PWD/certbot-webroot/conf:/etc/letsencrypt -v $PWD/certbot-webroot/logs:/var/log/letsencrypt certbot/certbot renew --webroot -w /var/www/certbot --quiet && cp -L certbot-webroot/conf/live/marketplace.gyvenimo-kelias.lt/fullchain.pem ssl/fullchain.pem && cp -L certbot-webroot/conf/live/marketplace.gyvenimo-kelias.lt/privkey.pem ssl/privkey.pem && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T nginx nginx -s reload
```

---

## 6. Escalation

Single-operator self-hosted topology — the escalation ladder is about
**response posture**, not headcount.

| Severity | Definition (see INCIDENT_RESPONSE.md)                | Action                                            |
| -------- | ---------------------------------------------------- | ------------------------------------------------ |
| **P1**   | Money path down (checkout/payment), full outage, data-loss risk | Drop everything; respond ≤ 15 min; page via MONITOR_WEBHOOK_URL + MONITOR_EMAIL; status page up within 30 min |
| **P2**   | Degraded but usable (search down, email delayed, one seller blocked) | Respond ≤ 1 h; fix in working hours |
| **P3**   | Cosmetic / non-urgent (admin UI glitch, copy fix)    | Respond ≤ 4 h; batch into next maintenance window |

If the operator is unreachable for a P1 > 30 min, the Proxmox host access
documented in `docs/DEPLOYMENT.md` is the recovery path for whoever holds the
Vaultwarden credentials (`jol-vaultwarden` on the same host).

**P1 vs P2 rule of thumb:** if a buyer cannot pay, or personal data is at
risk, it is P1. Everything that merely looks broken is P2 or P3.

---

## 7. Live environment facts (handoff, updated 2026-08-23)

| Fact | Value |
| ---- | ----- |
| Server | Proxmox guest VM, public IP `188.69.147.82` |
| Domain | `marketplace.gyvenimo-kelias.lt` |
| Repo checkout | `/opt/jol-m/repos/jol-m-marketplace` |
| TLS certificate | **bootstrap self-signed** (`issuer CN = domain`), expires **2026-11-20 15:40 UTC**. NOT Let's Encrypt yet — see Known issues. Once inbound 80/443 are open, issue the real cert with `bash scripts/tls-issue.sh` (renewal cron already installed). |
| Django superuser | username `jol_ops`, email **ops@gyvenimo-kelias.lt** (password is in Vaultwarden, never in this doc) |
| Stripe account ID | **PENDING — fill from Stripe Dashboard → Developers**. Never recorded on the VM. `.env.prod` `STRIPE_CONNECT_CLIENT_ID` is also still empty. |
| Stripe key mode | **TEST** (`sk_test_` / `pk_test_`). Live swap (Prompt 7) is blocked until the firewall opens — do not swap keys behind a closed edge. |
| Stripe webhook URL | `https://marketplace.gyvenimo-kelias.lt/api/v1/payments/webhooks/stripe/` (NOT `/api/v1/webhooks/stripe/` — that path 404s). Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`. |
| Backups | Nightly via `scripts/backup.sh` (pg_dump + redis rdb + ES snapshot). Root is `/var/backups/jol-marketplace` under cron; verification runs used `BACKUP_ROOT=backups` inside the repo. |

---

## 8. Known issues and limitations

| ID | Issue | Severity | Notes |
| -- | ----- | -------- | ----- |
| LI-1 | **External firewall blocks inbound 80/443** | P1 go-live blocker | Verified 2026-08-23: SSL Labs "Unable to connect". The whole public launch (real TLS, Stripe webhook registration, live key swap) chains behind this. Open TCP 80 + 443 at the Proxmox/hosting firewall. |
| LI-2 | TLS is self-signed until LI-1 is fixed | P1 | `scripts/tls-issue.sh` handles issuance + reload once ports open. Renewal cron already installed. |
| LI-3 | Elasticsearch provisioned but **unwired** | P3 | `search_app` uses Postgres `icontains`; ES cluster health green is informational only. Snapshot backups of ES are best-effort. |
| LI-4 | **GAP-A01: no analytics / Web Vitals ingestion** | P2 | `POST /api/v1/analytics/vitals/` → 404; Plausible is commented out until consent infra v2. CWV and cart-abandonment are currently unmeasurable — see §9. |
| LI-5 | KYC upload is a loud-stub contract gap | MVP-P1 | `seller-journey` e2e fails on it by design, identical on dev and prod. |
| LI-6 | Rate limiting trips under parallel e2e | Ops note | Prod Playwright suite runs `--workers=1` (general zone burst=40). |

---

## 9. 24-hour post-launch checklist

Mechanical items (automated by the §5 cron — verify the log):

```bash
cat logs/cron.log | tail -50                      # any health-check streaks? backup runs ok?
scripts/health-check.sh --json-only | python3 -m json.tool
```

Manual items for the first 24 h:

| Check | How | Status today |
| ----- | --- | ------------ |
| Core Web Vitals stable | **BLOCKED by LI-4** — no analytics ingestion. Once live publicly, use Google Search Console / a Lighthouse pass against the public URL. | n/a |
| Error logs empty of 500s | `docker compose … logs backend \| grep -iE '"status": 5\|HTTP 500'` and `docker compose … logs nginx \| grep -c ' 50[0-9] '` | run at launch + 24 h |
| Cart abandonment rate | **BLOCKED by LI-4** — not measurable until analytics exists. Track order creation vs. checkout completion counts as a proxy: `… exec backend python manage.py shell -c "from apps.orders_app.models import Order; print(Order.objects.filter(created_at__gte=__import__('datetime').timedelta(days=-1)).count())"` | proxy only |
| GDPR erasure requests queued | `docker compose … exec backend python manage.py shell -c "from apps.compliance_app.models import ErasureRequest, ErasureStatus; print(ErasureRequest.objects.filter(status=ErasureStatus.REQUESTED).count())"` | run at launch + 24 h |
| Stripe webhooks healthy | Dashboard → Developers → Webhooks → endpoint response codes; payout schedule confirmed (daily/weekly). Until live keys (LI-1): n/a — no live traffic possible. | n/a |
