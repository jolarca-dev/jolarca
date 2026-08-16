# 07 — Communication protocols

## REST
- Base: `/api/v1/` · Contract: `/api/schema/` (drf-spectacular) → snapshot
  `docs/api/openapi.yaml` → frontend codegen. Hand-edits fail CI.
- Errors: stable vocabulary from `apps.core.exceptions` (conflict, upstream_unavailable, processing_halted).
- `X-Request-ID` on every response (edge-supplied or generated).
- `Idempotency-Key` REQUIRED on `POST /orders/checkout/`.

## Celery queues
| Queue | Contents | Guarantees |
|---|---|---|
| default | orders sweep, indexing, webhooks handlers | acks_late, reject on worker lost |
| email | transactional mail | retries 5, backoff |
| media | image pipeline | retries 3 |
| ai | inference/translation | time_limit 300s, isolated pool |
| compliance | erasure fan-out, retention, SLA checks | retries 5, SLA-monitored |

DLQ policy: failed-after-retries tasks land in Celery's dead-letter via
`task_reject_on_worker_lost` + monitoring alert (runbooks/).

## Webhooks
- Stripe: `POST /api/v1/payments/webhooks/stripe/` — signature verified
  (STRIPE_WEBHOOK_SECRET), raw event persisted before dispatch, event-id dedupe.
- Carriers: `POST /api/v1/shipping/webhooks/tracking/<carrier>/` — HMAC-SHA256
  of raw body, constant-time compare.

## Trusted proxy assumption
`X-Forwarded-For` first hop is trusted ONLY behind the single edge proxy;
audit IP extraction relies on this (gdpr_middleware._client_ip).
