"""Carrier tracking webhooks → order state transitions.

Security: carrier callbacks are authenticated with a shared HMAC secret per
carrier (settings-per-carrier, rotated via env) — forgery of delivery state
is a fraud vector.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import structlog
from django.http import HttpResponseBadRequest, HttpResponseForbidden, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Shipment, ShipmentStatus, TrackingEvent

audit = structlog.get_logger("jol.audit")

# carrier status → our ShipmentStatus (delivery then drives order transitions)
_STATUS_MAP = {
    "in_transit": ShipmentStatus.IN_TRANSIT,
    "delivered": ShipmentStatus.DELIVERED,
    "failed": ShipmentStatus.FAILED,
}


def _verify(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@csrf_exempt
@require_POST
def tracking_webhook(request, carrier: str):
    # Sanctioned simplification (MVP-H4): secrets come from env per carrier.
    from django.conf import settings

    secret = {"dpd": settings.DPD_API_KEY, "omniva": settings.OMNIVA_API_KEY}.get(carrier, "")
    signature = request.headers.get("X-Carrier-Signature", "")
    if not secret or not _verify(request.body, signature, secret):
        return HttpResponseForbidden("invalid signature")

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("invalid json")

    shipment = Shipment.objects.filter(external_id=payload.get("external_id", "")).first()
    if shipment is None:
        return JsonResponse({"status": "unknown_shipment"}, status=404)

    carrier_status = payload.get("status", "")
    TrackingEvent.objects.create(
        shipment=shipment,
        carrier_status=carrier_status,
        occurred_at=timezone.now(),
        raw=payload,
    )

    new_status = _STATUS_MAP.get(carrier_status)
    if new_status:
        shipment.status = new_status
        shipment.save(update_fields=["status", "modified_at"])

        if new_status == ShipmentStatus.DELIVERED:
            # Delivery drives the order state machine — via orders_app, not directly.
            from apps.orders_app.state_machine import OrderEvent, transition

            try:
                transition(shipment.order, OrderEvent.DELIVER, actor=f"carrier.{carrier}")
            except Exception as exc:  # noqa: BLE001 — never lose a webhook to a state mismatch
                audit.error(
                    "tracking_transition_failed", shipment_id=str(shipment.pk), error=str(exc)
                )

    return JsonResponse({"status": "accepted"})
