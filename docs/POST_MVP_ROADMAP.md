# Post-MVP Roadmap

**Scope:** What happens after Day 100. Current state:
[MVP_REMAINING_WORK.md](MVP_REMAINING_WORK.md) · funding context:
[GRANT_APPLICATION.md](GRANT_APPLICATION.md) · architecture constraints:
[ARCHITECTURE_DECISION_RECORDS.md](ARCHITECTURE_DECISION_RECORDS.md).

Guiding principle: every phase preserves the three non-negotiables —
**GDPR-native, self-hosted, grief-aware** (ADR-0009/0012/0017).

## Phase 2 — Months 4–6: Intelligence and Institutional Reach

| Initiative | Description | Dependencies |
| --- | --- | --- |
| **AI search ranking (`jol-rag-server`)** | Semantic ranking over catalog + funeral directory using the reserved pgvector extension and the self-hosted inference endpoint; RAG answers grounded strictly in verified listing data (no hallucinated prices/availability) | Closes GAP-S01/S02; AI queue + PII filter already isolated (ADR-0001) |
| **Estonian go-live** | ET UI strings are content-ready; launch requires localized legal pages, DPD/Omniva EE parity checks, and native-speaker review | i18n dual system (ADR-0003) |
| **Diocese procurement** | Institutional purchasing: consolidated billing, approval workflows, tax-exempt handling for registered religious entities | Orders state machine extension; counsel review per state |
| **Analytics collector (GAP-A01) + Plausible** | Field Core Web Vitals dashboards and consent-gated traffic analytics on the self-hosted stack | Consent infra v2 already gates collection |
| **DAST in CI** | Automated dynamic scanning against staging per release | Pen-test findings feed the rule set |

**Exit criteria:** p75 CWV "Good" in field data; ET orders completing;
first diocese contract signed.

## Phase 3 — Months 7–12: Engagement and Depth

| Initiative | Description | Notes |
| --- | --- | --- |
| **Mobile app (React Native)** | Buyer app sharing the `/api/v1` contract (type-generated client), offline cart, push order updates | Reuses auth/session model; no token duplication (httpOnly cookie exchange pattern) |
| **AR vestment preview** | Web-based AR try-on for vestments/liturgical items via model-viewer; asset pipeline through existing S3 storage | Opt-in per product; lazy-loaded (performance budget applies) |
| **Real-time chat** | Buyer↔seller messaging with moderation hooks; grief-aware defaults in the funeral context (no auto-prompts, quiet hours) | WebSocket tier behind nginx; PII redaction on log path |
| **Advanced analytics** | Cohort/funnel reporting on derived, non-PII columns (ADR-0004 constraint respected); seller dashboards | Aggregates only; no cross-context tracking |

**Exit criteria:** ≥ 25% of sessions mobile; chat moderation SLA proven;
analytics dashboards in seller/admin use.

## Phase 4 — Year 2: EU-wide Expansion

| Initiative | Description | Gates |
| --- | --- | --- |
| **Geographic expansion** | PL and DE launches after LT/LV/EE/ET stabilization; per-state regulatory check (distance-selling, funeral rules) before enablement | ADR-0017 per-state gate |
| **Languages** | Polish, German; translation pipeline (DeepL + human review) already provider-abstracted | Terminology review for sacred vocabulary |
| **Marketplace financing** | Working-capital product for verified sellers (payout advances) via licensed partner — platform never holds credit risk itself | Partner due diligence; PCI scope unchanged |
| **Infrastructure scale-out** | Read replicas, ES cluster, app replicas per the scaling plan; optional caching layer in front of nginx | Trigger-based, not calendar-based (PERFORMANCE_REPORT.md §4) |

**Exit criteria:** two new member states live; financing partner
contracted; infra scaling executed at least once under real load.

## Cross-Phase Commitments

- **Security:** annual pen test before each major phase boundary;
  threat-model row review per feature (SECURITY_POSTURE.md §5).
- **Accessibility:** every new surface ships with axe gates and a manual
  screen-reader pass; funeral journeys keep the AAA target.
- **Data protection:** DPIA refresh for each initiative introducing new
  processing (chat, AR analytics, financing).
