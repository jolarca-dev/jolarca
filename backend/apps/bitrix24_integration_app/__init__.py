"""Bitrix24 CRM sync — isolated integration.

Invariant: a Bitrix24 outage must NEVER block a core marketplace flow.
All sync is async (Celery), behind a kill switch, with its own failure
budget. No marketplace code may import this app — it subscribes to events
via explicit task calls only.
"""
