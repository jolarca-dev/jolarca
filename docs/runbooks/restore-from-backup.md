# Runbook: restore from backup

**RPO 24h / RTO 4h target. Drill quarterly — evidence to compliance folder.**

1. Freeze writes: set `GDPR_PROCESSING_HALTED=1` (fail-closed kill switch).
2. Provision target cluster; restore latest WAL-archive base backup.
3. Point application at restored DB (read-only mode first).
4. Validate: row counts vs last audit snapshot; spot-check encrypted fields
   decrypt with CURRENT `FIELD_ENCRYPTION_KEY` chain (rotation history must
   be restored alongside data).
5. Verify `AuditLog` continuity (no gap in `created_at` sequence).
6. Re-enable traffic: `GDPR_PROCESSING_HALTED=0`.
7. Post-restore: replay Stripe webhooks since restore point (idempotent),
   requeue failed Celery tasks, confirm erasure SLA queue is drained.

**Never:** restore without the encryption key chain — that is a PII loss
incident in itself (notify DPO immediately if keys are missing).
