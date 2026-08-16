"""Liveness / readiness probes.

/healthz/ — process is up (orchestrator liveness; must never depend on DB).
/readyz/  — dependencies usable (readiness; gates traffic).
Both are exempt from the GDPR halt switch by design.
"""

from django.db import connection
from django.http import JsonResponse


def healthz(request):
    return JsonResponse({"status": "ok"})


def readyz(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:  # noqa: BLE001 — probe must not leak driver errors
        return JsonResponse({"status": "degraded", "database": "unavailable"}, status=503)
    return JsonResponse({"status": "ready"})
