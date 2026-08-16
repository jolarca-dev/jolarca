# Runbook: Stripe webhook failures

**Symptoms:** orders stuck in `pending`, `StripeWebhookEvent.processed_at` NULL,
`stripe_webhook_rejected` audit events.

1. **Verify scope:** `SELECT count(*) FROM payments_app_stripewebhookevent WHERE processed_at IS NULL;`
2. **Check signature rejections** in logs (`stripe_webhook_rejected`): usually
   a rotated endpoint secret — compare Stripe dashboard secret with
   `STRIPE_WEBHOOK_SECRET` (rotate via secret manager, then redeploy).
3. **Replay:** Stripe dashboard → Events → resend. Our handler is idempotent
   (event_id dedupe), replay is always safe.
4. **Broker down** (tasks never ran): check Redis health, then
   `celery -A project purge -Q default` is NEVER the answer — instead restart
   workers; acks_late guarantees at-least-once, handlers are idempotent.
5. **Escalate** if `PaymentRecord` and Stripe dashboard disagree after replay:
   reconciliation query + incident channel. Money mismatches are P1.

**Prevention:** alert on `unprocessed webhook events > 10 older than 5 minutes`.
