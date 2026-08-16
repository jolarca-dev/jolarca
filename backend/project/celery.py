"""Celery application.

Queues (declared in settings.CELERY_TASK_ROUTES and compose worker command):
  default    — order/seller/search housekeeping
  email      — transactional mail
  media      — image processing → S3
  ai         — LLM/translation work (isolated pool, hard timeouts)
  compliance — erasure fan-out & retention sweeps (SLA-tracked, isolated)
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings.dev")

app = Celery("jol_m_marketplace")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
