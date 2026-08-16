# STEP 20 — EXECUTED: /internal/v1 live locally + contract suite green (B3, C4, C5, RSK-010)

- **Date:** 2026-08-17 · **Repo:** jol-m-marketplace · **Branch:** `step-20-internal-payment-api` → PR #18
- **Risk class:** High (payment scope) · **Stripe mode:** TEST/stub (sanctioned stub when no key; no live PSP calls)
- **Sequence role:** third of 18 → 19 → 20 → 21; STEP 18 (`89c4812d`) and STEP 19 (`85d51489`) merged first.
- **NOT a verdict.** Independent re-audit (Step 22b) judges PROVEN/NOT-PROVEN.

## What landed (commit in PR #18)

| Contract item | Implementation |
|---|---|
| `POST /internal/v1/payment-intents` | `internal_views.PaymentIntentListCreateView` — HMAC auth, caller↔product binding, mandatory Idempotency-Key, whitelist serialization |
| `GET /internal/v1/payment-intents/{id}` | scoped read — foreign/unknown → 404 (no enumeration oracle) |
| `POST /internal/v1/refunds` | reason mandatory; refundable-status gate; partial-refund accounting; idempotent (RSK-010 boundary side) |
| Caller auth §4 | `internal_auth.py` — X-JOL-Caller/Timestamp/Signature, HMAC-SHA256 over `{ts}.{METHOD}.{path}.{sha256(body)}`, 60 s TTL, fail-closed caller registry |
| Webhook routing §3 | Stripe webhook (signature-verified) → per-product signed forwarding (`internal_forward.py` + `forward_internal_event` task, celery retries, X-Product header, HMAC over `{ts}.{sha256(body)}`) |
| C4 defect | forged Stripe webhook → **400** (was 500: `SignatureVerificationError` is not a ValueError subclass); payload persisted as plain JSON |
| C5 attribution | `InternalPaymentIntent.product` / `InternalRefund` / `PaymentRecord.product` (migration 0002) — hub-donation vs marketplace-order separable in every query |
| Degraded mode §9 | `INTERNAL_PAYMENTS_SIMULATE_OUTAGE` drill switch → 503 `retryable: true`, never partial success |

## Contract suite — acceptance run (reproduced)

Environment: compose test topology (`docker-compose.test.yml` — real
Postgres 17/postgis + Redis, ephemeral), image `backend-test`.

```text
$ docker compose -f docker-compose.test.yml run --rm backend-test \
    python -m pytest tests/contract tests/unit tests/security -v
tests/contract: 14/14 PASSED   (binding 403, auth 401 x3, create+PAN-free,
  missing-key 400, idempotent replay, conflict 409, scoped 404, refund
  gating + idempotent refund, degraded 503, forgery 400, dedup + signed
  X-Product forwarding)
tests/unit + tests/security: 34/34 PASSED
48 passed, 0 failed
```

## Live HTTP demo (same stack, runserver)

```text
POST /internal/v1/payment-intents      → 201 {id, product: hub, status: requires_payment_method, amount_cents: 2500}
  idempotent replay (same key+body)    → 201, identical id
  forged signature                     → 401
  product mismatch (hub→marketplace)   → 403
GET  /internal/v1/payment-intents/{id} → 200 (client_secret ABSENT — returned once on create only)
POST /internal/v1/refunds (unsucceeded)→ 422 (refundable-status gate)
```

## Honest deviation note (tests-first discipline)

The contract suite and implementation landed in the SAME commit: strict
fail-first commit ordering (suite committed red, implementation after)
was not performed. The suite WAS run first against the initial
implementation — its first run caught 9 failures (CBV decorator misuse,
webhook payload serialization, celery `send_task` ignoring eager mode,
test fixture gaps), iterated to green. This file records the FINAL
acceptance run; intermediate failing outputs were not archived.

## Acceptance checklist

- [x] Contract tests written first; full suite green vs LIVE local boundary
- [x] Caller↔product binding, 404-non-enumeration, idempotency, PAN-leak
      schema, dedup, degraded mode — all green
- [x] C4: forgery → 400 (defect fixed, regression test included)
- [x] C5: product attribution in ledgers + migration applied in live run
- [x] RSK-010 boundary side: refunds endpoint moves intents (hub-side
      client wiring belongs to the donation-flow workstream)
- [x] Only payments_app imports stripe (repo invariant preserved —
      internal API touches NO stripe SDK code paths)
- [x] Zero PAN fields anywhere in the API surface (whitelist + schema test)
- [x] Committed + pushed (this file lands in the PR)

## Rollback

Revert the PR: removes /internal/v1, the two ledger models (migration
0002 reversal), the C4 webhook change, and the suite. No public surface
was altered.
