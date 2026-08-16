"""Shared API exception vocabulary. Keep error shapes stable — the frontend
client is generated from the OpenAPI contract."""

from rest_framework import status
from rest_framework.exceptions import APIException


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The request conflicts with the current resource state."
    default_code = "conflict"


class ExternalServiceUnavailable(APIException):
    """Carrier/payment/AI provider down after circuit-breaker exhaustion."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "An upstream service is temporarily unavailable."
    default_code = "upstream_unavailable"


class ProcessingHalted(APIException):
    """GDPR kill switch active (see gdpr_middleware)."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Data processing is temporarily suspended."
    default_code = "processing_halted"
