## Summary

<!-- One paragraph: what and why. Link the issue. -->

Closes #

## Compliance checklist (required — reviewers will not merge without it)

- [ ] No new PII fields; if unavoidable, uses `core.encryption.EncryptedTextField`
      with RoPA classification and `docs/COMPLIANCE_MATRIX.md` updated in this PR.
- [ ] No new third-party dependency; if unavoidable, added to `pyproject.toml`
      and `make lock` was run (requirements diff is attached).
- [ ] No secrets, keys, or internal hostnames in code, tests, fixtures, or docs.
- [ ] Stripe SDK touched ONLY inside `apps/payments_app/`.
- [ ] No AI/inference call added to request/response code paths.
- [ ] Cross-app access goes through the owning app's `services.py`.
- [ ] State transitions use `orders_app.state_machine` (no direct status writes).
- [ ] Erasure fan-out impact assessed: new storage of personal data has a
      registered handler in `compliance_app.services.ERASURE_REGISTRY`.
- [ ] OpenAPI snapshot regenerated if API surface changed (`make api-schema`).
- [ ] Migrations reviewed: no destructive ops, no table locks on hot tables,
      reversible (down-migration path described).

## Security & privacy notes

<!-- Data classes touched, authz changes, external calls added. Write NONE if N/A. -->

## Rollback plan

<!-- How to revert safely, incl. data migrations. -->
