"""GDPR fail-closed middleware — the kill switch must actually kill."""

from unittest.mock import MagicMock

from django.http import JsonResponse
from django.test import RequestFactory

from project.middleware.gdpr_middleware import JOLGDPRComplianceMiddleware


def _request(method="POST", path="/api/v1/orders/checkout/"):
    factory = RequestFactory()
    request = getattr(factory, method.lower())(path)
    return request


def test_halted_blocks_mutations(settings):
    settings.GDPR_PROCESSING_HALTED = True
    inner = MagicMock(return_value=JsonResponse({"ok": True}))
    middleware = JOLGDPRComplianceMiddleware(inner)

    response = middleware(_request("POST"))

    assert response.status_code == 503
    assert response["Retry-After"] == "3600"
    inner.assert_not_called()  # request never reached the view


def test_halted_allows_reads(settings):
    settings.GDPR_PROCESSING_HALTED = True
    inner = MagicMock(return_value=JsonResponse({"ok": True}))
    middleware = JOLGDPRComplianceMiddleware(inner)

    response = middleware(_request("GET"))

    assert response.status_code == 200
    inner.assert_called_once()


def test_halted_exempts_health_probes(settings):
    settings.GDPR_PROCESSING_HALTED = True
    inner = MagicMock(return_value=JsonResponse({"status": "ok"}))
    middleware = JOLGDPRComplianceMiddleware(inner)

    response = middleware(_request("GET", path="/healthz/"))

    assert response.status_code == 200
    inner.assert_called_once()


def test_request_id_assigned_and_echoed(settings):
    settings.GDPR_PROCESSING_HALTED = False
    inner = MagicMock(return_value=JsonResponse({"ok": True}))
    middleware = JOLGDPRComplianceMiddleware(inner)

    request = _request("GET")
    response = middleware(request)

    assert request.request_id
    assert response["X-Request-ID"] == request.request_id


def test_inbound_request_id_preserved(settings):
    settings.GDPR_PROCESSING_HALTED = False
    inner = MagicMock(return_value=JsonResponse({"ok": True}))
    middleware = JOLGDPRComplianceMiddleware(inner)

    request = _request("GET")
    request.META["HTTP_X_REQUEST_ID"] = "trace-from-edge"
    middleware(request)

    assert request.request_id == "trace-from-edge"
