# MVP remaining work — sanctioned stubs ONLY

Every stub in the codebase raises loudly (`NotImplementedError("MVP-*")` or
`*NotConfigured`) and is listed here. Anything unfinished that is NOT on this
list is a defect, not a stub.

## Identity & sellers
- **MVP-U2** TOTP enrollment (2FA) — `users_app.services.enable_totp`
- **MVP-S1** VIES validation + evidence retention — `sellers_app.services.vies_validate`

## Catalog & search
- **MVP-P1** Image pipeline (webp renditions → S3) — `products_app.tasks.resize_listing_images`
- **MVP-P3** Catalog grid UI — frontend `src/app/[locale]/page.tsx`
- **MVP-Q1** SearchVector+GIN+trigram ranking — `search_app.backends.postgres`

## Checkout & payments
- **MVP-Y1** Multi-seller split payouts (transfer_data) — `payments_app.services.create_payment_intent`
- **MVP-Y2** Refund ledger reconciliation — `payments_app.tasks.handle_charge_refunded`
- **MVP-Y3** Stripe Connect status → seller verification mapping

## Tax
- **MVP-T2** Stripe Tax calculation wiring — `payments_app.services.stripe_tax_calc`
- **MVP-T3** VIES-evidenced reverse charge — `tax_app.services.reverse_charge_check`
- **MVP-T4** OSS quarterly aggregation — `tax_app.tasks.prepare_oss_return`

## Shipping
- **MVP-H1/H2** DPD / Omniva API wiring (labels, tracking, lockers)
- **MVP-H3** Recipient assembly from order + consented address
- **MVP-H4** Carrier webhook secret rotation procedure

## AI & integrations
- **MVP-A2** Embeddings endpoint (pgvector path)
- **MVP-B1/B2** Bitrix24 contact/deal sync
- **MVP-C2** Nullable-buyer retention migration (`retention.anonymize_order_history`)
- **MVP-E1** Full Playwright checkout journey (cart → payment mock)

## Compliance program
- DPIA template + annual review calendar
- Public subprocessor register
- RoPA export automation from `pii_classification` annotations
- Quarterly backup-restore drill (runbook evidence)
- import-linter contracts for the boundary rules in ADR-0001
