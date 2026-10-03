# 01 — Modular breakdown: responsibilities, interfaces, forbidden imports

## Apps

| App | Responsibility | Public interface | Forbidden |
|---|---|---|---|
| `core` | Base models, encryption, idempotency, RBAC, pagination | models + utilities | importing ANY domain app |
| `users_app` | Identity, auth, consent | `services.py` | direct Stripe/carrier/AI calls |
| `sellers_app` | Onboarding, KYC-lite, verification | `services.py` | calling Stripe directly (via payments_app) |
| `products_app` | Catalog, translations, geo | `services.py` | writing orders/payments tables |
| `orders_app` | Cart, checkout, state machine | `services.py`, `state_machine.py` | direct `Order.status` writes outside state machine |
| `payments_app` | THE Stripe boundary | `services.py`, webhook view | `import stripe` anywhere else in the codebase |
| `tax_app` | VAT rates, invoices, OSS | `services.py` | calling Stripe APIs directly |
| `search_app` | Search behind protocol | `services.get_backend()` | leaking backend types upward |
| `shipping_app` | Carriers behind protocol | `services.py`, webhook view | carrier clients outside `carriers/`; provider detail leaking upward |
| `ai_service_app` | Translation/embeddings | `tasks.py` only | LLM clients outside `providers/`; inference in request path; bypassing guardrails |
| `bitrix24_integration_app` | CRM sync | `tasks.py` only | being imported by marketplace apps |
| `compliance_app` | Erasure, export, retention, audit | `services.py` | deleting financial evidence |

## Vendor boundaries

The backend has exactly one vendor SDK: `stripe` (`backend/pyproject.toml:27`),
confined to `payments_app`. Carriers and LLM providers have **no SDK** — they sit
behind the `Carrier` (`shipping_app/carriers/base.py:12`) and `LLMProvider`
(`ai_service_app/providers/base.py:12`) protocols, clients confined to
`shipping_app/carriers/` and `ai_service_app/providers/`, transport over
`requests`. Carrier clients are unwired stubs raising `NotImplementedError`,
which `shipping_app/services.py:87` handles as a carrier failure (circuit
breaker + `shipment_label_pending` audit warning); checkout serves the curated
locker directory and labels it `"source": "curated"` (`services.py:159-163`).
When a real carrier or LLM SDK is adopted, add it to `SDK_CONTAINMENT` in
`backend/tests/unit/test_architecture_boundaries.py` in the same PR.

## Cross-cutting contracts
- Money path: `orders_app.services.checkout` → `tax_app.calculate_for_order` →
  `payments_app.create_payment_intent`; idempotent end-to-end.
- Erasure: `compliance_app` orchestrates; each owning app registers a handler.
- Webhooks: verify signature FIRST, persist raw event, then dispatch async.
- Audit: every personal-data mutation emits a `jol.audit` structured event.

Sequence diagrams 02–07 detail the flows; this table is the review checklist.
The import boundaries are machine-gated by
`backend/tests/unit/test_architecture_boundaries.py`; the responsibilities and
public-interface columns remain review-gated.
