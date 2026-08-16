"""AI services: translation, embeddings — local-first provider routing.

Runs ONLY in Celery workers (ai queue). Inference must never happen in the
request path. Every outbound call passes the PII guardrail and is audit-logged.
"""
