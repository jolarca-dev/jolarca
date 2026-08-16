# Runbook: AI provider outage

1. **Confirm scope:** `AIRequestLog.status='failed'` rate per provider.
2. Local LLM pods down → fallback chain auto-routes to DeepL → commercial.
   Translation quality degrades gracefully; core commerce is unaffected
   (publishing never blocks on AI — it's enqueued).
3. All providers down: translations queue builds up; `ai` queue depth is the
   alert signal. Do NOT route around the PII guardrail to "catch up".
4. Recovery: queue drains automatically (retries with backoff). Verify a
   sample of listings for translation quality before closing the incident.
5. If commercial fallback saw traffic during the incident, confirm the DPA
   volume log (AIRequestLog) for the subprocessor report.
