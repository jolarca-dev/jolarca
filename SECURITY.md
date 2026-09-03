# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| latest `main` | yes        |
| anything older | no          |

## Reporting a vulnerability

**Do NOT open a public issue.**

Report privately via one of:

1. GitHub **Security → Report a vulnerability** (private disclosure), or
2. Email `journey4oflife+jolarca.dev@gmail.com` with the subject prefix `[SECURITY]`.
   (This mailbox must be created and monitored before the repository is made public.)

### What to include

- Affected component (`backend/apps/<app>`, `frontend`, infra) and version/commit.
- Minimal reproduction or proof of concept.
- Impact assessment as you see it (data classes exposed: PII, financial, credentials).

### Our commitments (SOC 2 CC7.3 / ISO 27001 A.5.24 aligned)

- Acknowledgement within **2 business days**.
- Triage and severity rating within **5 business days**.
- Remediation targets: critical ≤ 7 days, high ≤ 30 days.
- Coordinated disclosure: we agree on a public timeline together.
- No legal action for good-faith research conducted within scope.

### Scope highlights

- Authentication/authorization bypass, IDOR across seller/buyer boundaries.
- GDPR-relevant: PII leakage, erasure incompleteness, consent bypass.
- Payment-integrity issues (amount manipulation, webhook forgery).
- Supply chain: dependency confusion, CI secret exposure.

Out of scope: self-XSS without a path to other users, missing cookie flags on
static marketing content, rate-limiting on unauthenticated read endpoints
above documented thresholds.
