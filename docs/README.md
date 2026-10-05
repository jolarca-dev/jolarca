# Documentation index

The single authoritative inventory of `docs/`, and the **authority map** that says which
document owns which topic.

Every path below is written as a backticked, repo-root-relative citation, so
`scripts/check_doc_claims.py` (check C2) resolves each one against the working tree: this
file is listed in `GOVERNANCE_FILES`, which means renaming or deleting a document without
updating this index fails `make check-docs` instead of leaving a dead link behind.

Confirm the index is still exhaustive:

```bash
BT=$(printf '\140')  # the backtick, spelled numerically: a literal pair in this file
                    # would be read as a path citation by C2 and fail the gate
diff <(find docs -name '*.md' | sort) \
     <(grep -oE "${BT}docs/[A-Za-z0-9_./-]+\.md${BT}" docs/README.md | tr -d "$BT" | sort -u)
```

An empty diff means every Markdown file under `docs/` has exactly one row here.

## Authority map

Where a topic has more than one document, the **single home** owns its numbers and its
enforcement claims; every other document links to it rather than restating it. This is
the fix for the drift mechanism recorded as QODER.md §8 G1 and G24: the same claim
restated in two or three files, corrected in one, and left false in the others.

| Topic | Single home | Links, never restates |
| --- | --- | --- |
| Coverage floors and gate values | [`docs/TESTING_STRATEGY.md`](TESTING_STRATEGY.md) | `docs/TESTING.md`, `README.md`, `QODER.md` |
| ADR records and numbering | [`docs/ARCHITECTURE_DECISION_RECORDS.md`](ARCHITECTURE_DECISION_RECORDS.md) | `docs/TECH_DECISIONS.md`, `README.md` |
| Vulnerability disclosure | [`SECURITY.md`](../SECURITY.md) (repository root) | `docs/SECURITY.md`, `README.md` |
| Security controls (headers, CSP, supply chain, PCI) | [`docs/SECURITY.md`](SECURITY.md) | `docs/SECURITY_POSTURE.md` |
| Threat model, compliance mapping, assurance roadmap | [`docs/SECURITY_POSTURE.md`](SECURITY_POSTURE.md) | `docs/SECURITY.md` |
| Incident response procedure | [`docs/INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) | `docs/SECURITY.md`, `docs/SECURITY_POSTURE.md`, `docs/RUNBOOK.md` |
| Live-ops incidents, logs, restarts, cron | [`docs/RUNBOOK.md`](RUNBOOK.md) | `docs/runbooks/*.md` (per-incident detail), `docs/DEPLOYMENT.md` |
| Build and deploy topology, TLS, backup, first launch | [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) | `docs/RUNBOOK.md` |
| Release and sprint history | [`docs/CHANGELOG.md`](CHANGELOG.md) | `README.md` |
| Control-to-article mapping | [`docs/COMPLIANCE_MATRIX.md`](COMPLIANCE_MATRIX.md) | `docs/GDPR_COMPLIANCE.md`, `docs/SECURITY_POSTURE.md` |
| Grant narrative vs work packages | [`docs/GRANT_SUBMISSION.md`](GRANT_SUBMISSION.md) (narrative) · [`docs/GRANT_APPLICATION.md`](GRANT_APPLICATION.md) (packages, budget, Gantt) | `README.md`, `docs/EXECUTIVE_SUMMARY.md` |
| Document inventory | [`docs/README.md`](README.md) (this file) | `README.md` (entry points only) |

## Repository-root documents

Not under `docs/`, listed here so the inventory has no blind spot.

| Document | Title | Role |
| --- | --- | --- |
| [`README.md`](../README.md) | jolarca | Entry point: badges, quickstart, pointers into this index |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Contributing | Developer guide, commit style, PR compliance checklist |
| [`SECURITY.md`](../SECURITY.md) | Security Policy | Vulnerability disclosure: scope, severity, what to include, supported versions |
| [`QODER.md`](../QODER.md) | Engineering guidelines | Enforcement tiers, module invariants, and the §8 gap register |

## Governance and decisions

| Document | Title | Role |
| --- | --- | --- |
| [`docs/ARCHITECTURE_DECISION_RECORDS.md`](ARCHITECTURE_DECISION_RECORDS.md) | Architecture Decision Records | The ADR registry: overview table plus the full decision records. Numbering is authoritative here — read the file, never restate a range |
| [`docs/TECH_DECISIONS.md`](TECH_DECISIONS.md) | Technical decisions (ADRs) | The earliest seven engineering decision records (monorepo, licensing, i18n, encryption, object storage, admin, sanctioned stubs) |
| [`docs/ASSUMPTIONS.md`](ASSUMPTIONS.md) | Assumptions register | Undecided items and the assumptions the build rests on |
| [`docs/COMPLIANCE_MATRIX.md`](COMPLIANCE_MATRIX.md) | Compliance matrix | Control-to-article mapping (ISO 27001, SOC 2, GDPR) |
| [`docs/MVP_REMAINING_WORK.md`](MVP_REMAINING_WORK.md) | MVP remaining work — sanctioned stubs ONLY | Inventory of sanctioned stubs by domain, with ticket ids |

## Architecture and design

| Document | Title | Role |
| --- | --- | --- |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | System Architecture | Architecture overview and cross-references |
| [`docs/TECHNICAL_SPECIFICATION.md`](TECHNICAL_SPECIFICATION.md) | Technical Specification | Specification: system architecture, data flows, caching |
| [`docs/API_CONTRACT.md`](API_CONTRACT.md) | API Contract | Endpoint contract documentation |
| [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Design System ("Sacred-Modern") | Design language, tokens and contrast constraints |
| [`docs/architecture/01-modular-breakdown.md`](architecture/01-modular-breakdown.md) | 01 — Modular breakdown | App responsibilities, interfaces, forbidden imports |
| [`docs/architecture/02-sequence-registration-2fa.md`](architecture/02-sequence-registration-2fa.md) | 02 — Sequence: registration + 2FA | Registration and two-factor flow |
| [`docs/architecture/03-sequence-listing-creation.md`](architecture/03-sequence-listing-creation.md) | 03 — Sequence: listing creation → publish | Listing creation to publication |
| [`docs/architecture/04-sequence-checkout.md`](architecture/04-sequence-checkout.md) | 04 — Sequence: checkout (money path) | Checkout and payment flow |
| [`docs/architecture/05-sequence-erasure.md`](architecture/05-sequence-erasure.md) | 05 — Sequence: GDPR erasure (Art. 17) | Erasure fan-out flow |
| [`docs/architecture/06-database-erd.md`](architecture/06-database-erd.md) | 06 — Database ERD (logical) | Logical entity relationships |
| [`docs/architecture/07-communication-protocols.md`](architecture/07-communication-protocols.md) | 07 — Communication protocols | REST and internal protocol conventions |

## Security and privacy

| Document | Title | Role |
| --- | --- | --- |
| [`docs/SECURITY.md`](SECURITY.md) | Security Documentation | Operational controls: headers, CSP, dependency supply chain, OWASP Top 10, payments and PCI scope, incident response, change and deployment controls |
| [`docs/SECURITY_POSTURE.md`](SECURITY_POSTURE.md) | Security Posture | STRIDE threat model, implemented mitigations with repository evidence, compliance mapping, incident response, assurance roadmap |
| [`docs/GDPR_COMPLIANCE.md`](GDPR_COMPLIANCE.md) | GDPR Compliance Documentation | Privacy architecture and GDPR obligations |
| [`docs/INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) | Incident Response | Severity definitions and the response procedure of record |

## Quality and testing

| Document | Title | Role |
| --- | --- | --- |
| [`docs/TESTING_STRATEGY.md`](TESTING_STRATEGY.md) | Testing Strategy | Test pyramid and inventory, accessibility assurance, security testing, CI/CD pipeline — and the only home of the coverage gate values |
| [`docs/TESTING.md`](TESTING.md) | Testing Documentation | How to run each suite: unit, integration, end-to-end, CI map, performance budgets, accessibility, security testing |
| [`docs/PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md) | Performance Report | Benchmarks: budget versus verified gates, techniques, scalability plan |

## Operations

| Document | Title | Role |
| --- | --- | --- |
| [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) | Self-Hosted Deployment Guide | Topology, Proxmox VM setup, production compose, nginx, Let's Encrypt TLS, backup and DR, monitoring, first-launch runbook |
| [`docs/RUNBOOK.md`](RUNBOOK.md) | Operations Runbook | Service overview, common incidents, log locations, restart procedures, VM cron jobs, escalation, live environment facts |
| [`docs/runbooks/ai-outage.md`](runbooks/ai-outage.md) | Runbook: AI provider outage | Response when the AI provider is down |
| [`docs/runbooks/stripe-webhook-failure.md`](runbooks/stripe-webhook-failure.md) | Runbook: Stripe webhook failures | Response to failing or forged webhook deliveries |
| [`docs/runbooks/restore-from-backup.md`](runbooks/restore-from-backup.md) | Runbook: restore from backup | Restore procedure and verification |
| [`docs/runbooks/dependabot-lock-peer-repair.md`](runbooks/dependabot-lock-peer-repair.md) | Runbook: dependabot npm PR red on a missing lock entry | Repair for dependabot branches whose lock edit dropped a required peer |

## Release history

| Document | Title | Role |
| --- | --- | --- |
| [`docs/CHANGELOG.md`](CHANGELOG.md) | Sprint Changelog (100-Day Sprint) | Sprint-by-sprint deliverables, known issues and limitations, post-MVP roadmap |

## Grant and narrative

| Document | Title | Role |
| --- | --- | --- |
| [`docs/EXECUTIVE_SUMMARY.md`](EXECUTIVE_SUMMARY.md) | Executive Summary | One-page mission, value proposition and status |
| [`docs/GRANT_APPLICATION.md`](GRANT_APPLICATION.md) | Grant Application | Objectives, work packages, 100-day timeline, budget, risk register, success metrics |
| [`docs/GRANT_SUBMISSION.md`](GRANT_SUBMISSION.md) | Grant Submission Package | Submitted narrative: summary, scope, technical approach, timeline, team, budget, risk, KPIs, sustainability |
| [`docs/POST_MVP_ROADMAP.md`](POST_MVP_ROADMAP.md) | Post-MVP Roadmap | Phases 2–4, beginning with intelligence and institutional reach |

## Generated artifacts — never hand-edit

| Path | What it is |
| --- | --- |
| [`docs/api/openapi.yaml`](api/openapi.yaml) | OpenAPI snapshot regenerated by `make api-schema` |
| [`docs/api/README.md`](api/README.md) | Guard note for the snapshot directory |

## Archive

[`docs/archive/README.md`](archive/README.md) holds frozen historical records and states
why they are non-authoritative, why they are corrected only by dated note, and why they
are deliberately outside this gate's claim checks. Current contents:
[`docs/archive/STEP20_EXECUTED.md`](archive/STEP20_EXECUTED.md).
