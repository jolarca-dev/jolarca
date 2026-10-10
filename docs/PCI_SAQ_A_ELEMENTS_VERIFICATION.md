# PCI DSS SAQ-A — manual verification runbook: Stripe Elements / checkout

**Procedure version:** 1.0, written 2026-10-08 against `main` @ `5a1f5c4`.
**Subject of verification:** `@stripe/stripe-js` **10.0.0** + `@stripe/react-stripe-js` **7.0.0**,
landed together as #190 (`78e255a`) — the peer-coupled pair (§8 G39, `JOL-DEP-20261007-01`).
**Who executes:** the operator, by hand, in a browser. **This document never asserts a result.**
Every `- [ ]` below is a box for the verifier to tick, next to the artifact that proves it.

Why a human is required: `frontend-playwright-smoke` is `if: false` (§8 G4, non-enforcement accepted
in ADR-0022), and even enabled it runs `smoke.spec.ts` only — so `frontend/e2e/checkout-journey.spec.ts`
exists, is written, and **executes nowhere in CI**. The Stripe leg is therefore unverified by any gate.

What this runbook does **not** decide: whether the platform's correct self-assessment is **SAQ A** or
**SAQ A-EP**. `docs/SECURITY.md` §5 and `docs/COMPLIANCE_MATRIX.md` assert SAQ-A on the basis of the
controls below; a QSA/assessor signs that classification, not this file. Item 5 has a box for it.

---

## 0. Pre-flight — what must be running, and two things that are not configured

Measured on this checkout on 2026-10-08. Do the pre-flight before the checklist: **P-2 and P-3 block
items 1–3 outright**, and ticking them from a degraded stack would produce a false pass.

- [ ] **P-1 Stack up.**
  ```bash
  cd /opt/jolarca/repos/jolarca && make dev-up
  docker compose -f docker-compose.dev.yml ps
  ```
  Expected: project `jol-marketplace-dev`; services `db`, `redis`, `minio`, `mailpit`, `backend`,
  `worker`, `beat`, `frontend`, `stripe-mock` all `Up (healthy)` where health is declared.
  Frontend `http://localhost:3000` (`FRONTEND_PORT=3000`), API `http://localhost:8010`
  (`BACKEND_PORT=8010`). **`worker` must be running**: the order-status transition happens in a
  Celery task, so with only `backend` up a webhook is persisted and the order stays `pending`
  forever — a stack defect that reads exactly like a Stripe failure.
- [ ] **P-2 Publishable key is configured — currently it is NOT.**
  ```bash
  grep -c '^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=' .env .env.prod frontend/.env.local 2>/dev/null
  ```
  Measured: absent from `.env` (dev) and from `frontend/.env.local`; present only in `.env.prod`.
  Consequence, read from code: `frontend/src/lib/stripe.ts:18` yields `stripePromise = null`, so
  `PaymentStep` renders the `paymentsNotConfigured` notice and **Stripe.js is never loaded, no
  iframe exists, and item 1 cannot be observed at all**. To proceed, add a **test-mode** `pk_test_…`
  to `.env` and recreate the frontend (`docker compose -f docker-compose.dev.yml up -d frontend`).
  Record which Stripe account the key belongs to — test mode is mandatory here (§ item 5).
  Note also `docker-compose.dev.yml:164` claims "dev = test-mode keys from the root `.env`", which
  the first command falsifies for the current tree.
- [ ] **P-3 Secret key and webhook signing secret are real, not placeholders.**
  ```bash
  python3 - <<'PY'
  import pathlib, re
  keys = ("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")
  for f in (".env", ".env.prod"):
      for line in pathlib.Path(f).read_text().splitlines():
          k, _, v = line.partition("=")
          v = v.strip()
          if k.strip() in keys:
              print(f"{f}:{k.strip()}: len={len(v)} sentinel={'CHANGE_ME' in v} "
                    f"real_shape={bool(re.match(r'^(sk|pk|whsec)_(test|live)_[A-Za-z0-9]{16,}$', v))}")
  PY
  ```
  Measured 2026-10-08 (values never printed, so the output is safe to file):
  - dev `.env`: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are **`…_CHANGE_ME` sentinels**
    (len 17 / 15). `"CHANGE_ME"` passes `if not settings.STRIPE_SECRET_KEY`, so `_stripe()`
    (`payments_app/services.py:20-29`) does **not** raise `PaymentsNotConfigured` — it calls the live
    `api.stripe.com` and gets **401 `AuthenticationError`**, which `orders_app/services.py:175`
    does *not* catch (it catches `PaymentsNotConfigured`/`NotImplementedError` only). Under
    `@transaction.atomic` the whole checkout rolls back and the API answers **500**. This exact
    failure is already on record as **AUD-05 (CRITICAL)** in
    `audits/internal/2026-08-marketplace-audit/AUDIT_REPORT.md:215,289`, and re-measuring today
    shows it was never dispositioned: `git grep -n "api_base|STRIPE_API"` finds no code, and
    `.env` still carries 11 `CHANGE_ME` placeholders.
  - `.env.prod`: real-length **test-mode** keys (`sk_test_…`, `pk_test_…`) and
    `STRIPE_WEBHOOK_SECRET` **present but empty** → `webhooks.py:27-28` raises → every genuine
    delivery is answered **400**. `docs/SECURITY.md:90-103` states the webhook control; this is where
    its configuration is checked.
  So items 2 and 3.1 need real **test-mode** credentials in `.env` first, and they must not be
  copied into any artifact (§5.1). Decide and record: **never run these cards against a live key.**
  **Good news that makes 3.3 runnable today with zero configuration:** `whsec_CHANGE_ME` is a
  perfectly usable HMAC key, and `construct_event` makes no network call — so the signature tests
  below need no credentials at all.
- [ ] **P-4 Webhook delivery path exists — currently it does not.**
  ```bash
  which stripe || echo "stripe CLI NOT installed"
  grep -rl "stripe listen\|webhooks/stripe" scripts/ 2>/dev/null || echo "no forwarder in scripts/"
  ```
  Measured: no Stripe CLI, no repo-side forwarder, and dev is plain HTTP on loopback — so Stripe
  **cannot** reach `http://localhost:8010/api/v1/payments/webhooks/stripe/`. Options: install the
  CLI and `stripe listen --forward-to localhost:8010/api/v1/payments/webhooks/stripe/` (plus
  `stripe trigger payment_intent.succeeded`), or put a tunnel in front and register the endpoint in
  the Dashboard, or run **item 3.3 offline** (below) which needs neither. Tick only what you
  actually built; item 2 says explicitly which half depends on it.
- [ ] **P-5 Know what `stripe-mock` is doing here — it is not in the path (AUD-05, unfixed).**
  ```bash
  git grep -n -E "api_base|STRIPE_API" -- backend frontend scripts | grep -v audits || echo "no code sets a Stripe API base"
  git grep -n "12111" | grep -v audits
  ```
  `make dev-up` starts `stripe/stripe-mock` and publishes `12111`, but nothing anywhere sets
  `stripe.api_base`, so the SDK talks to the real `https://api.stripe.com` with whatever key is
  configured. This is the second half of **AUD-05** and it is still true today. Two consequences the
  verifier must hold: a test-card run is a **real API call to Stripe**, which is what makes item 1.3's
  network evidence meaningful; and the mock's presence in the `dev-up` description must never be read
  as "dev simulates Stripe". Say in the run log which of the two the evidence came from.
- [ ] **P-6 Buyer account + a buyable product exist.** `/checkout` is gated
  (`frontend/src/i18n/config.ts:39-44` lists `/checkout` in `PROTECTED_ROUTES`), so an unauthenticated
  visit redirects to `/<locale>/login?redirect=…`. Seed if needed (`scripts/seed_data.py`) and note
  the login you used; the e2e spec's own recipe is address `Gedimino pr. 1 / LT-01103 / Vilnius`,
  courier delivery.
- [ ] **P-7 Browser + tooling ready.** DevTools with the Console filter reset, Network "Preserve log"
  **on** before typing any card number, HAR export path chosen, and a screenshot directory outside
  the repo (`mkdir -p /opt/jolarca/evidence/2026-10-saqa`). Also: `docker compose -f
  docker-compose.dev.yml exec -T backend python manage.py shell -c 'print("ok")'` works, since most
  assertions below are server-side.
- [ ] **P-8 Record the identity of what is being verified** — this is what makes the evidence
  re-checkable years later:
  ```bash
  { git rev-parse HEAD; git diff --stat HEAD -- frontend/package.json; sha256sum .github/dependabot.yml; } \
    > /opt/jolarca/evidence/2026-10-saqa/00-target.txt
  ```

---

## 1. Payment Element renders; no card input exists outside Stripe's iframe

Reality check before you look: the mounted component is **`<PaymentElement>`**, not a `CardElement`
(`frontend/src/components/client/checkout/payment-step.tsx:200-221`), with `layout: "tabs"` and
`paymentMethodOrder: ["card", "sepa_debit"]` — so expect a **card tab and a SEPA-debit tab**, and
expect the element to stay mounted-but-hidden on the review step (same `<Elements>` group; that is
what `confirmPayment({ elements })` confirms against, `review-step.tsx:55-59`).

- [ ] **1.1 Element mounts clean.** Sign in → product page → add to cart → `/en/checkout` → address →
  delivery → payment step. In the Console, with errors/warnings both enabled:
  - [ ] no `Content Security Policy` violation for `js.stripe.com`
        (the policy allowlists it: `frontend/src/lib/security.ts:61,69,87` — script, connect, frame)
  - [ ] no `Failed to load stripe.js`, no hydration error, no React `Elements` provider warning
  - [ ] DevTools → Network shows `https://js.stripe.com/v3` fetched **200** and a frame whose src is a
        `js.stripe.com` URL rendered on the page
  - [ ] screenshot: payment step with the card tab visible, console panel in frame →
        `10-payment-step-console.png`
- [ ] **1.2 Every card field lives in the Stripe frame; none exists in our document.** Paste in the
  page's **top** context (not the frame's):
  ```js
  copy(JSON.stringify({
    ourCardLikeInputs: [...document.querySelectorAll(
      'input[autocomplete^="cc-"], input[name*="card" i], input[id*="card" i], ' +
      'input[name*="exp" i], input[id*="cvc" i], input[name*="cvc" i]')].map(i => i.id || i.name),
    ourEditableFields: [...document.querySelectorAll('input,textarea,select')].map(i => ({
      id: i.id || null, type: i.type || null, autocomplete: i.autocomplete || null })),
    stripeFrames: [...document.querySelectorAll('iframe')].map(f => {
      let reachable = false;
      try { reachable = !!f.contentDocument; } catch (e) { reachable = false; }
      return { origin: new URL(f.src).origin, readableByOurJs: reachable };
    }),
  }, null, 2))
  ```
  - [ ] `ourCardLikeInputs` is `[]`
  - [ ] `ourEditableFields` contains only our own, non-card fields — the expected set is the VAT-ID
        input `co-vat-id` (`payment-step.tsx:305`), the four address fields, the delivery radios and
        the terms checkbox
  - [ ] `stripeFrames` shows a `https://js.stripe.com` frame with **`readableByOurJs: false`** —
        cross-origin isolation is the mechanism that keeps PAN/CVC out of our JS, so this `false` is
        the control working, not an error
  - [ ] switch the DevTools JS-context dropdown to the Stripe frame and confirm the number/expiry/CVC
        inputs exist **there**, then screenshot the frame's DOM → `11-stripe-frame-dom.png`
  - [ ] save the JSON → `12-dom-inventory.json`
- [ ] **1.3 No keystroke reaches our origin.** With Network recording, type a full test PAN into the
  card field, then:
  - [ ] filter `s:` / host `localhost:8010` — **zero** requests contain the PAN string
  - [ ] host `api.stripe.com` — requests exist, and they carry it (that is the design: the frame posts
        directly to Stripe)
  - [ ] export the HAR of the whole payment step → `13-payment-step.har` (see §5 for why this file
        never enters the repo)
- [ ] **1.4 Degradation is loud, not silent** (a control the register cares about: §8 G3). Remove the
  publishable key (`docker compose ... up -d frontend` with it unset) and reload the payment step:
  - [ ] the page renders the `checkout.paymentsNotConfigured` notice rather than a blank frame, an
        infinite spinner, or a fake "card" input
  - [ ] restore the key afterwards and re-confirm 1.1

---

## 2. Happy path — test card `4242…` completes checkout and the order advances

Order of operations as the code defines it: order created at step-3 mount → `PaymentIntent` created
server-side → client secret to the browser → `confirmPayment` → Stripe redirects to
`/<locale>/checkout/success?order_id=…` → **webhook** tells us it really succeeded → state machine.

- [ ] **2.1 Order is created and an intent exists.** Complete address + delivery, enter the card. In
  another terminal:
  ```bash
  docker compose -f docker-compose.dev.yml exec -T backend python manage.py shell -c "from apps.orders_app.models import Order; o = Order.objects.order_by('-created_at').first(); print(o.number, o.status, getattr(o.payment, 'payment_intent_id', '-'), getattr(o.payment, 'status', '-'))"
  docker compose -f docker-compose.dev.yml logs --since 10m backend 2>&1 | grep -iE "AuthenticationError|checkout_without_payment_intent|Stripe API error" | tail -5
  ```
  - [ ] order number matches `JOL-<year>-<6 digits>`, status `pending`
  - [ ] `payment_intent_id` is a real `pi_…`. If it is not, read **which** of the three measured
        branches you are in and record it — they mean different things:
      - **sentinel key (today's `.env`)**: the POST to create the order returns **500**, the
        `@transaction.atomic` checkout **rolls back**, so **no order row exists at all**, and the
        backend log shows `stripe.AuthenticationError`. This is **AUD-05**, and it ends item 2:
        no credential, no verification. Fix the credential, not the test.
      - **empty `STRIPE_SECRET_KEY`**: `PaymentsNotConfigured` is caught and turned into
        `audit.warning("checkout_without_payment_intent")`; the order exists, `pending`, with no
        PaymentRecord (`orders_app/services.py:170-175`).
      - **real test key**: expect a `pi_…`. Anything else here is the finding, not a nuisance.
- [ ] **2.2 Confirm succeeds and the browser returns.** Accept the terms checkbox → *Place order*.
  - [ ] Stripe handles the redirect and the browser lands on `/en/checkout/success?order_id=…`
  - [ ] the page shows the order number
  - [ ] **understand what this page does not prove**: `success-body.tsx` renders from the return URL
        and fetches order detail for the number only — it never reads payment status, so "the success
        page appeared" is evidence about the **redirect**, not about `paid`. Do not tick 2.4 from it.
  - [ ] screenshot with the URL bar visible → `20-success-page.png`
- [ ] **2.3 Stripe's own record says succeeded.** In the Dashboard (test mode) open the `pi_…`:
  status `Succeeded`, amount/order metadata `{"order_id":…, "order_number":…}` as sent by
  `payments_app/services.py:32-60` → `21-stripe-intent.png`.
- [ ] **2.4 The webhook drove the order through the state machine.** This is the item that depends on
  **P-4**; without a delivery path, Stripe's event never arrives and the correct observation is
  "order still `pending`, PaymentRecord still `requires_payment_method`" — which is a **stack**
  finding, not a Stripe finding. Once an event lands (triggered or genuine):
  ```bash
  docker compose -f docker-compose.dev.yml exec -T backend python manage.py shell -c "from apps.payments_app.models import StripeWebhookEvent as E; [print(e.event_id, e.event_type, e.is_processed, e.created_at) for e in E.objects.order_by('-created_at')[:5]]"
  docker compose -f docker-compose.dev.yml exec -T backend python manage.py shell -c "from apps.orders_app.models import Order; o = Order.objects.order_by('-created_at').first(); print(o.number, o.status, getattr(o.payment, 'status', '-'))"
  ```
  - [ ] `StripeWebhookEvent` row `payment_intent.succeeded`, `is_processed=True`
  - [ ] order status `pending → paid`, PaymentRecord status `succeeded`
  - [ ] the transition went through the machine, not a direct write — audit event
        `order_transition` with `actor="stripe.webhook"` (`payments_app/tasks.py:40`,
        `orders_app/state_machine.py:68-78`; direct `Order.status` writes are forbidden by §Part IV)
  - [ ] re-delivering the same `event_id` returns `{"status":"duplicate_ignored"}` and does **not**
        create a second row or a second transition (idempotency, `webhooks.py:70-75`)
- [ ] **2.5 Nothing else on the page leaked into our servers.** In the `worker`/`backend` logs for the
  run window:
  ```bash
  docker compose -f docker-compose.dev.yml logs --since 30m backend worker 2>&1 \
    | grep -icE '4242424242424242|cvc|cvv|pan' && echo "FOUND — this is a PCI finding, stop and report" \
    || echo "clean: no card data in logs"
  ```
  - [ ] result is `clean: no card data in logs`
  - [ ] save the log slice → `22-backend-logs.txt`

---

## 3. Failure paths

### 3.1 3-D Secure: `4000002760003184`

`redirect: "always"` (`review-step.tsx:58`) means the challenge is expected to be a **top-level**
round-trip. Watch for the opposite: if Stripe renders the challenge as an iframe from an origin other
than `js.stripe.com`, `frame-src` (`security.ts:87`, which lists exactly `js.stripe.com` and
`www.openstreetmap.org`) **blocks** it — and that blocking is a real finding for the CSP, not a flake.

- [ ] run 2.1's flow with the 3DS card; complete/abandon the challenge as the test matrix says
- [ ] record: the challenge origin(s) seen in Network, whether the browser came back to
      `/en/checkout/success`, and **whether the Console shows any CSP `frame-src` violation**
- [ ] if a violation appears: capture it verbatim → `30-3ds-csp-violation.png`, and raise it as a
      separate change (a `frame-src` addition is a security-header decision, not a checkout fix)
- [ ] confirm the failure is honest if you **cancel** the challenge: an error message from
      `paymentErrorKey(error)` is shown, the order stays `pending`, no `paid` transition happens
      - [ ] `31-3ds-cancelled.png`

### 3.2 Decline: `4000000000000002`

- [ ] the payment does **not** redirect; `confirmPayment` resolves with an error and
      `review-step.tsx:63-75` shows `t(key)` + a toast, and logs `checkout confirmPayment failed`
      with `{type, code, orderId}` only
- [ ] `docker compose ... logs backend | grep -i "card_declined"` — the decline is visible via the
      intent, and the order is still `pending`
- [ ] **expected webhook behaviour:** `payment_intent.payment_failed` sets PaymentRecord `failed`
      and does **not** transition the order (`tasks.py:53-60` has no `transition()` call). Tick only
      if you observed the DB state, not the UI:
      - [ ] `32-declined-db-state.txt` showing `pending` + `failed`
- [ ] the buyer can retry with a good card on the same order without a second order row (the idempotency
      key `payment-step.tsx:92` should return the same order) — record the two order numbers or note
      that this is unverifiable in the current build

### 3.3 Tampered / forged webhook signature — offline, deterministic, no Stripe needed

This is the strongest item in §3 because it does not depend on P-4, and it tests the exact ordering
`docs/architecture/01-modular-breakdown.md:38` asserts: *verify signature FIRST, persist raw event,
then dispatch async*. Run each case and record HTTP status **and** the event-table count
before/after — the count is the proof that rejection happens **before** persistence.

```bash
# count first
docker compose -f docker-compose.dev.yml exec -T backend python manage.py shell -c "from apps.payments_app.models import StripeWebhookEvent as E; print('count', E.objects.count())"

python3 - <<'PY'
import hashlib, hmac, json, pathlib, time, urllib.error, urllib.request
secret = next(l.split("=", 1)[1].strip() for l in pathlib.Path(".env").read_text().splitlines()
              if l.startswith("STRIPE_WEBHOOK_SECRET="))
URL = "http://localhost:8010/api/v1/payments/webhooks/stripe/"

def post(body: bytes, signature: str) -> tuple[int, str]:
    req = urllib.request.Request(URL, data=body, method="POST",
                                 headers={"Content-Type": "application/json",
                                          "Stripe-Signature": signature})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def sign(body: bytes, secret=secret, ts=None) -> str:
    ts = ts or int(time.time())
    return f"t={ts},v1={hmac.new(secret.encode(), f'{ts}.'.encode() + body, hashlib.sha256).hexdigest()}"

event = {"id": "evt_saqa_manual_1", "type": "payment_intent.succeeded",
         "data": {"object": {"id": "pi_saqa_manual_1", "object": "payment_intent", "status": "succeeded"}}}
body = json.dumps(event).encode()

for label, sent, sig in [
    ("A valid signature", body, sign(body)),
    ("B body tampered, old signature", body.replace(b"pi_saqa_manual_1", b"pi_TAMPERED_9999"), sign(body)),
    ("C signed with the wrong secret", body, sign(body, secret="whsec_not_the_real_one")),
    ("D no Stripe-Signature header", body, ""),
    ("E replay of A (same event id)", body, sign(body)),
]:
    code, text = post(sent, sig)
    print(f"{label:34s} -> HTTP {code}  {text[:60]}")
PY

docker compose -f docker-compose.dev.yml exec -T backend python manage.py shell -c "from apps.payments_app.models import StripeWebhookEvent as E; print('count', E.objects.count()); [print(r.event_id, r.event_type) for r in E.objects.order_by('-created_at')[:5]]"
```

- [ ] **A** → HTTP **200** `{"status": "accepted"}`, one new `StripeWebhookEvent` row whose `payload`
      is the **raw verified** event
- [ ] **B, C, D** → HTTP **400** `invalid signature`, and the event count **unchanged** — tampered
      payloads must not be persisted at all, and must not 500 either (the `_is_signature_error` branch,
      `webhooks.py:37-43`, exists because `SignatureVerificationError` is not a `ValueError`)
- [ ] backend log shows `stripe_webhook_rejected reason=signature_invalid` for each rejection, and the
      audit line contains **no payload** → `33-webhook-rejections.log`
- [ ] **E** → HTTP 200 `{"status": "duplicate_ignored"}` on the second delivery, still one row
- [ ] **F** the forged event's effect is recorded honestly: `pi_saqa_manual_1` matches no
      `PaymentRecord`, so no order moved. Say so in the run log — this case proves **endpoint logic**,
      not that Stripe sent anything, and a runbook that blurs the two is worthless to an assessor
- [ ] **G** optional, but it is what closes 2.4 without a public webhook URL: repeat **A** using the
      **real** `pi_…` from 2.1 as `data.object.id`. Then the task finds the `PaymentRecord` and the
      order goes `pending → paid`. Label the evidence **"handler test with a locally-signed payload"**
      — the intent id is real, the signature is ours
- [ ] **H** unhandled-but-valid event type (e.g. `type: "charge.succeeded"`) → 200 `accepted`, row
      persisted, no handler, and `processed_at` still set. Confirm that is acceptable retention rather
      than assuming it: `webhooks.py:77-88` marks every verified event processed

---

## 4. Boundary re-verification — who touches Stripe today

The register's own words for why this matters: a silent regression in Elements is "a scope change, not
a chore" (§8 G39). Compare the output against the list below and **tick only "matches, no new
consumer"**.

- [ ] **4.1 Backend — every `import stripe`:**
  ```bash
  git grep -n "import stripe" -- backend
  ```
  Expected exactly two real import statements, both function-local inside `payments_app`:
  `apps/payments_app/services.py:25` and `apps/payments_app/webhooks.py:30`. The other hits are
  prose (`payments_app/__init__.py:3`, `tests/unit/test_architecture_boundaries.py:88`).
  - [ ] matches; **no** import outside `payments_app`
  - [ ] any new file here = **PCI scope change** → open an incident ID in
        `docs/INCIDENT_RESPONSE.md` §6.2 before merging, per the repo rule that security fixes cite a
        JOL id on branch, commit and PR
- [ ] **4.2 Frontend — every real consumer:**
  ```bash
  git grep -n -E 'from "@stripe/(stripe-js|react-stripe-js)"|loadStripe\(|useStripe\(|useElements\(|<Elements|<PaymentElement|StripeElementsOptions' \
    -- frontend ':!frontend/package-lock.json'
  ```
  Expected three files: `src/lib/stripe.ts:14,19` (`loadStripe` + the `Stripe` type),
  `src/components/client/checkout/payment-step.tsx:18-24,168,233-234`,
  `src/components/client/checkout/review-step.tsx:15,28-29`.
  Mentions in `src/app/[locale]/layout.tsx:26` and `src/components/client/script-loader.tsx:11` are
  **comments** (the CSP/loader rationale) — keep the distinction in the run log, because grep does not
  make it for you.
  - [ ] matches; a fourth consumer = scope change, same escalation as 4.1
- [ ] **4.3 No card-shaped storage.** `git grep -n -iE "cc_number|pan|card_number|cvc" -- backend`
  returns nothing that is a persisted column; the models docstring states the rule
  (`payments_app/models.py:3-5`: only Stripe object ids, amounts, status tokens).
  - [ ] confirmed; and record the one honest caveat: `InternalPaymentIntent.client_secret`
        (`models.py:82-84`) **is** stored, by design "returned ONCE on create and never serialized
        again". A payment-intent `client_secret` is not CHD, but it can confirm an intent — so it is
        material that must not appear in evidence artifacts (§5) or logs.
        Verify no serializer exposes it: `git grep -n "client_secret" -- backend/apps/payments_app`
        and read each hit.
- [ ] **4.4 What the automated gate does and does not cover** — state this in the run log rather than
  implying the test covers the frontend:
  `backend/tests/unit/test_architecture_boundaries.py:36-38` maps `stripe → payments_app` and walks
  **Python** ASTs under `backend/apps` only, so it cannot see a `@stripe/*` import in `frontend/src`;
  and `tests/contract/test_payments_api.py::TestStripeTestMode::test_no_live_keys_in_codebase` scans
  `backend/**/*.py` for `sk_live`, excluding migrations.
  - [ ] `make test-contract` and `make test` green (they are the machine half of 4.1/4.4)
  - [ ] recorded: **there is no automated frontend containment test**, so 4.2 is manual by design and
        this tick is not replaceable by a green CI badge
- [ ] **4.5 CSP still matches the documented policy:** diff
  `frontend/src/lib/security.ts:61-98` against `docs/SECURITY.md` §5 + the policy block at lines
  42-47, and note the dev-only difference: with `NODE_ENV=development` the `dev` image stage adds
  `'unsafe-eval'` (`security.ts:62-68`; the prod stages set `NODE_ENV=production`,
  `frontend/Dockerfile:33,49`).
  - [ ] **evidence-integrity consequence, stated in the run log:** a pass on `make dev-up` proves the
        **dev** policy works. It does **not** clear the production policy; if the assessor needs prod,
        repeat 1.1–1.3 against a prod-shaped build and say which stack each artifact came from
- [ ] **4.6 Nothing else gained a Stripe-shaped door:** confirm the internal payment API is still
  unauthenticated-free-but-internal only (`payments_app/urls_internal.py` is mounted under
  `/internal/v1/` and guarded by `internal_auth.py`; `docs/SECURITY.md` §5 point 4) and that no new
  public URL routes to a payments view: `git grep -n "payments_app" -- backend/project/urls.py`

---

## 5. Evidence to retain, and where it goes

Two filing rules, and they conflict usefully, so both are stated:
`audits/` is **tracked** — measured: `git check-ignore -v audits/internal/2026-08-marketplace-audit/AUDIT_REPORT.md`
prints nothing and exits 1 — so anything committed there
enters git history permanently and is effectively unrevocable. `scripts/check_no_secrets.sh:75` scans
tracked text with `grep -IHnE`, whose `-I` makes it **blind to binary files** — a screenshot with a
key in it is caught by neither that gate nor a reviewer's eye. So: **scrubbed text in the repo, raw
artifacts outside it.**

| Artifact | Filename | Where filed | Why there |
|---|---|---|---|
| Completed run log (this file, boxes ticked, dates + observer) | `RUNLOG.md` | audits/internal/2026-10-pci-saqA-elements-verification/ in the repo, via PR — **the verifier creates that directory; it does not exist yet** | it is the control narrative an assessor reads first; text-only, so the secret gates do see it |
| DOM inventory (1.2) | `12-dom-inventory.json` | same audit dir | the SAQ-A claim is structural: our document has no card inputs |
| Console/DOM/HAR screenshots, raw HAR, Stripe Dashboard captures (1.1, 1.3, 2.x, 3.1) | as listed inline | `/opt/jolarca/evidence/2026-10-saqa/` **outside** the repo, then into the encrypted evidence store | HAR bodies legitimately contain the test PAN and a `client_secret`; they belong in the restricted store, not in git |
| Webhook accept/reject log slices (2.5, 3.3) | `22-backend-logs.txt`, `33-webhook-rejections.log` | audit dir after scrubbing (see the scrub command below) | they are the evidence that verification precedes persistence |
| SHA-256 manifest of every artifact (in and out of repo) | `00-manifest.txt` | audit dir | lets a later reviewer prove the restricted file has not been edited |
| Target identity: `git rev-parse HEAD`, lock hashes, Stripe account + **mode** | `00-target.txt` (P-8) | audit dir | reproducibility; test-mode must be recorded, live-mode runs must not happen for this |
| Assessor's classification decision (SAQ A vs A-EP) | outside repo, plus a one-line pointer in `docs/SECURITY.md` §5 | evidence store | a classification is an external judgement; the repo cites it, never invents it |

- [ ] 5.1 Scrub before filing any text artifact, then verify the scrub did its job:
  ```bash
  cd /opt/jolarca/evidence/2026-10-saqa
  grep -rlInE '(sk|pk)_(test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|client_secret' . | tee 99-scrub-hits.txt
  ```
  - [ ] `99-scrub-hits.txt` reviewed; key material and `client_secret` values removed from every file
        destined for the repo; the raw HAR stays out
- [ ] 5.2 Manifest: `sha256sum * > 00-manifest.txt` in the evidence dir **before** the first copy into
  `audits/`
- [ ] 5.3 No real PAN, in any artifact, anywhere. Test-mode cards only (record the account). If a real
  card number was ever entered into the dev stack, this stops being a verification run and becomes an
  incident: follow `docs/INCIDENT_RESPONSE.md` and mint a `JOL-SEC-…` id
- [ ] 5.4 Update the register **whatever the outcome**, in the same PR as the run log:
  - [ ] all items pass → §8 G39's "manual Elements verification remains the PCI control" and queue
        item 3(1)'s "hand-verification … is still outstanding" get dated dispositions saying it was
        performed, on which SHA, in which mode, and **which items were not reproducible** (P-4/P-2
        shape that)
  - [ ] any item fails or was blocked → it becomes a §8 row with the finding, not a soft note;
        §8 G4/G18/G40 precedent is that an unenforced control is written down as open
  - [ ] `make check-docs` clean after the edit (C2 resolves cited paths, C5/C7 police the register and
        table integrity; the new file only enters their scope once tracked, so run it after `git add`)

---

## 6. Sign-off

| Field | Value |
|---|---|
| Verifier / date / time zone | |
| Commit verified (`git rev-parse HEAD`) | |
| Stripe account id + **mode (test/live)** | |
| Stack used (`make dev-up` dev / prod-shaped build) | |
| Items completed | 1.__  2.__  3.__  4.__  5.__ |
| Items **not** reproducible, and why (state P-2/P-3/P-4 explicitly) | |
| Findings raised (with JOL ids) | |
| Evidence manifest sha256 | |

---

## Appendix A — measured facts behind this runbook (2026-10-08, `main` @ `5a1f5c4`)

- Card data path: `<PaymentElement>` inside a `js.stripe.com` iframe; confirm from the same mounted
  `<Elements>` group with `redirect: "always"` (`payment-step.tsx:192-224`, `review-step.tsx:55-59`).
- Intent creation is the single backend boundary: `orders_app/services.py:170-175` →
  `payments_app/services.py:32-60` (`_stripe()` at `:20-29`, `import stripe` at `:25`),
  `automatic_payment_methods` enabled, metadata `order_id`/`order_number`, returns **only** the client
  secret.
- Webhook: `POST /api/v1/payments/webhooks/stripe/` (`project/urls.py:30`, `payments_app/urls.py:6`),
  `csrf_exempt` + `require_POST`, verify → `get_or_create` on `event_id` → dispatch by
  `HANDLERS` → `processed_at` (`webhooks.py:55-89`).
- Order advance: `handle_payment_succeeded` → `transition(order, OrderEvent.PAY, actor="stripe.webhook")`
  (`tasks.py:24-50`, the call at `:40`); from `pending` the machine allows only `pay → paid`,
  `cancel → cancelled`, `timeout → cancelled` (`orders_app/state_machine.py:37-58`, `transition()`
  at `:68`).
- `payment_intent.payment_failed` marks the record `failed` and never transitions the order
  (`tasks.py:53-60`).
- CSP: `script-src` includes `https://js.stripe.com`; `connect-src` includes
  `https://api.stripe.com`; `frame-src` is `https://js.stripe.com https://www.openstreetmap.org`
  (`security.ts:61,69,87`), asserted by `frontend/tests/security/csp.test.ts`.
- Credential state (lengths and a sentinel test only; no value was ever printed): dev `.env` carries
  `…_CHANGE_ME` for `STRIPE_SECRET_KEY` (len 17) and `STRIPE_WEBHOOK_SECRET` (len 15) and has **no**
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; `.env.prod` has real-length **test-mode** `sk_test_…`/`pk_test_…`
  and an **empty** `STRIPE_WEBHOOK_SECRET`.
- No Stripe CLI on the host, no forwarder in `scripts/`, `stripe-mock` present but unreferenced by the
  app; `/checkout` is a protected route; CI's Playwright job is `if: false` **and** would run only
  `smoke.spec.ts` against a backend-less stack (`.github/workflows/ci.yml:258-296`).

## Appendix B — observations this runbook surfaced, reported and not fixed here

Each is a candidate for its own change; none belongs in a verification procedure's diff. Items 1–2 and
4 are **not new**: they are **AUD-05 (CRITICAL)** from `audits/internal/2026-08-marketplace-audit/`,
re-measured here on 2026-10-08 and still unfixed — `AUD-05` appears nowhere in that audit's
`CHANGES.md`, and `git grep -n "api_base|STRIPE_API"` still finds no code. Recording them as fresh
discoveries would erase seven months of non-disposition, which is its own finding.

1. **Dev stack cannot exercise the Stripe UI at all** (no publishable key in `.env`), while
   `docker-compose.dev.yml:164` states the opposite ("dev = test-mode keys from the root `.env`").
   A comment that contradicts the file it sits next to is the §8 G3 class of defect.
2. **AUD-05, first half — `…_CHANGE_ME` Stripe credentials pass the configured-check.** Because the
   value is non-empty, `PaymentsNotConfigured` is *not* raised; the SDK calls live `api.stripe.com`,
   gets 401, and `orders_app/services.py:175` catches only `PaymentsNotConfigured`/
   `NotImplementedError` — so the atomic checkout rolls back and the client sees a 500. Two different
   failure shapes hide behind one config flag: empty key ⇒ loud-in-logs/silent-in-UI `pending`;
   sentinel key ⇒ rolled-back 500.
3. **`.env.prod` carries a present-but-empty `STRIPE_WEBHOOK_SECRET`** → `webhooks.py:27-28` makes
   every genuine delivery a 400. Fail-closed, but the webhook control is inert wherever that file is
   used. Also `.env.prod` holds **test-mode** keys (`sk_test_`/`pk_test_`), which for a production
   posture deserves an explicit, dated statement rather than an inference by the reader.
4. **AUD-05, second half — `stripe-mock` is started and never addressed**: dead weight that reads
   like a simulation, and the reason a green-looking dev checkout can still be talking to Stripe.
5. **3DS could be blocked by `frame-src`** if the challenge renders as a non-`js.stripe.com` iframe;
   unknown until item 3.1 is run, which is precisely why this runbook exists.
6. **No automated frontend containment test** for `@stripe/*`, unlike the backend's AST gate — the
   boundary claim rests on review for the half that runs in the browser.
7. `docs/SECURITY.md:90-103` §5 point 1 says the buyer's card details enter "Stripe's hosted Payment
   Element" and calls the level SAQ-A; that is a classification **claim** whose support is this
   runbook's outcome plus an assessor's judgement (§5 "Assessor's classification" row).
